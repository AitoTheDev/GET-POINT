import {
  calculatePoints,
  DEFAULT_CLAIM_DAYS,
  formatRate,
  type PointRuleLevel,
  type RoundingMode,
} from '@getpoint/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../auth/auth-user';
import { communityWhere, hasWholeCommunity, locationWhere, type Scope } from '../auth/scope';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreatePointRuleDto,
  ListPointRulesQuery,
  ResolveQuery,
  UpdatePointRuleDto,
} from './dto';

const ref = { select: { id: true, code: true, name: true } } as const;
const ruleInclude = {
  community: ref,
  location: { select: { id: true, code: true, name: true, communityId: true } },
  shop: {
    select: {
      id: true,
      code: true,
      name: true,
      location: { select: { id: true, code: true, name: true, communityId: true } },
    },
  },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.PointRuleInclude;

type RuleRow = Prisma.PointRuleGetPayload<{ include: typeof ruleInclude }>;
type Tx = Prisma.TransactionClient;

const NOT_FOUND = 'ไม่พบเงื่อนไขนี้';

/** Prisma @db.Date values are midnight UTC of the calendar day. */
const toDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
const toDay = (date: Date) => date.toISOString().slice(0, 10);

const levelOf = (r: { shopId: string | null; locationId: string | null }): PointRuleLevel =>
  r.shopId ? 'SHOP' : r.locationId ? 'LOCATION' : 'COMMUNITY';

/** The rule's formula and dates, i.e. everything a version stores. */
interface RuleConfig {
  spendAmount: number;
  points: number;
  rounding: RoundingMode;
  maxPoints: number | null;
  /** Days after the receipt date a receipt may still be sent; null = no limit. */
  claimDays: number | null;
  startDate: string;
  endDate: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

const configOf = (r: {
  spendAmount: Prisma.Decimal;
  points: number;
  rounding: RoundingMode;
  maxPoints: number | null;
  claimDays: number | null;
  startDate: Date;
  endDate: Date | null;
  status: 'ACTIVE' | 'INACTIVE';
}): RuleConfig => ({
  spendAmount: r.spendAmount.toNumber(),
  points: r.points,
  rounding: r.rounding,
  maxPoints: r.maxPoints,
  claimDays: r.claimDays,
  startDate: toDay(r.startDate),
  endDate: r.endDate ? toDay(r.endDate) : null,
  status: r.status,
});

/** May this user change rules at the rule's place? (POINT_RULES manage is checked by the route.) */
function canManageRule(scope: Scope, r: RuleRow): boolean {
  if (scope.all) return true;
  if (r.communityId) return hasWholeCommunity(scope, r.communityId);
  const location = r.location ?? r.shop!.location;
  return (
    scope.communityIds.includes(location.communityId) || scope.locationIds.includes(location.id)
  );
}

/** Rules the user can see: at their Locations, those Locations' shops, and their Communities. */
const ruleScope = (scope: Scope): Prisma.PointRuleWhereInput =>
  scope.all
    ? {}
    : {
        OR: [
          { community: communityWhere(scope) },
          { location: locationWhere(scope) },
          { shop: { location: locationWhere(scope) } },
        ],
      };

function toRule(r: RuleRow, scope: Scope) {
  const { communityId: _c, locationId: _l, shopId: _s, createdById: _u, ...rest } = r;
  return {
    ...rest,
    ...configOf(r),
    level: levelOf(r),
    canManage: canManageRule(scope, r),
  };
}

@Injectable()
export class PointRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Communities and Locations for the form; `canManage` = rules can be added there. */
  async options(user: RequestUser) {
    const { scope } = user;
    const [communities, locations] = await this.prisma.$transaction([
      this.prisma.community.findMany({
        where: communityWhere(scope),
        select: { id: true, code: true, name: true, status: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.location.findMany({
        where: locationWhere(scope),
        select: { id: true, code: true, name: true, status: true, communityId: true },
        orderBy: { code: 'asc' },
      }),
    ]);
    return {
      communities: communities.map((c) => ({ ...c, canManage: hasWholeCommunity(scope, c.id) })),
      locations,
    };
  }

  /** Shops of one Location, for choosing a shop-level rule or testing a receipt. */
  async shops(locationId: string, user: RequestUser) {
    await this.findLocation(locationId, user);
    return this.prisma.shop.findMany({
      where: { locationId },
      select: { id: true, code: true, name: true, participating: true, status: true },
      orderBy: { code: 'asc' },
    });
  }

  async list(query: ListPointRulesQuery, user: RequestUser) {
    const and: Prisma.PointRuleWhereInput[] = [ruleScope(user.scope), { status: query.status }];
    if (query.communityId) {
      and.push({
        OR: [
          { communityId: query.communityId },
          { location: { communityId: query.communityId } },
          { shop: { location: { communityId: query.communityId } } },
        ],
      });
    }
    if (query.locationId) {
      const location = await this.findLocation(query.locationId, user);
      and.push({
        OR: [
          { communityId: location.communityId },
          { locationId: location.id },
          { shop: { locationId: location.id } },
        ],
      });
    }
    const rows = await this.prisma.pointRule.findMany({
      where: { AND: and },
      include: ruleInclude,
      take: 500,
    });
    return rows.map((r) => toRule(r, user.scope)).sort(byPlaceThenDate);
  }

  async versions(id: string, user: RequestUser) {
    await this.findAccessible(id, user);
    const versions = await this.prisma.pointRuleVersion.findMany({
      where: { ruleId: id },
      include: { changedBy: { select: { id: true, name: true } } },
      orderBy: { version: 'desc' },
    });
    return versions.map((v) => ({
      id: v.id,
      version: v.version,
      ...configOf(v),
      changedBy: v.changedBy,
      createdAt: v.createdAt,
    }));
  }

  async create(dto: CreatePointRuleDto, user: RequestUser) {
    const target = await this.resolveTarget(dto.level, dto.targetId, user);
    const config: RuleConfig = {
      spendAmount: dto.spendAmount,
      points: dto.points,
      rounding: dto.rounding,
      maxPoints: dto.maxPoints ?? null,
      claimDays: dto.claimDays !== undefined ? dto.claimDays : DEFAULT_CLAIM_DAYS,
      startDate: dto.startDate,
      endDate: dto.endDate ?? null,
      status: dto.status ?? 'ACTIVE',
    };
    assertDates(config);

    const rule = await this.prisma
      .$transaction(async (tx) => {
        await lockPlace(tx, dto.targetId);
        await assertNoOverlap(tx, target.where, config);
        const created = await tx.pointRule.create({
          data: { ...target.data, ...toColumns(config), createdById: user.id },
          include: ruleInclude,
        });
        await tx.pointRuleVersion.create({
          data: { ruleId: created.id, version: 1, ...toColumns(config), changedById: user.id },
        });
        await this.audit.log(
          {
            action: 'point_rule.created',
            actorId: user.id,
            entityType: 'point_rule',
            entityId: created.id,
            metadata: { level: dto.level, place: target.label, ...config },
          },
          tx,
        );
        return created;
      })
      .catch(rethrowOverlap);
    return toRule(rule, user.scope);
  }

  async update(id: string, dto: UpdatePointRuleDto, user: RequestUser) {
    const existing = await this.findAccessible(id, user);
    if (!canManageRule(user.scope, existing)) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์แก้ไขเงื่อนไขนี้');
    }
    const before = configOf(existing);
    const after: RuleConfig = {
      spendAmount: dto.spendAmount ?? before.spendAmount,
      points: dto.points ?? before.points,
      rounding: dto.rounding ?? before.rounding,
      maxPoints: dto.maxPoints !== undefined ? dto.maxPoints : before.maxPoints,
      claimDays: dto.claimDays !== undefined ? dto.claimDays : before.claimDays,
      startDate: dto.startDate ?? before.startDate,
      endDate: dto.endDate !== undefined ? dto.endDate : before.endDate,
      status: dto.status ?? before.status,
    };
    const changed = (Object.keys(after) as (keyof RuleConfig)[]).filter(
      (k) => after[k] !== before[k],
    );
    if (changed.length === 0) return toRule(existing, user.scope);
    assertDates(after);

    const place = {
      communityId: existing.communityId,
      locationId: existing.locationId,
      shopId: existing.shopId,
    };
    const rule = await this.prisma
      .$transaction(async (tx) => {
        await lockPlace(tx, (existing.communityId ?? existing.locationId ?? existing.shopId)!);
        await assertNoOverlap(tx, place, after, id);
        const version = existing.version + 1;
        // Only if nobody saved a newer version since we read it (no lost updates).
        const { count } = await tx.pointRule.updateMany({
          where: { id, version: existing.version },
          data: { ...toColumns(after), version },
        });
        if (count === 0) {
          throw new ConflictException(
            'มีผู้แก้ไขเงื่อนไขนี้ไปก่อนหน้า กรุณาโหลดข้อมูลใหม่แล้วลองอีกครั้ง',
          );
        }
        const saved = await tx.pointRule.findUniqueOrThrow({ where: { id }, include: ruleInclude });
        await tx.pointRuleVersion.create({
          data: { ruleId: id, version, ...toColumns(after), changedById: user.id },
        });
        await this.audit.log(
          {
            action: 'point_rule.updated',
            actorId: user.id,
            entityType: 'point_rule',
            entityId: id,
            metadata: { version, changed, before, after },
          },
          tx,
        );
        return saved;
      })
      .catch(rethrowOverlap);
    return toRule(rule, user.scope);
  }

  /** The rule a receipt from `shopId` dated `date` would use, plus its points for `amount`. */
  async resolve(query: ResolveQuery, user: RequestUser) {
    const shop = await this.prisma.shop.findFirst({
      where: { id: query.shopId, location: locationWhere(user.scope) },
      include: { location: { select: { id: true, code: true, name: true, communityId: true } } },
    });
    if (!shop) throw new NotFoundException('ไม่พบร้านค้านี้');

    const found = await this.findApplicableRule(shop.id, query.date);
    const rule = found ? toRule(found, user.scope) : null;
    return {
      shop: {
        id: shop.id,
        code: shop.code,
        name: shop.name,
        participating: shop.participating,
        status: shop.status,
      },
      date: query.date,
      rule,
      calculation: rule && query.amount !== undefined ? calculatePoints(query.amount, rule) : null,
    };
  }

  /** The rule a receipt uses, as plain data (for approval and its snapshot); null = none. */
  async applicableRule(shopId: string, date: string) {
    const found = await this.findApplicableRule(shopId, date);
    if (!found) return null;
    const { canManage: _, ...rule } = toRule(found, {
      all: true,
      communityIds: [],
      locationIds: [],
    });
    return rule;
  }

  /**
   * Shop rule, else Location rule, else Community rule, active on `date` (YYYY-MM-DD).
   * null = no rule, so the receipt cannot be approved. Used again when approving receipts.
   */
  async findApplicableRule(shopId: string, date: string): Promise<RuleRow | null> {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { locationId: true, location: { select: { communityId: true } } },
    });
    if (!shop) return null;
    const day = toDate(date);
    const activeOn: Prisma.PointRuleWhereInput = {
      status: 'ACTIVE',
      startDate: { lte: day },
      OR: [{ endDate: null }, { endDate: { gte: day } }],
    };
    for (const place of [
      { shopId },
      { locationId: shop.locationId },
      { communityId: shop.location.communityId },
    ]) {
      const rule = await this.prisma.pointRule.findFirst({
        where: { ...place, ...activeOn },
        include: ruleInclude,
        // Overlaps are prevented, but pick the newest start date if data ever disagrees.
        orderBy: { startDate: 'desc' },
      });
      if (rule) return rule;
    }
    return null;
  }

  private async findAccessible(id: string, user: RequestUser) {
    const rule = await this.prisma.pointRule.findFirst({
      where: { AND: [{ id }, ruleScope(user.scope)] },
      include: ruleInclude,
    });
    if (!rule) throw new NotFoundException(NOT_FOUND);
    return rule;
  }

  private async findLocation(id: string, user: RequestUser) {
    const location = await this.prisma.location.findFirst({
      where: { AND: [{ id }, locationWhere(user.scope)] },
    });
    if (!location) throw new NotFoundException('ไม่พบสถานที่นี้');
    return location;
  }

  /** Check the user may add a rule at this place; returns the columns to set. */
  private async resolveTarget(level: PointRuleLevel, targetId: string, user: RequestUser) {
    const { scope } = user;
    if (level === 'COMMUNITY') {
      const community = await this.prisma.community.findFirst({
        where: { id: targetId, ...communityWhere(scope) },
      });
      if (!community) throw new NotFoundException('ไม่พบ Community นี้');
      if (!hasWholeCommunity(scope, community.id)) {
        throw new ForbiddenException(
          'ตั้งเงื่อนไขระดับ Community ได้เฉพาะผู้ที่ดูแลทั้ง Community',
        );
      }
      return {
        data: { communityId: community.id },
        where: { communityId: community.id },
        label: community.name,
      };
    }
    if (level === 'LOCATION') {
      const location = await this.findLocation(targetId, user);
      return {
        data: { locationId: location.id },
        where: { locationId: location.id },
        label: location.name,
      };
    }
    const shop = await this.prisma.shop.findFirst({
      where: { id: targetId, location: locationWhere(scope) },
    });
    if (!shop) throw new NotFoundException('ไม่พบร้านค้านี้');
    return { data: { shopId: shop.id }, where: { shopId: shop.id }, label: shop.name };
  }
}

const toColumns = (c: RuleConfig) => ({
  spendAmount: new Prisma.Decimal(c.spendAmount),
  points: c.points,
  rounding: c.rounding,
  maxPoints: c.maxPoints,
  claimDays: c.claimDays,
  startDate: toDate(c.startDate),
  endDate: c.endDate ? toDate(c.endDate) : null,
  status: c.status,
});

function assertDates(c: RuleConfig) {
  for (const day of [c.startDate, c.endDate]) {
    // Round-trip check: "2026-02-31" would otherwise quietly become 3 March.
    const date = day ? toDate(day) : null;
    if (date && (Number.isNaN(date.getTime()) || toDay(date) !== day)) {
      throw new BadRequestException(`วันที่ไม่ถูกต้อง: ${day}`);
    }
  }
  if (c.endDate && c.endDate < c.startDate) {
    throw new BadRequestException('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มใช้');
  }
  if (c.maxPoints !== null && c.maxPoints < 1) {
    throw new BadRequestException('แต้มสูงสุดต้องอย่างน้อย 1');
  }
}

/**
 * The database constraint point_rules_no_overlap is the final guard against overlapping
 * active rules (e.g. two saves at the same moment); turn its error into a clear 409.
 */
function rethrowOverlap(err: unknown): never {
  if (err instanceof Error && err.message.includes('point_rules_no_overlap')) {
    throw new ConflictException(
      'ช่วงวันที่ซ้อนกับเงื่อนไขที่เปิดใช้งานอยู่ กรุณาโหลดข้อมูลใหม่แล้วตรวจสอบอีกครั้ง',
    );
  }
  throw err;
}

/** Serialise saves for one place so two overlapping rules can't slip in together. */
async function lockPlace(tx: Tx, placeId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`point_rule:${placeId}`}))`;
}

/** Two active rules at the same place may not cover the same day. */
async function assertNoOverlap(
  tx: Tx,
  place: Prisma.PointRuleWhereInput,
  c: RuleConfig,
  exceptId?: string,
) {
  if (c.status !== 'ACTIVE') return;
  const clash = await tx.pointRule.findFirst({
    where: {
      ...place,
      id: exceptId ? { not: exceptId } : undefined,
      status: 'ACTIVE',
      ...(c.endDate && { startDate: { lte: toDate(c.endDate) } }),
      OR: [{ endDate: null }, { endDate: { gte: toDate(c.startDate) } }],
    },
  });
  if (clash) {
    const range = `${toDay(clash.startDate)} – ${clash.endDate ? toDay(clash.endDate) : 'ไม่กำหนด'}`;
    throw new ConflictException(
      `ช่วงวันที่ซ้อนกับเงื่อนไขที่เปิดใช้งานอยู่ (${formatRate({
        spendAmount: clash.spendAmount.toNumber(),
        points: clash.points,
      })}, ${range}) กรุณาปิดใช้งานหรือกำหนดวันที่สิ้นสุดของเงื่อนไขเดิมก่อน`,
    );
  }
}

type Rule = ReturnType<typeof toRule>;
/** Grouped per Community: its own rules first (no location), then each Location and its shops. */
const placeKey = (r: Rule) => {
  const location = r.location ?? r.shop?.location;
  return [r.community?.id ?? location!.communityId, location?.code ?? '', r.shop?.code ?? ''];
};
/** Sort by place, then newest start date first. */
function byPlaceThenDate(a: Rule, b: Rule) {
  const [ka, kb] = [placeKey(a), placeKey(b)];
  for (let i = 0; i < ka.length; i++) {
    const diff = ka[i].localeCompare(kb[i]);
    if (diff) return diff;
  }
  return b.startDate.localeCompare(a.startDate);
}
