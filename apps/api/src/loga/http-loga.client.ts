import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  type AddPointsInput,
  type AddPointsResult,
  LogaClient,
  type LogaCustomer,
  type LogaMemberRef,
  LogaRequestError,
  LogaUnavailableError,
} from './loga.types';

export interface HttpLogaConfig {
  baseUrl: string;
  username: string;
  /** Plain password; LOGA expects its MD5 hash. */
  password: string;
  deviceId: string;
  cardId: string;
  timeoutMs: number;
}

interface LogaResponse {
  code: number | string;
  msg?: string;
  data?: unknown;
}

type Json = Record<string, unknown>;

/**
 * Real LOGA API, as described in "LOGA API Integration Guidelines" (docs/loga/).
 * Every call is a form-encoded POST that returns { code, msg, data }; code 200 = success.
 *
 * The login token never expires on its own (only on logout or a password change), so it is
 * kept in memory and fetched again only when LOGA rejects it.
 */
export class HttpLogaClient extends LogaClient {
  private readonly logger = new Logger('LOGA');
  private token: string | null = null;

  constructor(
    private readonly config: HttpLogaConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    super();
  }

  async findCustomerByPhone(phone: string) {
    return this.customerInfo(phone);
  }

  async getCustomer(ref: LogaMemberRef) {
    if (ref.uid) return this.customerInfo(ref.uid);
    if (ref.pcardId) return this.customerInfo(`P${ref.pcardId}`);
    return null;
  }

  async createCustomer({ phone, name }: { phone: string; name: string }) {
    // No plastic card: LOGA's docs say to use the phone number as serial and barcode.
    const res = await this.call('main/subscribe_by_unregistered_card', {
      serial: phone,
      barcode: phone,
      mobile: phone,
      fname: name,
    });
    if (!isOk(res)) throw new LogaRequestError(String(res.code), res.msg ?? '');
    const pcardId = str(get(res.data, 'pcard_id'));
    if (!pcardId) throw new LogaUnavailableError('LOGA ไม่ได้ส่งรหัสสมาชิกกลับมา');
    return { uid: null, pcardId };
  }

  async addPoints(input: AddPointsInput): Promise<AddPointsResult> {
    // `point` is sent, so LOGA uses our calculated points (no formula_id); `cost` is info only.
    const res = await this.call('points/add_customer_point', {
      cuid: input.cuid,
      point: String(input.points),
      cost: input.cost.toFixed(2),
      remark: input.remark,
      reference: input.reference,
    });
    if (!isOk(res)) throw new LogaRequestError(String(res.code), res.msg ?? '');
    const now = Number(get(res.data, 'point.now'));
    return { pointsNow: Number.isFinite(now) ? now : null };
  }

  async testConnection() {
    this.token = null; // log in again so a wrong password shows up now
    const res = await this.call('main/get_card_detail', {});
    if (!isOk(res)) throw new LogaRequestError(String(res.code), res.msg ?? '');
    return { cardName: str(get(res.data, 'name')) };
  }

  /** Get customer info; `cuid` may be a uid, "P" + pcard_id or a phone number. */
  private async customerInfo(cuid: string): Promise<LogaCustomer | null> {
    const res = await this.call('main/get_customer_info', { cuid });
    // LOGA's "not a member" answer isn't documented: anything except success counts as not found.
    if (!isOk(res)) return null;
    return parseCustomer(res.data, this.logger);
  }

  /** POST with token + card_id. Logs in first if needed, and once more if the token is rejected. */
  private async call(path: string, params: Record<string, string>): Promise<LogaResponse> {
    const hadToken = this.token !== null;
    const res = await this.post(path, { ...params, ...(await this.auth()) });
    if (hadToken && isTokenProblem(res)) {
      this.token = null;
      return this.post(path, { ...params, ...(await this.auth()) });
    }
    return res;
  }

  private async auth() {
    try {
      this.token ??= await this.login();
    } catch (err) {
      // Even a login timeout means the actual request was never sent.
      if (err instanceof LogaUnavailableError) throw new LogaUnavailableError(err.message, false);
      throw err;
    }
    return { token: this.token, uuid: this.config.deviceId, card_id: this.config.cardId };
  }

