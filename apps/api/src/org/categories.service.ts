import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto';

/** Shop categories (หมวดหมู่). Read by anyone who can see shops; edited by admins (Settings). */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const categories = await this.prisma.shopCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { shops: true } } },
    });
    return categories.map(({ _count, ...c }) => ({ ...c, shopCount: _count.shops }));
  }

  async create(dto: CreateCategoryDto, actorId: string) {
    await this.assertUniqueName(dto.name);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.shopCategory.create({
        data: { name: dto.name, sortOrder: dto.sortOrder ?? 0 },
      });
      await this.audit.log(
        {
          action: 'shop_category.created',
          actorId,
          entityType: 'shop_category',
          entityId: created.id,
          metadata: { name: created.name },
        },
        tx,
      );
      return created;
    });
  }

  async update(id: string, dto: UpdateCategoryDto, actorId: string) {
    const existing = await this.findOrThrow(id);
    if (dto.name && dto.name.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertUniqueName(dto.name, id);
    }
    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.shopCategory.update({
        where: { id },
        data: { name: dto.name, sortOrder: dto.sortOrder, status: dto.status },
      });
      await this.audit.log(
        {
          action: 'shop_category.updated',
          actorId,
          entityType: 'shop_category',
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

  /** Only unused categories can be deleted; used ones should be switched off instead. */
  async remove(id: string, actorId: string) {
    const existing = await this.findOrThrow(id);
    const used = await this.prisma.shop.count({ where: { categoryId: id } });
    if (used > 0) {
      throw new ConflictException(
        `หมวดหมู่นี้มีร้านค้าใช้อยู่ ${used} ร้าน ไม่สามารถลบได้ (ปิดใช้งานแทนได้)`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.shopCategory.delete({ where: { id } });
      await this.audit.log(
        {
          action: 'shop_category.deleted',
          actorId,
          entityType: 'shop_category',
          entityId: id,
          metadata: { name: existing.name },
        },
        tx,
      );
    });
  }

  private async findOrThrow(id: string) {
    const category = await this.prisma.shopCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('ไม่พบหมวดหมู่นี้');
    return category;
  }

  private async assertUniqueName(name: string, exceptId?: string) {
    const clash = await this.prisma.shopCategory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, id: { not: exceptId } },
    });
    if (clash) throw new ConflictException('มีหมวดหมู่ชื่อนี้อยู่แล้ว');
  }
}
