import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../auth/auth-user';
import { communityWhere, hasWholeCommunity, locationWhere } from '../auth/scope';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateCommunityDto,
  CreateLocationDto,
  ListLocationsQuery,
  UpdateCommunityDto,
  UpdateLocationDto,
} from './dto';

const NOT_FOUND_COMMUNITY = 'ไม่พบ Community นี้';
const NOT_FOUND_LOCATION = 'ไม่พบสถานที่นี้';

/** Communities and their Locations (Community Malls), limited to the user's scope. */
@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Communities ----------

  async listCommunities(user: RequestUser) {
    const communities = await this.prisma.community.findMany({
      where: communityWhere(user.scope),
      orderBy: { code: 'asc' },
      include: { locations: { where: locationWhere(user.scope), select: { id: true } } },
    });
    return communities.map(({ locations, ...c }) => ({
      ...c,
      locationCount: locations.length,
      /** Whether this user may edit the Community and add Locations to it. */
      canManage: hasWholeCommunity(user.scope, c.id),
    }));
  }

  async createCommunity(dto: CreateCommunityDto, user: RequestUser) {
    // A new Community is outside everyone's scope except users with access to everything.
    if (!user.scope.all) {
      throw new ForbiddenException(
        'เฉพาะผู้ใช้ที่เข้าถึงได้ทุกสถานที่เท่านั้นที่สร้าง Community ได้',
      );
    }
    await this.assertUniqueCommunityName(dto.name);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.community.create({
        data: { name: dto.name, status: dto.status },
      });
      await this.audit.log(
        {
          action: 'community.created',
          actorId: user.id,
          entityType: 'community',
          entityId: created.id,
          metadata: { code: created.code, name: created.name },
        },
        tx,
      );
      return created;
    });
  }

  async updateCommunity(id: string, dto: UpdateCommunityDto, user: RequestUser) {
    const existing = await this.prisma.community.findFirst({
      where: { id, ...communityWhere(user.scope) },
    });
    if (!existing) throw new NotFoundException(NOT_FOUND_COMMUNITY);
    if (!hasWholeCommunity(user.scope, id)) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์แก้ไข Community นี้');
    }
    if (dto.name && dto.name !== existing.name) await this.assertUniqueCommunityName(dto.name, id);

    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.community.update({
        where: { id },
        data: { name: dto.name, status: dto.status },
      });
      await this.audit.log(
        {
          action: 'community.updated',
          actorId: user.id,
          entityType: 'community',
          entityId: id,
          metadata: {
            before: { name: existing.name, status: existing.status },
            after: { name: saved.name, status: saved.status },
          },
        },
        tx,
      );
      return saved;
    });
  }

  // ---------- Locations ----------

  async listLocations(query: ListLocationsQuery, user: RequestUser) {
    const where: Prisma.LocationWhereInput = {
      AND: [
        locationWhere(user.scope),
        {
          communityId: query.communityId,
          status: query.status,
          ...(query.search && {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }),
        },
      ],
    };
    const locations = await this.prisma.location.findMany({
      where,
      orderBy: { code: 'asc' },
      include: {
        community: { select: { id: true, code: true, name: true } },
        _count: { select: { shops: true } },
      },
    });
    return locations.map(({ _count, ...l }) => ({
      ...l,
      shopCount: _count.shops,
      canManageCommunity: hasWholeCommunity(user.scope, l.communityId),
    }));
  }

  async createLocation(dto: CreateLocationDto, user: RequestUser) {
    const community = await this.prisma.community.findFirst({
      where: { id: dto.communityId, ...communityWhere(user.scope) },
    });
    if (!community) throw new NotFoundException(NOT_FOUND_COMMUNITY);
    if (!hasWholeCommunity(user.scope, community.id)) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์เพิ่มสถานที่ใน Community นี้');
    }
    await this.assertUniqueLocationName(dto.communityId, dto.name);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.location.create({
        data: {
          communityId: dto.communityId,
          name: dto.name,
          province: dto.province ?? null,
          status: dto.status,
        },
      });
      await this.audit.log(
        {
          action: 'location.created',
          actorId: user.id,
          entityType: 'location',
          entityId: created.id,
          metadata: { code: created.code, name: created.name, communityId: created.communityId },
        },
        tx,
      );
      return created;
    });
  }

  async updateLocation(id: string, dto: UpdateLocationDto, user: RequestUser) {
    const existing = await this.findAccessibleLocation(id, user);
    const moving = dto.communityId && dto.communityId !== existing.communityId;
    // Moving a Location changes which Community-level users can see it: users with access to everything only.
    if (moving && !user.scope.all) {
      throw new ForbiddenException(
        'เฉพาะผู้ใช้ที่เข้าถึงได้ทุกสถานที่เท่านั้นที่ย้าย Community ได้',
      );
    }
    if (moving && !(await this.prisma.community.findUnique({ where: { id: dto.communityId } }))) {
      throw new NotFoundException(NOT_FOUND_COMMUNITY);
    }
    const communityId = dto.communityId ?? existing.communityId;
    if (dto.name && (dto.name !== existing.name || moving)) {
      await this.assertUniqueLocationName(communityId, dto.name, id);
    }

    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.location.update({
        where: { id },
        data: { communityId, name: dto.name, province: dto.province, status: dto.status },
      });
      await this.audit.log(
        {
          action: 'location.updated',
          actorId: user.id,
          entityType: 'location',
          entityId: id,
          metadata: {
            before: pickLocation(existing),
            after: pickLocation(saved),
          },
        },
        tx,
      );
      return saved;
    });
  }

  /** Location inside the user's scope, or 404 (never reveals locations outside it). */
  async findAccessibleLocation(id: string, user: RequestUser) {
    const location = await this.prisma.location.findFirst({
      where: { AND: [{ id }, locationWhere(user.scope)] },
    });
    if (!location) throw new NotFoundException(NOT_FOUND_LOCATION);
    return location;
  }

  /** Summary cards on the Shops & Locations page. */
  async summary(user: RequestUser) {
    const locationFilter = locationWhere(user.scope);
    const [locations, shops, participatingShops] = await this.prisma.$transaction([
      this.prisma.location.count({ where: locationFilter }),
      this.prisma.shop.count({ where: { location: locationFilter } }),
      this.prisma.shop.count({
        where: { location: locationFilter, participating: true, status: 'ACTIVE' },
      }),
    ]);
    return { locations, shops, participatingShops };
  }

  private async assertUniqueCommunityName(name: string, exceptId?: string) {
    const clash = await this.prisma.community.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, id: { not: exceptId } },
    });
    if (clash) throw new ConflictException('มี Community ชื่อนี้อยู่แล้ว');
  }

  private async assertUniqueLocationName(communityId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.location.findFirst({
      where: { communityId, name: { equals: name, mode: 'insensitive' }, id: { not: exceptId } },
    });
    if (clash) throw new ConflictException('มีสถานที่ชื่อนี้ใน Community นี้อยู่แล้ว');
  }
}

function pickLocation(l: {
  communityId: string;
  name: string;
  province: string | null;
  status: string;
}) {
  return { communityId: l.communityId, name: l.name, province: l.province, status: l.status };
}
