import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { api, createTestApp, login, type MailOutbox, PASSWORD, resetData } from './helpers';

describe('Users & Roles (e2e)', () => {
  let app: INestApplication;
  let outbox: MailOutbox;
  const prisma = new PrismaClient();
  let data: Awaited<ReturnType<typeof resetData>>;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, outbox } = await createTestApp());
  });
  beforeEach(async () => {
    data = await resetData(prisma);
    outbox.sent.length = 0;
    adminToken = (await login(app, 'admin@test.local')).token;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('permissions are enforced on the server', () => {
    it('staff and community manager cannot open Users & Permissions', async () => {
      for (const email of ['staff@test.local', 'manager@test.local']) {
        const { token } = await login(app, email);
        const res = await api(app, token).get('/users').expect(403);
        expect(res.body.message).toBe('คุณไม่มีสิทธิ์ใช้งานส่วนนี้');
        await api(app, token).get('/roles').expect(403);
        await api(app, token)
          .post('/users')
          .send({
            name: 'x',
            email: 'x@test.local',
            roleId: data.roles.STAFF,
            scope: { all: true, communityIds: [], locationIds: [] },
          })
          .expect(403);
      }
    });

    it('admin can list users with filters and pagination', async () => {
      const all = await api(app, adminToken).get('/users').expect(200);
      expect(all.body).toMatchObject({ total: 3, page: 1, pageSize: 20 });

      const staffOnly = await api(app, adminToken)
        .get(`/users?roleId=${data.roles.STAFF}`)
        .expect(200);
      expect(staffOnly.body.items.map((u: { email: string }) => u.email)).toEqual([
        'staff@test.local',
      ]);

      const search = await api(app, adminToken).get('/users?search=MANAG').expect(200);
      expect(search.body.total).toBe(1);

      const paged = await api(app, adminToken).get('/users?page=2&pageSize=2').expect(200);
      expect(paged.body.items).toHaveLength(1);
    });

    it('a permission granted to a role works immediately, without logging in again', async () => {
      const { token } = await login(app, 'staff@test.local');
      await api(app, token).get('/users').expect(403);

      const roles = await api(app, adminToken).get('/roles').expect(200);
      const staffRole = roles.body.find((r: { key: string }) => r.key === 'STAFF');
      const permissions = staffRole.permissions.map((p: { menu: string }) =>
        p.menu === 'USERS' ? { ...p, canView: true } : p,
      );
      await api(app, adminToken).patch(`/roles/${staffRole.id}`).send({ permissions }).expect(200);

      await api(app, token).get('/users').expect(200);
      await api(app, token).post('/users').send({}).expect(403); // view only, not manage
    });
  });

  describe('creating users', () => {
    const scopeA = () => ({ all: false, communityIds: [], locationIds: [data.locA.id] });

    it('returns a temporary password once; the user must change it before using the CMS', async () => {
      const created = await api(app, adminToken)
        .post('/users')
        .send({
          name: 'New Reviewer',
          email: 'New@Test.local',
          roleId: data.roles.STAFF,
          scope: scopeA(),
        })
        .expect(201);
      expect(created.body.user).toMatchObject({
        email: 'new@test.local',
        mustChangePassword: true,
        scope: { all: false, locations: [{ code: 'LOC001' }] },
      });
      const temp = created.body.temporaryPassword;
      expect(temp).toMatch(/^[A-Za-z2-9]{12}$/);

      const { token } = await login(app, 'new@test.local', temp);
      await api(app, token).get('/auth/me').expect(200);
      const blocked = await api(app, token).get('/roles').expect(403);
      expect(blocked.body.message).toBe('กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน');

      await api(app, token)
        .post('/auth/change-password')
        .send({ currentPassword: temp, newPassword: 'MyOwnPass1' })
        .expect(200);
      const me = await api(app, token).get('/auth/me').expect(200);
      expect(me.body.mustChangePassword).toBe(false);
    });

    it('rejects a duplicate email', async () => {
      const res = await api(app, adminToken)
        .post('/users')
        .send({ name: 'Dup', email: 'staff@test.local', roleId: data.roles.STAFF, scope: scopeA() })
        .expect(409);
      expect(res.body.message).toBe('อีเมลนี้ถูกใช้งานแล้ว');
    });

    it('requires at least one location for non-admin roles', async () => {
      await api(app, adminToken)
        .post('/users')
        .send({
          name: 'No scope',
          email: 'noscope@test.local',
          roleId: data.roles.STAFF,
          scope: { all: false, communityIds: [], locationIds: [] },
        })
        .expect(400);
    });

    it('rejects unknown location ids', async () => {
      await api(app, adminToken)
        .post('/users')
        .send({
          name: 'Bad scope',
          email: 'bad@test.local',
          roleId: data.roles.STAFF,
          scope: {
            all: false,
            communityIds: [],
            locationIds: ['00000000-0000-4000-8000-000000000000'],
          },
        })
        .expect(400);
    });

    it('always gives admins every location', async () => {
      const res = await api(app, adminToken)
        .post('/users')
        .send({
          name: 'Admin 2',
          email: 'admin2@test.local',
          roleId: data.roles.ADMIN,
          scope: scopeA(),
        })
        .expect(201);
      expect(res.body.user.scope).toEqual({ all: true, communities: [], locations: [] });
    });

    it('drops locations already covered by a selected community', async () => {
      const res = await api(app, adminToken)
        .post('/users')
        .send({
          name: 'Overlap',
          email: 'overlap@test.local',
          roleId: data.roles.COMMUNITY_MANAGER,
          scope: { all: false, communityIds: [data.community.id], locationIds: [data.locA.id] },
        })
        .expect(201);
      expect(res.body.user.scope.communities).toHaveLength(1);
      expect(res.body.user.scope.locations).toHaveLength(0);
    });
  });

  describe('editing users', () => {
    it('updates role, scope and status, and suspending signs the user out', async () => {
      const { token } = await login(app, 'staff@test.local');
      const res = await api(app, adminToken)
        .patch(`/users/${data.staff.id}`)
        .send({
          roleId: data.roles.COMMUNITY_MANAGER,
          status: 'SUSPENDED',
          scope: { all: false, communityIds: [], locationIds: [data.locB.id] },
        })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'SUSPENDED',
        role: { key: 'COMMUNITY_MANAGER' },
        scope: { locations: [{ code: 'LOC002' }] },
      });
      await api(app, token).get('/auth/me').expect(401);

      const audit = await prisma.auditLog.findFirst({ where: { action: 'user.updated' } });
      expect(audit?.metadata).toMatchObject({
        before: { role: 'STAFF', status: 'ACTIVE' },
        after: { role: 'COMMUNITY_MANAGER', status: 'SUSPENDED' },
      });
    });

    it('an admin cannot change their own role or suspend themselves', async () => {
      await api(app, adminToken)
        .patch(`/users/${data.admin.id}`)
        .send({ roleId: data.roles.STAFF })
        .expect(400);
      await api(app, adminToken)
        .patch(`/users/${data.admin.id}`)
        .send({ status: 'SUSPENDED' })
        .expect(400);
      // Changing their own name is fine
      await api(app, adminToken)
        .patch(`/users/${data.admin.id}`)
        .send({ name: 'Boss' })
        .expect(200);
    });

    it('keeps at least one active admin', async () => {
      // A custom role that may manage users, but is not an admin itself.
      const role = await api(app, adminToken)
        .post('/roles')
        .send({
          name: 'User manager',
          permissions: [{ menu: 'USERS', canView: true, canManage: true }],
        })
        .expect(201);
      await api(app, adminToken)
        .patch(`/users/${data.staff.id}`)
        .send({ roleId: role.body.id })
        .expect(200);
      const { token } = await login(app, 'staff@test.local');

      // The only active admin can be neither demoted nor suspended...
      const demote = await api(app, token)
        .patch(`/users/${data.admin.id}`)
        .send({ roleId: data.roles.STAFF })
        .expect(400);
      expect(demote.body.message).toBe('ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน');
      await api(app, token)
        .patch(`/users/${data.admin.id}`)
        .send({ status: 'SUSPENDED' })
        .expect(400);

      // ...but once a second admin exists, the first one can be suspended.
      await api(app, adminToken)
        .post('/users')
        .send({
          name: 'Admin 2',
          email: 'admin2@test.local',
          roleId: data.roles.ADMIN,
          scope: { all: true, communityIds: [], locationIds: [] },
        })
        .expect(201);
      await api(app, token)
        .patch(`/users/${data.admin.id}`)
        .send({ status: 'SUSPENDED' })
        .expect(200);
    });
  });

  describe('admin password reset', () => {
    it('temporary: returns a new password, signs the user out and forces a change', async () => {
      const old = await login(app, 'staff@test.local');
      const res = await api(app, adminToken)
        .post(`/users/${data.staff.id}/reset-password`)
        .send({ method: 'temporary' })
        .expect(200);
      expect(res.body.temporaryPassword).toMatch(/^[A-Za-z2-9]{12}$/);

      await api(app, old.token).get('/auth/me').expect(401);
      await api(app)
        .post('/auth/login')
        .send({ email: 'staff@test.local', password: PASSWORD })
        .expect(401);
      const fresh = await login(app, 'staff@test.local', res.body.temporaryPassword);
      expect(fresh.body.user.mustChangePassword).toBe(true);

      const audit = await prisma.auditLog.findMany({
        where: { action: 'user.password_reset_by_admin' },
      });
      expect(audit).toHaveLength(1);
      expect(JSON.stringify(audit)).not.toContain(res.body.temporaryPassword);
    });

    it('email: sends the reset link to the user', async () => {
      const res = await api(app, adminToken)
        .post(`/users/${data.staff.id}/reset-password`)
        .send({ method: 'email' })
        .expect(200);
      expect(res.body).toEqual({ method: 'email', emailConfigured: false });
      expect(outbox.lastResetToken('staff@test.local')).toBeTruthy();
    });

    it('is refused for suspended accounts', async () => {
      await prisma.user.update({ where: { id: data.staff.id }, data: { status: 'SUSPENDED' } });
      await api(app, adminToken)
        .post(`/users/${data.staff.id}/reset-password`)
        .send({ method: 'temporary' })
        .expect(400);
    });
  });

  describe('roles', () => {
    it('lists the three system roles with user counts', async () => {
      const res = await api(app, adminToken).get('/roles').expect(200);
      expect(res.body.map((r: { key: string; userCount: number }) => [r.key, r.userCount])).toEqual(
        [
          ['ADMIN', 1],
          ['STAFF', 1],
          ['COMMUNITY_MANAGER', 1],
        ],
      );
    });

    it('cannot reduce admin permissions or delete system roles', async () => {
      await api(app, adminToken)
        .patch(`/roles/${data.roles.ADMIN}`)
        .send({ permissions: [] })
        .expect(400);
      await api(app, adminToken).delete(`/roles/${data.roles.STAFF}`).expect(400);
    });

    it('creates, edits and deletes a custom role; manage implies view', async () => {
      const created = await api(app, adminToken)
        .post('/roles')
        .send({
          name: 'ผู้ดูรายงาน',
          permissions: [{ menu: 'REPORTS', canView: false, canManage: true }],
        })
        .expect(201);
      const reports = created.body.permissions.find((p: { menu: string }) => p.menu === 'REPORTS');
      expect(reports).toEqual({ menu: 'REPORTS', canView: true, canManage: true });
      expect(created.body.permissions).toHaveLength(10);

      await api(app, adminToken)
        .patch(`/roles/${created.body.id}`)
        .send({ name: 'Report viewer' })
        .expect(200);
      await api(app, adminToken).delete(`/roles/${created.body.id}`).expect(204);
    });

    it('refuses to delete a custom role that still has users', async () => {
      const role = await api(app, adminToken)
        .post('/roles')
        .send({ name: 'Temp', permissions: [] })
        .expect(201);
      await api(app, adminToken)
        .patch(`/users/${data.staff.id}`)
        .send({ roleId: role.body.id })
        .expect(200);
      await api(app, adminToken).delete(`/roles/${role.body.id}`).expect(409);
    });

    it('rejects unknown menu keys', async () => {
      await api(app, adminToken)
        .post('/roles')
        .send({ name: 'Bad', permissions: [{ menu: 'HACK', canView: true, canManage: true }] })
        .expect(400);
    });
  });

  it('scope options list communities with their locations', async () => {
    const res = await api(app, adminToken).get('/users/scope-options').expect(200);
    expect(res.body).toEqual([
      {
        id: data.community.id,
        code: 'COM001',
        name: 'Community',
        locations: [
          { id: data.locA.id, code: 'LOC001', name: 'Mall A' },
          { id: data.locB.id, code: 'LOC002', name: 'Mall B' },
        ],
      },
    ]);
  });
});
