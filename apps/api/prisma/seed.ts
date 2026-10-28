/**
 * Idempotent seed: roles + permissions, sample Community/Locations, first admin.
 * In development it also creates one Staff and one Community Manager account for testing.
 *
 *   npm run db:seed
 */
import { PASSWORD_MIN_LENGTH, SystemRole } from '@getpoint/shared';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/crypto.util';
import { SYSTEM_ROLES } from '../src/roles/default-permissions';

const prisma = new PrismaClient();

const SAMPLE_COMMUNITY = { code: 'COM001', name: 'GET POINT Community' };
const SAMPLE_LOCATIONS = [
  { code: 'LOC001', name: 'Community Mall A', province: 'กรุงเทพมหานคร' },
  { code: 'LOC002', name: 'Community Mall B', province: 'กรุงเทพมหานคร' },
  { code: 'LOC003', name: 'Community Mall C', province: 'กรุงเทพมหานคร' },
];

async function seedRoles() {
  for (const role of SYSTEM_ROLES) {
    const saved = await prisma.role.upsert({
      where: { key: role.key },
      // Never overwrite permissions an admin has edited; only create them the first time.
      update: { isSystem: true },
      create: {
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: true,
        permissions: { create: role.permissions },
      },
    });
    if (role.key === SystemRole.ADMIN) {
      // Admin always keeps full access, even if rows were removed by hand.
      for (const p of role.permissions) {
        await prisma.rolePermission.upsert({
          where: { roleId_menu: { roleId: saved.id, menu: p.menu } },
          update: { canView: true, canManage: true },
          create: { ...p, roleId: saved.id },
        });
      }
    }
  }
}

async function seedOrganisation() {
  const community = await prisma.community.upsert({
    where: { code: SAMPLE_COMMUNITY.code },
    update: {},
    create: SAMPLE_COMMUNITY,
  });
  const locations = [];
  for (const loc of SAMPLE_LOCATIONS) {
    locations.push(
      await prisma.location.upsert({
        where: { code: loc.code },
        update: {},
        create: { ...loc, communityId: community.id },
      }),
    );
  }
  return { community, locations };
}

async function upsertUser(input: {
  email: string;
  name: string;
  password: string;
  roleKey: SystemRole;
  scopeAll: boolean;
  scope?: { communityId?: string; locationId?: string }[];
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) return { created: false, email: input.email };

  const role = await prisma.role.findUniqueOrThrow({ where: { key: input.roleKey } });
  await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      roleId: role.id,
      scopeAll: input.scopeAll,
      scopes: { create: input.scope ?? [] },
    },
  });
  return { created: true, email: input.email };
}

async function main() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@getpoint.local').trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? '';
  if (adminPassword.length < PASSWORD_MIN_LENGTH || adminPassword === 'CHANGE_ME') {
    throw new Error(
      `Set SEED_ADMIN_PASSWORD in apps/api/.env (at least ${PASSWORD_MIN_LENGTH} characters) before seeding.`,
    );
  }

  await seedRoles();
  const { community, locations } = await seedOrganisation();

  const results = [
    await upsertUser({
      email: adminEmail,
      name: 'ผู้ดูแลระบบ',
      password: adminPassword,
      roleKey: SystemRole.ADMIN,
      scopeAll: true,
    }),
  ];

  if (process.env.NODE_ENV !== 'production') {
    results.push(
      await upsertUser({
        email: 'staff@getpoint.local',
        name: 'เจ้าหน้าที่ ทดสอบ',
        password: adminPassword,
        roleKey: SystemRole.STAFF,
        scopeAll: false,
        scope: [{ locationId: locations[0].id }],
      }),
      await upsertUser({
        email: 'manager@getpoint.local',
        name: 'ผู้จัดการ ทดสอบ',
        password: adminPassword,
        roleKey: SystemRole.COMMUNITY_MANAGER,
        scopeAll: false,
        scope: [{ communityId: community.id }],
      }),
    );
  }

  console.log('Seed complete.');
  for (const r of results) {
    console.log(`  ${r.created ? 'created ' : 'exists  '} ${r.email}`);
  }
  console.log('  (passwords are not printed; new accounts use SEED_ADMIN_PASSWORD)');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
