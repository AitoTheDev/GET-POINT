import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { MOCK_LOGA_DOWN_PHONE } from '../src/loga/mock-loga.client';
import { api, createTestApp, login, resetData } from './helpers';

/** LOGA_MODE defaults to "mock", so these tests use the built-in fake LOGA. */
describe('Members (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  let data: Awaited<ReturnType<typeof resetData>>;
  let admin: string;
  let staff: string;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });
  beforeEach(async () => {
    data = await resetData(prisma);
    admin = (await login(app, 'admin@test.local')).token;
    staff = (await login(app, 'staff@test.local')).token;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const create = (token: string, body: Record<string, unknown>) =>
    api(app, token)
      .post('/members')
      .send({ communityId: data.community.id, ...body });

  const otherCommunity = () =>
    prisma.community.create({ data: { name: 'Other', locations: { create: { name: 'Mall Z' } } } });

  describe('create', () => {
    it('normalises the phone, numbers members M0001, M0002 and registers them in LOGA', async () => {
      const first = await create(admin, {
        phone: '+66 86 111 2222',
        firstName: ' ลูกค้า ',
        lastName: 'ใหม่',
      }).expect(201);
      expect(first.body).toMatchObject({
        code: 'M0001',
        phone: '0861112222',
        firstName: 'ลูกค้า',
        lastName: 'ใหม่',
        status: 'ACTIVE',
        channel: 'CMS',
        lineLinked: false,
        logaLinkStatus: 'LINKED',
        logaLinkError: null,
        community: { id: data.community.id },
      });
      // Created in LOGA → identified by "P" + pcard_id.
      expect(first.body.logaId).toMatch(/^P\d+$/);
      expect(first.body).not.toHaveProperty('logaUid');
      expect(first.body).not.toHaveProperty('lineUserId');

      const second = await create(admin, { phone: '086-111-3333', firstName: 'B' }).expect(201);
      expect(second.body.code).toBe('M0002');
    });

    it('links to an existing LOGA member instead of creating one', async () => {
      const res = await create(admin, { phone: '0812341234', firstName: 'สมชาย' }).expect(201);
      expect(res.body).toMatchObject({ logaLinkStatus: 'LINKED', logaId: '100001' });

      const audit = await prisma.auditLog.findFirst({ where: { action: 'member.loga_linked' } });
      expect(audit?.metadata).toMatchObject({ logaId: '100001', createdInLoga: false });
    });

    it('keeps the member when LOGA is down, and the link can be retried', async () => {
      const res = await create(admin, { phone: MOCK_LOGA_DOWN_PHONE, firstName: 'X' }).expect(201);
      expect(res.body).toMatchObject({
        code: 'M0001',
        logaLinkStatus: 'ERROR',
        logaLinkError: 'ไม่สามารถเชื่อมต่อ LOGA ได้ในขณะนี้',
      });
      expect(res.body.logaCheckedAt).toBeTruthy();

      const retry = await api(app, admin).post(`/members/${res.body.id}/loga-link`).expect(200);
      expect(retry.body.logaLinkStatus).toBe('ERROR');
      expect(await prisma.member.count()).toBe(1);
    });

    it('rejects numbers that are not Thai mobiles, with a Thai message', async () => {
      for (const phone of ['021234567', '0712345678', '08123456', 'abc']) {
        const res = await create(admin, { phone, firstName: 'X' }).expect(400);
        expect(res.body.details).toContain(
          'เบอร์มือถือต้องมี 10 หลัก และขึ้นต้นด้วย 06, 08 หรือ 09',
        );
      }
      await create(admin, { phone: '0812345678' }).expect(400);
      await create(admin, { phone: '0812345678', firstName: 'X', loyalty: 1 }).expect(400);
    });

    it('allows a phone once per Community', async () => {
      await create(admin, { phone: '0861112222', firstName: 'A' }).expect(201);
      const dup = await create(admin, { phone: '086-111-2222', firstName: 'B' }).expect(409);
      expect(dup.body.message).toContain('M0001');

      const other = await otherCommunity();
      await create(admin, { communityId: other.id, phone: '0861112222', firstName: 'C' }).expect(
        201,
      );
    });

    it('lets only one of two simultaneous requests for the same phone through', async () => {
      const results = await Promise.all([
        create(admin, { phone: '0861115555', firstName: 'A' }),
        create(admin, { phone: '0861115555', firstName: 'B' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    it('refuses an inactive Community', async () => {
      await prisma.community.update({
        where: { id: data.community.id },
        data: { status: 'INACTIVE' },
      });
      await create(admin, { phone: '0861112222', firstName: 'A' }).expect(400);
    });
  });

  describe('permissions and scope', () => {
    it('lets Staff with a Location grant work with members of that Location’s Community', async () => {
      const res = await create(staff, { phone: '0861112222', firstName: 'A' }).expect(201);
      await api(app, staff).get(`/members/${res.body.id}`).expect(200);
      const list = await api(app, staff).get('/members').expect(200);
      expect(list.body.total).toBe(1);
    });

    it('hides members of other Communities (404) and blocks adding to them', async () => {
      const other = await otherCommunity();
      const outside = await create(admin, {
        communityId: other.id,
        phone: '0861112222',
        firstName: 'Outside',
      }).expect(201);

      const list = await api(app, staff).get('/members').expect(200);
      expect(list.body.items).toHaveLength(0);
      await api(app, staff).get(`/members/${outside.body.id}`).expect(404);
      await api(app, staff)
        .patch(`/members/${outside.body.id}`)
        .send({ firstName: 'x' })
        .expect(404);
      await api(app, staff).post(`/members/${outside.body.id}/loga-link`).expect(404);
      await create(staff, { communityId: other.id, phone: '0861113333', firstName: 'B' }).expect(
        404,
      );

      const options = await api(app, staff).get('/members/communities').expect(200);
      expect(options.body.map((c: { id: string }) => c.id)).toEqual([data.community.id]);

      const balances = await api(app, staff)
        .get(`/members/balances?ids=${outside.body.id}`)
        .expect(200);
      expect(balances.body).toEqual([]);
    });

    it('requires the Members permission (Community Manager has none by default)', async () => {
      const manager = (await login(app, 'manager@test.local')).token;
      await api(app, manager).get('/members').expect(403);
      await api(app, manager).get('/members/summary').expect(403);
      await create(manager, { phone: '0861112222', firstName: 'A' }).expect(403);
    });

    it('needs "manage" to add or edit; "view" can only read', async () => {
      const role = await prisma.role.create({
        data: {
          key: 'VIEWER',
          name: 'Viewer',
          permissions: { create: [{ menu: 'MEMBERS', canView: true, canManage: false }] },
        },
      });
      await prisma.user.update({ where: { id: data.staff.id }, data: { roleId: role.id } });
      const viewer = (await login(app, 'staff@test.local')).token;

      const member = await create(admin, { phone: '0861112222', firstName: 'A' }).expect(201);
      await api(app, viewer).get(`/members/${member.body.id}`).expect(200);
      await api(app, viewer).get('/members/export').expect(200);
      await create(viewer, { phone: '0861113333', firstName: 'B' }).expect(403);
      await api(app, viewer)
        .patch(`/members/${member.body.id}`)
        .send({ status: 'SUSPENDED' })
        .expect(403);
      await api(app, viewer).post(`/members/${member.body.id}/loga-link`).expect(403);
    });
  });

  describe('update', () => {
    it('suspends and reactivates a member, with audit entries', async () => {
      const m = await create(admin, { phone: '0861112222', firstName: 'A' }).expect(201);
      const suspended = await api(app, admin)
        .patch(`/members/${m.body.id}`)
        .send({ status: 'SUSPENDED', note: 'ส่งใบเสร็จปลอม' })
        .expect(200);
      expect(suspended.body).toMatchObject({ status: 'SUSPENDED', note: 'ส่งใบเสร็จปลอม' });
      await api(app, admin).patch(`/members/${m.body.id}`).send({ status: 'ACTIVE' }).expect(200);

      const actions = await prisma.auditLog.findMany({
        where: { entityId: m.body.id },
        orderBy: { createdAt: 'asc' },
        select: { action: true, metadata: true },
      });
      expect(actions.map((a) => a.action)).toEqual([
        'member.created',
        'member.loga_linked',
        'member.suspended',
        'member.reactivated',
      ]);
      expect(actions[2].metadata).toMatchObject({ changed: ['note', 'status'] });
      // The audit log never holds the full phone number.
      expect(JSON.stringify(actions)).not.toContain('0861112222');
    });

    it('does not let a linked member’s phone change, but fixes a phone that failed to link', async () => {
      const linked = await create(admin, { phone: '0861112222', firstName: 'A' }).expect(201);
      const blocked = await api(app, admin)
        .patch(`/members/${linked.body.id}`)
        .send({ phone: '0861119999' })
        .expect(400);
      expect(blocked.body.message).toContain('LOGA');

      const failed = await create(admin, { phone: MOCK_LOGA_DOWN_PHONE, firstName: 'B' }).expect(
        201,
      );
      const fixed = await api(app, admin)
        .patch(`/members/${failed.body.id}`)
        .send({ phone: '0812341234' })
        .expect(200);
      expect(fixed.body).toMatchObject({
        phone: '0812341234',
        logaLinkStatus: 'LINKED',
        logaId: '100001',
        logaLinkError: null,
      });
    });

    it('can clear the last name and note, and blocks moving to a taken phone', async () => {
      const a = await create(admin, {
        phone: MOCK_LOGA_DOWN_PHONE,
        firstName: 'A',
        lastName: 'L',
        note: 'n',
      });
      await create(admin, { phone: '0861112222', firstName: 'B' }).expect(201);
      const cleared = await api(app, admin)
        .patch(`/members/${a.body.id}`)
        .send({ lastName: '', note: '  ' })
        .expect(200);
      expect(cleared.body).toMatchObject({ lastName: null, note: null });
      await api(app, admin)
        .patch(`/members/${a.body.id}`)
        .send({ phone: '0861112222' })
        .expect(409);
      await api(app, admin)
        .patch(`/members/${a.body.id}`)
        .send({ communityId: data.community.id })
        .expect(400);
    });
  });

  describe('list, summary and export', () => {
    async function seedMembers() {
      const rows = [
        { phone: '0812341234', firstName: 'สมชาย', lastName: 'ใจดี', at: '2025-09-15T05:00:00Z' },
        { phone: '0812345678', firstName: 'สมหญิง', lastName: 'มีสุข', at: '2025-10-01T05:00:00Z' },
        {
          phone: '0922223333',
          firstName: 'วิชัย',
          lastName: 'รักดี',
          at: '2025-10-05T05:00:00Z',
          suspended: true,
        },
      ];
      for (const r of rows) {
        await prisma.member.create({
          data: {
            communityId: data.community.id,
            phone: r.phone,
            firstName: r.firstName,
            lastName: r.lastName,
            status: r.suspended ? 'SUSPENDED' : 'ACTIVE',
            createdAt: new Date(r.at),
          },
        });
      }
    }
    const codes = (body: { items: { code: string }[] }) => body.items.map((m) => m.code);

    it('searches by name, full name, code and phone in any format', async () => {
      await seedMembers();
      const search = async (q: string) =>
        codes(
          (
            await api(app, admin)
              .get(`/members?search=${encodeURIComponent(q)}`)
              .expect(200)
          ).body,
        );

      expect(await search('สมหญิง')).toEqual(['M0002']);
      expect(await search('สมชาย ใจดี')).toEqual(['M0001']);
      expect(await search('m0003')).toEqual(['M0003']);
      expect(await search('081-234')).toEqual(['M0001', 'M0002']);
      expect(await search('+66 92')).toEqual(['M0003']);
      expect(await search('ไม่มีคนนี้')).toEqual([]);
    });

    it('filters by status and registration date (Bangkok days), and pages', async () => {
      await seedMembers();
      const get = (q: string) => api(app, admin).get(`/members?${q}`).expect(200);

      expect(codes((await get('status=SUSPENDED')).body)).toEqual(['M0003']);
      expect(codes((await get('registeredFrom=2025-10-01&registeredTo=2025-10-04')).body)).toEqual([
        'M0002',
      ]);
      const page2 = (await get('page=2&pageSize=2')).body;
      expect(page2).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      expect(codes(page2)).toEqual(['M0003']);

      await api(app, admin).get('/members?registeredFrom=1/10/2569').expect(400);
      await api(app, admin).get('/members?pageSize=500').expect(400);
    });

    it('counts KPI cards within scope', async () => {
      await seedMembers();
      const now = await create(admin, { phone: '0861112222', firstName: 'ใหม่' }).expect(201);
      expect(now.body.code).toBe('M0004');

      const summary = await api(app, admin).get('/members/summary').expect(200);
      expect(summary.body).toEqual({ total: 4, newThisMonth: 1, withReceipts: 0, active: 3 });
    });

    it('returns live LOGA points per member, and LOGA details', async () => {
      const linked = await create(admin, { phone: '0812343456', firstName: 'พิมพ์ชนก' }).expect(
        201,
      );
      const notLinked = await create(admin, { phone: MOCK_LOGA_DOWN_PHONE, firstName: 'X' }).expect(
        201,
      );

      const balances = await api(app, admin)
        .get(`/members/balances?ids=${linked.body.id},${notLinked.body.id}`)
        .expect(200);
      expect(balances.body).toEqual(
        expect.arrayContaining([
          { id: linked.body.id, status: 'OK', points: 860 },
          { id: notLinked.body.id, status: 'NOT_LINKED', points: null },
        ]),
      );

      const detail = await api(app, admin).get(`/members/${linked.body.id}/loga`).expect(200);
      expect(detail.body).toEqual({
        status: 'OK',
        customer: expect.objectContaining({ uid: '100004', points: 860, level: 'Platinum' }),
      });
      const none = await api(app, admin).get(`/members/${notLinked.body.id}/loga`).expect(200);
      expect(none.body).toEqual({ status: 'NOT_LINKED', customer: null });

      await api(app, admin).get('/members/balances?ids=not-a-uuid').expect(400);
      await api(app, admin).get('/members/balances').expect(400);
    });

    it('exports the filtered members to Excel and logs it', async () => {
      await seedMembers();
      const res = await api(app, admin)
        .get('/members/export?status=ACTIVE')
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const sheet = workbook.getWorksheet('สมาชิก')!;
      expect(sheet.rowCount).toBe(3);
      expect(sheet.getRow(2).getCell(1).value).toBe('M0001');
      expect(sheet.getRow(2).getCell(4).value).toBe('081-234-1234');
      expect(sheet.getRow(2).getCell(11).value).toBe('15/09/2568');

      const audit = await prisma.auditLog.findFirst({ where: { action: 'member.exported' } });
      expect(audit?.metadata).toMatchObject({ rows: 2, filters: { status: 'ACTIVE' } });
    });
  });
});
