import {
  daysInRange,
  formatThaiDate,
  formatThaiDateTime,
  formatThaiShortDate,
  formatThaiShortDateTime,
  maskThaiMobile,
  memberFullName,
  MemberStatusLabel,
  presetRange,
  ReceiptStatusLabel,
  TransferStatusLabel,
} from '@getpoint/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../auth/auth-user';
import { communityWhere } from '../auth/scope';
import { bangkokDay, bangkokDayEnd, bangkokDayStart, isCalendarDay } from '../common/bangkok-time';
import { PrismaService } from '../prisma/prisma.service';
import { receiptScope } from '../receipts/receipts.service';
import type {
  ExportQuery,
  LogaReportQuery,
  MembersReportQuery,
  RangeQuery,
  ReceiptsReportQuery,
} from './dto';

/** Reports read at most this many rows into memory; beyond that, narrow the range. */
const ROW_LIMIT = 100_000;
const EXPORT_MAX_ROWS = 50_000;
const OPEN = ['PENDING_REVIEW', 'NEEDS_CHECK'] as const;

/** The range asked for, or this Bangkok month; refuses ranges over a year. */
export function resolveRange(q: RangeQuery) {
  const fallback = presetRange('month', bangkokDay(new Date()));
  const from = q.from ?? fallback.from;
  const to = q.to ?? (q.from ? q.from : fallback.to);
  for (const day of [from, to]) {
    if (!isCalendarDay(day)) throw new BadRequestException(`วันที่ไม่ถูกต้อง: ${day}`);
  }
  if (to < from) throw new BadRequestException('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น');
  if (daysInRange(from, to).length > 366) {
    throw new BadRequestException('เลือกช่วงวันที่ได้ไม่เกิน 1 ปี');
  }
  return { from, to, gte: bangkokDayStart(from), lt: bangkokDayEnd(to) };
}

/** Count per Bangkok day over the whole range (days with nothing are 0). */
function perDay(dates: Date[], from: string, to: string) {
  const counts = new Map(daysInRange(from, to).map((d) => [d, 0]));
  for (const date of dates) {
    const day = bangkokDay(date);
    if (counts.has(day)) counts.set(day, counts.get(day)! + 1);
  }
  return [...counts].map(([day, count]) => ({ day, count }));
}

const memberScope = (user: RequestUser): Prisma.MemberWhereInput => ({
  community: communityWhere(user.scope),
});

