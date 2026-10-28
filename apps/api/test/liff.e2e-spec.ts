import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { LogaService } from '../src/loga/loga.service';
import { SmsService } from '../src/liff/sms.service';
import { TransferService } from '../src/transfers/transfer.service';
import { api, createTestApp, login, resetData } from './helpers';

const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(64)]);
const LINE_A = 'Ua0000000000000000000000000000001';
const LINE_B = 'Ub0000000000000000000000000000002';

/** The member app: LINE sign-in (mock), sign-up / link by phone, SMS codes, receipts, points. */
describe('Member app (LIFF) (e2e)', () => {
  let app: INestApplication;
  let sms: SmsService;
  const prisma = new PrismaClient();
  let data: Awaited<ReturnType<typeof resetData>>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app } = await createTestApp());
    sms = app.get(SmsService);
    app.get(TransferService).autoSend = false;
  });
  beforeEach(async () => {
    data = await resetData(prisma);
    sms.mock!.sent.length = 0;
    app.get(LogaService).mock!.reset();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Sign in as a (mock) LINE user; returns the member-app token. */
  async function signIn(lineUserId = LINE_A, name = 'น้องเอ') {
    const res = await http()
      .post('/api/liff/session')
      .send({ idToken: `mock:${lineUserId}:${name}` })
      .expect(200);
    return res.body as { token: string; member: Record<string, unknown> | null };
  }
  const as = (token: string) => ({
    get: (url: string) => http().get(`/api/liff${url}`).set('Authorization', `Bearer ${token}`),
    post: (url: string) => http().post(`/api/liff${url}`).set('Authorization', `Bearer ${token}`),
  });
  const register = (token: string, body: Record<string, unknown> = {}) =>
    as(token)
      .post('/register')
      .send({ communityId: data.community.id, phone: '081-555-1234', firstName: 'เอ', ...body });

  describe('sign-in', () => {
    it('config is public and lists only active Communities', async () => {
      await prisma.community.create({ data: { name: 'Closed', status: 'INACTIVE' } });
      const res = await http().get('/api/liff/config').expect(200);
      expect(res.body).toMatchObject({
        lineMode: 'mock',
        verifyPhone: false,
        uploadLimits: { maxFileMb: 10, maxFiles: 10 },
      });
      expect(res.body.communities).toEqual([{ id: data.community.id, name: 'Community' }]);
    });

    it('signs in with a LINE ID token; member is null until sign-up', async () => {
      const s = await signIn();
      expect(s.member).toBeNull();
      expect((await as(s.token).get('/me').expect(200)).body).toEqual({
        displayName: 'น้องเอ',
        member: null,
      });
      await http().post('/api/liff/session').send({ idToken: 'not-a-token' }).expect(401);
    });

    it('member and staff tokens are not interchangeable', async () => {
      const s = await signIn();
      const staff = (await login(app, 'admin@test.local')).token;
      await api(app, s.token).get('/members').expect(401);
      const res = await as(staff).get('/me').expect(401);
      expect(res.body.code).toBe('LIFF_LOGIN');
    });
  });

  describe('sign-up', () => {
    it('creates a LINE member, links LOGA, and never signs up twice', async () => {
      const s = await signIn();
      const res = await register(s.token, { lastName: 'บี' }).expect(201);
      expect(res.body).toEqual({
        linkedExisting: false,
        member: {
          code: 'M0001',
          phone: '0815551234',
          community: { id: data.community.id, name: 'Community' },
          status: 'ACTIVE',
          logaLinked: true,
        },
      });
      const saved = await prisma.member.findUniqueOrThrow({ where: { lineUserId: LINE_A } });
      expect(saved).toMatchObject({ channel: 'LINE', firstName: 'เอ', lastName: 'บี' });
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'member.registered_line' },
      });
      expect(audit).toMatchObject({ actorId: null, entityId: saved.id });

      expect((await signIn()).member).toMatchObject({ code: 'M0001' });
      await register(s.token).expect(409);
    });

    it('links the member staff already added, without revealing their name', async () => {
      const staffMade = await prisma.member.create({
        data: {
          communityId: data.community.id,
          phone: '0815551234',
          firstName: 'ชื่อจริง',
          lastName: 'ที่เก็บไว้',
        },
      });
      const s = await signIn();
      const res = await register(s.token, { firstName: 'คนอื่น' }).expect(201);
      expect(res.body.linkedExisting).toBe(true);
      expect(res.body.member.code).toBe(staffMade.code);
      expect(JSON.stringify(res.body)).not.toContain('ชื่อจริง');
      const after = await prisma.member.findUniqueOrThrow({ where: { id: staffMade.id } });
      // The stored name stays; only the LINE account is attached.
      expect(after).toMatchObject({ firstName: 'ชื่อจริง', lineUserId: LINE_A, channel: 'CMS' });
      expect(await prisma.member.count()).toBe(1);

      // Another LINE account can't take the same phone.
      const other = await signIn(LINE_B);
      const clash = await register(other.token).expect(409);
      expect(clash.body.message).toContain('ติดต่อเจ้าหน้าที่');
    });

    it('validates the phone and the Community', async () => {
      const s = await signIn();
      await register(s.token, { phone: '021234567' }).expect(400);
      const closed = await prisma.community.create({
        data: { name: 'Closed', status: 'INACTIVE' },
      });
      await register(s.token, { communityId: closed.id }).expect(400);
    });
  });

  describe('SMS phone check (switched on in Settings)', () => {
    beforeEach(async () => {
      await prisma.setting.create({ data: { key: 'memberSignup', value: { verifyPhone: true } } });
    });
    const lastCode = () => sms.mock!.sent[sms.mock!.sent.length - 1].text.match(/\d{6}/)![0];

    it('needs the code that was texted to that phone', async () => {
      const s = await signIn();
      const none = await register(s.token).expect(400);
      expect(none.body.code).toBe('CODE_REQUIRED');

      const sent = await as(s.token).post('/phone-code').send({ phone: '0815551234' }).expect(200);
      expect(sent.body).toMatchObject({ phone: '08X-XXX-1234', expiresInSeconds: 300 });
      expect(sms.mock!.sent).toHaveLength(1);
      expect(sms.mock!.sent[0].phone).toBe('0815551234');
      // The code itself is never stored.
      const row = await prisma.phoneVerification.findFirstOrThrow();
      expect(row.codeHash).not.toContain(lastCode());

      const wrong = await register(s.token, {
        code: lastCode() === '000000' ? '111111' : '000000',
      }).expect(400);
      expect(wrong.body.code).toBe('CODE_WRONG');
      // A code for another phone doesn't work either.
      await register(s.token, { phone: '0815550000', code: lastCode() }).expect(400);

      await register(s.token, { code: lastCode() }).expect(201);
      expect((await prisma.phoneVerification.findFirstOrThrow()).usedAt).not.toBeNull();
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'member.registered_line' },
      });
      expect(audit.metadata).toMatchObject({ phoneVerified: true });
    });

    it('limits resends and wrong guesses', async () => {
      const s = await signIn();
      await as(s.token).post('/phone-code').send({ phone: '0815551234' }).expect(200);
      const again = await as(s.token).post('/phone-code').send({ phone: '0815551234' }).expect(429);
      expect(again.body.code).toBe('CODE_WAIT');

      const good = lastCode();
      const bad = good === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) await register(s.token, { code: bad }).expect(400);
      const locked = await register(s.token, { code: good }).expect(400);
      expect(locked.body.code).toBe('CODE_EXPIRED');
    });

    it('is refused while switched off', async () => {
      await prisma.setting.deleteMany();
      const s = await signIn();
      await as(s.token).post('/phone-code').send({ phone: '0815551234' }).expect(400);
      expect(sms.mock!.sent).toHaveLength(0);
    });
  });

  describe('receipts and points', () => {
    async function member() {
      const s = await signIn();
      await register(s.token).expect(201);
      return s.token;
    }
    const upload = (token: string, count: number) => {
      const req = as(token).post('/receipts');
      for (let i = 0; i < count; i++) req.attach('files', jpeg(), `r${i}.jpg`);
      return req;
    };

    it('needs sign-up first', async () => {
      const s = await signIn();
      const res = await upload(s.token, 1).expect(403);
      expect(res.body.code).toBe('NOT_REGISTERED');
    });

    it('sends receipts into the review queue and shows their status to the member', async () => {
      const token = await member();
      const res = await upload(token, 2).expect(201);
      expect(res.body).toEqual({ receipts: [{ code: 'GP001' }, { code: 'GP002' }] });
      const sub = await prisma.submission.findFirstOrThrow({ include: { receipts: true } });
      expect(sub.channel).toBe('LIFF');
      expect(sub.receipts.map((r) => r.status)).toEqual(['PENDING_REVIEW', 'PENDING_REVIEW']);

      const admin = (await login(app, 'admin@test.local')).token;
      await api(app, admin)
        .post(`/receipts/${sub.receipts[0].id}/reject`)
        .send({ reason: 'UNREADABLE' })
        .expect(200);
      await api(app, admin)
        .post(`/receipts/${sub.receipts[1].id}/needs-check`)
        .send({ note: 'ดูอีกที' });

      const mine = await as(token).get('/receipts').expect(200);
      const byCode = Object.fromEntries(mine.body.map((r: { code: string }) => [r.code, r]));
      expect(byCode.GP001).toMatchObject({
        status: 'REJECTED',
        rejectMessage: 'รูปภาพไม่ชัดเจน อ่านไม่ได้',
      });
      // "Needs another look" is still just "waiting" to the member.
      expect(byCode.GP002).toMatchObject({ status: 'PENDING_REVIEW', rejectMessage: null });
    });

    it('enforces the file count, the daily limit and suspension', async () => {
      const token = await member();
      const tooMany = await upload(token, 11).expect(400);
      expect(tooMany.body.message).toContain('10');

      const m = await prisma.member.findUniqueOrThrow({ where: { lineUserId: LINE_A } });
      // 49 receipts in the last 24 hours (a submission holds at most 10).
      for (let n = 0; n < 49; n += 10) {
        const sub = await prisma.submission.create({ data: { memberId: m.id } });
        await prisma.receipt.createMany({
          data: Array.from({ length: Math.min(10, 49 - n) }, (_, i) => ({
            submissionId: sub.id,
            sequence: i + 1,
            memberId: m.id,
            imagePath: `x/${n + i}.jpg`,
            imageMime: 'image/jpeg',
            imageSize: 10,
            imageSha256: `h${n + i}`,
          })),
        });
      }
      const limit = await upload(token, 2).expect(429);
      expect(limit.body.code).toBe('DAILY_LIMIT');
      // The member gets the real reason, not the generic "too many requests".
      expect(limit.body.message).toContain('50 ใบต่อวัน');
      await upload(token, 1).expect(201);

      await prisma.member.update({ where: { id: m.id }, data: { status: 'SUSPENDED' } });
      expect((await upload(token, 1).expect(403)).body.code).toBe('SUSPENDED');
    });

    it('shows live points from LOGA', async () => {
      const token = await member();
      expect((await as(token).get('/points').expect(200)).body).toEqual({
        status: 'OK',
        points: 0,
      });
    });
  });
});
