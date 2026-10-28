import { SystemRole } from '@getpoint/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { generateTemporaryPassword, hashPassword } from '../auth/crypto.util';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto, ListUsersQuery, ScopeDto, UpdateUserDto } from './dto';

const userViewInclude = {
  role: { select: { id: true, key: true, name: true } },
  scopes: {
    include: {
      community: { select: { id: true, code: true, name: true } },
      location: { select: { id: true, code: true, name: true } },
    },
  },
} satisfies Prisma.UserInclude;

type UserRecord = Prisma.UserGetPayload<{ include: typeof userViewInclude }>;

export interface UserView {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'SUSPENDED';
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  role: { id: string; key: string; name: string };
  scope: {
    all: boolean;
    communities: { id: string; code: string; name: string }[];
    locations: { id: string; code: string; name: string }[];
  };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly mail: MailService,
  ) {}

  async list(query: ListUsersQuery): Promise<Paginated<UserView>> {
    const where: Prisma.UserWhereInput = {
      roleId: query.roleId,
      status: query.status,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: userViewInclude,
        orderBy: [{ createdAt: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: users.map(toUserView), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<UserView> {
    return toUserView(await this.findOrThrow(id));
  }

  /** Creates the account with a temporary password, returned once so the admin can hand it over. */
  async create(dto: CreateUserDto, actorId: string) {
    const role = await this.findRoleOrThrow(dto.roleId);
    const scope = await this.resolveScope(role.key, dto.scope);

    if (await this.prisma.user.findUnique({ where: { email: dto.email } })) {
      throw new ConflictException('อีเมลนี้ถูกใช้งานแล้ว');
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          mustChangePassword: true,
          status: dto.status ?? 'ACTIVE',
          roleId: role.id,
          scopeAll: scope.all,
          scopes: { create: scopeRows(scope) },
        },
        include: userViewInclude,
      });
      await this.audit.log(
        {
          action: 'user.created',
          actorId,
          entityType: 'user',
          entityId: created.id,
          metadata: { email: created.email, role: role.key, status: created.status, scope },
        },
        tx,
      );
      return created;
    });

    return { user: toUserView(user), temporaryPassword };
  }

  async update(id: string, dto: UpdateUserDto, actor: { id: string }): Promise<UserView> {
    const existing = await this.findOrThrow(id);
    const isSelf = existing.id === actor.id;

    if (isSelf && dto.roleId && dto.roleId !== existing.roleId) {
      throw new BadRequestException('ไม่สามารถเปลี่ยนบทบาทของตัวเองได้');
    }
    if (isSelf && dto.status === 'SUSPENDED') {
      throw new BadRequestException('ไม่สามารถระงับบัญชีของตัวเองได้');
    }

    const role = dto.roleId ? await this.findRoleOrThrow(dto.roleId) : existing.role;
    const nextStatus = dto.status ?? existing.status;

    const losesAdmin =
      existing.role.key === SystemRole.ADMIN &&
      existing.status === 'ACTIVE' &&
      (role.key !== SystemRole.ADMIN || nextStatus !== 'ACTIVE');

    // Role change to/from ADMIN or a new scope both need the scope re-resolved.
    const scope =
      dto.scope || role.key !== existing.role.key
        ? await this.resolveScope(role.key, dto.scope ?? currentScope(existing))
        : undefined;

    const saved = await this.prisma.$transaction(async (tx) => {
      if (losesAdmin) await assertAnotherActiveAdmin(tx, existing.id);

      if (scope) {
        await tx.userScope.deleteMany({ where: { userId: id } });
        await tx.userScope.createMany({
          data: scopeRows(scope).map((row) => ({ ...row, userId: id })),
        });
      }
      const updated = await tx.user.update({
        where: { id },
        data: {
          name: dto.name,
          roleId: role.id,
          status: nextStatus,
          scopeAll: scope?.all,
        },
        include: userViewInclude,
      });
      if (nextStatus === 'SUSPENDED' && existing.status !== 'SUSPENDED') {
        await tx.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.audit.log(
        {
          action: 'user.updated',
          actorId: actor.id,
          entityType: 'user',
          entityId: id,
          metadata: {
            before: snapshot(existing),
            after: snapshot(updated),
          },
        },
        tx,
      );
      return updated;
    });
    return toUserView(saved);
  }

  /**
   * Admin-initiated reset.
   * - temporary: new one-time password returned to the admin; user must change it at next login.
   * - email: the user gets the same reset link as "forgot password".
   */
  async resetPassword(id: string, method: 'temporary' | 'email', actorId: string) {
    const user = await this.findOrThrow(id);
    if (user.status !== 'ACTIVE') {
      throw new BadRequestException('ไม่สามารถรีเซ็ตรหัสผ่านของบัญชีที่ถูกระงับได้');
    }

    if (method === 'email') {
      await this.auth.requestPasswordReset(user.email);
      await this.audit.log({
        action: 'user.password_reset_emailed',
        actorId,
        entityType: 'user',
        entityId: id,
      });
      return { method, emailConfigured: this.mail.isConfigured };
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
      await tx.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(
        { action: 'user.password_reset_by_admin', actorId, entityType: 'user', entityId: id },
        tx,
      );
    });
    return { method, temporaryPassword };
  }

  /** Communities with their Locations, for the "accessible locations" picker. */
  async scopeOptions() {
    return this.prisma.community.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        locations: {
          where: { status: 'ACTIVE' },
          orderBy: { code: 'asc' },
          select: { id: true, code: true, name: true },
        },
      },
    });
  }

  /**
   * Admins always get every location. Other roles need at least one Community or Location,
   * and every id must exist. Locations already covered by a selected Community are dropped.
   */
  private async resolveScope(roleKey: string, input: ScopeDto): Promise<ScopeDto> {
    if (roleKey === SystemRole.ADMIN || input.all) {
      return { all: true, communityIds: [], locationIds: [] };
    }

    const communityIds = [...new Set(input.communityIds)];
    const locationIds = [...new Set(input.locationIds)];
    if (communityIds.length === 0 && locationIds.length === 0) {
      throw new BadRequestException('กรุณาเลือกสถานที่ที่เข้าถึงได้อย่างน้อย 1 แห่ง');
    }

    const [communities, locations] = await Promise.all([
      this.prisma.community.findMany({ where: { id: { in: communityIds } }, select: { id: true } }),
      this.prisma.location.findMany({
        where: { id: { in: locationIds } },
        select: { id: true, communityId: true },
      }),
    ]);
    if (communities.length !== communityIds.length || locations.length !== locationIds.length) {
      throw new BadRequestException('ไม่พบสถานที่บางรายการที่เลือก');
    }

    const selected = new Set(communityIds);
    return {
      all: false,
      communityIds,
      locationIds: locations.filter((l) => !selected.has(l.communityId)).map((l) => l.id),
    };
  }

  private async findOrThrow(id: string): Promise<UserRecord> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: userViewInclude });
    if (!user) throw new NotFoundException('ไม่พบผู้ใช้งานนี้');
    return user;
  }

  private async findRoleOrThrow(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new BadRequestException('ไม่พบบทบาทที่เลือก');
    return role;
  }
}

