import { ActivityGroupLabel, ActivityLabel, hasPermission, Menu } from '@getpoint/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RequestUser } from '../auth/auth-user';
import { bangkokDayEnd, bangkokDayStart, isCalendarDay } from '../common/bangkok-time';
import { PrismaService } from '../prisma/prisma.service';
import type { ActivityLogQuery } from './dto';

/** "view" = your own activity; "manage" = everyone's (Admin by default). */
const seesEveryone = (user: RequestUser) =>
  hasPermission(user.permissions, Menu.ACTIVITY_LOG, 'manage');

/** A short "what was it about" from the stored details (code, name, email…). */
function target(metadata: Prisma.JsonValue): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  for (const key of ['code', 'name', 'email', 'key', 'place', 'report']) {
    const value = metadata[key];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ActivityLogQuery, user: RequestUser) {
    const everyone = seesEveryone(user);
    for (const day of [q.from, q.to]) {
      if (day && !isCalendarDay(day)) throw new BadRequestException(`วันที่ไม่ถูกต้อง: ${day}`);
    }
    if (q.from && q.to && q.to < q.from) {
      throw new BadRequestException('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น');
    }
    const and: Prisma.AuditLogWhereInput[] = [
      // Without "manage", other people's actions (and system ones) are never returned.
      everyone ? (q.actorId ? { actorId: q.actorId } : {}) : { actorId: user.id },
    ];
    if (q.group) and.push({ action: { startsWith: `${q.group}.` } });
    if (q.from || q.to) {
      and.push({
        createdAt: {
          ...(q.from && { gte: bangkokDayStart(q.from) }),
          ...(q.to && { lt: bangkokDayEnd(q.to) }),
        },
      });
    }
    if (q.search) and.push(this.search(q.search, everyone));

    const where: Prisma.AuditLogWhereInput = { AND: and };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
    ]);
    return {
      everyone,
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        action: r.action,
        actor: r.actor,
        entityType: r.entityType,
        entityId: r.entityId,
        target: target(r.metadata),
        metadata: r.metadata,
        ip: r.ip,
      })),
    };
  }

  /** People who appear in the log (for the "who" filter); everyone-view only. */
  actors(user: RequestUser) {
    if (!seesEveryone(user)) return [];
    return this.prisma.user.findMany({
      where: { auditLogs: { some: {} } },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
  }

  groups() {
    return Object.entries(ActivityGroupLabel).map(([key, label]) => ({ key, label }));
  }

  /** Matches the Thai action wording, the item's code/name, or (everyone-view) who did it. */
  private search(text: string, everyone: boolean): Prisma.AuditLogWhereInput {
    const actions = Object.entries(ActivityLabel)
      .filter(([, label]) => label.toLowerCase().includes(text.toLowerCase()))
      .map(([action]) => action);
    return {
      OR: [
        { action: { in: actions } },
        { action: { contains: text, mode: 'insensitive' } },
        ...['code', 'name', 'email'].map((key) => ({
          metadata: { path: [key], string_contains: text },
        })),
        ...(everyone
          ? [
              { actor: { name: { contains: text, mode: 'insensitive' as const } } },
              { actor: { email: { contains: text, mode: 'insensitive' as const } } },
            ]
          : []),
      ],
    };
  }
}
