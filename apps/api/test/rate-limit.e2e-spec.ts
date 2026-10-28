import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { api, createTestApp, login, resetData } from './helpers';

describe('Rate limiting (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    process.env.TEST_RATE_LIMIT = '1';
    ({ app } = await createTestApp());
    await resetData(prisma);
  });
  afterAll(async () => {
    delete process.env.TEST_RATE_LIMIT;
    await app.close();
    await prisma.$disconnect();
  });

  it('page loads (session refresh) are not limited like logins', async () => {
    const { cookie } = await login(app, 'admin@test.local');
    let current = cookie;
    for (let i = 0; i < 40; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', current)
        .expect(200);
      current = res.headers['set-cookie'] as unknown as string[];
    }
  });

  it('limits repeated login attempts from one IP with a Thai message', async () => {
    const statuses: number[] = [];
    let last: request.Response | undefined;
    for (let i = 0; i < 22; i++) {
      // An unknown email: a real account would hit its own 5-try lock first (423).
      last = await api(app)
        .post('/auth/login')
        .send({ email: 'nobody@test.local', password: 'Wrong1234' });
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 19).every((s) => s === 401)).toBe(true);
    expect(statuses[statuses.length - 1]).toBe(429);
    expect(last!.body.message).toBe('มีการเรียกใช้งานบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่');
  });
});