  private async login(): Promise<string> {
    const res = await this.post('main/login', {
      user: this.config.username,
      pass: createHash('md5').update(this.config.password).digest('hex'),
      uuid: this.config.deviceId,
    });
    const token = str(get(res.data, 'token'));
    if (!isOk(res) || !token) {
      // Never log the request: it contains the password hash.
      this.logger.error(`LOGA login failed (code ${String(res.code)}): ${res.msg ?? ''}`);
      throw new LogaUnavailableError('เข้าสู่ระบบ LOGA ไม่สำเร็จ กรุณาตรวจสอบการตั้งค่า LOGA');
    }
    return token;
  }

  private async post(path: string, params: Record<string, string>): Promise<LogaResponse> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.config.baseUrl.replace(/\/$/, '')}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (err) {
      this.logger.warn(`${path}: ${err instanceof Error ? err.message : String(err)}`);
      throw new LogaUnavailableError(undefined, !neverArrived(err));
    }
    if (!response.ok) {
      this.logger.warn(`${path}: HTTP ${response.status}`);
      // A server error may come after the work was done.
      throw new LogaUnavailableError(undefined, response.status >= 500);
    }
    const body = (await response.json().catch(() => null)) as LogaResponse | null;
    if (!body || typeof body !== 'object' || !('code' in body)) {
      this.logger.warn(`${path}: response is not LOGA JSON`);
      throw new LogaUnavailableError(undefined, true);
    }
    return body;
  }
}

const isOk = (res: LogaResponse) => String(res.code) === '200';

/** Network errors that mean the request never reached LOGA (safe to treat as "not sent"). */
const NEVER_ARRIVED = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH'];

function neverArrived(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string } })?.cause;
  const code = cause?.code ?? (err as { code?: string })?.code;
  return Boolean(code && NEVER_ARRIVED.includes(code));
}

const isTokenProblem = (res: LogaResponse) =>
  ['401', '403'].includes(String(res.code)) || /token|login|auth/i.test(res.msg ?? '');

function get(value: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (obj, key) => (obj && typeof obj === 'object' ? (obj as Json)[key] : undefined),
      value,
    );
}

function str(value: unknown): string | null {
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const first = (data: unknown, paths: string[]) =>
  paths.map((p) => get(data, p)).find((v) => v !== undefined && v !== null && v !== '');

/**
 * Map Get customer info's data to LogaCustomer. The guide only documents data.card.uid and
 * data.card.pcard_id; other fields are looked up under the names LOGA uses elsewhere
 * (e.g. data.point.now in Add customer points). Unknown layouts give null, never a crash.
 */
export function parseCustomer(data: unknown, logger?: Logger): LogaCustomer | null {
  const uid = str(get(data, 'card.uid'));
  const pcardId = str(first(data, ['card.pcard_id', 'card.pcard_no']));
  if (!uid && !pcardId) return null;

  const rawPoints = first(data, ['point.now', 'points.now', 'card.point', 'card.points', 'point']);
  const points = rawPoints === undefined || typeof rawPoints === 'object' ? NaN : Number(rawPoints);
  if (Number.isNaN(points) && logger && data && typeof data === 'object') {
    // Field names only (no personal data) so the mapping can be fixed against the real API.
    logger.warn(
      `Points not found in get_customer_info; data keys: ${Object.keys(data).join(', ')}`,
    );
  }

  const firstName = str(first(data, ['customer.fname', 'profile.fname', 'fname', 'name']));
  const lastName = str(first(data, ['customer.lname', 'profile.lname', 'lname']));
  return {
    uid,
    pcardId,
    name: [firstName, lastName].filter(Boolean).join(' ') || null,
    birthday: str(first(data, ['customer.birthday', 'profile.birthday', 'birthday', 'birth_date'])),
    level: str(first(data, ['level.name', 'card.level_name', 'level_name', 'card.level'])),
    points: Number.isNaN(points) ? null : points,
  };
}
