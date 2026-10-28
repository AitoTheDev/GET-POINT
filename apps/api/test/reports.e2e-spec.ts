import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { randomBytes } from 'node:crypto';
import { ReceiptsService } from '../src/receipts/receipts.service';
import { TransferService } from '../src/transfers/transfer.service';
import { api, createTestApp, login, resetData } from './helpers';

const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(64)]);
const RANGE = 'from=2026-10-01&to=2026-10-31';

/** Binary body for supertest (xlsx downloads). */
const binary = (
  r: { on: (event: string, fn: (chunk?: Buffer) => void) => void },
  cb: (err: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  r.on('data', (c) => chunks.push(c!));
  r.on('end', () => cb(null, Buffer.concat(chunks)));
};

/** Dashboard, Reports, Activity Log and the notification bell (scoped numbers). */
describe('Reports, Activity Log and notifications (e2e)', () => {
  let app: INestApplication;
  let receipts: ReceiptsService;
  const prisma = new PrismaClient();
  let data: Awaited<ReturnType<typeof resetData>>;
  let admin: string;
  let staff: string;
  let manager: string;
  let shopA: { id: string };
  let shopB: { id: string };

  beforeAll(async () => {
    ({ app } = await createTestApp());
    receipts = app.get(ReceiptsService);
    app.get(TransferService).autoSend = false;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /**
   * October 2026 (Bangkok):
   * - Mall A: GP001 approved 680 (member 1, 6 Oct 01:30 = 5 Oct 18:30 UTC), GP002 waiting,
   *   GP003 rejected (member 2)
   * - Mall B: GP004 approved 250 (member 2)
   * - a receipt from September (outside the range)
   */
  beforeEach(async () => {
    data = await resetData(prisma);
    admin = (await login(app, 'admin@test.local')).token;
    staff = (await login(app, 'staff@test.local')).token; // Mall A only
    manager = (await login(app, 'manager@test.local')).token; // whole Community
    shopA = await prisma.shop.create({ data: { locationId: data.locA.id, name: 'Cafe A' } });
    shopB = await prisma.shop.create({ data: { locationId: data.locB.id, name: 'Shop B' } });
    for (const locationId of [data.locA.id, data.locB.id]) {
      await prisma.pointRule.create({
        data: { locationId, spendAmount: 25, points: 1, startDate: new Date('2026-01-01') },
      });
    }
    const m1 = await member('0811111111', '2026-09-20T03:00:00Z');
    const m2 = await member('0822222222', '2026-10-10T03:00:00Z');

    await submit(m1, '2026-10-05T18:30:00Z', {
      locationId: data.locA.id,
      shopId: shopA.id,
      amount: 680,
      decide: 'approve',
    });
    await submit(m1, '2026-10-07T03:00:00Z', { locationId: data.locA.id });
    await submit(m2, '2026-10-12T03:00:00Z', { locationId: data.locA.id, decide: 'reject' });
    await submit(m2, '2026-10-12T05:00:00Z', {
      locationId: data.locB.id,
      shopId: shopB.id,
      amount: 250,
      decide: 'approve',
    });
    await submit(m1, '2026-09-30T03:00:00Z', { locationId: data.locA.id });
    // Points were "created" on the receipt's day, for the date filters.
    for (const r of await prisma.receipt.findMany({ include: { transaction: true } })) {
      if (r.transaction) {
        await prisma.pointTransaction.update({
          where: { id: r.transaction.id },
          data: { createdAt: r.submittedAt },
        });
      }
    }
  });

  const member = (phone: string, createdAt: string) =>
    prisma.member.create({
      data: {
        communityId: data.community.id,
        phone,
        firstName: `M${phone.slice(-1)}`,
        createdAt: new Date(createdAt),
      },
    });

  async function submit(
    m: { id: string },
    submittedAt: string,
    o: { locationId: string; shopId?: string; amount?: number; decide?: 'approve' | 'reject' },
  ) {
    const sub = await receipts.createSubmission(m.id, [jpeg()], { channel: 'SAMPLE' });
    const receipt = sub.receipts[0];
    await prisma.receipt.update({
      where: { id: receipt.id },
      data: { submittedAt: new Date(submittedAt), locationId: o.locationId },
    });
    if (o.decide === 'approve') {
      await api(app, admin)
        .post(`/receipts/${receipt.id}/approve`)
        .send({
          locationId: o.locationId,
          shopId: o.shopId,
          receiptNo: receipt.code,
          receiptDate: submittedAt.slice(0, 10),
          amount: o.amount,
        })
        .expect(200);
    } else if (o.decide === 'reject') {
      await api(app, admin)
        .post(`/receipts/${receipt.id}/reject`)
        .send({ reason: 'UNREADABLE' })
        .expect(200);
    }
    return receipt;
  }

  describe('Dashboard', () => {
    it('counts the range, buckets by Bangkok day, and lists waiting receipts', async () => {
      const res = await api(app, admin).get(`/reports/dashboard?${RANGE}`).expect(200);
      expect(res.body.kpis).toEqual({
        members: 2,
        receiptsSubmitted: 4,
        waiting: 2, // includes the September one: "waiting now" ignores the range
        pointsGiven: 27 + 10,
      });
      expect(res.body.statuses).toEqual({ approved: 2, waiting: 1, rejected: 1, total: 4 });
      expect(res.body.trend).toHaveLength(31);
      // 5 Oct 18:30 UTC is 6 Oct in Bangkok.
      expect(res.body.trend.find((d: { day: string }) => d.day === '2026-10-05').count).toBe(0);
      expect(res.body.trend.find((d: { day: string }) => d.day === '2026-10-06').count).toBe(1);
      expect(res.body.trend.find((d: { day: string }) => d.day === '2026-10-12').count).toBe(2);
      expect(res.body.recentWaiting.map((r: { code: string }) => r.code)).toEqual([
        'GP002',
        'GP005',
      ]);
      expect(res.body.recentWaiting[0].member.phone).toBe('08X-XXX-1111');
    });

    it('a Location-scoped user only sees their Location; the Location filter narrows it', async () => {
      const own = await api(app, staff).get(`/reports/dashboard?${RANGE}`).expect(200);
      expect(own.body.kpis).toMatchObject({ receiptsSubmitted: 3, pointsGiven: 27 });
      // Asking for another Location gives nothing back from it.
      const other = await api(app, staff)
        .get(`/reports/dashboard?${RANGE}&locationId=${data.locB.id}`)
        .expect(200);
      expect(other.body.kpis).toMatchObject({ receiptsSubmitted: 0, pointsGiven: 0 });

      const b = await api(app, manager)
        .get(`/reports/dashboard?${RANGE}&locationId=${data.locB.id}`)
        .expect(200);
      expect(b.body.kpis).toEqual({
        members: 1,
        receiptsSubmitted: 1,
        waiting: 0,
        pointsGiven: 10,
      });
    });

    it('defaults to this month and refuses bad ranges', async () => {
      const res = await api(app, admin).get('/reports/dashboard').expect(200);
      expect(res.body.range.from).toMatch(/^\d{4}-\d{2}-01$/);
      await api(app, admin).get('/reports/dashboard?from=2026-10-10&to=2026-10-01').expect(400);
      await api(app, admin).get('/reports/dashboard?from=2025-01-01&to=2026-10-01').expect(400);
      await api(app, admin).get('/reports/dashboard?from=2026-02-31').expect(400);
    });
  });

  describe('Reports', () => {
    it('receipts: approved by default, per shop, with members counted once', async () => {
      const res = await api(app, admin).get(`/reports/receipts?${RANGE}`).expect(200);
      expect(res.body.kpis).toEqual({ receipts: 2, amount: 930, members: 2, pointsSent: 0 });
      expect(res.body.byShop.map((s: { shop: { name: string } }) => s.shop.name)).toEqual([
        'Cafe A',
        'Shop B',
      ]);

      const all = await api(app, admin).get(`/reports/receipts?${RANGE}&status=ALL`).expect(200);
      expect(all.body.kpis.receipts).toBe(4);
      const shop = await api(app, admin)
        .get(`/reports/receipts?${RANGE}&shopId=${shopB.id}`)
        .expect(200);
      expect(shop.body.kpis).toMatchObject({ receipts: 1, amount: 250 });
    });

    it('members: totals at the end of the range, new members, and who sent receipts', async () => {
      const res = await api(app, admin).get(`/reports/members?${RANGE}`).expect(200);
      expect(res.body.kpis).toEqual({
        totalAtEnd: 2,
        newInRange: 1,
        sendersInRange: 2,
        newSenders: 1,
      });
      expect(res.body.newMembersSending).toEqual({ sent: 1, notYet: 0 });
      const m1 = res.body.items.find((i: { phone: string }) => i.phone === '08X-XXX-1111');
      // September's receipt is outside the range; only the approved one counts as spend.
      expect(m1).toMatchObject({
        receiptsInRange: 2,
        approvedAmountInRange: 680,
        community: 'Community',
      });

      const sept = await api(app, admin)
        .get('/reports/members?from=2026-09-01&to=2026-09-30')
        .expect(200);
      expect(sept.body.kpis).toEqual({
        totalAtEnd: 1,
        newInRange: 1,
        sendersInRange: 1,
        newSenders: 1,
      });
    });

    it('LOGA: status counts, search by receipt code, scoped for staff', async () => {
      const res = await api(app, admin).get(`/reports/loga?${RANGE}`).expect(200);
      expect(res.body.kpis).toMatchObject({ pointsSent: 0, pending: 2, total: 2 });
      expect(res.body.items[0]).toMatchObject({ code: 'GP004', points: 10, reference: null });

      const found = await api(app, admin).get(`/reports/loga?${RANGE}&search=gp001`).expect(200);
      expect(found.body.items.map((i: { code: string }) => i.code)).toEqual(['GP001']);
      const own = await api(app, staff).get(`/reports/loga?${RANGE}`).expect(200);
      expect(own.body.items.map((i: { code: string }) => i.code)).toEqual(['GP001']);
    });

    it('exports Excel files and records the export', async () => {
      for (const report of ['dashboard', 'receipts', 'members', 'loga']) {
        const res = await api(app, admin)
          .get(`/reports/${report}/export?${RANGE}`)
          .buffer(true)
          .parse(binary)
          .expect(200);
        expect(res.headers['content-type']).toContain('spreadsheetml');
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(res.body as unknown as ArrayBuffer);
        expect(book.getWorksheet('สรุป')!.getCell('B2').value).toBe('1 ต.ค. 2569 – 31 ต.ค. 2569');
      }
      const logged = await prisma.auditLog.findMany({ where: { action: 'report.exported' } });
      expect(logged.map((l) => (l.metadata as { report: string }).report).sort()).toEqual([
        'dashboard',
        'loga',
        'members',
        'receipts',
      ]);
    });

    it('needs the right menu: no REPORTS view, no reports', async () => {
      await prisma.rolePermission.updateMany({
        where: { roleId: data.roles.STAFF, menu: 'REPORTS' },
        data: { canView: false },
      });
      const fresh = (await login(app, 'staff@test.local')).token;
      await api(app, fresh).get(`/reports/receipts?${RANGE}`).expect(403);
      await api(app, fresh).get(`/reports/members/export?${RANGE}`).expect(403);
      await api(app, fresh).get(`/reports/dashboard?${RANGE}`).expect(200);
    });
  });

  describe('Activity Log', () => {
    it('Staff see only their own actions; Admin sees everyone and can filter by person', async () => {
      await api(app, staff)
        .get(`/reports/receipts/export?${RANGE}`)
        .buffer(true)
        .parse(binary)
        .expect(200);

      const own = await api(app, staff).get('/activity-log').expect(200);
      expect(own.body.everyone).toBe(false);
      expect(own.body.items.length).toBeGreaterThan(0);
      expect(
        own.body.items.every(
          (i: { actor: { email: string } }) => i.actor.email === 'staff@test.local',
        ),
      ).toBe(true);
      // Asking for someone else's actions still returns only your own.
      const sneaky = await api(app, staff)
        .get(`/activity-log?actorId=${data.admin.id}`)
        .expect(200);
      expect(sneaky.body.total).toBe(own.body.total);
      expect(await api(app, staff).get('/activity-log/actors').expect(200)).toHaveProperty(
        'body',
        [],
      );

      const all = await api(app, admin).get('/activity-log?group=receipt').expect(200);
      expect(all.body.everyone).toBe(true);
      expect(all.body.items.every((i: { action: string }) => i.action.startsWith('receipt.'))).toBe(
        true,
      );
      expect(all.body.items.some((i: { target: string }) => i.target === 'GP001')).toBe(true);
      const byStaff = await api(app, admin)
        .get(`/activity-log?actorId=${data.staff.id}`)
        .expect(200);
      expect(byStaff.body.total).toBe(own.body.total);
    });

    it('searches the Thai wording and the item code', async () => {
      const approved = await api(app, admin)
        .get(`/activity-log?search=${encodeURIComponent('อนุมัติใบเสร็จ')}`)
        .expect(200);
      // "ไม่อนุมัติใบเสร็จ" contains the words too.
      expect(new Set(approved.body.items.map((i: { action: string }) => i.action))).toEqual(
        new Set(['receipt.approved', 'receipt.rejected']),
      );
      const code = await api(app, admin).get('/activity-log?search=GP004').expect(200);
      expect(code.body.items.map((i: { action: string }) => i.action)).toEqual([
        'receipt.approved',
      ]);
    });

    it('a role without Activity Log cannot open it', async () => {
      await prisma.rolePermission.updateMany({
        where: { roleId: data.roles.COMMUNITY_MANAGER, menu: 'ACTIVITY_LOG' },
        data: { canView: false },
      });
      const fresh = (await login(app, 'manager@test.local')).token;
      await api(app, fresh).get('/activity-log').expect(403);
    });
  });

  describe('Notifications', () => {
    it('shows transfers that stopped retrying and receipts waiting over 24 hours, within scope', async () => {
      const gp004 = await prisma.receipt.findUniqueOrThrow({ where: { code: 'GP004' } });
      await prisma.pointTransaction.update({
        where: { receiptId: gp004.id },
        data: { transferStatus: 'FAILED', nextAttemptAt: null, lastAttemptAt: new Date() },
      });

      const res = await api(app, admin).get('/notifications').expect(200);
      expect(res.body.items).toEqual([
        expect.objectContaining({ key: 'transfers-stopped', count: 1 }),
        expect.objectContaining({ key: 'receipts-waiting', count: 2 }),
      ]);
      expect(res.body.total).toBe(3);
      // The bell links to the receipt history filtered the same way.
      const linked = await api(app, admin).get('/receipts?transferStatus=NEEDS_RETRY').expect(200);
      expect(linked.body.items.map((r: { code: string }) => r.code)).toEqual(['GP004']);

      // Staff (Mall A): the failed send is at Mall B.
      const own = await api(app, staff).get('/notifications').expect(200);
      expect(own.body.items).toEqual([
        expect.objectContaining({ key: 'receipts-waiting', count: 2 }),
      ]);
      // No receipt menus: nothing to act on.
      expect((await api(app, manager).get('/notifications').expect(200)).body).toEqual({
        total: 0,
        items: [],
      });
    });

    it('a planned retry or a fresh receipt is not a notification', async () => {
      await prisma.receipt.updateMany({
        where: { status: 'PENDING_REVIEW' },
        data: { submittedAt: new Date() },
      });
      const res = await api(app, admin).get('/notifications').expect(200);
      expect(res.body).toEqual({ total: 0, items: [] });
    });
  });
});
