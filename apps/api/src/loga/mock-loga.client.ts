import {
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
 * In-memory stand-in for LOGA (LOGA_MODE=mock). Members created here are lost when the API
 * restarts; a pcard_id it doesn't know is then reported as a member with 0 points.
 */
export class MockLogaClient extends LogaClient {
  private readonly byPhone = new Map<string, LogaCustomer>();
  private nextPcard = 770001;

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
    for (const customer of this.byPhone.values()) {
      if (
        (ref.uid && customer.uid === ref.uid) ||
        (ref.pcardId && customer.pcardId === ref.pcardId)
      ) {
        return customer;
      }
    }
    if (ref.pcardId) {
      return {
        uid: null,
        pcardId: ref.pcardId,
        name: null,
        birthday: null,
        level: 'Basic',
        points: 0,
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

  private async respond(phone?: string) {
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (phone === MOCK_LOGA_DOWN_PHONE) throw new LogaUnavailableError();
  }
}
