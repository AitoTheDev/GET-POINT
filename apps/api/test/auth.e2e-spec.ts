import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { api, createTestApp, login, type MailOutbox, PASSWORD, resetData } from './helpers';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let outbox: MailOutbox;
  const prisma = new PrismaClient();
  let data: Awaited<ReturnType<typeof resetData>>;

  beforeAll(async () => {
    ({ app, outbox } = await createTestApp());
  });
  beforeEach(async () => {
    data = await resetData(prisma);
    outbox.sent.length = 0;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('login', () => {
    it('returns an access token, the user with permissions, and an httpOnly refresh cookie', async () => {
      const { token, cookie, body } = await login(app, 'ADMIN@test.local ');
      expect(token).toBeTruthy();
      expect(body.user).toMatchObject({
        email: 'admin@test.local',
        role: { key: 'ADMIN' },
        scope: { all: true },
      });
      expect(body.user.permissions).toHaveLength(10);
      expect(body.user).not.toHaveProperty('passwordHash');
      expect(cookie[0]).toMatch(/gp_refresh=.+HttpOnly/i);
      expect(cookie[0]).toMatch(/SameSite=Strict/i);
      // No "remember me" => browser-session cookie (no Expires)
      expect(cookie[0]).not.toMatch(/Expires=/i);
    });

    it('sets a persistent cookie with remember me', async () => {
      const res = await api(app)
        .post('/auth/login')
        .send({ email: 'admin@test.local', password: PASSWORD, rememberMe: true })
        .expect(200);
      expect(res.headers['set-cookie'][0]).toMatch(/Expires=/i);
    });

    it('uses the same message for a wrong password and an unknown email', async () => {
      const wrong = await api(app)
        .post('/auth/login')
        .send({ email: 'admin@test.local', password: 'nope12345' })
        .expect(401);
      const unknown = await api(app)
        .post('/auth/login')
        .send({ email: 'nobody@test.local', password: 'nope12345' })
        .expect(401);
      expect(wrong.body.message).toBe(unknown.body.message);
    });

    it('rejects a suspended user', async () => {
      await prisma.user.update({ where: { id: data.staff.id }, data: { status: 'SUSPENDED' } });
      await api(app)
        .post('/auth/login')
        .send({ email: 'staff@test.local', password: PASSWORD })
        .expect(403);
    });

    it('validates the body', async () => {
      const res = await api(app).post('/auth/login').send({ email: 'not-an-email' }).expect(400);
      expect(res.body.details).toEqual(expect.arrayContaining(['รูปแบบอีเมลไม่ถูกต้อง']));
    });
  });

  describe('protected routes', () => {
    it('require a token', async () => {
      await api(app).get('/auth/me').expect(401);
      await api(app, 'garbage').get('/auth/me').expect(401);
    });

    it('return the current user', async () => {
      const { token } = await login(app, 'staff@test.local');
      const me = await api(app, token).get('/auth/me').expect(200);
      expect(me.body).toMatchObject({
        email: 'staff@test.local',
        role: { key: 'STAFF' },
        scope: { all: false, locationIds: [data.locA.id] },
      });
    });

    it('stop working immediately after the user is suspended', async () => {
      const { token } = await login(app, 'staff@test.local');
      await prisma.user.update({ where: { id: data.staff.id }, data: { status: 'SUSPENDED' } });
      await api(app, token).get('/auth/me').expect(401);
    });

    it('keep /health public', async () => {
      await api(app).get('/health').expect(200);
    });
  });

  describe('refresh and logout', () => {
    it('rotates the refresh token; the old one stops working', async () => {
      const { cookie } = await login(app, 'admin@test.local');
      const first = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);
      expect(first.body.accessToken).toBeTruthy();
      const rotated = first.headers['set-cookie'] as unknown as string[];
      expect(rotated[0]).not.toEqual(cookie[0]);

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', rotated)
        .expect(200);
    });

    it('logout revokes the session for both access and refresh', async () => {
      const { token, cookie } = await login(app, 'admin@test.local');
      await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookie).expect(204);
      await api(app, token).get('/auth/me').expect(401);
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });
  });

  describe('change password', () => {
    it('requires the current password and signs out other sessions', async () => {
      const a = await login(app, 'staff@test.local');
      const b = await login(app, 'staff@test.local');

      await api(app, a.token)
        .post('/auth/change-password')
        .send({ currentPassword: 'wrong', newPassword: 'NewPassw0rd' })
        .expect(400);
      await api(app, a.token)
        .post('/auth/change-password')
        .send({ currentPassword: PASSWORD, newPassword: 'NewPassw0rd' })
        .expect(200);

      await api(app, a.token).get('/auth/me').expect(200);
      await api(app, b.token).get('/auth/me').expect(401);
      await login(app, 'staff@test.local', 'NewPassw0rd');
    });

    it('enforces the password rule', async () => {
      const { token } = await login(app, 'staff@test.local');
      const res = await api(app, token)
        .post('/auth/change-password')
        .send({ currentPassword: PASSWORD, newPassword: 'short' })
        .expect(400);
      expect(res.body.details.join(' ')).toMatch(/อย่างน้อย 8/);
    });
  });

  describe('forgot password (email)', () => {
    it('emails a single-use link that resets the password and signs out all sessions', async () => {
      const old = await login(app, 'staff@test.local');

      await api(app).post('/auth/forgot-password').send({ email: 'staff@test.local' }).expect(202);
      const token = outbox.lastResetToken('staff@test.local');

      await api(app)
        .post('/auth/reset-password')
        .send({ token, newPassword: 'Reset1234' })
        .expect(200);
      await api(app, old.token).get('/auth/me').expect(401);
      await login(app, 'staff@test.local', 'Reset1234');

      // Second use of the same link fails
      await api(app)
        .post('/auth/reset-password')
        .send({ token, newPassword: 'Another1234' })
        .expect(400);
    });

    it('answers the same for unknown emails and sends nothing', async () => {
      const res = await api(app)
        .post('/auth/forgot-password')
        .send({ email: 'nobody@test.local' })
        .expect(202);
      expect(res.body.message).toBeTruthy();
      expect(outbox.sent).toHaveLength(0);
    });

    it('only the newest link works', async () => {
      await api(app).post('/auth/forgot-password').send({ email: 'staff@test.local' }).expect(202);
      const first = outbox.lastResetToken('staff@test.local');
      await api(app).post('/auth/forgot-password').send({ email: 'staff@test.local' }).expect(202);
      await api(app)
        .post('/auth/reset-password')
        .send({ token: first, newPassword: 'Reset1234' })
        .expect(400);
    });

    it('rejects an expired link', async () => {
      await api(app).post('/auth/forgot-password').send({ email: 'staff@test.local' }).expect(202);
      const token = outbox.lastResetToken('staff@test.local');
      await prisma.passwordResetToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await api(app)
        .post('/auth/reset-password')
        .send({ token, newPassword: 'Reset1234' })
        .expect(400);
    });
  });

  describe('audit log', () => {
    it('records logins without storing any password', async () => {
      await login(app, 'admin@test.local');
      await api(app).post('/auth/login').send({ email: 'admin@test.local', password: 'Wrong999' });

      const logs = await prisma.auditLog.findMany();
      expect(logs.map((l) => l.action)).toEqual(
        expect.arrayContaining(['auth.login', 'auth.login_failed']),
      );
      const dump = JSON.stringify(logs);
      expect(dump).not.toContain(PASSWORD);
      expect(dump).not.toContain('Wrong999');
    });
  });
});
