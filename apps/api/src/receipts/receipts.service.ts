import {
  calculatePoints,
  daysBetween,
  formatRate,
  formatThaiDateTime,
  formatThaiMobile,
  formatThaiShortDate,
  memberFullName,
  normalizeReceiptNo,
  type PointCalculation,
  ReceiptStatusLabel,
  orderedRejectReasons,
  type RejectReasonSetting,
  TransferStatusLabel,
} from '@getpoint/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type RejectReason } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../auth/auth-user';
import { communityWhere, locationWhere, type Scope } from '../auth/scope';
import { bangkokDay, bangkokDayEnd, bangkokDayStart } from '../common/bangkok-time';
import { PointRulesService } from '../point-rules/point-rules.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { TransferService } from '../transfers/transfer.service';
import type {
  CreateReceiptDto,
  ListReceiptsQuery,
  NeedsCheckDto,
  PartialFieldsDto,
  ReceiptFieldsDto,
  RejectDto,
} from './dto';
import { checkSubmission, ReceiptFileError } from './receipt-files';
import { ReceiptStorageService } from './receipt-storage.service';

const receiptInclude = {
  member: {
    select: {
      id: true,
      code: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
      communityId: true,
    },
  },
  location: { select: { id: true, code: true, name: true, communityId: true } },
  shop: { select: { id: true, code: true, name: true, participating: true, status: true } },
  submission: { select: { id: true, createdAt: true, _count: { select: { receipts: true } } } },
  transaction: {
    select: {
      id: true,
      points: true,
      transferStatus: true,
      rule: true,
      calculation: true,
      remark: true,
      attempts: true,
      lastAttemptAt: true,
      nextAttemptAt: true,
      lastError: true,
      sentAt: true,
      pointsAfter: true,
    },
  },
  reviewedBy: { select: { id: true, name: true } },
} satisfies Prisma.ReceiptInclude;

type ReceiptRow = Prisma.ReceiptGetPayload<{ include: typeof receiptInclude }>;

/** Receipts waiting for a decision. */
const OPEN: ('PENDING_REVIEW' | 'NEEDS_CHECK')[] = ['PENDING_REVIEW', 'NEEDS_CHECK'];
const EXPORT_MAX_ROWS = 50_000;
const NOT_FOUND = 'ไม่พบใบเสร็จนี้';
const ALREADY_REVIEWED = 'ใบเสร็จนี้ถูกตรวจสอบไปแล้ว กรุณาโหลดข้อมูลใหม่';

const toDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
const toDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Receipts staff may see: those at their Locations, plus receipts not yet placed at a Location
 * from members of their Communities (so someone in scope can pick them up).
 */
function receiptScope(scope: Scope): Prisma.ReceiptWhereInput {
  if (scope.all) return {};
  return {
    OR: [
      { location: locationWhere(scope) },
      { locationId: null, member: { community: communityWhere(scope) } },
    ],
  };
}

/** API shape: no file path, numbers instead of Decimals, calendar days as strings. */
function toReceipt(
  { imagePath: _, fingerprint: __, submission, ...r }: ReceiptRow,
  reasons: Record<RejectReason, RejectReasonSetting>,
) {
  return {
    ...r,
    amount: r.amount?.toNumber() ?? null,
    receiptDate: r.receiptDate ? toDay(r.receiptDate) : null,
    member: { ...r.member, name: memberFullName(r.member) },
    submission: { id: submission.id, count: submission._count.receipts },
    rejectLabel: r.rejectReason ? reasons[r.rejectReason].label : null,
    /** What the member will see in LINE. */
    memberMessage: r.rejectReason ? reasons[r.rejectReason].memberMessage : null,
  };
}

/** One reason the receipt can't be approved (or a warning), with the reject reason it suggests. */
export interface Problem {
  code:
    | 'MEMBER_SUSPENDED'
    | 'SHOP_NOT_PARTICIPATING'
    | 'FUTURE_DATE'
    | 'TOO_OLD'
    | 'NO_RULE'
    | 'DUPLICATE_APPROVED'
    | 'SAME_IMAGE'
    | 'SAME_DETAILS';
  message: string;
  /** Blocks approval (warnings don't). */
  blocking: boolean;
  suggestedReason?: RejectReason;
  /** Other receipts involved (duplicates). */
  receipts?: { id: string; code: string; status: string }[];
}

