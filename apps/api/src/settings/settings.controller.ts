import { DEFAULT_SETTINGS, Menu, SETTING_KEYS, type SettingKey } from '@getpoint/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Allow, IsIn } from 'class-validator';
import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../auth/auth-user';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import type { Env } from '../config/env';
import { LogaService } from '../loga/loga.service';
import { LogaRequestError } from '../loga/loga.types';
import { MOCK_TRANSFER_MODES, type MockTransferMode } from '../loga/mock-loga.client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransferService } from '../transfers/transfer.service';
import { SettingsService } from './settings.service';

class UpdateSettingDto {
  /**
   * Shape depends on the key; validated by SettingsService. May be null (e.g. no receipt age
   * limit), so only a missing value is refused (checked in the handler).
   */
  @Allow()
  value: unknown;
}

class MockModeDto {
  @IsIn(MOCK_TRANSFER_MODES)
  mode: MockTransferMode;
}

const startedAt = new Date();

/** "ตั้งค่า": stored settings, LOGA and email checks, system information. */
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly loga: LogaService,
    private readonly mail: MailService,
    private readonly transfers: TransferService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @RequirePermission(Menu.SETTINGS, 'view')
  @Get()
  async get() {
    const smtpHost = this.config.get('SMTP_HOST', { infer: true });
    return {
      values: await this.settings.all(),
      defaults: DEFAULT_SETTINGS,
      changes: await this.settings.changes(),
      loga: {
        mode: this.config.get('LOGA_MODE', { infer: true }),
        baseUrl: this.config.get('LOGA_BASE_URL', { infer: true }),
        cardId: this.config.get('LOGA_CARD_ID', { infer: true }) ?? null,
        deviceId: this.config.get('LOGA_DEVICE_ID', { infer: true }),
        // Whether a username/password is set, never the values themselves.
        credentialsSet: Boolean(
          this.config.get('LOGA_USERNAME', { infer: true }) &&
          this.config.get('LOGA_PASSWORD', { infer: true }),
        ),
        mockTransferMode: this.loga.mock?.transferMode ?? null,
        transfers: await this.transfers.stats(),
      },
      email: {
        configured: this.mail.isConfigured,
        host: smtpHost ?? null,
        from: this.config.get('SMTP_FROM', { infer: true }),
      },
      // Member app (LIFF). IDs are not secret (they're in the LIFF URL); only whether they're set.
      line: {
        mode: this.config.get('LINE_MODE', { infer: true }),
        liffId: this.config.get('LIFF_ID', { infer: true }) ?? null,
        channelIdSet: Boolean(this.config.get('LINE_CHANNEL_ID', { infer: true })),
      },
      sms: {
        provider: this.config.get('SMS_PROVIDER', { infer: true }),
        // The mock prints codes in the log: it can't be used in production.
        ready: this.config.get('NODE_ENV', { infer: true }) !== 'production',
      },
      system: await this.systemInfo(),
    };
  }

  @RequirePermission(Menu.SETTINGS, 'manage')
  @Put(':key')
  async update(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser() user: RequestUser,
  ) {
    if (!SETTING_KEYS.includes(key as SettingKey))
      throw new NotFoundException('ไม่พบการตั้งค่านี้');
    if (dto.value === undefined) throw new BadRequestException('กรุณาระบุค่า');
    return { key, value: await this.settings.update(key as SettingKey, dto.value, user) };
  }

  /** Log in to LOGA and read the card with the current .env settings. */
  @RequirePermission(Menu.SETTINGS, 'manage')
  @Post('loga/test')
  @HttpCode(200)
  async testLoga(@CurrentUser() user: RequestUser) {
    const started = Date.now();
    let result: { ok: boolean; message: string; cardName?: string | null };
    try {
      const { cardName } = await this.loga.testConnection();
      result = { ok: true, message: 'เชื่อมต่อ LOGA สำเร็จ', cardName };
    } catch (err) {
      result = {
        ok: false,
        message:
          err instanceof LogaRequestError
            ? `LOGA ตอบกลับ: ${err.logaMessage || err.code}`
            : err instanceof Error
              ? err.message
              : 'เชื่อมต่อ LOGA ไม่สำเร็จ',
      };
    }
    await this.audit.log({
      action: 'loga.connection_tested',
      actorId: user.id,
      entityType: 'setting',
      entityId: 'loga',
      metadata: { ok: result.ok, message: result.message },
    });
    return { ...result, durationMs: Date.now() - started };
  }

  /** Mock LOGA only: choose how "add points" answers, to try each case. */
  @RequirePermission(Menu.SETTINGS, 'manage')
  @Post('loga/mock-mode')
  @HttpCode(200)
  async mockMode(@Body() dto: MockModeDto, @CurrentUser() user: RequestUser) {
    const mock = this.loga.mock;
    if (!mock) throw new BadRequestException('ใช้ได้เฉพาะเมื่อใช้ LOGA จำลอง (LOGA_MODE=mock)');
    mock.transferMode = dto.mode;
    await this.audit.log({
      action: 'loga.mock_mode_changed',
      actorId: user.id,
      entityType: 'setting',
      entityId: 'loga',
      metadata: { mode: dto.mode },
    });
    return { mode: mock.transferMode };
  }

  /** Send a test email to the signed-in user. */
  @RequirePermission(Menu.SETTINGS, 'manage')
  @Post('email/test')
  @HttpCode(200)
  async testEmail(@CurrentUser() user: RequestUser) {
    try {
      await this.mail.send({
        to: user.email,
        subject: 'GET POINT: ทดสอบการส่งอีเมล',
        text: `อีเมลนี้ส่งจากหน้าตั้งค่าของ GET POINT CMS เพื่อทดสอบการตั้งค่าอีเมล\n\nส่งถึง ${user.name}`,
      });
    } catch {
      return { ok: false, message: 'ส่งอีเมลไม่สำเร็จ กรุณาตรวจสอบการตั้งค่า SMTP' };
    }
    await this.audit.log({
      action: 'email.test_sent',
      actorId: user.id,
      metadata: { to: user.email },
    });
    return {
      ok: true,
      to: user.email,
      message: this.mail.isConfigured
        ? `ส่งอีเมลทดสอบไปที่ ${user.email} แล้ว`
        : 'ยังไม่ได้ตั้งค่า SMTP: ระบบบันทึกอีเมลเป็นไฟล์ในเครื่องแทน (โหมดพัฒนา)',
    };
  }

  private async systemInfo() {
    let database = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    const storageDir = resolve(this.config.get('RECEIPT_STORAGE_DIR', { infer: true }));
    const storage = await folderSize(storageDir);
    return {
      database,
      environment: this.config.get('NODE_ENV', { infer: true }),
      nodeVersion: process.version,
      startedAt,
      receipts: await this.prisma.receipt.count(),
      storage,
    };
  }
}

/** Total bytes and file count under a folder (missing folder = empty). */
async function folderSize(dir: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return { bytes, files };
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await folderSize(path);
      bytes += sub.bytes;
      files += sub.files;
    } else if (entry.isFile()) {
      bytes += (await stat(path)).size;
      files += 1;
    }
  }
  return { bytes, files };
}
