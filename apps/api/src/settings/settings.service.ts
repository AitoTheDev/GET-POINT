import {
  DEFAULT_SETTINGS,
  REJECT_REASONS,
  RETRY_LIMIT_CAPS,
  type SettingKey,
  type SettingsValues,
  UPLOAD_LIMIT_CAPS,
} from '@getpoint/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';

const int = (min: number, max: number, label: string) =>
  z
    .number({ invalid_type_error: `${label}ต้องเป็นตัวเลข` })
    .int(`${label}ต้องเป็นจำนวนเต็ม`)
    .min(min, `${label}ต้องไม่น้อยกว่า ${min}`)
    .max(max, `${label}ต้องไม่เกิน ${max}`);
const text = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `กรุณากรอก${label}`).max(max, `${label}ยาวเกิน ${max} ตัวอักษร`);
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}ยาวเกิน ${max} ตัวอักษร`)
    .nullable()
    .transform((v) => v || null);

/** What each Settings item may contain. Limits never go above the hard caps. */
const SCHEMAS: { [K in SettingKey]: z.ZodType<SettingsValues[K], z.ZodTypeDef, unknown> } = {
  transferRetry: z.object({
    maxAttempts: int(1, RETRY_LIMIT_CAPS.maxAttempts, 'จำนวนครั้ง'),
    intervalMinutes: int(1, RETRY_LIMIT_CAPS.intervalMinutes, 'ระยะห่าง'),
  }),
  transferRemark: text(1, 150, 'ข้อความ'),
  uploadLimits: z.object({
    maxFileMb: int(1, UPLOAD_LIMIT_CAPS.maxFileMb, 'ขนาดไฟล์'),
    maxFiles: int(1, UPLOAD_LIMIT_CAPS.maxFiles, 'จำนวนไฟล์'),
  }),
  defaultClaimDays: int(0, 3650, 'จำนวนวัน').nullable(),
  supportContact: z.object({
    // Mobile or landline (a support line may be either): 9–10 digits starting with 0.
    phone: optionalText(20, 'เบอร์โทร').refine(
      (v) => v === null || /^0\d{8,9}$/.test(v.replace(/[\s-]/g, '')),
      'เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0',
    ),
    lineId: optionalText(50, 'LINE ID'),
  }),
  rejectReasons: z
    .object(
      Object.fromEntries(
        REJECT_REASONS.map((reason) => [
          reason,
          z.object({
            label: text(1, 100, 'ชื่อเหตุผล'),
            memberMessage: text(1, 200, 'ข้อความถึงสมาชิก'),
            enabled: z.boolean(),
            sortOrder: int(1, 99, 'ลำดับ'),
          }),
        ]),
      ) as unknown as Record<(typeof REJECT_REASONS)[number], z.ZodTypeAny>,
    )
    .strict()
    // "Other" is the way out when nothing else fits: it can't be switched off.
    .transform((v) => ({ ...v, OTHER: { ...v.OTHER, enabled: true } })) as never,
};

/** Values read from the database are kept briefly (other API instances catch up within this). */
// Off in automated tests, which reset the database between cases.
const CACHE_MS = process.env.NODE_ENV === 'test' ? 0 : 30_000;

/** Settings page values: stored per key, falling back to the defaults in @getpoint/shared. */
@Injectable()
export class SettingsService {
  private cache: { values: SettingsValues; expires: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async all(): Promise<SettingsValues> {
    if (this.cache && this.cache.expires > Date.now()) return this.cache.values;
    const rows = await this.prisma.setting.findMany();
    const values = structuredClone(DEFAULT_SETTINGS);
    for (const row of rows) {
      const key = row.key as SettingKey;
      if (!(key in SCHEMAS)) continue;
      // A stored value that no longer validates (e.g. after a change of rules) falls back.
      const parsed = SCHEMAS[key].safeParse(merge(key, row.value));
      if (parsed.success) (values as Record<SettingKey, unknown>)[key] = parsed.data;
    }
    this.cache = { values, expires: Date.now() + CACHE_MS };
    return values;
  }

  async get<K extends SettingKey>(key: K): Promise<SettingsValues[K]> {
    return (await this.all())[key];
  }

  async update<K extends SettingKey>(key: K, value: unknown, user: RequestUser) {
    if (!(key in SCHEMAS)) throw new BadRequestException('ไม่รู้จักการตั้งค่านี้');
    const parsed = SCHEMAS[key].safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'ข้อมูลไม่ถูกต้อง',
        details: parsed.error.issues.map((i) => i.message),
      });
    }
    const before = await this.get(key);
    await this.prisma.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: { key },
        create: { key, value: parsed.data as Prisma.InputJsonValue, updatedById: user.id },
        update: { value: parsed.data as Prisma.InputJsonValue, updatedById: user.id },
      });
      await this.audit.log(
        {
          action: 'setting.updated',
          actorId: user.id,
          entityType: 'setting',
          entityId: key,
          metadata: { key, before, after: parsed.data },
        },
        tx,
      );
    });
    this.cache = null;
    return parsed.data;
  }

  /** When each item was last changed, and by whom. */
  async changes() {
    const rows = await this.prisma.setting.findMany({
      select: { key: true, updatedAt: true, updatedBy: { select: { name: true } } },
    });
    return Object.fromEntries(
      rows.map((r) => [r.key, { at: r.updatedAt, by: r.updatedBy?.name ?? null }]),
    );
  }
}

/** Stored reject reasons are completed with defaults (a reason added later still appears). */
function merge(key: SettingKey, stored: unknown) {
  if (key !== 'rejectReasons' || !stored || typeof stored !== 'object') return stored;
  return Object.fromEntries(
    REJECT_REASONS.map((r) => [
      r,
      { ...DEFAULT_SETTINGS.rejectReasons[r], ...((stored as Record<string, object>)[r] ?? {}) },
    ]),
  );
}
