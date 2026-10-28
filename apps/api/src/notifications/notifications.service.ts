import { hasPermission, Menu } from '@getpoint/shared';
import { Injectable } from '@nestjs/common';
import type { RequestUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { receiptScope } from '../receipts/receipts.service';

/** A receipt waiting longer than this needs attention. */
export const WAITING_ALERT_MS = 24 * 60 * 60 * 1000;

/**
 * The header bell: things someone has to act on, within the user's scope.
 * Only what the user is allowed to fix is shown.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: RequestUser) {
    const scope = receiptScope(user.scope);
    const items: {
      key: 'transfers-stopped' | 'receipts-waiting';
      count: number;
      oldestAt: Date | null;
    }[] = [];

    // Automatic retries are over (FAILED/UNKNOWN with nothing planned): needs "retry" by hand.
    if (hasPermission(user.permissions, Menu.RECEIPT_REVIEW, 'manage')) {
      const where = {
        transferStatus: { in: ['FAILED' as const, 'UNKNOWN' as const] },
        nextAttemptAt: null,
        receipt: scope,
      };
      const [count, oldest] = await Promise.all([
        this.prisma.pointTransaction.count({ where }),
        this.prisma.pointTransaction.findFirst({
          where,
          orderBy: { lastAttemptAt: 'asc' },
          select: { lastAttemptAt: true },
        }),
      ]);
      if (count)
        items.push({ key: 'transfers-stopped', count, oldestAt: oldest?.lastAttemptAt ?? null });
    }

    if (hasPermission(user.permissions, Menu.RECEIPT_REVIEW, 'view')) {
      const where = {
        AND: [
          scope,
          {
            status: { in: ['PENDING_REVIEW' as const, 'NEEDS_CHECK' as const] },
            submittedAt: { lt: new Date(Date.now() - WAITING_ALERT_MS) },
          },
        ],
      };
      const [count, oldest] = await Promise.all([
        this.prisma.receipt.count({ where }),
        this.prisma.receipt.findFirst({
          where,
          orderBy: { submittedAt: 'asc' },
          select: { submittedAt: true },
        }),
      ]);
      if (count)
        items.push({ key: 'receipts-waiting', count, oldestAt: oldest?.submittedAt ?? null });
    }

    return { total: items.reduce((n, i) => n + i.count, 0), items };
  }
}
