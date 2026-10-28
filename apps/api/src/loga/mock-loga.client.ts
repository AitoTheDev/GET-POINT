import {
  type AddPointsInput,
  type AddPointsResult,
  LogaClient,
  type LogaCustomer,
  type LogaMemberRef,
  LogaRequestError,
  LogaUnavailableError,
} from './loga.types';

/** Phone number that makes the mock behave as if LOGA were down (for testing error states). */
export const MOCK_LOGA_DOWN_PHONE = '0899999999';

/** LOGA members that already exist in the mock (they match the seeded sample members). */
const FIXTURES: LogaCustomer[] = [
  {
    uid: '100001',
    pcardId: null,
    name: 'สมชาย ใจดี',
    birthday: '1990-05-14',
    level: 'Gold',
    points: 520,
  },
  {
    uid: '100002',
    pcardId: null,
    name: 'สมหญิง มีสุข',
    birthday: null,
    level: 'Basic',
    points: 240,
  },
  {
    uid: '100003',
    pcardId: null,
    name: 'วิชัย รักดี',
    birthday: null,
    level: 'Basic',
    points: 180,
  },
  {
    uid: '100004',
    pcardId: null,
    name: 'พิมพ์ชนก สุขใจ',
    birthday: '1995-11-02',
    level: 'Platinum',
    points: 860,
  },
  { uid: '100005', pcardId: null, name: 'ธนพล แสงทอง', birthday: null, level: 'Basic', points: 0 },
];
const FIXTURE_PHONES = ['0812341234', '0812345678', '0812349012', '0812343456', '0812347890'];

/**
 * How the mock answers "add points", switchable from the Settings page to try every case:
 * - SUCCESS: points added
 * - FAIL: LOGA answers with an error (nothing added)
 * - TIMEOUT: no answer, nothing added
 * - LOST_RESPONSE: points added, but the answer never arrives (the case `reference` protects)
 */
export type MockTransferMode = 'SUCCESS' | 'FAIL' | 'TIMEOUT' | 'LOST_RESPONSE';
export const MOCK_TRANSFER_MODES: MockTransferMode[] = [
  'SUCCESS',
  'FAIL',
  'TIMEOUT',
  'LOST_RESPONSE',
];

/**
 * In-memory stand-in for LOGA (LOGA_MODE=mock). Members created here are lost when the API
 * restarts; a pcard_id it doesn't know is then reported as a member with 0 points.
 */
export class MockLogaClient extends LogaClient {
  private readonly byPhone = new Map<string, LogaCustomer>();
  private nextPcard = 770001;
  /** Points added per cuid, and the references already used (LOGA ignores repeats). */
  private readonly added = new Map<string, number>();
  private readonly references = new Map<string, number>();
  transferMode: MockTransferMode = 'SUCCESS';

  /** Forget added points and go back to SUCCESS (tests start clean). */
  reset() {
    this.added.clear();
    this.references.clear();
    this.transferMode = 'SUCCESS';
  }

  /** Points the mock has added for this reference (tests). */
  pointsFor(reference: string) {
    return this.references.get(reference) ?? null;
  }

  constructor(private readonly delayMs = 150) {
    super();
    FIXTURES.forEach((customer, i) => this.byPhone.set(FIXTURE_PHONES[i], customer));
  }

  async findCustomerByPhone(phone: string) {
    await this.respond(phone);
    return this.byPhone.get(phone) ?? null;
  }

  async getCustomer(ref: LogaMemberRef) {
    await this.respond();
    const extra = this.added.get(ref.uid ?? `P${ref.pcardId}`) ?? 0;
    for (const customer of this.byPhone.values()) {
      if (
        (ref.uid && customer.uid === ref.uid) ||
        (ref.pcardId && customer.pcardId === ref.pcardId)
      ) {
        return { ...customer, points: (customer.points ?? 0) + extra };
      }
    }
    if (ref.pcardId) {
      return {
        uid: null,
        pcardId: ref.pcardId,
        name: null,
        birthday: null,
        level: 'Basic',
        points: extra,
      };
    }
    return null;
  }

  async createCustomer({ phone, name }: { phone: string; name: string }) {
    await this.respond(phone);
    if (this.byPhone.has(phone)) {
      throw new LogaRequestError('400', 'เบอร์โทรศัพท์นี้เป็นสมาชิกอยู่แล้ว');
    }
    const customer: LogaCustomer = {
      uid: null,
      pcardId: String(this.nextPcard++),
      name,
      birthday: null,
      level: 'Basic',
      points: 0,
    };
    this.byPhone.set(phone, customer);
    return { uid: null, pcardId: customer.pcardId };
  }

  async addPoints({ cuid, points, reference }: AddPointsInput): Promise<AddPointsResult> {
    await this.respond();
    if (this.transferMode === 'FAIL') {
      throw new LogaRequestError('500', 'ไม่สามารถเพิ่มแต้มได้ (จำลอง)');
    }
    if (this.transferMode === 'TIMEOUT') {
      throw new LogaUnavailableError('LOGA ไม่ตอบกลับภายในเวลาที่กำหนด (จำลอง)', true);
    }
    // Same reference again = the same transaction: LOGA does not add it twice.
    if (!this.references.has(reference)) {
      this.references.set(reference, points);
      this.added.set(cuid, (this.added.get(cuid) ?? 0) + points);
    }
    if (this.transferMode === 'LOST_RESPONSE') {
      throw new LogaUnavailableError('การเชื่อมต่อขาดก่อนได้รับคำตอบจาก LOGA (จำลอง)', true);
    }
    return { pointsNow: await this.balance(cuid) };
  }

  async testConnection() {
    await this.respond();
    return { cardName: 'GET POINT (LOGA จำลอง)' };
  }

  private async balance(cuid: string) {
    const ref = cuid.startsWith('P')
      ? { uid: null, pcardId: cuid.slice(1) }
      : { uid: cuid, pcardId: null };
    return (await this.getCustomer(ref))?.points ?? null;
  }

  private async respond(phone?: string) {
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (phone === MOCK_LOGA_DOWN_PHONE) throw new LogaUnavailableError();
  }
}
