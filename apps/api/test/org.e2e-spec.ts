import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { api, createTestApp, login, resetData } from './helpers';

describe('Communities, Locations & Shops (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  let data: Awaited<ReturnType<typeof resetData>>;
  let admin: string;
  let manager: string;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });
  beforeEach(async () => {
    data = await resetData(prisma);
    admin = (await login(app, 'admin@test.local')).token;
    manager = (await login(app, 'manager@test.local')).token;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const category = (name: string) =>
    api(app, admin)
      .post('/shop-categories')
      .send({ name })
      .expect(201)
      .then((r) => r.body.id as string);

  const shop = (token: string, body: Record<string, unknown>) =>
    api(app, token).post('/shops').send(body);

  /** A user with a custom role (SHOPS manage) limited to one Location. */
  async function locationOnlyUser() {
    const role = await prisma.role.create({
      data: {
        key: 'LOC_ONLY',
        name: 'Location only',
        permissions: { create: [{ menu: 'SHOPS', canView: true, canManage: true }] },
      },
    });
    await prisma.user.update({
      where: { id: data.staff.id },
      data: { roleId: role.id },
    });
    return (await login(app, 'staff@test.local')).token;
  }

  describe('auto-generated codes', () => {
    it('continues COM/LOC numbering and starts shops at S001', async () => {
      const com = await api(app, admin).post('/communities').send({ name: 'Second' }).expect(201);
      expect(com.body.code).toBe('COM002');

      const loc = await api(app, admin)
        .post('/locations')
        .send({ communityId: com.body.id, name: 'Mall C', province: 'เชียงใหม่' })
        .expect(201);
      expect(loc.body).toMatchObject({ code: 'LOC003', province: 'เชียงใหม่', status: 'ACTIVE' });

      const s1 = await shop(admin, { locationId: data.locA.id, name: 'ร้านกาแฟ A' }).expect(201);
      const s2 = await shop(admin, { locationId: data.locA.id, name: 'ร้านอาหาร B' }).expect(201);
      expect([s1.body.code, s2.body.code]).toEqual(['S001', 'S002']);
    });

    it('stays unique when many shops are created at the same time', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          shop(admin, { locationId: data.locA.id, name: `Shop ${i}` }),
        ),
      );
      const codes = results.map((r) => r.body.code).sort();
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(new Set(codes).size).toBe(10);
      expect(codes[0]).toBe('S001');
      expect(codes[9]).toBe('S010');
    });

    it('ignores a code sent by the client', async () => {
      await api(app, admin)
        .post('/locations')
        .send({ communityId: data.community.id, name: 'X', code: 'HACK' })
        .expect(400);
    });
  });

  describe('scope', () => {
    let otherCommunityId: string;
    let otherLocationId: string;

    beforeEach(async () => {
      const com = await api(app, admin).post('/communities').send({ name: 'Other' }).expect(201);
      otherCommunityId = com.body.id;
      const loc = await api(app, admin)
        .post('/locations')
        .send({ communityId: otherCommunityId, name: 'Other Mall' })
        .expect(201);
      otherLocationId = loc.body.id;
    });

    it('admin sees everything', async () => {
      const res = await api(app, admin).get('/locations').expect(200);
      expect(res.body.map((l: { name: string }) => l.name)).toEqual([
        'Mall A',
        'Mall B',
        'Other Mall',
      ]);
    });

    it('a community manager only sees and changes their own Community', async () => {
      const communities = await api(app, manager).get('/communities').expect(200);
      expect(communities.body).toEqual([
        expect.objectContaining({ name: 'Community', locationCount: 2, canManage: true }),
      ]);

      const locations = await api(app, manager).get('/locations').expect(200);
      expect(locations.body.map((l: { name: string }) => l.name)).toEqual(['Mall A', 'Mall B']);

      // Can add a location to their community...
      await api(app, manager)
        .post('/locations')
        .send({ communityId: data.community.id, name: 'Mall New' })
        .expect(201);
      // ...but not to another community (looks like it doesn't exist)
      await api(app, manager)
        .post('/locations')
        .send({ communityId: otherCommunityId, name: 'Sneaky' })
        .expect(404);
      await api(app, manager)
        .patch(`/locations/${otherLocationId}`)
        .send({ name: 'x' })
        .expect(404);
      await shop(manager, { locationId: otherLocationId, name: 'x' }).expect(404);
      // and cannot create communities
      await api(app, manager).post('/communities').send({ name: 'Mine' }).expect(403);
    });

    it('a user limited to one Location cannot add Locations or touch other Locations', async () => {
      const token = await locationOnlyUser();
      await prisma.userScope.deleteMany({ where: { userId: data.staff.id } });
      await prisma.userScope.create({ data: { userId: data.staff.id, locationId: data.locA.id } });

      const locations = await api(app, token).get('/locations').expect(200);
      expect(locations.body.map((l: { name: string }) => l.name)).toEqual(['Mall A']);
      expect(locations.body[0].canManageCommunity).toBe(false);

      // Sees the community (because of Mall A) but cannot edit it or add locations
      const communities = await api(app, token).get('/communities').expect(200);
      expect(communities.body).toEqual([
        expect.objectContaining({ name: 'Community', locationCount: 1, canManage: false }),
      ]);
      await api(app, token)
        .patch(`/communities/${data.community.id}`)
        .send({ name: 'Renamed' })
        .expect(403);
      await api(app, token)
        .post('/locations')
        .send({ communityId: data.community.id, name: 'New' })
        .expect(403);

      await shop(token, { locationId: data.locA.id, name: 'Allowed' }).expect(201);
      await shop(token, { locationId: data.locB.id, name: 'Not allowed' }).expect(404);
    });

    it('staff (no Shops permission) is refused', async () => {
      const staff = (await login(app, 'staff@test.local')).token;
      await api(app, staff).get('/locations').expect(403);
      await api(app, staff).get('/shops').expect(403);
    });

    it('only users with access to everything may move a Location to another Community', async () => {
      await api(app, manager)
        .patch(`/locations/${data.locA.id}`)
        .send({ communityId: otherCommunityId })
        .expect(403);
      await api(app, admin)
        .patch(`/locations/${data.locA.id}`)
        .send({ communityId: otherCommunityId })
        .expect(200);
    });

    it('summary counts only what the user can see', async () => {
      await shop(admin, { locationId: data.locA.id, name: 'A1' }).expect(201);
      await shop(admin, { locationId: data.locA.id, name: 'A2', participating: false }).expect(201);
      await shop(admin, { locationId: otherLocationId, name: 'O1' }).expect(201);

      const all = await api(app, admin).get('/org/summary').expect(200);
      expect(all.body).toEqual({ locations: 3, shops: 3, participatingShops: 2 });
      const mine = await api(app, manager).get('/org/summary').expect(200);
      expect(mine.body).toEqual({ locations: 2, shops: 2, participatingShops: 1 });
    });
  });

  describe('locations', () => {
    it('rejects a duplicate name in the same community, case-insensitively', async () => {
      const res = await api(app, admin)
        .post('/locations')
        .send({ communityId: data.community.id, name: 'mall a' })
        .expect(409);
      expect(res.body.message).toBe('มีสถานที่ชื่อนี้ใน Community นี้อยู่แล้ว');
    });

    it('lists with shop counts, search and status filter', async () => {
      await shop(admin, { locationId: data.locA.id, name: 'A1' }).expect(201);
      await api(app, admin)
        .patch(`/locations/${data.locB.id}`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      const res = await api(app, admin).get('/locations?search=LOC001').expect(200);
      expect(res.body).toEqual([expect.objectContaining({ code: 'LOC001', shopCount: 1 })]);
      const inactive = await api(app, admin).get('/locations?status=INACTIVE').expect(200);
      expect(inactive.body.map((l: { code: string }) => l.code)).toEqual(['LOC002']);
    });

    it('clears the province with an empty string and audits the change', async () => {
      await api(app, admin)
        .patch(`/locations/${data.locA.id}`)
        .send({ province: 'ภูเก็ต' })
        .expect(200);
      const res = await api(app, admin)
        .patch(`/locations/${data.locA.id}`)
        .send({ province: '' })
        .expect(200);
      expect(res.body.province).toBeNull();
      expect(await prisma.auditLog.count({ where: { action: 'location.updated' } })).toBe(2);
    });
  });

  describe('shops', () => {
    it('creates with all fields, and rejects duplicate names in the same location', async () => {
      const cafe = await category('คาเฟ่');
      const created = await shop(admin, {
        locationId: data.locA.id,
        name: 'ร้านกาแฟ A',
        categoryId: cafe,
        receiptName: ' CAFE A ',
        participating: true,
      }).expect(201);
      expect(created.body).toMatchObject({
        code: 'S001',
        receiptName: 'CAFE A',
        participating: true,
        status: 'ACTIVE',
        category: { name: 'คาเฟ่' },
        location: { code: 'LOC001' },
      });
      await shop(admin, { locationId: data.locA.id, name: 'ร้านกาแฟ a' }).expect(409);
      // Same name in another location is fine
      await shop(admin, { locationId: data.locB.id, name: 'ร้านกาแฟ A' }).expect(201);
    });

    it('filters by location, search (name/code/receipt name), category, participating and status', async () => {
      const cafe = await category('คาเฟ่');
      await shop(admin, {
        locationId: data.locA.id,
        name: 'Cafe',
        categoryId: cafe,
        receiptName: 'CAFE X',
      });
      await shop(admin, { locationId: data.locA.id, name: 'Food', participating: false });
      await shop(admin, { locationId: data.locB.id, name: 'Other', status: 'INACTIVE' });

      const q = async (qs: string) =>
        (await api(app, admin).get(`/shops?${qs}`).expect(200)).body.items.map(
          (s: { name: string }) => s.name,
        );
      expect(await q(`locationId=${data.locA.id}`)).toEqual(['Cafe', 'Food']);
      expect(await q('search=cafe x')).toEqual(['Cafe']);
      expect(await q('search=S002')).toEqual(['Food']);
      expect(await q(`categoryId=${cafe}`)).toEqual(['Cafe']);
      expect(await q('participating=false')).toEqual(['Food']);
      expect(await q('status=INACTIVE')).toEqual(['Other']);

      const paged = await api(app, admin).get('/shops?page=2&pageSize=2').expect(200);
      expect(paged.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      expect(paged.body.items).toHaveLength(1);
    });

    it('updates fields, moves between accessible locations and clears the category', async () => {
      const cafe = await category('คาเฟ่');
      const s = await shop(admin, { locationId: data.locA.id, name: 'S', categoryId: cafe }).expect(
        201,
      );
      const res = await api(app, manager)
        .patch(`/shops/${s.body.id}`)
        .send({
          locationId: data.locB.id,
          categoryId: null,
          participating: false,
          status: 'INACTIVE',
          receiptName: '',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        locationId: data.locB.id,
        category: null,
        participating: false,
        status: 'INACTIVE',
        receiptName: null,
      });
    });

    it('refuses an inactive or unknown category', async () => {
      const cafe = await category('คาเฟ่');
      await api(app, admin)
        .patch(`/shop-categories/${cafe}`)
        .send({ status: 'INACTIVE' })
        .expect(200);
      await shop(admin, { locationId: data.locA.id, name: 'X', categoryId: cafe }).expect(400);
      await shop(admin, {
        locationId: data.locA.id,
        name: 'Y',
        categoryId: '00000000-0000-4000-8000-000000000000',
      }).expect(400);
    });

    it('records an audit entry', async () => {
      const s = await shop(manager, { locationId: data.locA.id, name: 'Audited' }).expect(201);
      const log = await prisma.auditLog.findFirst({ where: { action: 'shop.created' } });
      expect(log).toMatchObject({ actorId: data.manager.id, entityId: s.body.id });
    });
  });

  describe('categories', () => {
    it('can be read by shop users but only edited by admins (Settings)', async () => {
      await category('คาเฟ่');
      const list = await api(app, manager).get('/shop-categories').expect(200);
      expect(list.body).toEqual([expect.objectContaining({ name: 'คาเฟ่', shopCount: 0 })]);
      await api(app, manager).post('/shop-categories').send({ name: 'อาหาร' }).expect(403);
    });

    it('rename, duplicate check, and delete only when unused', async () => {
      const cafe = await category('คาเฟ่');
      const food = await category('อาหาร');
      await api(app, admin).post('/shop-categories').send({ name: 'อาหาร' }).expect(409);
      await api(app, admin)
        .patch(`/shop-categories/${food}`)
        .send({ name: 'ร้านอาหาร' })
        .expect(200);

      await shop(admin, { locationId: data.locA.id, name: 'X', categoryId: cafe }).expect(201);
      const blocked = await api(app, admin).delete(`/shop-categories/${cafe}`).expect(409);
      expect(blocked.body.message).toContain('ปิดใช้งานแทนได้');
      await api(app, admin).delete(`/shop-categories/${food}`).expect(204);
    });
  });

  describe('Excel export', () => {
    it('returns an .xlsx of the shops the user can see', async () => {
      const cafe = await category('คาเฟ่');
      await shop(admin, {
        locationId: data.locA.id,
        name: 'ร้านกาแฟ A',
        categoryId: cafe,
        receiptName: 'CAFE A',
      });
      const com = await api(app, admin).post('/communities').send({ name: 'Other' });
      const other = await api(app, admin)
        .post('/locations')
        .send({ communityId: com.body.id, name: 'Other Mall' });
      await shop(admin, { locationId: other.body.id, name: 'Hidden', participating: false });

      const res = await api(app, manager)
        .get('/shops/export')
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toMatch(
        /attachment; filename="shops-\d{4}-\d{2}-\d{2}\.xlsx"/,
      );

      const workbook = new ExcelJS.Workbook();
      // exceljs types predate Node 24's generic Buffer type
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const rows = workbook.getWorksheet('ร้านค้า')!.getSheetValues().slice(1) as unknown[][];
      expect(rows[0].slice(1, 5)).toEqual([
        'รหัสร้าน',
        'ชื่อร้านค้า',
        'หมวดหมู่',
        'ชื่อร้านบนใบเสร็จ',
      ]);
      expect(rows).toHaveLength(2); // header + only the manager's shop
      expect(rows[1].slice(1)).toEqual([
        'S001',
        'ร้านกาแฟ A',
        'คาเฟ่',
        'CAFE A',
        'ใช่',
        'เปิดใช้งาน',
        'LOC001',
        'Mall A',
        'Community',
      ]);
    });
  });
});