async function assertAnotherActiveAdmin(tx: Prisma.TransactionClient, excludeUserId: string) {
  const others = await tx.user.count({
    where: { id: { not: excludeUserId }, status: 'ACTIVE', role: { key: SystemRole.ADMIN } },
  });
  if (others === 0) {
    throw new BadRequestException('ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน');
  }
}

function scopeRows(scope: ScopeDto) {
  if (scope.all) return [];
  return [
    ...scope.communityIds.map((communityId) => ({ communityId })),
    ...scope.locationIds.map((locationId) => ({ locationId })),
  ];
}

function currentScope(user: UserRecord): ScopeDto {
  return {
    all: user.scopeAll,
    communityIds: user.scopes.flatMap((s) => (s.communityId ? [s.communityId] : [])),
    locationIds: user.scopes.flatMap((s) => (s.locationId ? [s.locationId] : [])),
  };
}

function snapshot(user: UserRecord) {
  return {
    name: user.name,
    role: user.role.key,
    status: user.status,
    scope: currentScope(user),
  };
}

export function toUserView(user: UserRecord): UserView {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    role: user.role,
    scope: {
      all: user.scopeAll,
      communities: user.scopes.flatMap((s) => (s.community ? [s.community] : [])),
      locations: user.scopes.flatMap((s) => (s.location ? [s.location] : [])),
    },
  };
}
