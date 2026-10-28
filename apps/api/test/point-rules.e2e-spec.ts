import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { api, createTestApp, login, resetData } from './helpers';

describe('Point rules (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  let data: Awaited<ReturnType<typeof resetData>>;
  let admin: string;
  let manager: string;
  let shopA: { id: string };
  let shopA2: { id: string };
  let shopB: { id: string };

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });
  beforeEach(async () => {
    data = await resetData(prisma);
    admin = (await login(app, 'admin@test.local')).token;
    manager = (await login(app, 'manager@test.local')).token;
    shopA = await prisma.shop.create({ data: { locationId: data.locA.id, name: 'Cafe A' } });
    shopA2 = await prisma.shop.create({ data: { locationId: data.locA.id, name: 'Bakery A' } });
    shopB = await prisma.shop.create({ data: { locationId: data.locB.id, name: 'Shop B' } });
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const base = { spendAmount: 25, points: 1, rounding: 'FLOOR', startDate: '2026-10-01' };
  const create = (token: string, body: Record<string, unknown>) =>
    api(app, token)
      .post('/point-rules')
      .send({ ...base, ...body });
  const resolve = (shopId: string, date: string, amount = 680, token = admin) =>
    api(app, token)
      .get(`/point-rules/resolve?shopId=${shopId}&date=${date}&amount=${amount}`)
      .expect(200)
      .then((r) => r.body);

  describe('create and resolve', () => {
    it('saves a Location rule as version 1 and gives 680 baht → 27 points', async () => {
      const res = await create(admin, { level: 'LOCATION', targetId: data.locA.id }).expect(201);
      expect(res.body).toMatchObject({
        level: 'LOCATION',
        location: { id: data.locA.id, code: 'LOC001' },
        community: null,
        shop: null,
        spendAmount: 25,
        points: 1,
        rounding: 'FLOOR',
        maxPoints: null,
        startDate: '2026-10-01',
        endDate: null,
        status: 'ACTIVE',
        version: 1,
        canManage: true,
      });

      const result = await resolve(shopA.id, '2026-10-15');
      expect(result.rule.id).toBe(res.body.id);
      expect(result.calculation).toEqual({ points: 27, exact: 27.2, capped: false });

      // Before the start date there is no rule: the receipt can't earn points.
      expect(await resolve(shopA.id, '2026-09-30')).toMatchObject({
        rule: null,
        calculation: null,
      });

      const versions = await api(app, admin)
        .get(`/point-rules/${res.body.id}/versions`)
        .expect(200);
      expect(versions.body).toEqual([expect.objectContaining({ version: 1, spendAmount: 25 })]);
    });

    it('uses Shop, then Location, then Community', async () => {
      await create(admin, {
        level: 'COMMUNITY',
        targetId: data.community.id,
        spendAmount: 50,
      }).expect(201);
      await create(admin, { level: 'LOCATION', targetId: data.locA.id, spendAmount: 25 }).expect(
        201,
      );
      await create(admin, {
        level: 'SHOP',
        targetId: shopA.id,
        spendAmount: 10,
        startDate: '2026-11-01',
        endDate: '2026-11-30',
      }).expect(201);

      // Shop rule inside its dates wins.
      let r = await resolve(shopA.id, '2026-11-15');
      expect([r.rule.level, r.calculation.points]).toEqual(['SHOP', 68]);
      // Outside its dates → Location rule.
      r = await resolve(shopA.id, '2026-12-01');
      expect([r.rule.level, r.calculation.points]).toEqual(['LOCATION', 27]);
      // Other shop at the same Location → Location rule.
      r = await resolve(shopA2.id, '2026-11-15');
      expect(r.rule.level).toBe('LOCATION');
      // Location without its own rule → Community rule.
      r = await resolve(shopB.id, '2026-11-15');
      expect([r.rule.level, r.calculation.points]).toEqual(['COMMUNITY', 13]);
    });

    it('ignores inactive rules and applies the maximum per receipt', async () => {
      await create(admin, { level: 'LOCATION', targetId: data.locA.id, maxPoints: 20 }).expect(201);
      await create(admin, {
        level: 'SHOP',
        targetId: shopA.id,
        spendAmount: 1,
        status: 'INACTIVE',
      }).expect(201);

      const r = await resolve(shopA.id, '2026-10-15');
      expect(r.rule.level).toBe('LOCATION');
      expect(r.calculation).toEqual({ points: 20, exact: 27.2, capped: true });
    });

    it('keeps a receipt age limit: 30 days by default, changeable or none', async () => {
      const rule = await create(admin, { level: 'LOCATION', targetId: data.locA.id }).expect(201);
      expect(rule.body.claimDays).toBe(30);

      const none = await api(app, admin)
        .patch(`/point-rules/${rule.body.id}`)
        .send({ claimDays: null })
        .expect(200);
      expect(none.body).toMatchObject({ claimDays: null, version: 2 });
      const seven = await api(app, admin)
        .patch(`/point-rules/${rule.body.id}`)
        .send({ claimDays: 7 })
        .expect(200);
      expect(seven.body.claimDays).toBe(7);

      const versions = await api(app, admin)
        .get(`/point-rules/${rule.body.id}/versions`)
        .expect(200);
      expect(versions.body.map((v: { claimDays: number | null }) => v.claimDays)).toEqual([
        7,
        null,
        30,
      ]);

      const bad = await create(admin, { level: 'SHOP', targetId: shopA.id, claimDays: -1 }).expect(
        400,
      );
      expect(bad.body.details).toContain('จำนวนวันต้องไม่ติดลบ');
    });

    it('rounds as chosen', async () => {
      await create(admin, { level: 'LOCATION', targetId: data.locA.id, rounding: 'CEIL' }).expect(
        201,
      );
      expect((await resolve(shopA.id, '2026-10-15', 680)).calculation.points).toBe(28);
    });
  });

  describe('validation', () => {
    it.each([
      [{ spendAmount: 0 }, 'ยอดใช้จ่ายต้องมากกว่า 0'],
      [{ spendAmount: 25.555 }, 'ยอดใช้จ่ายต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง'],
      [{ points: 1.5 }, 'จำนวนแต้มต้องเป็นจำนวนเต็ม'],
      [{ points: 0 }, 'จำนวนแต้มต้องอย่างน้อย 1'],
      [{ maxPoints: 0 }, 'แต้มสูงสุดต้องอย่างน้อย 1'],
      [{ startDate: '01/10/2569' }, 'วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD'],
    ])('rejects %j', async (body, message) => {
      const res = await create(admin, {
        level: 'LOCATION',
        targetId: data.locA.id,
        ...body,
      }).expect(400);
      expect(res.body.details).toContain(message);
    });

    it('rejects an end date before the start date, and impossible dates', async () => {
      const res = await create(admin, {
        level: 'LOCATION',
        targetId: data.locA.id,
        endDate: '2026-09-30',
      }).expect(400);
      expect(res.body.message).toBe('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มใช้');
      await create(admin, {
        level: 'LOCATION',
        targetId: data.locA.id,
        startDate: '2026-02-31',
      }).expect(400);
    });

    it('checks the place matches the level, and the place cannot be edited later', async () => {
      await create(admin, { level: 'LOCATION', targetId: shopA.id }).expect(404);
      await create(admin, { level: 'SHOP', targetId: data.locA.id }).expect(404);
      const rule = await create(admin, { level: 'LOCATION', targetId: data.locA.id }).expect(201);
      await api(app, admin)
        .patch(`/point-rules/${rule.body.id}`)
        .send({ targetId: data.locB.id })
        .expect(400);
    });

    it('enforces one place per rule in the database too', async () => {
      await expect(
        prisma.pointRule.create({
          data: {
            locationId: data.locA.id,
            shopId: shopA.id,
            spendAmount: 25,
            points: 1,
            startDate: new Date('2026-10-01'),
          },
        }),
      ).rejects.toThrow(/point_rules_one_target/);
    });
  });

  describe('overlapping dates', () => {
    it('blocks two active rules covering the same day at the same place', async () => {
      const first = await create(admin, { level: 'LOCATION', targetId: data.locA.id }).expect(201);
      const clash = await create(admin, {
        level: 'LOCATION',
        targetId: data.locA.id,
        startDate: '2027-01-01',
      }).expect(409);
      expect(clash.body.message).toContain('25 บาท = 1 แต้ม, 2026-10-01 – ไม่กำหนด');

      // Other places are independent.
      await create(admin, { level: 'LOCATION', targetId: data.locB.id }).expect(201);
      await create(admin, { level: 'SHOP', targetId: shopA.id }).expect(201);

      // End the first rule, then the new one fits.
      await api(app, admin)
        .patch(`/point-rules/${first.body.id}`)
        .send({ endDate: '2026-12-31' })
        .expect(200);
      await create(admin, {
        level: 'LOCATION',
        targetId: data.locA.id,
        startDate: '2027-01-01',
        spendAmount: 20,
      }).expect(201);
      expect((await resolve(shopA2.id, '2026-12-31')).rule.spendAmount).toBe(25);
      expect((await resolve(shopA2.id, '2027-01-01')).rule.spendAmount).toBe(20);
    });

    it('allows an overlapping rule while inactive, but not switching it on', async () => {
      await create(admin, { level: 'LOCATION', targetId: data.locA.id }).expect(201);
      const draft = await create(admin, {
        level: 'LOCATION',
        targetId: data.locA.id,
        status: 'INACTIVE',
      }).expect(201);
      await api(app, admin)
        .patch(`/point-rules/${draft.body.id}`)
        .send({ status: 'ACTIVE' })
        .expect(409);
    });

    it('lets only one of many simultaneous overlapping rules through', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          create(admin, {
            level: 'LOCATION',
            targetId: data.locA.id,
            startDate: `2026-12-${10 + i}`,
          }),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(9);
      expect(await prisma.pointRule.count()).toBe(1);
    });

    it('is guaranteed by the database, even bypassing the API', async () => {
      const row = (startDate: string, endDate: string | null, status: 'ACTIVE' | 'INACTIVE') =>
        prisma.pointRule.create({
          data: {
            locationId: data.locA.id,
            spendAmount: 25,
            points: 1,
            startDate: new Date(startDate),
            endDate: endDate ? new Date(endDate) : null,
            status,
          },
        });
      await row('2026-10-01', '2026-10-31', 'ACTIVE');
      // Same last day = overlap (ranges include both ends).
      await expect(row('2026-10-31', null, 'ACTIVE')).rejects.toThrow(/point_rules_no_overlap/);
      await row('2026-11-01', null, 'ACTIVE');
      await row('2026-10-15', null, 'INACTIVE');
    });

    it('refuses an edit based on an old version', async () => {
      const rule = await create(admin, { level: 'LOCATION', targetId: data.locA.id }).expect(201);
      const results = await Promise.all(
        [20, 30, 40].map((spendAmount) =>
          api(app, admin).patch(`/point-rules/${rule.body.id}`).send({ spendAmount }),
        ),
      );
      const statuses = results.map((r) => r.status);
      expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);
      const saved = await prisma.pointRule.findUniqueOrThrow({ where: { id: rule.body.id } });
      expect(await prisma.pointRuleVersion.count({ where: { ruleId: rule.body.id } })).toBe(
        saved.version,
      );
    });
  });

  describe('versions and audit', () => {
    it('keeps every version and logs what changed', async () => {
      const rule = await create(admin, { level: 'LOCATION', targetId: data.locA.id }).expect(201);
      const v2 = await api(app, admin)
        .patch(`/point-rules/${rule.body.id}`)
        .send({ spendAmount: 20, maxPoints: 100 })
        .expect(200);
      expect(v2.body).toMatchObject({ version: 2, spendAmount: 20, maxPoints: 100 });

      // Saving the same values again doesn't create a version.
      const same = await api(app, admin)
        .patch(`/point-rules/${rule.body.id}`)
        .send({ spendAmount: 20 })
        .expect(200);
      expect(same.body.version).toBe(2);

      const versions = await api(app, admin)
        .get(`/point-rules/${rule.body.id}/versions`)
        .expect(200);
      expect(
        versions.body.map((v: { version: number; spendAmount: number }) => [
          v.version,
          v.spendAmount,
        ]),
      ).toEqual([
        [2, 20],
        [1, 25],
      ]);
      expect(versions.body[0].changedBy).toMatchObject({ name: 'Admin' });

      const audit = await prisma.auditLog.findFirst({ where: { action: 'point_rule.updated' } });
      expect(audit?.metadata).toMatchObject({
        version: 2,
        changed: ['spendAmount', 'maxPoints'],
        before: { spendAmount: 25, maxPoints: null },
        after: { spendAmount: 20, maxPoints: 100 },
      });
    });
  });

  describe('permissions and scope', () => {
    it('needs the Point rules permission (Staff has none by default)', async () => {
      const staff = (await login(app, 'staff@test.local')).token;
      await api(app, staff).get('/point-rules').expect(403);
      await create(staff, { level: 'LOCATION', targetId: data.locA.id }).expect(403);
    });

    it('lets a Community Manager manage every level in their Community', async () => {
      await create(manager, { level: 'COMMUNITY', targetId: data.community.id }).expect(201);
      await create(manager, { level: 'LOCATION', targetId: data.locB.id }).expect(201);
      await create(manager, { level: 'SHOP', targetId: shopA.id }).expect(201);
      const list = await api(app, manager).get('/point-rules').expect(200);
      expect(list.body).toHaveLength(3);
      expect(list.body.every((r: { canManage: boolean }) => r.canManage)).toBe(true);
    });

    it('limits a Location-only user to that Location and its shops', async () => {
      const communityRule = await create(admin, {
        level: 'COMMUNITY',
        targetId: data.community.id,
      }).expect(201);
      await create(admin, { level: 'LOCATION', targetId: data.locB.id }).expect(201);

      // Staff (granted Mall A only) gets a role that can manage point rules.
      const role = await prisma.role.create({
        data: {
          key: 'RULES_A',
          name: 'Rules A',
          permissions: { create: [{ menu: 'POINT_RULES', canView: true, canManage: true }] },
        },
      });
      await prisma.user.update({ where: { id: data.staff.id }, data: { roleId: role.id } });
      const user = (await login(app, 'staff@test.local')).token;

      await create(user, { level: 'LOCATION', targetId: data.locA.id }).expect(201);
      await create(user, { level: 'SHOP', targetId: shopA.id }).expect(201);
      await create(user, { level: 'LOCATION', targetId: data.locB.id }).expect(404);
      await create(user, { level: 'SHOP', targetId: shopB.id }).expect(404);
      await create(user, {
        level: 'COMMUNITY',
        targetId: data.community.id,
        startDate: '2030-01-01',
      }).expect(403);

      // Sees the Community rule (it applies to Mall A) but can't change it; Mall B's rule is hidden.
      const list = await api(app, user).get('/point-rules').expect(200);
      const levels = list.body.map((r: { level: string; canManage: boolean }) => [
        r.level,
        r.canManage,
      ]);
      expect(levels).toEqual([
        ['COMMUNITY', false],
        ['LOCATION', true],
        ['SHOP', true],
      ]);
      await api(app, user)
        .patch(`/point-rules/${communityRule.body.id}`)
        .send({ points: 2 })
        .expect(403);

      await api(app, user)
        .get(`/point-rules/resolve?shopId=${shopB.id}&date=2026-10-15`)
        .expect(404);
      await api(app, user).get(`/point-rules/shops?locationId=${data.locB.id}`).expect(404);
      const options = await api(app, user).get('/point-rules/options').expect(200);
      expect(options.body.locations.map((l: { id: string }) => l.id)).toEqual([data.locA.id]);
      expect(options.body.communities).toEqual([
        expect.objectContaining({ id: data.community.id, canManage: false }),
      ]);
    });

    it('filters the list by Location: its own, its shops’ and its Community’s rules', async () => {
      await create(admin, { level: 'COMMUNITY', targetId: data.community.id }).expect(201);
      await create(admin, { level: 'LOCATION', targetId: data.locA.id }).expect(201);
      await create(admin, { level: 'SHOP', targetId: shopA.id }).expect(201);
      await create(admin, { level: 'LOCATION', targetId: data.locB.id }).expect(201);

      const res = await api(app, admin).get(`/point-rules?locationId=${data.locA.id}`).expect(200);
      expect(res.body.map((r: { level: string }) => r.level)).toEqual([
        'COMMUNITY',
        'LOCATION',
        'SHOP',
      ]);
    });
  });
});
