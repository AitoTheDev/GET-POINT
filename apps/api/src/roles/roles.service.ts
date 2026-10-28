import { type MenuPermission, SystemRole } from '@getpoint/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { toMenuPermissions } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRoleDto, UpdateRoleDto } from './dto';

export interface RoleView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: MenuPermission[];
}

const roleInclude = { permissions: true, _count: { select: { users: true } } } as const;

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<RoleView[]> {
    const roles = await this.prisma.role.findMany({
      include: roleInclude,
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });
    return roles.map(toRoleView);
  }

  async create(dto: CreateRoleDto, actorId: string): Promise<RoleView> {
    // One entry per menu; "manage" implies "view".
    const permissions = toMenuPermissions(dto.permissions);
    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          key: `CUSTOM_${randomBytes(4).toString('hex').toUpperCase()}`,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          permissions: { create: permissions },
        },
        include: roleInclude,
      });
      await this.audit.log(
        {
          action: 'role.created',
          actorId,
          entityType: 'role',
          entityId: created.id,
          metadata: { name: created.name, permissions },
        },
        tx,
      );
      return created;
    });
    return toRoleView(role);
  }

  async update(id: string, dto: UpdateRoleDto, actorId: string): Promise<RoleView> {
    const existing = await this.findOrThrow(id);
    if (existing.key === SystemRole.ADMIN && dto.permissions) {
      throw new BadRequestException('ไม่สามารถลดสิทธิ์ของบทบาทผู้ดูแลระบบได้');
    }

    const permissions = dto.permissions ? toMenuPermissions(dto.permissions) : undefined;
    const role = await this.prisma.$transaction(async (tx) => {
      if (permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ ...p, roleId: id })),
        });
      }
      const saved = await tx.role.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          description: dto.description === undefined ? undefined : dto.description.trim() || null,
        },
        include: roleInclude,
      });
      await this.audit.log(
        {
          action: 'role.updated',
          actorId,
          entityType: 'role',
          entityId: id,
          metadata: {
            before: { name: existing.name, permissions: toMenuPermissions(existing.permissions) },
            after: { name: saved.name, permissions: permissions ?? 'unchanged' },
          },
        },
        tx,
      );
      return saved;
    });
    return toRoleView(role);
  }

  async remove(id: string, actorId: string): Promise<void> {
    const role = await this.findOrThrow(id);
    if (role.isSystem) throw new BadRequestException('ไม่สามารถลบบทบาทหลักของระบบได้');
    if (role._count.users > 0) {
      throw new ConflictException('ยังมีผู้ใช้งานในบทบาทนี้ กรุณาย้ายผู้ใช้งานก่อนลบ');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      await this.audit.log(
        {
          action: 'role.deleted',
          actorId,
          entityType: 'role',
          entityId: id,
          metadata: { name: role.name },
        },
        tx,
      );
    });
  }

  private async findOrThrow(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: roleInclude });
    if (!role) throw new NotFoundException('ไม่พบบทบาทนี้');
    return role;
  }
}

function toRoleView(role: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: { menu: string; canView: boolean; canManage: boolean }[];
  _count: { users: number };
}): RoleView {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    userCount: role._count.users,
    permissions: toMenuPermissions(role.permissions),
  };
}