/**
 * Dashboard and the three reports. Every number respects the user's scope (same rules as the
 * receipt pages); a Location filter counts receipts placed at that Location.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Dashboard ----------

  async dashboard(q: RangeQuery, user: RequestUser) {
    const range = resolveRange(q);
    const scoped: Prisma.ReceiptWhereInput = {
      AND: [receiptScope(user.scope), q.locationId ? { locationId: q.locationId } : {}],
    };
    const inRange: Prisma.ReceiptWhereInput = {
      AND: [scoped, { submittedAt: { gte: range.gte, lt: range.lt } }],
    };
    const [members, submitted, waiting, points, byStatus, dates, recent] = await Promise.all([
      this.prisma.member.count({
        where: {
          AND: [
            memberScope(user),
            q.locationId ? { receipts: { some: { locationId: q.locationId } } } : {},
          ],
        },
      }),
      this.prisma.receipt.count({ where: inRange }),
      this.prisma.receipt.count({ where: { AND: [scoped, { status: { in: [...OPEN] } }] } }),
      this.prisma.pointTransaction.aggregate({
        where: { receipt: scoped, createdAt: { gte: range.gte, lt: range.lt } },
        _sum: { points: true },
      }),
      this.prisma.receipt.groupBy({ by: ['status'], where: inRange, _count: { _all: true } }),
      this.prisma.receipt.findMany({
        where: inRange,
        select: { submittedAt: true },
        take: ROW_LIMIT,
      }),
      this.prisma.receipt.findMany({
        where: { AND: [scoped, { status: { in: [...OPEN] } }] },
        orderBy: { submittedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          code: true,
          status: true,
          submittedAt: true,
          amount: true,
          shop: { select: { name: true } },
          member: { select: { phone: true } },
        },
      }),
    ]);
    const count = (...s: string[]) =>
      byStatus.filter((g) => s.includes(g.status)).reduce((n, g) => n + g._count._all, 0);
    return {
      range: { from: range.from, to: range.to },
      kpis: {
        members,
        receiptsSubmitted: submitted,
        waiting,
        pointsGiven: points._sum.points ?? 0,
      },
      trend: perDay(
        dates.map((d) => d.submittedAt),
        range.from,
        range.to,
      ),
      statuses: {
        approved: count('APPROVED'),
        waiting: count(...OPEN),
        rejected: count('REJECTED'),
        total: submitted,
      },
      recentWaiting: recent.map((r) => ({
        ...r,
        amount: r.amount?.toNumber() ?? null,
        member: { phone: maskThaiMobile(r.member.phone) },
      })),
    };
  }

  // ---------- Receipts report ----------

  async receipts(q: ReceiptsReportQuery, user: RequestUser) {
    const range = resolveRange(q);
    const where: Prisma.ReceiptWhereInput = {
      AND: [
        receiptScope(user.scope),
        { submittedAt: { gte: range.gte, lt: range.lt } },
        q.locationId ? { locationId: q.locationId } : {},
        q.shopId ? { shopId: q.shopId } : {},
        q.status === 'ALL' ? {} : { status: q.status },
      ],
    };
    const rows = await this.prisma.receipt.findMany({
      where,
      take: ROW_LIMIT,
      select: {
        submittedAt: true,
        memberId: true,
        amount: true,
        shop: { select: { id: true, code: true, name: true } },
        transaction: { select: { points: true, transferStatus: true } },
      },
    });

    const sent = (r: (typeof rows)[number]) =>
      r.transaction?.transferStatus === 'SUCCEEDED' ? r.transaction.points : 0;
    const shops = new Map<
      string,
      {
        shop: { id: string; code: string; name: string } | null;
        receipts: number;
        members: Set<string>;
        amount: number;
        pointsSent: number;
      }
    >();
    for (const r of rows) {
      const key = r.shop?.id ?? '-';
      const entry =
        shops.get(key) ??
        shops
          .set(key, { shop: r.shop, receipts: 0, members: new Set(), amount: 0, pointsSent: 0 })
          .get(key)!;
      entry.receipts += 1;
      entry.members.add(r.memberId);
      entry.amount += r.amount?.toNumber() ?? 0;
      entry.pointsSent += sent(r);
    }
    const byShop = [...shops.values()]
      .map(({ members, ...s }) => ({ ...s, members: members.size, amount: round2(s.amount) }))
      .sort((a, b) => b.amount - a.amount || b.receipts - a.receipts);

    return {
      range: { from: range.from, to: range.to },
      status: q.status,
      kpis: {
        receipts: rows.length,
        amount: round2(rows.reduce((n, r) => n + (r.amount?.toNumber() ?? 0), 0)),
        // A member may use many shops: counted once here.
        members: new Set(rows.map((r) => r.memberId)).size,
        pointsSent: rows.reduce((n, r) => n + sent(r), 0),
      },
      daily: perDay(
        rows.map((r) => r.submittedAt),
        range.from,
        range.to,
      ),
      byShop,
      truncated: rows.length === ROW_LIMIT,
    };
  }

  // ---------- Members report ----------

  async members(q: MembersReportQuery, user: RequestUser) {
    const range = resolveRange(q);
    const { members, receiptsInRange } = this.memberWhere(q, user, range);
    const createdInRange = { createdAt: { gte: range.gte, lt: range.lt } };

    const [totalAtEnd, newMembers, senders] = await Promise.all([
      this.prisma.member.count({ where: { AND: [members, { createdAt: { lt: range.lt } }] } }),
      this.prisma.member.findMany({
        where: { AND: [members, createdInRange] },
        select: { id: true, createdAt: true },
        take: ROW_LIMIT,
      }),
      this.prisma.receipt.groupBy({
        by: ['memberId'],
        where: { AND: [receiptsInRange, { member: members }] },
      }),
    ]);
    const senderIds = new Set(senders.map((s) => s.memberId));
    const newSenders = newMembers.filter((m) => senderIds.has(m.id)).length;

    const where: Prisma.MemberWhereInput = {
      AND: [members, q.search ? searchMember(q.search) : {}],
    };
    const [total, items] = await Promise.all([
      this.prisma.member.count({ where }),
      this.memberRows(where, receiptsInRange, (q.page - 1) * q.pageSize, q.pageSize),
    ]);
    return {
      range: { from: range.from, to: range.to },
      kpis: {
        totalAtEnd,
        newInRange: newMembers.length,
        sendersInRange: senderIds.size,
        newSenders,
      },
      dailyNew: perDay(
        newMembers.map((m) => m.createdAt),
        range.from,
        range.to,
      ),
      newMembersSending: { sent: newSenders, notYet: newMembers.length - newSenders },
      total,
      page: q.page,
      pageSize: q.pageSize,
      items,
    };
  }

  /**
   * Members in scope (a Location = members who sent receipts there, as on the Members page),
   * and the receipts that count as "in the range".
   */
  private memberWhere(q: MembersReportQuery, user: RequestUser, range: { gte: Date; lt: Date }) {
    const receiptsInRange: Prisma.ReceiptWhereInput = {
      AND: [
        receiptScope(user.scope),
        { submittedAt: { gte: range.gte, lt: range.lt } },
        q.locationId ? { locationId: q.locationId } : {},
      ],
    };
    const members: Prisma.MemberWhereInput = {
      AND: [
        memberScope(user),
        { status: q.status },
        q.locationId ? { receipts: { some: { locationId: q.locationId } } } : {},
      ],
    };
    return { members, receiptsInRange };
  }

  /** Member rows with their receipts and approved spend in the range. */
  private async memberRows(
    where: Prisma.MemberWhereInput,
    receiptsInRange: Prisma.ReceiptWhereInput,
    skip: number,
    take: number,
  ) {
    const rows = await this.prisma.member.findMany({
      where,
      orderBy: { code: 'asc' },
      skip,
      take,
      include: { community: { select: { name: true } } },
    });
    const ids = rows.map((m) => m.id);
    const [counts, spend] = await Promise.all([
      this.prisma.receipt.groupBy({
        by: ['memberId'],
        where: { AND: [receiptsInRange, { memberId: { in: ids } }] },
        _count: { _all: true },
      }),
      this.prisma.receipt.groupBy({
        by: ['memberId'],
        where: { AND: [receiptsInRange, { memberId: { in: ids } }, { status: 'APPROVED' }] },
        _sum: { amount: true },
      }),
    ]);
    const countOf = new Map(counts.map((c) => [c.memberId, c._count._all]));
    const spendOf = new Map(spend.map((s) => [s.memberId, s._sum.amount?.toNumber() ?? 0]));
    return rows.map((m) => ({
      id: m.id,
      code: m.code,
      name: memberFullName(m),
      phone: maskThaiMobile(m.phone),
      community: m.community.name,
      status: m.status,
      createdAt: m.createdAt,
      receiptsInRange: countOf.get(m.id) ?? 0,
      approvedAmountInRange: spendOf.get(m.id) ?? 0,
    }));
  }

  // ---------- LOGA report ----------

  async loga(q: LogaReportQuery, user: RequestUser) {
    const range = resolveRange(q);
    const { base, list } = this.transferWhere(q, user, range);
    const [groups, total, items] = await Promise.all([
      this.prisma.pointTransaction.groupBy({
        by: ['transferStatus'],
        where: base,
        _count: { _all: true },
        _sum: { points: true },
      }),
      this.prisma.pointTransaction.count({ where: list }),
      this.transferRows(list, (q.page - 1) * q.pageSize, q.pageSize),
    ]);
    const g = (s: string) => groups.find((x) => x.transferStatus === s);
    const n = (...s: string[]) => s.reduce((sum, x) => sum + (g(x)?._count._all ?? 0), 0);
    return {
      range: { from: range.from, to: range.to },
      kpis: {
        pointsSent: g('SUCCEEDED')?._sum.points ?? 0,
        succeeded: n('SUCCEEDED'),
        pending: n('PENDING', 'PROCESSING'),
        failed: n('FAILED'),
        unknown: n('UNKNOWN'),
        total: n('SUCCEEDED', 'PENDING', 'PROCESSING', 'FAILED', 'UNKNOWN'),
      },
      total,
      page: q.page,
      pageSize: q.pageSize,
      items,
    };
  }

  /** Points created (= receipt approved) within the range; `list` adds the table filters. */
  private transferWhere(q: LogaReportQuery, user: RequestUser, range: { gte: Date; lt: Date }) {
    const base: Prisma.PointTransactionWhereInput = {
      createdAt: { gte: range.gte, lt: range.lt },
      receipt: {
        AND: [receiptScope(user.scope), q.locationId ? { locationId: q.locationId } : {}],
      },
    };
    const list: Prisma.PointTransactionWhereInput = {
      AND: [
        base,
        q.search ? searchTransfer(q.search) : {},
        q.transferStatus ? { transferStatus: q.transferStatus } : {},
      ],
    };
    return { base, list };
  }

  private async transferRows(where: Prisma.PointTransactionWhereInput, skip: number, take: number) {
    const rows = await this.prisma.pointTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        member: { select: { phone: true } },
        receipt: { select: { id: true, code: true, location: { select: { name: true } } } },
      },
    });
    return rows.map((t) => ({
      id: t.id,
      receiptId: t.receipt.id,
      code: t.receipt.code,
      phone: maskThaiMobile(t.member.phone),
      location: t.receipt.location?.name ?? null,
      points: t.points,
      transferStatus: t.transferStatus,
      lastError: t.lastError,
      attempts: t.attempts,
      lastAttemptAt: t.lastAttemptAt,
      sentAt: t.sentAt,
      reference: t.transferStatus === 'SUCCEEDED' ? t.reference : null,
      approvedAt: t.createdAt,
    }));
  }

  // ---------- Excel ----------

  async exportXlsx(report: ReportKind, q: ExportQuery, user: RequestUser): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GET POINT CMS';
    const range = resolveRange(q);
    const place = q.locationId
      ? ((await this.prisma.location.findUnique({ where: { id: q.locationId } }))?.name ?? '-')
      : 'ทุกสถานที่';
    const header: [string, string | number][] = [
      ['รายงาน', ReportTitle[report]],
      [
        'ช่วงวันที่',
        `${formatThaiDate(range.gte)} – ${formatThaiDate(new Date(range.lt.getTime() - 1))}`,
      ],
      ['สถานที่', place],
      ['ออกรายงานเมื่อ', formatThaiDateTime(new Date())],
    ];
    let rows: number;

    if (report === 'dashboard') {
      const d = await this.dashboard(q, user);
      summarySheet(workbook, [
        ...header,
        ['สมาชิกทั้งหมด', d.kpis.members],
        ['ใบเสร็จที่ส่งเข้ามา', d.kpis.receiptsSubmitted],
        ['รอตรวจสอบ (ปัจจุบัน)', d.kpis.waiting],
        ['แต้มที่ให้', d.kpis.pointsGiven],
        ['อนุมัติ', d.statuses.approved],
        ['รอตรวจสอบ', d.statuses.waiting],
        ['ไม่อนุมัติ', d.statuses.rejected],
      ]);
      daySheet(workbook, 'รายวัน', 'ใบเสร็จที่ส่งเข้ามา', d.trend);
      rows = d.trend.length;
    } else if (report === 'receipts') {
      const status = q.status ?? 'APPROVED';
      const r = await this.receipts({ ...q, status }, user);
      summarySheet(workbook, [
        ...header,
        ['สถานะ', status === 'ALL' ? 'ทุกสถานะ' : ReceiptStatusLabel[status]],
        ['จำนวนใบเสร็จ', r.kpis.receipts],
        ['ยอดซื้อรวม (บาท)', r.kpis.amount],
        ['จำนวนสมาชิก', r.kpis.members],
        ['แต้มที่ส่งสำเร็จ', r.kpis.pointsSent],
      ]);
      const sheet = tableSheet(workbook, 'ตามร้านค้า', [
        { header: 'รหัสร้าน', key: 'code', width: 10 },
        { header: 'ร้านค้า', key: 'name', width: 28 },
        { header: 'จำนวนใบเสร็จ', key: 'receipts', width: 14 },
        { header: 'จำนวนสมาชิก', key: 'members', width: 14 },
        { header: 'ยอดซื้อ (บาท)', key: 'amount', width: 16, style: { numFmt: '#,##0.00' } },
        { header: 'แต้มที่ส่งสำเร็จ', key: 'pointsSent', width: 16 },
      ]);
      for (const s of r.byShop) {
        sheet.addRow({ ...s, code: s.shop?.code ?? '', name: s.shop?.name ?? 'ยังไม่ระบุร้าน' });
      }
      daySheet(workbook, 'รายวัน', 'จำนวนใบเสร็จ', r.daily);
      rows = r.byShop.length;
    } else if (report === 'members') {
      const mq: MembersReportQuery = { ...q, status: q.memberStatus, page: 1, pageSize: 1 };
      const m = await this.members(mq, user);
      summarySheet(workbook, [
        ...header,
        ['สมาชิกทั้งหมด ณ สิ้นช่วง', m.kpis.totalAtEnd],
        ['สมาชิกใหม่ในช่วง', m.kpis.newInRange],
        ['สมาชิกที่ส่งใบเสร็จในช่วง', m.kpis.sendersInRange],
        ['สมาชิกใหม่ที่ส่งใบเสร็จ', m.kpis.newSenders],
      ]);
      if (m.total > EXPORT_MAX_ROWS) throw tooMany(m.total);
      const { members, receiptsInRange } = this.memberWhere(mq, user, range);
      const where = { AND: [members, mq.search ? searchMember(mq.search) : {}] };
      const items = await this.memberRows(where, receiptsInRange, 0, EXPORT_MAX_ROWS);
      const sheet = tableSheet(workbook, 'สมาชิก', [
        { header: 'รหัสสมาชิก', key: 'code', width: 12 },
        { header: 'ชื่อ-นามสกุล', key: 'name', width: 26 },
        { header: 'เบอร์โทร', key: 'phone', width: 14 },
        { header: 'Community', key: 'community', width: 24 },
        { header: 'สถานะ', key: 'status', width: 10 },
        { header: 'วันที่สมัคร', key: 'created', width: 14 },
        { header: 'ใบเสร็จในช่วง', key: 'receiptsInRange', width: 14 },
        {
          header: 'ยอดซื้อที่อนุมัติ (บาท)',
          key: 'approvedAmountInRange',
          width: 20,
          style: { numFmt: '#,##0.00' },
        },
      ]);
      for (const i of items) {
        sheet.addRow({
          ...i,
          status: MemberStatusLabel[i.status],
          created: formatThaiShortDate(i.createdAt),
        });
      }
      daySheet(workbook, 'สมาชิกใหม่รายวัน', 'สมาชิกใหม่', m.dailyNew);
      rows = items.length;
    } else {
      const lq: LogaReportQuery = { ...q, page: 1, pageSize: 1 };
      const l = await this.loga(lq, user);
      summarySheet(workbook, [
        ...header,
        ['แต้มที่ส่งสำเร็จ', l.kpis.pointsSent],
        ['ส่งสำเร็จ (รายการ)', l.kpis.succeeded],
        ['รอส่ง', l.kpis.pending],
        ['ส่งไม่สำเร็จ', l.kpis.failed],
        ['ไม่ทราบผล', l.kpis.unknown],
      ]);
      if (l.total > EXPORT_MAX_ROWS) throw tooMany(l.total);
      const { list } = this.transferWhere(lq, user, range);
      const items = await this.transferRows(list, 0, EXPORT_MAX_ROWS);
      const sheet = tableSheet(workbook, 'ประวัติการส่งแต้ม', [
        { header: 'รหัสใบเสร็จ', key: 'code', width: 12 },
        { header: 'เบอร์โทร', key: 'phone', width: 14 },
        { header: 'สถานที่', key: 'location', width: 22 },
        { header: 'แต้ม', key: 'points', width: 8 },
        { header: 'สถานะ', key: 'status', width: 14 },
        { header: 'ข้อผิดพลาดล่าสุด', key: 'lastError', width: 36 },
        { header: 'ส่งแล้ว (ครั้ง)', key: 'attempts', width: 12 },
        { header: 'ส่งล่าสุด', key: 'last', width: 18 },
        { header: 'อนุมัติเมื่อ', key: 'approved', width: 18 },
        { header: 'Reference', key: 'reference', width: 16 },
      ]);
      for (const i of items) {
        sheet.addRow({
          ...i,
          location: i.location ?? '',
          status: TransferStatusLabel[i.transferStatus],
          lastError: i.lastError ?? '',
          last: i.lastAttemptAt ? formatThaiShortDateTime(i.lastAttemptAt) : '',
          approved: formatThaiShortDateTime(i.approvedAt),
          reference: i.reference ?? '',
        });
      }
      rows = items.length;
    }

    await this.audit.log({
      action: 'report.exported',
      actorId: user.id,
      entityType: 'report',
      metadata: { report, filters: { ...q, from: range.from, to: range.to }, rows },
    });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}

