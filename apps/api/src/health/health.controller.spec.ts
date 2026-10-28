import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { setupApp } from '../setup-app';
import { HealthController } from './health.controller';

describe('GET /api/health', () => {
  let app: INestApplication;
  const prisma = { $queryRaw: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(() => app.close());

  it('returns 200 when the database answers', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('returns 503 when the database is down', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'error', database: 'down' });
  });

  it('returns the standard error body for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ statusCode: 404, error: 'NOT_FOUND', path: '/api/nope' });
  });
});
