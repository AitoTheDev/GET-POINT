import {
  formatThaiMobile,
  formatThaiShortDate,
  LogaLinkStatusLabel,
  maskThaiMobile,
  MemberChannelLabel,
  memberFullName,
  MemberStatusLabel,
} from '@getpoint/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../auth/auth-user';
import { communityWhere } from '../auth/scope';
import { bangkokDayEnd, bangkokDayStart, bangkokMonthStart } from '../common/bangkok-time';
import { LogaService } from '../loga/loga.service';
import { logaCuid, LogaRequestError, LogaUnavailableError } from '../loga/loga.types';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateMemberDto, ListMembersQuery, MemberFilterQuery, UpdateMemberDto } from './dto';

export const memberInclude = {
  community: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.MemberInclude;

export type MemberRow = Prisma.MemberGetPayload<{ include: typeof memberInclude }>;

const NOT_FOUND = 'ไม่พบสมาชิกนี้';
const PHONE_TAKEN = 'เบอร์โทรนี้เป็นสมาชิกใน Community นี้อยู่แล้ว';
const EXPORT_MAX_ROWS = 50_000;

/** Live LOGA balance of one member in the list. */
export type BalanceStatus = 'OK' | 'NOT_LINKED' | 'NOT_FOUND' | 'UNAVAILABLE';

/** API shape of a member. Raw LOGA/LINE IDs are reduced to what staff need to see. */
function toMember({ logaUid, logaPcardId, lineUserId, createdById: _, ...m }: MemberRow) {
  return {
    ...m,
    logaId: logaCuid({ uid: logaUid, pcardId: logaPcardId }),
    lineLinked: Boolean(lineUserId),
    // Receipts arrive in Session 5; until then every member has none.
    receiptCount: 0,
  };
}

/** Members are seen through their Community: a Location grant covers its Community's members. */
const memberScope = (user: RequestUser): Prisma.MemberWhereInput => ({
  community: communityWhere(user.scope),
});

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly loga: LogaService,
  ) {}

  async list(query: ListMembersQuery, user: RequestUser) {
    const where = this.where(query, user);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.member.count({ where }),
      this.prisma.member.findMany({
        where,
        include: memberInclude,
        orderBy: { code: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toMember), total, page: query.page, pageSize: query.pageSize };
  }

  /** KPI cards at the top of the Members page. */
  async summary(user: RequestUser) {
    const scope = memberScope(user);
    const [total, newThisMonth, active, withReceipts] = await this.prisma.$transaction([
      this.prisma.member.count({ where: scope }),
      this.prisma.member.count({ where: { ...scope, createdAt: { gte: bangkokMonthStart() } } }),
      this.prisma.member.count({ where: { ...scope, status: 'ACTIVE' } }),
      this.prisma.member.count({ where: { ...scope, receipts: { some: {} } } }),
    ]);
    return { total, newThisMonth, withReceipts, active };
  }

  /** Communities the user can pick in filters and the add-member form. */
  communityOptions(user: RequestUser) {
    return this.prisma.community.findMany({
      where: communityWhere(user.scope),
      select: { id: true, code: true, name: true, status: true },
      orderBy: { code: 'asc' },
    });
  }

  async get(id: string, user: RequestUser) {
    return toMember(await this.findAccessible(id, user));
  }

  async create(dto: CreateMemberDto, user: RequestUser) {
    const community = await this.prisma.community.findFirst({
      where: { id: dto.communityId, ...communityWhere(user.scope) },
    });
    if (!community) throw new NotFoundException('ไม่พบ Community นี้');
    if (community.status !== 'ACTIVE') {
      throw new BadRequestException('Community นี้ถูกปิดใช้งาน ไม่สามารถเพิ่มสมาชิกได้');
    }
    await this.assertPhoneFree(dto.communityId, dto.phone);

    const created = await this.prisma
      .$transaction(async (tx) => {
        const member = await tx.member.create({
          data: {
            communityId: dto.communityId,
            phone: dto.phone,
            firstName: dto.firstName,
            lastName: dto.lastName ?? null,
            note: dto.note ?? null,
            channel: 'CMS',
            createdById: user.id,
          },
        });
        await this.audit.log(
          {
            action: 'member.created',
            actorId: user.id,
            entityType: 'member',
            entityId: member.id,
            metadata: { code: member.code, phone: maskThaiMobile(member.phone) },
          },
          tx,
        );
        return member;
      })
      .catch(rethrowPhoneTaken);

    // Outside the DB transaction: a slow or failed LOGA call must not lose the new member.
    return this.link(created.id, user);
  }

  async update(id: string, dto: UpdateMemberDto, user: RequestUser) {
    const existing = await this.findAccessible(id, user);
    const phoneChanged = dto.phone !== undefined && dto.phone !== existing.phone;
    if (phoneChanged) {
      if (existing.logaLinkStatus === 'LINKED') {
        throw new BadRequestException(
          'ไม่สามารถเปลี่ยนเบอร์โทรของสมาชิกที่เชื่อมกับ LOGA แล้ว เพราะ LOGA ใช้เบอร์นี้ระบุตัวสมาชิก',
        );
      }
      await this.assertPhoneFree(existing.communityId, dto.phone!, id);
    }

    const saved = await this.prisma
      .$transaction(async (tx) => {
        const member = await tx.member.update({
          where: { id },
          data: {
            phone: dto.phone,
            firstName: dto.firstName,
            lastName: dto.lastName,
            note: dto.note,
            status: dto.status,
            // A new phone may belong to a different LOGA member: link again from scratch.
            ...(phoneChanged && { logaLinkStatus: 'NOT_LINKED', logaLinkError: null }),
          },
          include: memberInclude,
        });
        const statusChanged = dto.status !== undefined && dto.status !== existing.status;
        await this.audit.log(
          {
            action: statusChanged
              ? member.status === 'SUSPENDED'
                ? 'member.suspended'
                : 'member.reactivated'
              : 'member.updated',
            actorId: user.id,
            entityType: 'member',
            entityId: id,
            metadata: {
              code: member.code,
              changed: changedFields(existing, member),
            },
          },
          tx,
        );
        return member;
      })
      .catch(rethrowPhoneTaken);

    return phoneChanged ? this.link(id, user) : toMember(saved);
  }

  /**
   * Match the member to LOGA by phone, or register them in LOGA. Errors are saved on the
   * member (shown in the CMS with a retry button) instead of failing the request.
   */
  async link(id: string, user: RequestUser) {
    return this.linkMember(await this.findAccessible(id, user), user.id);
  }

  /** Same as link(), for a member already loaded; `actorId` null = the member themself (LINE). */
  async linkMember(member: MemberRow, actorId: string | null) {
    const id = member.id;
    if (member.logaLinkStatus === 'LINKED') return toMember(member);

    let data: Prisma.MemberUpdateInput;
    let created = false;
    try {
      const ref = await this.loga.findOrCreate(member.phone, memberFullName(member));
      created = ref.created;
      data = {
        logaUid: ref.uid,
        logaPcardId: ref.pcardId,
        logaLinkStatus: 'LINKED',
        logaLinkError: null,
      };
    } catch (err) {
      data = { logaLinkStatus: 'ERROR', logaLinkError: linkErrorMessage(err) };
      if (!(err instanceof LogaUnavailableError || err instanceof LogaRequestError)) {
        this.logger.error(`LOGA link failed for member ${member.code}`, err as Error);
      }
    }

    const saved = await this.prisma.member.update({
      where: { id },
      data: { ...data, logaCheckedAt: new Date() },
      include: memberInclude,
    });
    await this.audit.log({
      action: saved.logaLinkStatus === 'LINKED' ? 'member.loga_linked' : 'member.loga_link_failed',
      actorId,
      entityType: 'member',
      entityId: id,
      metadata: {
        code: saved.code,
        ...(saved.logaLinkStatus === 'LINKED'
          ? {
              logaId: logaCuid({ uid: saved.logaUid, pcardId: saved.logaPcardId }),
              createdInLoga: created,
            }
          : { error: saved.logaLinkError }),
      },
    });
    return toMember(saved);
  }

  /** Points and other live data for the member detail panel. */
  async logaDetail(id: string, user: RequestUser) {
    const member = await this.findAccessible(id, user);
    if (member.logaLinkStatus !== 'LINKED')
      return { status: 'NOT_LINKED' as const, customer: null };
    try {
      const customer = await this.loga.getCustomer({
        uid: member.logaUid,
        pcardId: member.logaPcardId,
      });
      return customer
        ? { status: 'OK' as const, customer }
        : { status: 'NOT_FOUND' as const, customer: null };
    } catch {
      return { status: 'UNAVAILABLE' as const, customer: null };
    }
  }

  /** Live points for one page of the list (LOGA is called at most 5 at a time, with a cache). */
  async balances(ids: string[], user: RequestUser) {
    const members = await this.prisma.member.findMany({
      where: { id: { in: ids }, ...memberScope(user) },
      select: { id: true, logaUid: true, logaPcardId: true, logaLinkStatus: true },
    });
    const linked = members
      .filter((m) => m.logaLinkStatus === 'LINKED')
      .map((m) => ({ id: m.id, uid: m.logaUid, pcardId: m.logaPcardId }));
    const results = await this.loga.getMany(linked);

    const byId = new Map(results.map((r) => [r.ref.id, r]));
    return members.map((m): { id: string; status: BalanceStatus; points: number | null } => {
      const r = byId.get(m.id);
      if (!r) return { id: m.id, status: 'NOT_LINKED', points: null };
      if (r.error) return { id: m.id, status: 'UNAVAILABLE', points: null };
      if (!r.customer) return { id: m.id, status: 'NOT_FOUND', points: null };
      return { id: m.id, status: 'OK', points: r.customer.points };
    });
  }

  /** Excel file of the members matching the filters (within the user's scope). */
  async exportXlsx(query: MemberFilterQuery, user: RequestUser): Promise<Buffer> {
    const where = this.where(query, user);
    const total = await this.prisma.member.count({ where });
    if (total > EXPORT_MAX_ROWS) {
      throw new BadRequestException(
        `ข้อมูลมีมากเกินไป (${total} รายการ) กรุณากรองข้อมูลก่อน Export`,
      );
    }
    const members = await this.prisma.member.findMany({
      where,
      include: memberInclude,
      orderBy: { code: 'asc' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GET POINT CMS';
    const sheet = workbook.addWorksheet('สมาชิก');
    sheet.columns = [
      { header: 'รหัสสมาชิก', key: 'code', width: 12 },
      { header: 'ชื่อ', key: 'firstName', width: 20 },
      { header: 'นามสกุล', key: 'lastName', width: 20 },
      { header: 'เบอร์โทร', key: 'phone', width: 16 },
      { header: 'Community', key: 'community', width: 24 },
      { header: 'สถานะ', key: 'status', width: 10 },
      { header: 'ช่องทางสมัคร', key: 'channel', width: 16 },
      { header: 'เชื่อม LINE', key: 'line', width: 12 },
      { header: 'LOGA', key: 'loga', width: 22 },
      { header: 'รหัส LOGA', key: 'logaId', width: 14 },
      { header: 'วันที่สมัคร', key: 'registered', width: 14 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    for (const m of members) {
      sheet.addRow({
        code: m.code,
        firstName: m.firstName,
        lastName: m.lastName ?? '',
        phone: formatThaiMobile(m.phone),
        community: m.community.name,
        status: MemberStatusLabel[m.status],
        channel: MemberChannelLabel[m.channel],
        line: m.lineUserId ? 'ใช่' : 'ไม่',
        loga: LogaLinkStatusLabel[m.logaLinkStatus],
        logaId: logaCuid({ uid: m.logaUid, pcardId: m.logaPcardId }) ?? '',
        registered: formatThaiShortDate(m.createdAt),
      });
    }

    await this.audit.log({
      action: 'member.exported',
      actorId: user.id,
      entityType: 'member',
      metadata: { filters: { ...query }, rows: members.length },
    });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private where(query: MemberFilterQuery, user: RequestUser): Prisma.MemberWhereInput {
    const and: Prisma.MemberWhereInput[] = [
      memberScope(user),
      { communityId: query.communityId, status: query.status },
    ];
    if (query.registeredFrom || query.registeredTo) {
      and.push({
        createdAt: {
          ...(query.registeredFrom && { gte: bangkokDayStart(query.registeredFrom) }),
          ...(query.registeredTo && { lt: bangkokDayEnd(query.registeredTo) }),
        },
      });
    }
    if (query.search) and.push(searchWhere(query.search));
    return { AND: and };
  }

  /** Member inside the user's scope, or 404 (never reveals members outside it). */
  private async findAccessible(id: string, user: RequestUser) {
    const member = await this.prisma.member.findFirst({
      where: { id, ...memberScope(user) },
      include: memberInclude,
    });
    if (!member) throw new NotFoundException(NOT_FOUND);
    return member;
  }

  private async assertPhoneFree(communityId: string, phone: string, exceptId?: string) {
    const clash = await this.prisma.member.findFirst({
      where: { communityId, phone, id: { not: exceptId } },
      select: { code: true },
    });
    if (clash) throw new ConflictException(`${PHONE_TAKEN} (${clash.code})`);
  }
}

/** Search by code, phone (any format) or name, including "first last". */
function searchWhere(search: string): Prisma.MemberWhereInput {
  const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });
  const or: Prisma.MemberWhereInput[] = [
    { code: contains(search) },
    { firstName: contains(search) },
    { lastName: contains(search) },
  ];
  const digits = search.replace(/[\s\-+]/g, '');
  if (/^\d{3,}$/.test(digits)) {
    // "+66 81..." / "6681..." typed as an international number → local "081..."
    or.push({ phone: { contains: digits.replace(/^66(?=[689])/, '0') } });
  }
  const [first, ...rest] = search.split(/\s+/);
  if (rest.length) {
    or.push({ firstName: contains(first), lastName: contains(rest.join(' ')) });
  }
  return { OR: or };
}

function changedFields(before: MemberRow, after: MemberRow) {
  const keys = ['phone', 'firstName', 'lastName', 'note', 'status'] as const;
  return keys.filter((k) => before[k] !== after[k]);
}

function linkErrorMessage(err: unknown): string {
  if (err instanceof LogaUnavailableError) return err.message;
  if (err instanceof LogaRequestError)
    return `LOGA ไม่รับข้อมูลสมาชิก: ${err.logaMessage || err.code}`;
  return 'เชื่อม LOGA ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
}

/** Two people adding the same phone at the same moment: the unique index decides. */
function rethrowPhoneTaken(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new ConflictException(PHONE_TAKEN);
  }
  throw err;
}
