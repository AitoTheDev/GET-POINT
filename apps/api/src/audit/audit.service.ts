import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Keys whose values are never written to the audit log. */
const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|hash/i;

/** Replace sensitive values with "[REDACTED]" at any depth. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(inner),
      ]),
    );
  }
  return value;
}

export interface AuditEntry {
  action: string;
  actorId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record an action. Pass `tx` to write inside an existing transaction.
   * Outside a transaction, a failure is logged but never breaks the caller's request.
   */
  async log(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const data: Prisma.AuditLogUncheckedCreateInput = {
      action: entry.action,
      actorId: entry.actorId ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata ? (redact(entry.metadata) as Prisma.InputJsonValue) : undefined,
      ip: entry.ip,
    };

    if (tx) {
      await tx.auditLog.create({ data });
      return;
    }
    try {
      await this.prisma.auditLog.create({ data });
    } catch (err) {
      this.logger.error(`Failed to write audit log "${entry.action}": ${String(err)}`);
    }
  }
}
