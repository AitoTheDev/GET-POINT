import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/crypto.util';
import { MailService, type MailMessage } from '../src/mail/mail.service';
import { SYSTEM_ROLES } from '../src/roles/default-permissions';
import { setupApp } from '../src/setup-app';

export const PASSWORD = 'Passw0rd!';

/** Captures outgoing emails instead of sending them. */
export class MailOutbox {
  readonly sent: MailMessage[] = [];
  isConfigured = false;
  async send(message: MailMessage) {
    this.sent.push(message);
  }
  /** Reset token from the last email sent to `to`. */
  lastResetToken(to: string): string {
    const mail = [...this.sent].reverse().find((m) => m.to === to);
    const token = mail?.text.match(/token=([\w-]+)/)?.[1];
    if (!token) throw new Error(`No reset email for ${to}`);
    return token;
  }
}

export async function createTestApp() {
  const outbox = new MailOutbox();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(outbox)
    .compile();
  const app = moduleRef.createNestApplication();
  setupApp(app);
  await app.init();
  return { app, outbox };
}

/** Empty all tables, then insert roles, one community with two locations and three users. */
export async function resetData(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE audit_logs, password_reset_tokens, auth_sessions, user_scopes, users, role_permissions, roles, locations, communities CASCADE',
  );

  const roles: Record<string, string> = {};
  for (const role of SYSTEM_ROLES) {
    const saved = await prisma.role.create({
      data: {
        key: role.key,
        name: role.name,
        isSystem: true,
        permissions: { create: role.permissions },
      },
    });
    roles[role.key] = saved.id;
  }

  const community = await prisma.community.create({ data: { code: 'COM001', name: 'Community' } });
  const locA = await prisma.location.create({
    data: { code: 'LOC001', name: 'Mall A', communityId: community.id },
  });
  const locB = await prisma.location.create({
    data: { code: 'LOC002', name: 'Mall B', communityId: community.id },
  });

  const passwordHash = await hashPassword(PASSWORD);
  const admin = await prisma.user.create({
    data: {
      email: 'admin@test.local',
      name: 'Admin',
      passwordHash,
      roleId: roles.ADMIN,
      scopeAll: true,
    },
  });
  const staff = await prisma.user.create({
    data: {
      email: 'staff@test.local',
      name: 'Staff',
      passwordHash,
      roleId: roles.STAFF,
      scopes: { create: [{ locationId: locA.id }] },
    },
  });
  const manager = await prisma.user.create({
    data: {
      email: 'manager@test.local',
      name: 'Manager',
      passwordHash,
      roleId: roles.COMMUNITY_MANAGER,
      scopes: { create: [{ communityId: community.id }] },
    },
  });

  return { roles, community, locA, locB, admin, staff, manager };
}

export async function login(app: INestApplication, email: string, password = PASSWORD) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return {
    token: res.body.accessToken as string,
    cookie: res.headers['set-cookie'] as unknown as string[],
    body: res.body,
  };
}

export const api = (app: INestApplication, token?: string) => {
  const agent = request(app.getHttpServer());
  const withAuth = <T extends request.Test>(req: T) =>
    token ? req.set('Authorization', `Bearer ${token}`) : req;
  return {
    get: (url: string) => withAuth(agent.get(`/api${url}`)),
    post: (url: string) => withAuth(agent.post(`/api${url}`)),
    patch: (url: string) => withAuth(agent.patch(`/api${url}`)),
    delete: (url: string) => withAuth(agent.delete(`/api${url}`)),
  };
};
