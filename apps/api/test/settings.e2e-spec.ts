import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { LogaService } from '../src/loga/loga.service';
import { ReceiptsService } from '../src/receipts/receipts.service';
import { TransferService } from '../src/transfers/transfer.service';
import { api, createTestApp, login, MailOutbox, resetData } from './helpers';

const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(64)]);

describe('Settings (e2e)', () => {
  let app: INestApplication;
  let outbox: MailOutbox;
  const prisma = new PrismaClient();
  let data: Awaited<ReturnType<typeof resetData>>;
  let admin: string;

  beforeAll(async () => {
    ({ app, outbox } = await createTestApp());
  });
  beforeEach(async () => {
    data = await resetData(prisma);
    admin = (await login(app, 'admin@test.local')).token;
    app.get(LogaService).mock!.reset();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const put = (key: string, value: unknown, token = admin) =>
    api(app, token).put(`/settings/${key}`).send({ value });

  it('shows defaults, LOGA and email status, and system information', async () => {
    const res = await api(app, admin).get('/settings').expect(200);
    expect(res.body.values).toMatchObject({
      transferRetry: { maxAttempts: 5, intervalMinutes: 5 },
      transferRemark: 'สะสมแต้มจากใบเสร็จ {code} · {shop}',
      uploadLimits: { maxFileMb: 10, maxFiles: 10 },
      defaultClaimDays: 30,
      supportContact: { phone: null, lineId: null },
    });
    expect(Object.keys(res.body.values.rejectReasons)).toHaveLength(9);
    expect(res.body.loga).toMatchObject({
      mode: 'mock',
      credentialsSet: false,
      mockTransferMode: 'SUCCESS',
      transfers: { pending: 0, failed: 0, unknown: 0, succeeded: 0, lastSentAt: null },
    });
    expect(res.body.email).toMatchObject({ configured: false });
    expect(res.body.system).toMatchObject({ database: 'up', environment: 'test', receipts: 0 });
    // Never any LOGA password or username in the answer.
    expect(JSON.stringify(res.body)).not.toMatch(/LOGA_PASSWORD|password/i);
  });

  it('saves a setting, records who changed it, and logs before/after', async () => {
    const res = await put('transferRetry', { maxAttempts: 3, intervalMinutes: 10 }).expect(200);
    expect(res.body).toEqual({
      key: 'transferRetry',
      value: { maxAttempts: 3, intervalMinutes: 10 },
    });

    const after = await api(app, admin).get('/settings').expect(200);
    expect(after.body.values.transferRetry).toEqual({ maxAttempts: 3, intervalMinutes: 10 });
    expect(after.body.changes.transferRetry).toMatchObject({ by: 'Admin' });
    const audit = await prisma.auditLog.findFirst({ where: { action: 'setting.updated' } });
    expect(audit?.metadata).toMatchObject({
      key: 'transferRetry',
      before: { maxAttempts: 5, intervalMinutes: 5 },
      after: { maxAttempts: 3, intervalMinutes: 10 },
    });
  });

  it('rejects bad values with Thai messages and never goes above the hard limits', async () => {
    let res = await put('uploadLimits', { maxFileMb: 11, maxFiles: 10 }).expect(400);
    expect(res.body.details).toContain('ขนาดไฟล์ต้องไม่เกิน 10');
    res = await put('uploadLimits', { maxFileMb: 5, maxFiles: 0 }).expect(400);
    expect(res.body.details).toContain('จำนวนไฟล์ต้องไม่น้อยกว่า 1');
    res = await put('transferRemark', '   ').expect(400);
    expect(res.body.details).toContain('กรุณากรอกข้อความ');
    res = await put('supportContact', { phone: '12345', lineId: null }).expect(400);
    expect(res.body.details).toContain('เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0');
    await put('supportContact', { phone: '02-123-4567', lineId: '@getpoint' }).expect(200);
    await put('defaultClaimDays', -1).expect(400);
    await put('defaultClaimDays', null).expect(200);
    await api(app, admin).put('/settings/nope').send({ value: 1 }).expect(404);
    await api(app, admin).put('/settings/transferRemark').send({}).expect(400);
  });

  it('needs the Settings permission: view to read, manage to change', async () => {
    const staff = (await login(app, 'staff@test.local')).token;
    await api(app, staff).get('/settings').expect(403);

    const role = await prisma.role.create({
      data: {
        key: 'SETTINGS_VIEW',
        name: 'Settings viewer',
        permissions: { create: [{ menu: 'SETTINGS', canView: true, canManage: false }] },
      },
    });
    await prisma.user.update({ where: { id: data.staff.id }, data: { roleId: role.id } });
    const viewer = (await login(app, 'staff@test.local')).token;
    await api(app, viewer).get('/settings').expect(200);
    await put('defaultClaimDays', 7, viewer).expect(403);
    await api(app, viewer).post('/settings/loga/test').expect(403);
  });

  it('edits reject reasons: wording reaches receipts, and a switched-off reason can’t be used', async () => {
    const current = (await api(app, admin).get('/settings').expect(200)).body.values.rejectReasons;
    await put('rejectReasons', {
      ...current,
      UNREADABLE: {
        ...current.UNREADABLE,
        label: 'ภาพเบลอ',
        memberMessage: 'กรุณาถ่ายรูปใหม่ให้ชัด',
        sortOrder: 20,
      },
      ALTERED: { ...current.ALTERED, enabled: false },
      OTHER: { ...current.OTHER, enabled: false }, // ignored: "Other" stays on
    }).expect(200);

    const config = await api(app, admin).get('/receipts/config').expect(200);
    const reasons = config.body.rejectReasons.map((r: { reason: string }) => r.reason);
    expect(reasons).not.toContain('ALTERED');
    expect(reasons).toContain('OTHER');
    expect(reasons.at(-1)).toBe('UNREADABLE');
    expect(config.body.uploadLimits).toEqual({ maxFileMb: 10, maxFiles: 10 });

    const member = await prisma.member.create({
      data: { communityId: data.community.id, phone: '0812341234', firstName: 'A' },
    });
    const sub = await app
      .get(ReceiptsService)
      .createSubmission(member.id, [jpeg(), jpeg()], { channel: 'SAMPLE' });
    const [a, b] = sub.receipts.sort((x, y) => x.sequence - y.sequence);
    const rejected = await api(app, admin)
      .post(`/receipts/${a.id}/reject`)
      .send({ reason: 'UNREADABLE' })
      .expect(200);
    expect(rejected.body).toMatchObject({
      rejectLabel: 'ภาพเบลอ',
      memberMessage: 'กรุณาถ่ายรูปใหม่ให้ชัด',
    });
    const off = await api(app, admin)
      .post(`/receipts/${b.id}/reject`)
      .send({ reason: 'ALTERED' })
      .expect(400);
    expect(off.body.message).toBe('เหตุผลนี้ถูกปิดใช้งานในหน้าตั้งค่า');
  });

  it('applies upload limits, default receipt age and the LOGA remark', async () => {
    await put('uploadLimits', { maxFileMb: 1, maxFiles: 2 }).expect(200);
    const member = await prisma.member.create({
      data: {
        communityId: data.community.id,
        phone: '0812341234',
        firstName: 'A',
        logaUid: '100001',
        logaLinkStatus: 'LINKED',
      },
    });
    const receipts = app.get(ReceiptsService);
    await expect(receipts.createSubmission(member.id, [jpeg(), jpeg(), jpeg()])).rejects.toThrow(
      'ไม่เกิน 2 ใบ',
    );
    const big = Buffer.alloc(1024 * 1024 + 1);
    jpeg().copy(big);
    await expect(receipts.createSubmission(member.id, [big])).rejects.toThrow('เกิน 1 MB');

    await put('defaultClaimDays', 14).expect(200);
    const options = await api(app, admin).get('/point-rules/options').expect(200);
    expect(options.body.defaultClaimDays).toBe(14);
    const rule = await api(app, admin)
      .post('/point-rules')
      .send({
        level: 'LOCATION',
        targetId: data.locA.id,
        spendAmount: 25,
        points: 1,
        rounding: 'FLOOR',
        startDate: '2026-01-01',
      })
      .expect(201);
    expect(rule.body.claimDays).toBe(14);

    await put('transferRemark', 'แต้มจาก {shop} (ใบเสร็จ {code})').expect(200);
    const shop = await prisma.shop.create({ data: { locationId: data.locA.id, name: 'Cafe A' } });
    const sub = await receipts.createSubmission(member.id, [jpeg()], { channel: 'SAMPLE' });
    await api(app, admin)
      .post(`/receipts/${sub.receipts[0].id}/approve`)
      .send({
        locationId: data.locA.id,
        shopId: shop.id,
        receiptNo: 'X1',
        receiptDate: new Date().toISOString().slice(0, 10),
        amount: 100,
      })
      .expect(200);
    await app.get(TransferService).runDue();
    const tx = await prisma.pointTransaction.findFirstOrThrow();
    expect(tx).toMatchObject({
      transferStatus: 'SUCCEEDED',
      remark: 'แต้มจาก Cafe A (ใบเสร็จ GP001)',
    });
  });

  it('tests LOGA, switches the mock LOGA behaviour, and sends a test email', async () => {
    const test = await api(app, admin).post('/settings/loga/test').expect(200);
    expect(test.body).toMatchObject({ ok: true, cardName: 'GET POINT (LOGA จำลอง)' });

    await api(app, admin).post('/settings/loga/mock-mode').send({ mode: 'TIMEOUT' }).expect(200);
    expect(app.get(LogaService).mock!.transferMode).toBe('TIMEOUT');
    await api(app, admin).post('/settings/loga/mock-mode').send({ mode: 'NOPE' }).expect(400);

    const mail = await api(app, admin).post('/settings/email/test').expect(200);
    expect(mail.body).toMatchObject({ ok: true, to: 'admin@test.local' });
    expect(outbox.sent[outbox.sent.length - 1]).toMatchObject({
      to: 'admin@test.local',
      subject: 'GET POINT: ทดสอบการส่งอีเมล',
    });

    const actions = (await prisma.auditLog.findMany({ select: { action: true } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining(['loga.connection_tested', 'loga.mock_mode_changed']),
    );
  });
});