export type ReportKind = 'dashboard' | 'receipts' | 'members' | 'loga';
const ReportTitle: Record<ReportKind, string> = {
  dashboard: 'Dashboard',
  receipts: 'รายงานใบเสร็จ',
  members: 'รายงานสมาชิก',
  loga: 'รายงานการส่งแต้ม LOGA',
};

const tooMany = (total: number) =>
  new BadRequestException(`ข้อมูลมีมากเกินไป (${total} รายการ) กรุณากรองข้อมูลก่อน Export`);

function summarySheet(workbook: ExcelJS.Workbook, lines: [string, string | number][]) {
  const sheet = workbook.addWorksheet('สรุป');
  sheet.columns = [{ width: 28 }, { width: 36 }];
  for (const line of lines) sheet.addRow(line);
  sheet.getColumn(1).font = { bold: true };
}

function tableSheet(workbook: ExcelJS.Workbook, name: string, columns: Partial<ExcelJS.Column>[]) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return sheet;
}

function daySheet(
  workbook: ExcelJS.Workbook,
  name: string,
  label: string,
  days: { day: string; count: number }[],
) {
  const sheet = tableSheet(workbook, name, [
    { header: 'วันที่', key: 'day', width: 14 },
    { header: label, key: 'count', width: 18 },
  ]);
  for (const d of days) {
    sheet.addRow({ day: formatThaiShortDate(bangkokDayStart(d.day)), count: d.count });
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function searchMember(search: string): Prisma.MemberWhereInput {
  const digits = search.replace(/[\s\-+]/g, '');
  return {
    OR: [
      { code: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      ...(/^\d{3,}$/.test(digits)
        ? [{ phone: { contains: digits.replace(/^66(?=[689])/, '0') } }]
        : []),
    ],
  };
}

function searchTransfer(search: string): Prisma.PointTransactionWhereInput {
  const digits = search.replace(/[\s\-+]/g, '');
  return {
    OR: [
      { reference: { contains: search.replace(/^#/, ''), mode: 'insensitive' } },
      ...(/^\d{3,}$/.test(digits)
        ? [{ member: { phone: { contains: digits.replace(/^66(?=[689])/, '0') } } }]
        : []),
    ],
  };
}
