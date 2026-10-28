import { memberFullName, renderRemark } from '@getpoint/shared';
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import type { TransferStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { LogaService } from '../loga/loga.service';
import { LogaRequestError, LogaUnavailableError } from '../loga/loga.types';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

/** Statuses a transaction can be (re)sent from. */
const SENDABLE: TransferStatus[] = ['PENDING', 'FAILED', 'UNKNOWN'];
/** A send that has been "in progress" this long was interrupted (e.g. the API restarted). */
const STUCK_AFTER_MS = 10 * 60_000;

/**
 * Sends approved points to LOGA, outside any database transaction, one attempt at a time:
 *
 * 1. Claim: PENDING / FAILED / UNKNOWN → PROCESSING in one conditional update, so two senders
 *    (the scheduler and a staff retry, or two API instances) can never send it together.
 * 2. Make sure the member is linked to LOGA, then add_customer_point with reference = receipt
 *    code. LOGA ignores a repeated reference, so re-sending after an unknown outcome is safe.
 * 3. Record the result:
 *    - SUCCEEDED: LOGA confirmed.
 *    - FAILED: certainly not added (LOGA said no, or the request never reached it).
 *    - UNKNOWN: may have been added (timeout, lost reply). Retried like FAILED; the reference
 *      prevents a double add.
 *    Unsuccessful sends are retried automatically (Settings: count and interval), then wait
 *    for a staff retry.
 */
@Injectable()
export class TransferService {
  private readonly logger = new Logger('Transfers');
  /** Send right after approval. Off in automated tests, which send explicitly. */
  autoSend = process.env.TRANSFER_AUTO_SEND !== 'false';

  constructor(
    private readonly prisma: PrismaService,
    private readonly loga: LogaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** After an approval: send now in the background (the scheduler catches anything missed). */
  queue(transactionId: string) {
    if (!this.autoSend) return;
    setImmediate(() => {
      this.send(transactionId).catch((err: unknown) =>
        this.logger.error(`Sending ${transactionId} failed`, err as Error),
      );
    });
  }

  /**
   * One attempt. `manual` = a staff member pressed retry: allowed any time the transaction isn't
   * already sent or being sent. Automatic attempts only run when due.
   */
  async send(transactionId: string, options: { manualBy?: string } = {}) {
    const now = new Date();
    const { count } = await this.prisma.pointTransaction.updateMany({
      where: {
        id: transactionId,
        transferStatus: { in: SENDABLE },
        ...(options.manualBy ? {} : { nextAttemptAt: { lte: now } }),
      },
      data: {
        transferStatus: 'PROCESSING',
        attempts: { increment: 1 },
        lastAttemptAt: now,
        nextAttemptAt: null,
      },
    });
    if (count === 0) {
      if (options.manualBy) {
        throw new ConflictException('รายการนี้กำลังส่งอยู่ หรือส่งสำเร็จแล้ว กรุณาโหลดข้อมูลใหม่');
      }
      return null;
    }

    const tx = await this.prisma.pointTransaction.findUniqueOrThrow({
      where: { id: transactionId },
      include: {
        member: true,
        receipt: { select: { code: true, shop: { select: { name: true } } } },
      },
    });
    const started = Date.now();
    let result: TransferStatus;
    let error: string | null = null;
    let pointsAfter: number | null = null;
    const remark =
      tx.remark ??
      renderRemark(await this.settings.get('transferRemark'), {
        code: tx.receipt.code,
        shop: tx.receipt.shop?.name ?? '',
      });

    try {
      const ref = await this.ensureLinked(tx.member);
      const sent = await this.loga.addPoints(ref, {
        points: tx.points,
        cost: tx.amount.toNumber(),
        remark,
        reference: tx.reference,
      });
      result = 'SUCCEEDED';
      pointsAfter = sent.pointsNow;
    } catch (err) {
      if (err instanceof LogaRequestError) {
        result = 'FAILED';
        error =
          err.code === 'NOT_LINKED'
            ? err.logaMessage
            : `LOGA ตอบกลับ: ${err.logaMessage || err.code}`;
      } else if (err instanceof LogaUnavailableError) {
        result = err.maybeProcessed ? 'UNKNOWN' : 'FAILED';
        error = err.maybeProcessed
          ? `${err.message} (ไม่ทราบว่า LOGA เพิ่มแต้มแล้วหรือไม่)`
          : err.message;
      } else {
        // Something unexpected after the request may have gone out: treat as unknown.
        this.logger.error(`Unexpected error sending ${tx.reference}`, err as Error);
        result = 'UNKNOWN';
        error = 'เกิดข้อผิดพลาดระหว่างส่ง';
      }
    }

    const retry = await this.settings.get('transferRetry');
    const attempt = tx.attempts;
    const nextAttemptAt =
      result !== 'SUCCEEDED' && attempt < retry.maxAttempts
        ? new Date(Date.now() + retry.intervalMinutes * 60_000)
        : null;

    const saved = await this.prisma.$transaction(async (db) => {
      const updated = await db.pointTransaction.update({
        where: { id: tx.id },
        data: {
          transferStatus: result,
          remark,
          lastError: error,
          nextAttemptAt,
          ...(result === 'SUCCEEDED' && { sentAt: new Date(), pointsAfter }),
        },
      });
      await db.pointTransferAttempt.create({
        data: {
          transactionId: tx.id,
          attempt,
          result,
          error,
          durationMs: Date.now() - started,
          triggeredById: options.manualBy ?? null,
        },
      });
      await this.audit.log(
        {
          action: `transfer.${result.toLowerCase()}`,
          actorId: options.manualBy ?? null,
          entityType: 'receipt',
          entityId: tx.receiptId,
          metadata: {
            code: tx.reference,
            points: tx.points,
            attempt,
            manual: Boolean(options.manualBy),
            ...(error && { error }),
            ...(nextAttemptAt && { nextAttemptAt }),
          },
        },
        db,
      );
      return updated;
    });
    return saved;
  }

  /** Automatic run: everything due, oldest first. Returns how many were attempted. */
  async runDue(limit = 20) {
    await this.recoverStuck();
    const due = await this.prisma.pointTransaction.findMany({
      where: { transferStatus: { in: SENDABLE }, nextAttemptAt: { lte: new Date() } },
      select: { id: true },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
    });
    let attempted = 0;
    for (const { id } of due) {
      if (await this.send(id).catch(() => null)) attempted++;
    }
    return attempted;
  }

  /** "In progress" for too long means the API stopped mid-send: the outcome is unknown. */
  async recoverStuck() {
    const { count } = await this.prisma.pointTransaction.updateMany({
      where: {
        transferStatus: 'PROCESSING',
        lastAttemptAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) },
      },
      data: {
        transferStatus: 'UNKNOWN',
        lastError: 'การส่งถูกขัดจังหวะ (ไม่ทราบว่า LOGA เพิ่มแต้มแล้วหรือไม่)',
        nextAttemptAt: new Date(),
      },
    });
    if (count) this.logger.warn(`${count} interrupted transfer(s) marked UNKNOWN`);
    return count;
  }

  /** Counts for the Settings page. */
  async stats() {
    const [groups, last] = await this.prisma.$transaction([
      this.prisma.pointTransaction.groupBy({
        by: ['transferStatus'],
        _count: { _all: true },
        orderBy: { transferStatus: 'asc' },
      }),
      this.prisma.pointTransaction.findFirst({
        where: { transferStatus: 'SUCCEEDED' },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true },
      }),
    ]);
    const count = (s: TransferStatus) =>
      (groups.find((g) => g.transferStatus === s)?._count as { _all?: number } | undefined)?._all ??
      0;
    return {
      pending: count('PENDING') + count('PROCESSING'),
      failed: count('FAILED'),
      unknown: count('UNKNOWN'),
      succeeded: count('SUCCEEDED'),
      lastSentAt: last?.sentAt ?? null,
    };
  }

  /** Link the member to LOGA first if that hasn't happened yet (e.g. LOGA was down then). */
  private async ensureLinked(member: {
    id: string;
    phone: string;
    firstName: string;
    lastName: string | null;
    logaUid: string | null;
    logaPcardId: string | null;
    logaLinkStatus: string;
  }) {
    if (member.logaLinkStatus === 'LINKED') {
      return { uid: member.logaUid, pcardId: member.logaPcardId };
    }
    try {
      const ref = await this.loga.findOrCreate(member.phone, memberFullName(member));
      await this.prisma.member.update({
        where: { id: member.id },
        data: {
          logaUid: ref.uid,
          logaPcardId: ref.pcardId,
          logaLinkStatus: 'LINKED',
          logaLinkError: null,
          logaCheckedAt: new Date(),
        },
      });
      return { uid: ref.uid, pcardId: ref.pcardId };
    } catch (err) {
      // Linking happens before any points are sent, so nothing was added.
      const message = err instanceof Error ? err.message : 'เชื่อมสมาชิกกับ LOGA ไม่สำเร็จ';
      throw new LogaUnavailableError(`เชื่อมสมาชิกกับ LOGA ไม่สำเร็จ: ${message}`, false);
    }
  }
}
