import { ActiveStatusLabel } from '@getpoint/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../auth/auth-user';
import { locationWhere } from '../auth/scope';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateShopDto, ExportShopsQuery, ListShopsQuery, UpdateShopDto } from './dto';
import { LocationsService } from './locations.service';

const shopInclude = {
  category: { select: { id: true, name: true } },
  location: { select: { id: true, code: true, name: true } },
} satisfies Prisma.ShopInclude;

/** Hard cap so an export can't load an unbounded number of rows into memory. */
const EXPORT_MAX_ROWS = 50_000;

@Injectable()
export class ShopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locations: LocationsService,
  ) {}

  async list(query: ListShopsQuery, user: RequestUser) {
    const where = this.where(query, user);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.shop.count({ where }),
      this.prisma.shop.findMany({
        where,
        include: shopInclude,
        orderBy: { code: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async create(dto: CreateShopDto, user: RequestUser) {
    await this.locations.findAccessibleLocation(dto.locationId, user);
    if (dto.categoryId) await this.assertActiveCategory(dto.categoryId);
    await this.assertUniqueName(dto.locationId, dto.name);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.shop.create({
        data: {
          locationId: dto.locationId,
          name: dto.name,
          categoryId: dto.categoryId ?? null,
          receiptName: dto.receiptName ?? null,
          participating: dto.participating ?? true,
          status: dto.status,
        },
        include: shopInclude,
      });
      await this.audit.log(
        {
          action: 'shop.created',
          actorId: user.id,
          entityType: 'shop',
          entityId: created.id,
          metadata: { code: created.code, ...pickShop(created) },
        },
        tx,
      );
      return created;
    });
  }

  async update(id: string, dto: UpdateShopDto, user: RequestUser) {
    const existing = await this.prisma.shop.findFirst({
      where: { id, location: locationWhere(user.scope) },
    });
    if (!existing) throw new NotFoundException('ไม่พบร้านค้านี้');

    const locationId = dto.locationId ?? existing.locationId;
    if (locationId !== existing.locationId) {
      await this.locations.findAccessibleLocation(locationId, user);
    }
    if (dto.categoryId && dto.categoryId !== existing.categoryId) {
      await this.assertActiveCategory(dto.categoryId);
    }
    const name = dto.name ?? existing.name;
    if (name !== existing.name || locationId !== existing.locationId) {
      await this.assertUniqueName(locationId, name, id);
    }

    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.shop.update({
        where: { id },
        data: {
          locationId,
          name: dto.name,
          categoryId: dto.categoryId,
          receiptName: dto.receiptName,
          participating: dto.participating,
          status: dto.status,
        },
        include: shopInclude,
      });
      await this.audit.log(
        {
          action: 'shop.updated',
          actorId: user.id,
          entityType: 'shop',
          entityId: id,
          metadata: { before: pickShop(existing), after: pickShop(saved) },
        },
        tx,
      );
      return saved;
    });
  }

  /** Excel file of the shops matching the filters (within the user's scope). */
  async exportXlsx(query: ExportShopsQuery, user: RequestUser): Promise<Buffer> {
    const where = this.where(query, user);
    const total = await this.prisma.shop.count({ where });
    if (total > EXPORT_MAX_ROWS) {
      throw new BadRequestException(
        `ข้อมูลมีมากเกินไป (${total} รายการ) กรุณาเลือกสถานที่หรือกรองข้อมูลก่อน Export`,
      );
    }
    const shops = await this.prisma.shop.findMany({
      where,
      include: {
        ...shopInclude,
        location: { select: { code: true, name: true, community: { select: { name: true } } } },
      },
      orderBy: [{ location: { code: 'asc' } }, { code: 'asc' }],
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GET POINT CMS';
    const sheet = workbook.addWorksheet('ร้านค้า');
    sheet.columns = [
      { header: 'รหัสร้าน', key: 'code', width: 12 },
      { header: 'ชื่อร้านค้า', key: 'name', width: 28 },
      { header: 'หมวดหมู่', key: 'category', width: 16 },
      { header: 'ชื่อร้านบนใบเสร็จ', key: 'receiptName', width: 24 },
      { header: 'ร่วมสะสมแต้ม', key: 'participating', width: 14 },
      { header: 'สถานะ', key: 'status', width: 12 },
      { header: 'รหัสสถานที่', key: 'locationCode', width: 12 },
      { header: 'สถานที่', key: 'location', width: 24 },
      { header: 'Community', key: 'community', width: 24 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    for (const shop of shops) {
      sheet.addRow({
        code: shop.code,
        name: shop.name,
        category: shop.category?.name ?? '',
        receiptName: shop.receiptName ?? '',
        participating: shop.participating ? 'ใช่' : 'ไม่',
        status: ActiveStatusLabel[shop.status],
        locationCode: shop.location.code,
        location: shop.location.name,
        community: shop.location.community.name,
      });
    }

    await this.audit.log({
      action: 'shop.exported',
      actorId: user.id,
      entityType: 'shop',
      metadata: { filters: { ...query }, rows: shops.length },
    });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private where(query: ExportShopsQuery & { participating?: boolean }, user: RequestUser) {
    return {
      location: locationWhere(user.scope),
      locationId: query.locationId,
      categoryId: query.categoryId,
      status: query.status,
      participating: query.participating,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { code: { contains: query.search, mode: 'insensitive' } },
          { receiptName: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    } satisfies Prisma.ShopWhereInput;
  }

  private async assertActiveCategory(id: string) {
    const category = await this.prisma.shopCategory.findUnique({ where: { id } });
    if (!category || category.status !== 'ACTIVE') {
      throw new BadRequestException('ไม่พบหมวดหมู่ที่เลือก หรือหมวดหมู่ถูกปิดใช้งาน');
    }
  }

  private async assertUniqueName(locationId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.shop.findFirst({
      where: { locationId, name: { equals: name, mode: 'insensitive' }, id: { not: exceptId } },
    });
    if (clash) throw new ConflictException('มีร้านค้าชื่อนี้ในสถานที่นี้อยู่แล้ว');
  }
}

function pickShop(s: {
  locationId: string;
  name: string;
  categoryId: string | null;
  receiptName: string | null;
  participating: boolean;
  status: string;
}) {
  return {
    locationId: s.locationId,
    name: s.name,
    categoryId: s.categoryId,
    receiptName: s.receiptName,
    participating: s.participating,
    status: s.status,
  };
}
