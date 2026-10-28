import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { api, createTestApp, login, MailOutbox, PASSWORD, resetData } from './helpers';

/** Too many wrong passwords lock a staff account (Settings > loginSecurity: 5 tries, 15 min). */
describe('Login lockout (e2e)', () => {
  let app: INestApplication;
  let outbox: MailOutbox;
  const prisma = new PrismaClient();
  let data: Awaited<ReturnType<typeof resetData>>;

  beforeAll(async () => {
    ({ app, outbox } = await createTestApp());
  });
  beforeEach(async () => {
    data = await resetData(prisma);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const attempt = (password: string, email = 'staff@test.local') =>
    request(app.getHttpServer()).post('/api/auth/login').send({ email, password });

  it('locks after 5 wrong passwords, refusing even the right one, and logs it', async () => {
    for (let i = 0; i < 4; i++) await attempt('wrong-password').expect(401);
    const fifth = await attempt('wrong-password').expect(423);
    expect(fifth.body).toMatchObject({ code: 'ACCOUNT_LOCKED' });
    expect(fifth.body.message).toContain('15 นาที');

    const right = await attempt(PASSWORD).expect(423);
    expect(right.body.code).toBe('ACCOUNT_LOCKED');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: data.staff.id } });
    expect(user.lockedUntil!.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    const actions = (await prisma.auditLog.findMany({ where: { actorId: data.staff.id } })).map(
      (a) => a.action,
    );
    expect(actions.filter((a) => a === 'auth.locked')).toHaveLength(1);
    expect(actions).toContain('auth.login_locked');
  });

  it('a correct login resets the count; the lock ends by itself', async () => {
    for (let i = 0; i < 4; i++) await attempt('wrong-password').expect(401);
    await attempt(PASSWORD).expect(200);
    // Counting starts again from zero.
    for (let i = 0; i < 4; i++) await attempt('wrong-password').expect(401);
    await attempt(PASSWORD).expect(200);

    await prisma.user.update({
      where: { id: data.staff.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    await attempt(PASSWORD).expect(200);
  });

  it('follows the Settings values', async () => {
    const admin = (await login(app, 'admin@test.local')).token;
    await api(app, admin)
      .put('/settings/loginSecurity')
      .send({ value: { maxFailedAttempts: 3, lockMinutes: 60 } })
      .expect(200);
    await api(app, admin)
      .put('/settings/loginSecurity')
      .send({ value: { maxFailedAttempts: 1, lockMinutes: 60 } })
      .expect(400);

    await attempt('wrong-password').expect(401);
    await attempt('wrong-password').expect(401);
    const locked = await attempt('wrong-password').expect(423);
    expect(locked.body.message).toContain('60 นาที');
  });

  it('an admin can unlock early; a password reset by email also unlocks', async () => {
    for (let i = 0; i < 5; i++) await attempt('wrong-password');
    const admin = (await login(app, 'admin@test.local')).token;
    const list = await api(app, admin).get('/users').expect(200);
    const staffRow = list.body.items.find((u: { email: string }) => u.email === 'staff@test.local');
    expect(staffRow.lockedUntil).not.toBeNull();

    await attempt(PASSWORD).expect(423);

    const res = await api(app, admin).post(`/users/${data.staff.id}/unlock`).expect(200);
    expect(res.body.lockedUntil).toBeNull();
    await attempt(PASSWORD).expect(200);
    expect(await prisma.auditLog.count({ where: { action: 'user.unlocked' } })).toBe(1);

    // Staff can't unlock anyone.
    const staffToken = (await login(app, 'staff@test.local')).token;
    await api(app, staffToken).post(`/users/${data.manager.id}/unlock`).expect(403);

    // Locked again, then "forgot password" → new password works straight away.
    for (let i = 0; i < 5; i++) await attempt('wrong-password', 'manager@test.local');
    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'manager@test.local' })
      .expect(202);
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: outbox.lastResetToken('manager@test.local'), newPassword: 'NewPassw0rd!' })
      .expect(200);
    await attempt('NewPassw0rd!', 'manager@test.local').expect(200);
  });

  it('unknown emails never lock anything and still get the same answer', async () => {
    for (let i = 0; i < 6; i++) {
      const res = await attempt('wrong-password', 'nobody@test.local').expect(401);
      expect(res.body.message).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }
  });
});
