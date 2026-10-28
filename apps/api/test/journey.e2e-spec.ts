import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { LogaService } from '../src/loga/loga.service';
import { TransferService } from '../src/transfers/transfer.service';
import { api, createTestApp, login, resetData } from './helpers';

const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(64)]);

/**
 * The whole journey through the public API: a shopper signs up in LINE, sends a receipt,
 * staff (scoped to Mall A) review and approve it, points reach LOGA, and the member sees them.
 */
describe('Full journey (e2e)', () => {
  let app: INestApplication;
  let transfers: TransferService;
  const prisma = new PrismaClient();
  let data: Awaited<ReturnType<typeof resetData>>;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    transfers = app.get(TransferService);
    transfers.autoSend = false;
  });
  beforeEach(async () => {
    data = await resetData(prisma);
    app.get(LogaService).mock!.reset();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('LINE sign-up → receipt → staff approval → LOGA points → member sees them', async () => {
    // Set-up by staff: a participating shop and a rule (25 baht = 1 point) at Mall A.
    const shop = await prisma.shop.create({ data: { locationId: data.locA.id, name: 'Cafe A' } });
    await prisma.pointRule.create({
      data: {
        locationId: data.locA.id,
        spendAmount: 25,
        points: 1,
        startDate: new Date('2026-01-01'),
      },
    });

    // 1. The member signs in with LINE and signs up.
    const http = () => request(app.getHttpServer());
    const session = await http()
      .post('/api/liff/session')
      .send({ idToken: 'mock:Ujourney:นักช้อป' })
      .expect(200);
    const member = (path: string) => ({
      get: () =>
        http().get(`/api/liff${path}`).set('Authorization', `Bearer ${session.body.token}`),
      post: () =>
        http().post(`/api/liff${path}`).set('Authorization', `Bearer ${session.body.token}`),
    });
    const signup = await member('/register')
      .post()
      .send({ communityId: data.community.id, phone: '0891234567', firstName: 'นักช้อป' })
      .expect(201);
    expect(signup.body.member).toMatchObject({ code: 'M0001', logaLinked: true });

    // 2. They send a receipt photo.
    const sent = await member('/receipts').post().attach('files', jpeg(), 'r.jpg').expect(201);
    const code = sent.body.receipts[0].code;
    expect((await member('/receipts').get().expect(200)).body[0]).toMatchObject({
      code,
      status: 'PENDING_REVIEW',
    });

    // 3. Staff (Mall A only) find it in the queue, type the details, and approve.
    const staff = (await login(app, 'staff@test.local')).token;
    const queue = await api(app, staff).get('/receipts?status=PENDING_REVIEW').expect(200);
    expect(queue.body.items).toHaveLength(1);
    const receipt = queue.body.items[0];
    const details = {
      locationId: data.locA.id,
      shopId: shop.id,
      receiptNo: 'INV-0001',
      receiptDate: new Date().toISOString().slice(0, 10),
      amount: 680,
    };
    const check = await api(app, staff).get(
      `/receipts/${receipt.id}/check?${new URLSearchParams({ ...details, amount: '680' })}`,
    );
    expect(check.status).toBe(200);
    expect(check.body.calculation.points).toBe(27);
    expect(check.body.problems.filter((p: { blocking: boolean }) => p.blocking)).toEqual([]);
    await api(app, staff).post(`/receipts/${receipt.id}/approve`).send(details).expect(200);

    // 4. The points go to LOGA (the scheduler's job, run once here).
    expect(await transfers.runDue()).toBe(1);
    const tx = await prisma.pointTransaction.findFirstOrThrow();
    expect(tx).toMatchObject({ transferStatus: 'SUCCEEDED', points: 27, reference: code });

    // 5. The member sees the approval, the points on the receipt, and the LOGA balance.
    const mine = await member('/receipts').get().expect(200);
    expect(mine.body[0]).toMatchObject({
      code,
      status: 'APPROVED',
      points: 27,
      pointsAdded: true,
      shop: 'Cafe A',
      amount: 680,
    });
    expect((await member('/points').get().expect(200)).body).toEqual({ status: 'OK', points: 27 });

    // 6. It shows up in staff reports and the Activity Log.
    const admin = (await login(app, 'admin@test.local')).token;
    const loga = await api(app, admin).get('/reports/loga').expect(200);
    expect(loga.body.kpis).toMatchObject({ pointsSent: 27, succeeded: 1 });
    const actions = (await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        'member.registered_line',
        'receipt.submitted',
        'receipt.approved',
        'transfer.succeeded',
      ]),
    );
  });
});
