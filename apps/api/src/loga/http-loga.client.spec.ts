import { HttpLogaClient, parseCustomer } from './http-loga.client';
import { LogaRequestError, LogaUnavailableError } from './loga.types';

const config = {
  baseUrl: 'https://loga.test/api',
  username: 'demo@loga.app',
  password: 'secret',
  deviceId: 'TEST-DEVICE',
  cardId: '195',
  timeoutMs: 1000,
};

type Reply = { status?: number; body: unknown } | Error;

/** Fake fetch that answers each LOGA path from a queue and records the form fields sent. */
function fakeLoga(replies: Record<string, Reply[]>) {
  const calls: { path: string; form: Record<string, string> }[] = [];
  const fetchFn = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace(`${config.baseUrl}/`, '');
    calls.push({ path, form: Object.fromEntries(new URLSearchParams(String(init?.body))) });
    const reply = replies[path]?.shift();
    if (!reply) throw new Error(`unexpected call ${path}`);
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  });
  return { client: new HttpLogaClient(config, fetchFn as typeof fetch), calls };
}

const loginOk = (token = 'tok-1') => ({ body: { code: 200, msg: 'ok', data: { token } } });
const customer = { code: 200, msg: 'ok', data: { card: { uid: '103140', pcard_no: null } } };

describe('HttpLogaClient', () => {
  it('logs in with the MD5 password once, then reuses the token', async () => {
    const { client, calls } = fakeLoga({
      'main/login': [loginOk()],
      'main/get_customer_info': [{ body: customer }, { body: customer }],
    });

    await client.findCustomerByPhone('0891234567');
    await client.getCustomer({ uid: '103140', pcardId: null });

    expect(calls.map((c) => c.path)).toEqual([
      'main/login',
      'main/get_customer_info',
      'main/get_customer_info',
    ]);
    expect(calls[0].form).toEqual({
      user: 'demo@loga.app',
      pass: '5ebe2294ecd0e0f08eab7690d2a6ee69', // md5("secret")
      uuid: 'TEST-DEVICE',
    });
    expect(calls[1].form).toEqual({
      cuid: '0891234567',
      token: 'tok-1',
      uuid: 'TEST-DEVICE',
      card_id: '195',
    });
    expect(calls[2].form.cuid).toBe('103140');
  });

  it('asks for members we created with "P" + pcard_id', async () => {
    const { client, calls } = fakeLoga({
      'main/login': [loginOk()],
      'main/get_customer_info': [{ body: customer }],
    });
    await client.getCustomer({ uid: null, pcardId: '770788' });
    expect(calls[1].form.cuid).toBe('P770788');
  });

  it('logs in again once when LOGA rejects the saved token', async () => {
    const { client, calls } = fakeLoga({
      'main/login': [loginOk('old'), loginOk('new')],
      'main/get_customer_info': [
        { body: customer },
        { body: { code: 401, msg: 'invalid token' } },
        { body: customer },
      ],
    });
    await client.findCustomerByPhone('0891234567');
    const found = await client.findCustomerByPhone('0891234567');

    expect(found?.uid).toBe('103140');
    expect(calls.filter((c) => c.path === 'main/login')).toHaveLength(2);
    expect(calls[calls.length - 1].form.token).toBe('new');
  });

  it('treats a non-200 customer answer as "not a member"', async () => {
    const { client } = fakeLoga({
      'main/login': [loginOk()],
      'main/get_customer_info': [{ body: { code: 404, msg: 'not found' } }],
    });
    await expect(client.findCustomerByPhone('0812345678')).resolves.toBeNull();
  });

  it('creates a member with the phone as serial and barcode', async () => {
    const { client, calls } = fakeLoga({
      'main/login': [loginOk()],
      'main/subscribe_by_unregistered_card': [
        { body: { code: 200, msg: 'ok', data: { pcard_id: 770788, credit: 0, status: 'D' } } },
      ],
    });
    await expect(
      client.createCustomer({ phone: '0891112222', name: 'คุณลูกค้า' }),
    ).resolves.toEqual({
      uid: null,
      pcardId: '770788',
    });
    expect(calls[1].form).toMatchObject({
      serial: '0891112222',
      barcode: '0891112222',
      mobile: '0891112222',
      fname: 'คุณลูกค้า',
    });
  });

  it('reports a refused create as a LOGA error', async () => {
    const { client } = fakeLoga({
      'main/login': [loginOk()],
      'main/subscribe_by_unregistered_card': [{ body: { code: 400, msg: 'duplicate mobile' } }],
    });
    await expect(client.createCustomer({ phone: '0891112222', name: 'x' })).rejects.toBeInstanceOf(
      LogaRequestError,
    );
  });

  it.each<[string, Reply]>([
    ['network failure', new Error('ECONNREFUSED')],
    ['HTTP 502', { status: 502, body: {} }],
    ['non-LOGA JSON', { body: { hello: 'world' } }],
  ])('throws LogaUnavailableError on %s', async (_, reply) => {
    const { client } = fakeLoga({ 'main/login': [reply] });
    await expect(client.findCustomerByPhone('0812345678')).rejects.toBeInstanceOf(
      LogaUnavailableError,
    );
  });

  it('fails clearly when the LOGA login is wrong', async () => {
    const { client } = fakeLoga({ 'main/login': [{ body: { code: 401, msg: 'wrong password' } }] });
    await expect(client.findCustomerByPhone('0812345678')).rejects.toThrow(/เข้าสู่ระบบ LOGA/);
  });
});