type EvaluatedRule = NonNullable<Awaited<ReturnType<ReceiptsService['check']>>['rule']>;

type Fields = Partial<
  Pick<ReceiptFieldsDto, 'locationId' | 'shopId' | 'receiptNo' | 'receiptDate' | 'amount'>
>;

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rules: PointRulesService,
    private readonly storage: ReceiptStorageService,
    private readonly settings: SettingsService,
    private readonly transfers: TransferService,
  ) {}

  private reasons() {
    return this.settings.get('rejectReasons');
  }

  /** What the review and add-receipt screens need: reject reasons and upload limits. */
  async config() {
    const values = await this.settings.all();
    return {
      rejectReasons: orderedRejectReasons(values.rejectReasons),
      uploadLimits: values.uploadLimits,
    };
  }

  /**
   * Store a member's submission: 1–10 files (JPG/PNG/PDF, ≤10 MB), one receipt per file.
   * Used by the LINE flow (Session 8), staff on the review page and the sample script.
   */
  async createSubmission(
    memberId: string,
    files: Buffer[],
    {
      channel = 'LIFF',
      createdById,
    }: { channel?: 'LIFF' | 'CMS' | 'SAMPLE'; createdById?: string } = {},
  ) {
    let checked;
    try {
      checked = checkSubmission(files, await this.settings.get('uploadLimits'));
    } catch (err) {
      if (err instanceof ReceiptFileError) throw new BadRequestException(err.message);
      throw err;
    }
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member) throw new NotFoundException('ไม่พบสมาชิก');
    if (member.status !== 'ACTIVE') {
      throw new BadRequestException('บัญชีสมาชิกถูกระงับ ไม่สามารถส่งใบเสร็จได้');
    }
    const paths: string[] = [];
    for (const file of checked) paths.push(await this.storage.save(file));

    return this.prisma.submission.create({
      data: {
        memberId,
        channel,
        createdById,
        receipts: {
          create: checked.map((file, i) => ({
            sequence: i + 1,
            memberId,
            imagePath: paths[i],
            imageMime: file.mime,
            imageSize: file.size,
            imageSha256: file.sha256,
          })),
        },
      },
      include: { receipts: { select: { id: true, code: true, sequence: true } } },
    });
  }

  /** Counts per status, for the review tabs, the history cards and the sidebar badge. */
  async summary(user: RequestUser) {
    const groups = await this.prisma.receipt.groupBy({
      by: ['status'],
      where: receiptScope(user.scope),
      _count: { _all: true },
    });
    const count = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
    const result = {
      PENDING_REVIEW: count('PENDING_REVIEW'),
      NEEDS_CHECK: count('NEEDS_CHECK'),
      APPROVED: count('APPROVED'),
      REJECTED: count('REJECTED'),
    };
    return { ...result, total: Object.values(result).reduce((a, b) => a + b, 0) };
  }

  /** Locations for filters and the review form. */
  locations(user: RequestUser) {
    return this.prisma.location.findMany({
      where: locationWhere(user.scope),
      select: { id: true, code: true, name: true, communityId: true, status: true },
      orderBy: { code: 'asc' },
    });
  }

  async shops(locationId: string, user: RequestUser) {
    const location = await this.prisma.location.findFirst({
      where: { AND: [{ id: locationId }, locationWhere(user.scope)] },
    });
    if (!location) throw new NotFoundException('ไม่พบสถานที่นี้');
    return this.prisma.shop.findMany({
      where: { locationId },
      select: {
        id: true,
        code: true,
        name: true,
        receiptName: true,
        participating: true,
        status: true,
      },
      orderBy: { code: 'asc' },
    });
  }

  async list(query: ListReceiptsQuery, user: RequestUser) {
    const where = this.where(query, user);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.receipt.count({ where }),
      this.prisma.receipt.findMany({
        where,
        include: receiptInclude,
        orderBy: orderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const reasons = await this.reasons();
    return {
      items: rows.map((r) => toReceipt(r, reasons)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string, user: RequestUser) {
    return toReceipt(await this.findAccessible(id, user), await this.reasons());
  }

  /** The receipt file, after checking the user may see the receipt. */
  async image(id: string, user: RequestUser) {
    const receipt = await this.findAccessible(id, user);
    const file = await this.storage.open(receipt.imagePath);
    return { ...file, mime: receipt.imageMime, code: receipt.code };
  }

  /**
   * Everything the review screen shows while staff type: rule and points, duplicates and
   * problems that would block approval. Nothing is saved.
   */
  async check(id: string, fields: PartialFieldsDto, user: RequestUser) {
    const receipt = await this.findAccessible(id, user);
    return this.evaluate(receipt, fields);
  }

  /** "ต้องตรวจเพิ่ม": keep what was typed so far and say what needs checking. */
  async needsCheck(id: string, dto: NeedsCheckDto, user: RequestUser) {
    const receipt = await this.findAccessible(id, user);
    if (dto.locationId) await this.assertPlace(receipt, dto.locationId, dto.shopId, user);
    const saved = await this.transition(
      receipt,
      user,
      'receipt.needs_check',
      { status: 'NEEDS_CHECK', ...fieldColumns(dto), staffNote: dto.staffNote },
      { note: dto.staffNote },
    );
    return toReceipt(saved, await this.reasons());
  }

  async reject(id: string, dto: RejectDto, user: RequestUser) {
    if (dto.reason === 'OTHER' && !dto.note) {
      throw new BadRequestException('กรุณาระบุเหตุผลเมื่อเลือก "อื่นๆ"');
    }
    if (!(await this.reasons())[dto.reason].enabled) {
      throw new BadRequestException('เหตุผลนี้ถูกปิดใช้งานในหน้าตั้งค่า');
    }
    const receipt = await this.findAccessible(id, user);
    if (dto.locationId) await this.assertPlace(receipt, dto.locationId, dto.shopId, user);
    const saved = await this.transition(
      receipt,
      user,
      'receipt.rejected',
      {
        status: 'REJECTED',
        ...fieldColumns(dto),
        rejectReason: dto.reason,
        rejectNote: dto.note ?? null,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
      { reason: dto.reason },
    );
    return toReceipt(saved, await this.reasons());
  }

  /** Members to pick when adding a receipt by hand (active, within the user's scope). */
  memberOptions(search: string | undefined, user: RequestUser) {
    const digits = search?.replace(/[\s\-+]/g, '') ?? '';
    return this.prisma.member.findMany({
      where: {
        status: 'ACTIVE',
        community: communityWhere(user.scope),
        ...(search && {
          OR: [
            { code: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            ...(/^\d{3,}$/.test(digits)
              ? [{ phone: { contains: digits.replace(/^66(?=[689])/, '0') } }]
              : []),
          ],
        }),
      },
      select: {
        id: true,
        code: true,
        firstName: true,
        lastName: true,
        phone: true,
        communityId: true,
      },
      orderBy: { code: 'asc' },
      take: 20,
    });
  }

  /**
   * Staff add a receipt themselves (review page): one file, the details they read, and the
   * status they choose. Each status goes through its normal action, with the same checks
   * (e.g. approving still needs a rule and no duplicate). If that fails, nothing is kept.
   */
  async createByStaff(file: Buffer | undefined, dto: CreateReceiptDto, user: RequestUser) {
    if (!file) throw new BadRequestException('กรุณาแนบรูปหรือไฟล์ใบเสร็จ');
    const member = await this.prisma.member.findFirst({
      where: { id: dto.memberId, community: communityWhere(user.scope) },
    });
    if (!member) throw new NotFoundException('ไม่พบสมาชิก');

    // Check what the chosen status needs before storing anything.
    const missing = [
      !dto.locationId && 'สถานที่',
      !dto.shopId && 'ร้านค้า',
      !dto.receiptNo && 'เลขที่ใบเสร็จ',
      !dto.receiptDate && 'วันที่ใบเสร็จ',
      !dto.amount && 'ยอดชำระ',
    ].filter(Boolean);
    if (dto.status === 'APPROVED' && missing.length) {
      throw new BadRequestException(`กรอกข้อมูลให้ครบก่อนอนุมัติ: ${missing.join(', ')}`);
    }
    if (dto.status === 'NEEDS_CHECK' && !dto.staffNote) {
      throw new BadRequestException('กรุณาระบุสิ่งที่ต้องตรวจเพิ่มในหมายเหตุ');
    }
    if (dto.status === 'REJECTED' && !dto.rejectReason) {
      throw new BadRequestException('กรุณาเลือกเหตุผลที่ไม่อนุมัติ');
    }
    if (dto.shopId && !dto.locationId) throw new BadRequestException('กรุณาเลือกสถานที่');

    const submission = await this.createSubmission(member.id, [file], {
      channel: 'CMS',
      createdById: user.id,
    });
    const id = submission.receipts[0].id;
    const fields = {
      locationId: dto.locationId,
      shopId: dto.shopId,
      receiptNo: dto.receiptNo,
      receiptDate: dto.receiptDate,
      amount: dto.amount,
    };
    try {
      const receipt = await this.findAccessible(id, user);
      if (dto.locationId) await this.assertPlace(receipt, dto.locationId, dto.shopId, user);
      switch (dto.status) {
        case 'APPROVED':
          await this.approve(
            id,
            { ...(fields as ReceiptFieldsDto), staffNote: dto.staffNote },
            user,
          );
          break;
        case 'REJECTED':
          await this.reject(
            id,
            { ...fields, reason: dto.rejectReason!, note: dto.rejectNote },
            user,
          );
          if (dto.staffNote) {
            await this.prisma.receipt.update({ where: { id }, data: { staffNote: dto.staffNote } });
          }
          break;
        case 'NEEDS_CHECK':
          await this.needsCheck(id, { ...fields, staffNote: dto.staffNote! }, user);
          break;
        default:
          await this.prisma.receipt.update({
            where: { id },
            data: { ...fieldColumns(fields), staffNote: dto.staffNote ?? null },
          });
      }
    } catch (err) {
      await this.discard(id, submission.id);
      throw err;
    }
    await this.audit.log({
      action: 'receipt.created',
      actorId: user.id,
      entityType: 'receipt',
      entityId: id,
      metadata: { code: submission.receipts[0].code, memberCode: member.code, status: dto.status },
    });
    return this.get(id, user);
  }

  /** Remove a receipt that was just added but couldn't be given its status. */
  private async discard(receiptId: string, submissionId: string) {
    const receipt = await this.prisma.receipt.findUnique({ where: { id: receiptId } });
    await this.prisma.$transaction([
      this.prisma.pointTransaction.deleteMany({ where: { receiptId } }),
      this.prisma.receipt.deleteMany({ where: { id: receiptId } }),
      this.prisma.submission.deleteMany({ where: { id: submissionId } }),
    ]);
    if (receipt) await this.storage.remove(receipt.imagePath);
  }

  /**
   * Approve and give points. Safe against double approval: the status change only succeeds
   * from an open status, the same receipt details can be approved only once (unique index),
   * and a receipt has at most one point transaction (unique receipt_id).
   */
  async approve(id: string, dto: ReceiptFieldsDto, user: RequestUser) {
    const receipt = await this.findAccessible(id, user);
    if (!OPEN.includes(receipt.status as (typeof OPEN)[number])) {
      throw new ConflictException(ALREADY_REVIEWED);
    }
    await this.assertPlace(receipt, dto.locationId, dto.shopId, user);
    const result = await this.evaluate(receipt, dto);
    const blocking = result.problems.find((p) => p.blocking);
    if (blocking) {
      throw new ConflictException({ message: blocking.message, code: blocking.code });
    }
    const { rule, calculation } = result as {
      rule: NonNullable<typeof result.rule>;
      calculation: PointCalculation;
    };
    const fingerprint = fingerprintOf(dto);

    const saved = await this.prisma
      .$transaction(async (tx) => {
        const { count } = await tx.receipt.updateMany({
          where: { id, status: { in: OPEN } },
          data: {
            status: 'APPROVED',
            locationId: dto.locationId,
            shopId: dto.shopId,
            receiptNo: dto.receiptNo,
            receiptDate: toDate(dto.receiptDate),
            amount: new Prisma.Decimal(dto.amount),
            fingerprint,
            staffNote: dto.staffNote ?? receipt.staffNote,
            rejectReason: null,
            rejectNote: null,
            reviewedById: user.id,
            reviewedAt: new Date(),
          },
        });
        if (count === 0) throw new ConflictException(ALREADY_REVIEWED);

        // A receipt below the rate earns 0 points: approved, but nothing to send to LOGA.
        if (calculation.points > 0) {
          await tx.pointTransaction.create({
            data: {
              receiptId: id,
              memberId: receipt.memberId,
              points: calculation.points,
              amount: new Prisma.Decimal(dto.amount),
              ruleId: rule.id,
              ruleVersion: rule.version,
              rule: ruleSnapshot(rule),
              calculation: { exact: calculation.exact, capped: calculation.capped },
              reference: receipt.code,
              createdById: user.id,
              // Due now: sent right after this commits (or by the next scheduled run).
              nextAttemptAt: new Date(),
            },
          });
        }
        await this.audit.log(
          {
            action: 'receipt.approved',
            actorId: user.id,
            entityType: 'receipt',
            entityId: id,
            metadata: {
              code: receipt.code,
              points: calculation.points,
              amount: dto.amount,
              ruleId: rule.id,
              ruleVersion: rule.version,
            },
          },
          tx,
        );
        return tx.receipt.findUniqueOrThrow({ where: { id }, include: receiptInclude });
      })
      .catch((err) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException(
            'ใบเสร็จนี้ (ร้านค้า เลขที่ วันที่ และยอดเดียวกัน) ได้รับอนุมัติไปแล้ว',
          );
        }
        throw err;
      });
    // Points go to LOGA after the approval is safely stored, never inside its transaction.
    if (saved.transaction) this.transfers.queue(saved.transaction.id);
    return toReceipt(saved, await this.reasons());
  }

  /** Staff retry of a transfer that failed or has an unknown outcome. */
  async retryTransfer(id: string, user: RequestUser) {
    const receipt = await this.findAccessible(id, user);
    if (!receipt.transaction) throw new NotFoundException('ใบเสร็จนี้ไม่มีแต้มที่ต้องส่ง');
    await this.transfers.send(receipt.transaction.id, { manualBy: user.id });
    return this.get(id, user);
  }

  /** Every attempt at sending this receipt's points, newest first. */
  async transferAttempts(id: string, user: RequestUser) {
    const receipt = await this.findAccessible(id, user);
    if (!receipt.transaction) return [];
    return this.prisma.pointTransferAttempt.findMany({
      where: { transactionId: receipt.transaction.id },
      include: { triggeredBy: { select: { id: true, name: true } } },
      orderBy: { attempt: 'desc' },
    });
  }

  /** Excel of the receipts matching the history filters. */
  async exportXlsx(query: ListReceiptsQuery, user: RequestUser): Promise<Buffer> {
    const where = this.where(query, user);
    const total = await this.prisma.receipt.count({ where });
    if (total > EXPORT_MAX_ROWS) {
      throw new BadRequestException(
        `ข้อมูลมีมากเกินไป (${total} รายการ) กรุณากรองข้อมูลก่อน Export`,
      );
    }
    const rows = await this.prisma.receipt.findMany({
      where,
      include: receiptInclude,
      orderBy: orderBy(query),
    });
    const reasons = await this.reasons();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GET POINT CMS';
    const sheet = workbook.addWorksheet('ใบเสร็จ');
    sheet.columns = [
      { header: 'เลขรายการ', key: 'code', width: 12 },
      { header: 'วันที่ส่ง', key: 'submitted', width: 18 },
      { header: 'รหัสสมาชิก', key: 'member', width: 12 },
      { header: 'เบอร์โทร', key: 'phone', width: 15 },
      { header: 'สถานที่', key: 'location', width: 22 },
      { header: 'ร้านค้า', key: 'shop', width: 22 },
      { header: 'เลขที่ใบเสร็จ', key: 'receiptNo', width: 16 },
      { header: 'วันที่ใบเสร็จ', key: 'receiptDate', width: 14 },
      { header: 'ยอดชำระ', key: 'amount', width: 12 },
      { header: 'แต้ม', key: 'points', width: 8 },
      { header: 'สถานะ', key: 'status', width: 14 },
      { header: 'เหตุผลที่ไม่อนุมัติ', key: 'reason', width: 26 },
      { header: 'ส่งแต้มไป LOGA', key: 'transfer', width: 14 },
      { header: 'ผู้ตรวจ', key: 'reviewer', width: 18 },
      { header: 'วันที่ตรวจ', key: 'reviewed', width: 18 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.getColumn('amount').numFmt = '#,##0.00';
    for (const r of rows) {
      sheet.addRow({
        code: r.code,
        submitted: formatThaiDateTime(r.submittedAt),
        member: r.member.code,
        phone: formatThaiMobile(r.member.phone),
        location: r.location?.name ?? '',
        shop: r.shop?.name ?? '',
        receiptNo: r.receiptNo ?? '',
        receiptDate: r.receiptDate ? formatThaiShortDate(toDay(r.receiptDate)) : '',
        amount: r.amount?.toNumber() ?? null,
        points: r.transaction?.points ?? (r.status === 'APPROVED' ? 0 : null),
        status: ReceiptStatusLabel[r.status],
        reason: r.rejectReason
          ? reasons[r.rejectReason].label + (r.rejectNote ? `: ${r.rejectNote}` : '')
          : '',
        transfer: r.transaction ? TransferStatusLabel[r.transaction.transferStatus] : '',
        reviewer: r.reviewedBy?.name ?? '',
        reviewed: r.reviewedAt ? formatThaiDateTime(r.reviewedAt) : '',
      });
    }
    await this.audit.log({
      action: 'receipt.exported',
      actorId: user.id,
      entityType: 'receipt',
      metadata: { filters: { ...query, page: undefined, pageSize: undefined }, rows: rows.length },
    });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // ---------- internals ----------

  /** Rule, points, duplicates and blocking problems for these fields. */
  private async evaluate(receipt: ReceiptRow, fields: Fields) {
    const problems: Problem[] = [];
    const others = (rows: { id: string; code: string; status: string }[]) =>
      rows.map((r) => ({ id: r.id, code: r.code, status: r.status }));

    if (receipt.member.status !== 'ACTIVE') {
      problems.push({
        code: 'MEMBER_SUSPENDED',
        message: 'สมาชิกถูกระงับ ไม่สามารถให้แต้มได้',
        blocking: true,
      });
    }

    // Same image bytes sent before (any status except rejected ones).
    const sameImage = await this.prisma.receipt.findMany({
      where: {
        imageSha256: receipt.imageSha256,
        id: { not: receipt.id },
        status: { not: 'REJECTED' },
      },
      select: { id: true, code: true, status: true },
      take: 5,
    });
    if (sameImage.length) {
      problems.push({
        code: 'SAME_IMAGE',
        message: `รูปภาพเดียวกับใบเสร็จ ${sameImage.map((r) => r.code).join(', ')}`,
        blocking: false,
        suggestedReason: 'DUPLICATE',
        receipts: others(sameImage),
      });
    }

    const shop = fields.shopId
      ? await this.prisma.shop.findUnique({ where: { id: fields.shopId } })
      : null;
    if (shop && (!shop.participating || shop.status !== 'ACTIVE')) {
      problems.push({
        code: 'SHOP_NOT_PARTICIPATING',
        message: `${shop.name} ไม่ได้ร่วมสะสมแต้ม${shop.status !== 'ACTIVE' ? ' (ปิดใช้งาน)' : ''}`,
        blocking: true,
        suggestedReason: 'SHOP_NOT_PARTICIPATING',
      });
    }

    const submittedDay = bangkokDay(receipt.submittedAt);
    if (fields.receiptDate && fields.receiptDate > submittedDay) {
      problems.push({
        code: 'FUTURE_DATE',
        message: 'วันที่บนใบเสร็จอยู่หลังวันที่ส่ง กรุณาตรวจสอบวันที่',
        blocking: true,
        suggestedReason: 'ALTERED',
      });
    }

    let rule = null;
    let calculation: PointCalculation | null = null;
    if (shop && fields.receiptDate) {
      rule = await this.rules.applicableRule(shop.id, fields.receiptDate);
      if (!rule) {
        problems.push({
          code: 'NO_RULE',
          message: 'ไม่มีเงื่อนไขการให้แต้มสำหรับร้านค้านี้ในวันที่บนใบเสร็จ',
          blocking: true,
        });
      } else {
        const age = daysBetween(fields.receiptDate, submittedDay);
        if (rule.claimDays !== null && age > rule.claimDays) {
          problems.push({
            code: 'TOO_OLD',
            message: `ส่งใบเสร็จหลังวันที่บนใบเสร็จ ${age} วัน เกินกำหนด ${rule.claimDays} วัน`,
            blocking: true,
            suggestedReason: 'TOO_OLD',
          });
        }
        if (fields.amount !== undefined) calculation = calculatePoints(fields.amount, rule);
      }
    }

    if (shop && fields.receiptNo && fields.receiptDate && fields.amount !== undefined) {
      const sameDetails = await this.prisma.receipt.findMany({
        where: {
          id: { not: receipt.id },
          OR: [
            { fingerprint: fingerprintOf(fields as ReceiptFieldsDto) },
            // Still open receipts have no fingerprint yet: compare the typed fields.
            {
              status: { in: OPEN },
              shopId: shop.id,
              receiptDate: toDate(fields.receiptDate),
              amount: new Prisma.Decimal(fields.amount),
            },
          ],
        },
        select: { id: true, code: true, status: true, receiptNo: true },
        take: 5,
      });
      const matches = sameDetails.filter(
        (r) =>
          r.status === 'APPROVED' ||
          normalizeReceiptNo(r.receiptNo ?? '') === normalizeReceiptNo(fields.receiptNo!),
      );
      const approved = matches.filter((r) => r.status === 'APPROVED');
      if (approved.length) {
        problems.push({
          code: 'DUPLICATE_APPROVED',
          message: `ใบเสร็จนี้ได้รับอนุมัติแล้วใน ${approved.map((r) => r.code).join(', ')}`,
          blocking: true,
          suggestedReason: 'DUPLICATE',
          receipts: others(approved),
        });
      } else if (matches.length) {
        problems.push({
          code: 'SAME_DETAILS',
          message: `ข้อมูลเดียวกับใบเสร็จที่รอตรวจ ${matches.map((r) => r.code).join(', ')}`,
          blocking: false,
          suggestedReason: 'DUPLICATE',
          receipts: others(matches),
        });
      }
    }

    return {
      rule: rule && {
        id: rule.id,
        version: rule.version,
        level: rule.level,
        label: formatRate(rule),
        spendAmount: rule.spendAmount,
        points: rule.points,
        rounding: rule.rounding,
        maxPoints: rule.maxPoints,
        claimDays: rule.claimDays,
        place: rule.shop?.name ?? rule.location?.name ?? rule.community?.name ?? '',
        startDate: rule.startDate,
        endDate: rule.endDate,
      },
      calculation,
      problems,
      submittedDay,
    };
  }

  /** The Location must be one the user can access, in the member's Community; the shop in it. */
  private async assertPlace(
    receipt: ReceiptRow,
    locationId: string,
    shopId: string | undefined,
    user: RequestUser,
  ) {
    const location = await this.prisma.location.findFirst({
      where: { AND: [{ id: locationId }, locationWhere(user.scope)] },
    });
    if (!location) throw new NotFoundException('ไม่พบสถานที่นี้');
    if (location.communityId !== receipt.member.communityId) {
      throw new BadRequestException('สถานที่นี้ไม่ได้อยู่ใน Community ของสมาชิก');
    }
    if (shopId) {
      const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
      if (!shop || shop.locationId !== locationId) {
        throw new BadRequestException('ร้านค้านี้ไม่ได้อยู่ในสถานที่ที่เลือก');
      }
    }
  }

  /** Move an open receipt to another status (no lost race with another reviewer). */
  private async transition(
    receipt: ReceiptRow,
    user: RequestUser,
    action: string,
    data: Prisma.ReceiptUncheckedUpdateManyInput,
    metadata: Record<string, unknown>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.receipt.updateMany({
        where: { id: receipt.id, status: { in: OPEN } },
        data,
      });
      if (count === 0) throw new ConflictException(ALREADY_REVIEWED);
      await this.audit.log(
        {
          action,
          actorId: user.id,
          entityType: 'receipt',
          entityId: receipt.id,
          metadata: { code: receipt.code, ...metadata },
        },
        tx,
      );
      return tx.receipt.findUniqueOrThrow({ where: { id: receipt.id }, include: receiptInclude });
    });
  }

  private where(query: ListReceiptsQuery, user: RequestUser): Prisma.ReceiptWhereInput {
    const and: Prisma.ReceiptWhereInput[] = [
      receiptScope(user.scope),
      { status: query.status, locationId: query.locationId, shopId: query.shopId },
      ...(query.transferStatus ? [{ transaction: { transferStatus: query.transferStatus } }] : []),
    ];
    if (query.submittedFrom || query.submittedTo) {
      and.push({
        submittedAt: {
          ...(query.submittedFrom && { gte: bangkokDayStart(query.submittedFrom) }),
          ...(query.submittedTo && { lt: bangkokDayEnd(query.submittedTo) }),
        },
      });
    }
    if (query.search) {
      const or: Prisma.ReceiptWhereInput[] = [
        { code: { contains: query.search.replace(/^#/, ''), mode: 'insensitive' } },
        { receiptNo: { contains: query.search, mode: 'insensitive' } },
      ];
      const digits = query.search.replace(/[\s\-+]/g, '');
      if (/^\d{3,}$/.test(digits)) {
        or.push({ member: { phone: { contains: digits.replace(/^66(?=[689])/, '0') } } });
      }
      and.push({ OR: or });
    }
    return { AND: and };
  }

  private async findAccessible(id: string, user: RequestUser) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { AND: [{ id }, receiptScope(user.scope)] },
      include: receiptInclude,
    });
    if (!receipt) throw new NotFoundException(NOT_FOUND);
    return receipt;
  }
}

/** shop + normalised receipt no. + date + amount: "the same receipt". */
export function fingerprintOf(
  f: Pick<ReceiptFieldsDto, 'shopId' | 'receiptNo' | 'receiptDate' | 'amount'>,
) {
  return [f.shopId, normalizeReceiptNo(f.receiptNo), f.receiptDate, f.amount.toFixed(2)].join('|');
}

/** The rule exactly as used, stored with the points so later rule edits don't change history. */
function ruleSnapshot(rule: EvaluatedRule) {
  const { id: _id, version: _version, label: _label, ...snapshot } = rule;
  return snapshot;
}

/** Typed receipt fields → columns (only those given). */
function fieldColumns(f: PartialFieldsDto) {
  return {
    locationId: f.locationId,
    shopId: f.shopId,
    receiptNo: f.receiptNo || undefined,
    receiptDate: f.receiptDate ? toDate(f.receiptDate) : undefined,
    amount: f.amount !== undefined ? new Prisma.Decimal(f.amount) : undefined,
  };
}

function orderBy(query: ListReceiptsQuery): Prisma.ReceiptOrderByWithRelationInput[] {
  // The review queue works oldest first; history shows newest first.
  const order =
    query.order ?? (query.status && OPEN.includes(query.status as never) ? 'asc' : 'desc');
  switch (query.sort) {
    case 'amount':
      return [{ amount: { sort: order, nulls: 'last' } }, { submittedAt: 'desc' }];
    case 'points':
      return [{ transaction: { points: order } }, { submittedAt: 'desc' }];
    case 'status':
      return [{ status: order }, { submittedAt: 'desc' }];
    default:
      return [{ submittedAt: order }, { code: order }];
  }
}
