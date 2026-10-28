import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { LogaService } from '../src/loga/loga.service';
import { MOCK_LOGA_DOWN_PHONE, type MockLogaClient } from '../src/loga/mock-loga.client';
import { ReceiptsService } from '../src/receipts/receipts.service';
import { TransferService } from '../src/transfers/transfer.service';
import { api, createTestApp, login, resetData } from './helpers';

const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(64)]);

/** Sending approved points to LOGA (mock LOGA, switched between outcomes). */
describe('Point transfers to LOGA (e2e)', () => {
  let app: INestApplication;
  let receipts: ReceiptsService;
  let transfers: TransferService;
  let mock: MockLogaClient;
  const prisma = new PrismaClient();
  let data: Awaited<ReturnType<typeof resetData>>;
  let admin: string;
  let shop: { id: string };

  beforeAll(async () => {
    ({ app } = await createTestApp());
    receipts = app.get(ReceiptsService);
    transfers = app.get(TransferService);
    mock = app.get(LogaService).mock!;
  });
  beforeEach(async () => {
    data = await resetData(prisma);
    admin = (await login(app, 'admin@test.local')).token;
    mock.reset();
    transfers.autoSend = false;
    shop = await prisma.shop.create({ data: { locationId: data.locA.id, name: 'Cafe A' } });
    await prisma.pointRule.create({
      data: {
        locationId: data.locA.id,
        spendAmount: 25,
        points: 1,
        startDate: new Date('2026-01-01'),
      },
    });
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** A member already linked to the mock LOGA (uid 100001, 520 points there). */
  const linkedMember = () =>
    prisma.member.create({
      data: {
        communityId: data.community.id,
        phone: '0812341234',
        firstName: 'สมชาย',
        logaUid: '100001',
        logaLinkStatus: 'LINKED',
      },
    });

  /** Submit and approve one receipt (680 baht → 27 points); returns receipt + transaction. */
  async function approved(memberId: string, receiptNo = 'A1') {
    const sub = await receipts.createSubmission(memberId, [jpeg()], { channel: 'SAMPLE' });
    const receipt = sub.receipts[0];
    await api(app, admin)
      .post(`/receipts/${receipt.id}/approve`)
      .send({
        locationId: data.locA.id,
        shopId: shop.id,
        receiptNo,
        receiptDate: new Date().toISOString().slice(0, 10),
        amount: 680,
      })
      .expect(200);
    const tx = await prisma.pointTransaction.findUniqueOrThrow({
      where: { receiptId: receipt.id },
    });
    return { receipt, tx };
  }
  const reload = (id: string) => prisma.pointTransaction.findUniqueOrThrow({ where: { id } });
  /** Make a planned retry due now. */
  const makeDue = (id: string) =>
    prisma.pointTransaction.update({ where: { id }, data: { nextAttemptAt: new Date() } });

  it('waits as "PENDING", due now, then sends with the remark and records the attempt', async () => {
    const member = await linkedMember();
    const { receipt, tx } = await approved(member.id);
    expect(tx).toMatchObject({ transferStatus: 'PENDING', attempts: 0, reference: 'GP001' });
    expect(tx.nextAttemptAt).not.toBeNull();

    expect(await transfers.runDue()).toBe(1);
    const sent = await reload(tx.id);
    expect(sent).toMatchObject({
      transferStatus: 'SUCCEEDED',
      attempts: 1,
      remark: 'สะสมแต้มจากใบเสร็จ GP001 · Cafe A',
      pointsAfter: 547,
      lastError: null,
      nextAttemptAt: null,
    });
    expect(sent.sentAt).not.toBeNull();
    expect(mock.pointsFor('GP001')).toBe(27);

    const attempts = await api(app, admin).get(`/receipts/${receipt.id}/transfer`).expect(200);
    expect(attempts.body).toEqual([
      expect.objectContaining({ attempt: 1, result: 'SUCCEEDED', triggeredBy: null }),
    ]);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'transfer.succeeded' } });
    expect(audit).toMatchObject({ actorId: null, entityId: receipt.id });
    // Nothing more to do.
    expect(await transfers.runDue()).toBe(0);
  });

  it('on a LOGA refusal: FAILED, retried automatically later, and a staff retry works', async () => {
    const member = await linkedMember();
    const { receipt, tx } = await approved(member.id);
    mock.transferMode = 'FAIL';
    await transfers.runDue();

    let after = await reload(tx.id);
    expect(after).toMatchObject({ transferStatus: 'FAILED', attempts: 1 });
    expect(after.lastError).toBe('LOGA ตอบกลับ: ไม่สามารถเพิ่มแต้มได้ (จำลอง)');
    // Next automatic try in 5 minutes (default setting), not now.
    const wait = after.nextAttemptAt!.getTime() - Date.now();
    expect(wait).toBeGreaterThan(4 * 60_000);
    expect(wait).toBeLessThanOrEqual(5 * 60_000);
    expect(await transfers.runDue()).toBe(0);

    mock.transferMode = 'SUCCESS';
    const res = await api(app, admin).post(`/receipts/${receipt.id}/transfer/retry`).expect(200);
    expect(res.body.transaction).toMatchObject({ transferStatus: 'SUCCEEDED', attempts: 2 });
    after = await reload(tx.id);
    expect(after.nextAttemptAt).toBeNull();

    const attempts = await prisma.pointTransferAttempt.findMany({
      where: { transactionId: tx.id },
      orderBy: { attempt: 'asc' },
    });
    expect(attempts.map((a) => [a.attempt, a.result, Boolean(a.triggeredById)])).toEqual([
      [1, 'FAILED', false],
      [2, 'SUCCEEDED', true],
    ]);
  });

  it('on a timeout: UNKNOWN (nothing added) — resending adds the points once', async () => {
    const member = await linkedMember();
    const { tx } = await approved(member.id);
    mock.transferMode = 'TIMEOUT';
    await transfers.runDue();
    const after = await reload(tx.id);
    expect(after.transferStatus).toBe('UNKNOWN');
    expect(after.lastError).toContain('ไม่ทราบว่า LOGA เพิ่มแต้มแล้วหรือไม่');
    expect(mock.pointsFor('GP001')).toBeNull();

    mock.transferMode = 'SUCCESS';
    await makeDue(tx.id);
    await transfers.runDue();
    expect(await reload(tx.id)).toMatchObject({ transferStatus: 'SUCCEEDED', pointsAfter: 547 });
  });

  it('when LOGA added the points but the reply was lost, the resend does not add them twice', async () => {
    const member = await linkedMember();
    const { tx } = await approved(member.id);
    mock.transferMode = 'LOST_RESPONSE';
    await transfers.runDue();
    expect((await reload(tx.id)).transferStatus).toBe('UNKNOWN');
    expect(mock.pointsFor('GP001')).toBe(27); // LOGA did add them

    mock.transferMode = 'SUCCESS';
    await makeDue(tx.id);
    await transfers.runDue();
    // Same reference → LOGA kept one transaction: 520 + 27, not 520 + 54.
    expect(await reload(tx.id)).toMatchObject({ transferStatus: 'SUCCEEDED', pointsAfter: 547 });
  });

  it('stops retrying after the configured number of attempts; staff can still retry', async () => {
    await api(app, admin)
      .put('/settings/transferRetry')
      .send({ value: { maxAttempts: 2, intervalMinutes: 1 } })
      .expect(200);
    const member = await linkedMember();
    const { receipt, tx } = await approved(member.id);
    mock.transferMode = 'FAIL';
    await transfers.runDue();
    expect((await reload(tx.id)).nextAttemptAt).not.toBeNull();
    await makeDue(tx.id);
    await transfers.runDue();
    const after = await reload(tx.id);
    expect(after).toMatchObject({ transferStatus: 'FAILED', attempts: 2, nextAttemptAt: null });

    mock.transferMode = 'SUCCESS';
    await api(app, admin).post(`/receipts/${receipt.id}/transfer/retry`).expect(200);
    expect((await reload(tx.id)).transferStatus).toBe('SUCCEEDED');
  });

  it('never sends the same transaction twice at once, and refuses retrying a sent one', async () => {
    const member = await linkedMember();
    const { receipt, tx } = await approved(member.id);
    const results = await Promise.all([
      transfers.send(tx.id),
      transfers.send(tx.id),
      transfers.runDue(),
    ]);
    expect(results.filter((r) => r && typeof r === 'object')).toHaveLength(1);
    expect(await prisma.pointTransferAttempt.count()).toBe(1);

    const again = await api(app, admin).post(`/receipts/${receipt.id}/transfer/retry`).expect(409);
    expect(again.body.message).toContain('ส่งสำเร็จแล้ว');
  });

  it('marks a send interrupted mid-way (e.g. API restart) as UNKNOWN, then retries it', async () => {
    const member = await linkedMember();
    const { tx } = await approved(member.id);
    await prisma.pointTransaction.update({
      where: { id: tx.id },
      data: {
        transferStatus: 'PROCESSING',
        lastAttemptAt: new Date(Date.now() - 11 * 60_000),
        nextAttemptAt: null,
      },
    });
    expect(await transfers.recoverStuck()).toBe(1);
    expect((await reload(tx.id)).transferStatus).toBe('UNKNOWN');
    await transfers.runDue();
    expect((await reload(tx.id)).transferStatus).toBe('SUCCEEDED');
  });

  it('links a member to LOGA first when needed, or fails clearly if LOGA is down', async () => {
    const fresh = await prisma.member.create({
      data: { communityId: data.community.id, phone: '0861112222', firstName: 'ใหม่' },
    });
    const { tx } = await approved(fresh.id, 'B1');
    await transfers.runDue();
    expect((await reload(tx.id)).transferStatus).toBe('SUCCEEDED');
    expect(await prisma.member.findUniqueOrThrow({ where: { id: fresh.id } })).toMatchObject({
      logaLinkStatus: 'LINKED',
    });

    const down = await prisma.member.create({
      data: { communityId: data.community.id, phone: MOCK_LOGA_DOWN_PHONE, firstName: 'X' },
    });
    const second = await approved(down.id, 'B2');
    await transfers.runDue();
    const after = await reload(second.tx.id);
    // Linking failed before anything was sent: certainly not added.
    expect(after.transferStatus).toBe('FAILED');
    expect(after.lastError).toContain('เชื่อมสมาชิกกับ LOGA ไม่สำเร็จ');
  });

  it('sends right after approval when automatic sending is on', async () => {
    transfers.autoSend = true;
    const member = await linkedMember();
    const { tx } = await approved(member.id);
    for (let i = 0; i < 50 && (await reload(tx.id)).transferStatus !== 'SUCCEEDED'; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect((await reload(tx.id)).transferStatus).toBe('SUCCEEDED');
  });

  it('shows the transfer on the receipt, filters history, and limits retry to Review "manage"', async () => {
    const member = await linkedMember();
    const { receipt, tx } = await approved(member.id);
    mock.transferMode = 'FAIL';
    await transfers.runDue();

    const detail = await api(app, admin).get(`/receipts/${receipt.id}`).expect(200);
    expect(detail.body.transaction).toMatchObject({
      transferStatus: 'FAILED',
      attempts: 1,
      lastError: 'LOGA ตอบกลับ: ไม่สามารถเพิ่มแต้มได้ (จำลอง)',
    });
    const failed = await api(app, admin).get('/receipts?transferStatus=FAILED').expect(200);
    expect(failed.body.items.map((r: { id: string }) => r.id)).toEqual([receipt.id]);
    expect(
      (await api(app, admin).get('/receipts?transferStatus=SUCCEEDED').expect(200)).body.total,
    ).toBe(0);

    const role = await prisma.role.create({
      data: {
        key: 'HISTORY',
        name: 'History',
        permissions: { create: [{ menu: 'RECEIPT_HISTORY', canView: true, canManage: false }] },
      },
    });
    await prisma.user.update({ where: { id: data.staff.id }, data: { roleId: role.id } });
    const viewer = (await login(app, 'staff@test.local')).token;
    await api(app, viewer).get(`/receipts/${receipt.id}/transfer`).expect(200);
    await api(app, viewer).post(`/receipts/${receipt.id}/transfer/retry`).expect(403);
    expect((await reload(tx.id)).attempts).toBe(1);
  });
});