describe('HttpLogaClient.addPoints', () => {
  const input = { cuid: 'P770788', points: 27, cost: 680, remark: 'สะสมแต้ม', reference: 'GP001' };
  const refused = Object.assign(new TypeError('fetch failed'), {
    cause: { code: 'ECONNREFUSED' },
  });
  const timedOut = Object.assign(new Error('The operation was aborted due to timeout'), {
    name: 'TimeoutError',
  });

  it('sends our points (no formula) with the receipt code as reference', async () => {
    const { client, calls } = fakeLoga({
      'main/login': [loginOk()],
      'points/add_customer_point': [
        { body: { code: 200, msg: 'ok', data: { point: { now: '547' } } } },
      ],
    });
    await expect(client.addPoints(input)).resolves.toEqual({ pointsNow: 547 });
    expect(calls[1].form).toEqual({
      cuid: 'P770788',
      point: '27',
      cost: '680.00',
      remark: 'สะสมแต้ม',
      reference: 'GP001',
      token: 'tok-1',
      uuid: 'TEST-DEVICE',
      card_id: '195',
    });
  });

  it('reports a LOGA error answer as a request error (nothing was added)', async () => {
    const { client } = fakeLoga({
      'main/login': [loginOk()],
      'points/add_customer_point': [{ body: { code: 400, msg: 'no member' } }],
    });
    await expect(client.addPoints(input)).rejects.toBeInstanceOf(LogaRequestError);
  });

  it.each<[string, Reply, boolean]>([
    ['connection refused', refused, false],
    ['timeout', timedOut, true],
    ['HTTP 502', { status: 502, body: {} }, true],
    ['HTTP 404', { status: 404, body: {} }, false],
    ['a reply that is not LOGA JSON', { body: 'oops' }, true],
  ])('on %s: maybe processed = %s', async (_, reply, maybe) => {
    const { client } = fakeLoga({
      'main/login': [loginOk()],
      'points/add_customer_point': [reply],
    });
    const err = await client.addPoints(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LogaUnavailableError);
    expect((err as LogaUnavailableError).maybeProcessed).toBe(maybe);
  });

  it('counts a login timeout as "not sent": the points request never went out', async () => {
    const { client, calls } = fakeLoga({ 'main/login': [timedOut] });
    const err = (await client.addPoints(input).catch((e: unknown) => e)) as LogaUnavailableError;
    expect(err.maybeProcessed).toBe(false);
    expect(calls.map((c) => c.path)).toEqual(['main/login']);
  });

  it('tests the connection by logging in again and reading the card', async () => {
    const { client, calls } = fakeLoga({
      'main/login': [loginOk('a'), loginOk('b')],
      'main/get_card_detail': [
        { body: { code: 200, data: { name: 'GET POINT' } } },
        { body: { code: 200, data: { name: 'GET POINT' } } },
      ],
    });
    await expect(client.testConnection()).resolves.toEqual({ cardName: 'GET POINT' });
    await client.testConnection();
    expect(calls.filter((c) => c.path === 'main/login')).toHaveLength(2);
  });
});

describe('parseCustomer', () => {
  it('reads the documented member IDs plus points, name and level', () => {
    expect(
      parseCustomer({
        card: { uid: '103140', pcard_id: null },
        point: { now: '10', expiring: 0 },
        customer: { fname: 'สมชาย', lname: 'ใจดี', birthday: '1990-01-31' },
        level: { name: 'Gold' },
      }),
    ).toEqual({
      uid: '103140',
      pcardId: null,
      name: 'สมชาย ใจดี',
      birthday: '1990-01-31',
      level: 'Gold',
      points: 10,
    });
  });

  it('gives null fields instead of failing on an unknown layout', () => {
    expect(parseCustomer({ card: { pcard_id: 770788 } })).toEqual({
      uid: null,
      pcardId: '770788',
      name: null,
      birthday: null,
      level: null,
      points: null,
    });
    expect(parseCustomer({ card: {} })).toBeNull();
    expect(parseCustomer(null)).toBeNull();
  });
});
