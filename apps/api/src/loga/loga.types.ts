/**
 * LOGA (https://loga.app/api) is the points system. GET POINT talks to it only from the
 * server, through LogaClient. LOGA_MODE picks the implementation: the built-in mock for
 * development/tests, or the real HTTP API (see http-loga.client.ts).
 */

/** How LOGA identifies a member: `uid` for LINE/app members, `pcardId` for members we create. */
export interface LogaMemberRef {
  uid: string | null;
  pcardId: string | null;
}

/** Member data read live from LOGA (Get customer info). Fields LOGA leaves out are null. */
export interface LogaCustomer extends LogaMemberRef {
  name: string | null;
  birthday: string | null;
  level: string | null;
  points: number | null;
}

/** LOGA could not be reached or answered with something unusable (timeout, 5xx, bad JSON). */
export class LogaUnavailableError extends Error {
  constructor(
    message = 'ไม่สามารถเชื่อมต่อ LOGA ได้ในขณะนี้',
    /**
     * true when the request may have reached LOGA and been carried out (timeout, dropped
     * connection, 5xx): the outcome is unknown. false when it certainly never arrived
     * (connection refused, login failed).
     */
    readonly maybeProcessed = false,
  ) {
    super(message);
  }
}

/** LOGA answered, but with an error code (e.g. phone already registered). */
export class LogaRequestError extends Error {
  constructor(
    readonly code: string,
    readonly logaMessage: string,
  ) {
    super(`LOGA ตอบกลับข้อผิดพลาด (${code}): ${logaMessage}`);
  }
}

export abstract class LogaClient {
  /** Find a member by Thai mobile number ("0812345678"). null = not a LOGA member. */
  abstract findCustomerByPhone(phone: string): Promise<LogaCustomer | null>;

  /** Read a member by their LOGA ID. null = LOGA does not know this ID. */
  abstract getCustomer(ref: LogaMemberRef): Promise<LogaCustomer | null>;

  /** Register a new LOGA member with only a phone number (subscribe_by_unregistered_card). */
  abstract createCustomer(input: { phone: string; name: string }): Promise<LogaMemberRef>;

  /**
   * Give a member points (add_customer_point). LOGA treats a repeated `reference` as the same
   * transaction and does not add it twice, so sending again after an unknown outcome is safe.
   */
  abstract addPoints(input: AddPointsInput): Promise<AddPointsResult>;

  /** Log in and read the card: proves the settings work. */
  abstract testConnection(): Promise<{ cardName: string | null }>;
}

export interface AddPointsInput {
  /** uid, or "P" + pcard_id (see logaCuid). */
  cuid: string;
  points: number;
  /** Receipt amount, kept by LOGA for information. */
  cost: number;
  /** Shown to the member in LOGA. */
  remark: string;
  /** Unique per transaction (the receipt code). */
  reference: string;
}

export interface AddPointsResult {
  /** The member's balance after this, if LOGA reports it. */
  pointsNow: number | null;
}

/**
 * The value LOGA accepts as `cuid`: the uid, or "P" + pcard_id for members we created
 * (documented shortcut in "Add customer points").
 */
export function logaCuid(ref: LogaMemberRef): string | null {
  if (ref.uid) return ref.uid;
  if (ref.pcardId) return `P${ref.pcardId}`;
  return null;
}
