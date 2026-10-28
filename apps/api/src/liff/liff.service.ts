import { maskThaiMobile } from '@getpoint/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { Env } from '../config/env';
import { LogaService } from '../loga/loga.service';
import { memberInclude, type MemberRow, MembersService } from '../members/members.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { SettingsService } from '../settings/settings.service';
import type { RegisterDto } from './dto';
import { LIFF_AUDIENCE, liffSecret } from './liff.guard';
import { type LineProfile, LineLoginService } from './line-login.service';
import { SmsService } from './sms.service';

const CODE_TTL_MS = 5 * 60_000;
const CODE_RESEND_MS = 60_000;
const CODES_PER_HOUR = 5;
const CODE_MAX_GUESSES = 5;
/** Receipts one member may send in 24 hours (stops floods; real shoppers never get near it). */
export const RECEIPTS_PER_DAY = 50;

const NOT_REGISTERED = { message: 'กรุณาสมัครสมาชิกก่อนใช้งาน', code: 'NOT_REGISTERED' };
const PHONE_LINKED_ELSEWHERE =
  'เบอร์นี้เชื่อมกับบัญชี LINE อื่นแล้ว กรุณาติดต่อเจ้าหน้าที่เพื่อตรวจสอบ';

const hashCode = (phone: string, code: string) =>
  createHash('sha256').update(`${phone}:${code}`).digest('hex');

/**
 * What the member app gets. No stored name: without an SMS check, someone could link a phone
 * that isn't theirs, and must not learn whose it is. The app greets with the LINE name instead.
 */
function toMemberView(m: MemberRow) {
  return {
    code: m.code,
    phone: m.phone,
    community: { id: m.community.id, name: m.community.name },
    status: m.status,
    logaLinked: m.logaLinkStatus === 'LINKED',
  };
}

/**
 * The member app (LIFF): sign-in with LINE, sign-up / link by phone, sending receipts,
 * receipt status and points. A LINE account is tied to at most one member.
 */
@Injectable()
export class LiffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly line: LineLoginService,
    private readonly sms: SmsService,
    private readonly settings: SettingsService,
    private readonly members: MembersService,
    private readonly receipts: ReceiptsService,
    private readonly loga: LogaService,
    private readonly audit: AuditService,
  ) {}

  /** Public: what the app needs before signing in. */
  async appConfig() {
    const [communities, signup, limits, support] = await Promise.all([
      this.prisma.community.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: { code: 'asc' },
      }),
      this.settings.get('memberSignup'),
      this.settings.get('uploadLimits'),
      this.settings.get('supportContact'),
    ]);
    return {
      lineMode: this.line.mode,
      liffId: this.config.get('LIFF_ID', { infer: true }) ?? null,
      verifyPhone: signup.verifyPhone,
      uploadLimits: limits,
      supportContact: support,
      communities,
    };
  }

  async session(idToken: string) {
    const profile = await this.line.verify(idToken);
    const minutes = this.config.get('LIFF_SESSION_MINUTES', { infer: true });
    const token = await this.jwt.signAsync(
      { sub: profile.lineUserId, name: profile.displayName },
      { secret: liffSecret(this.config), audience: LIFF_AUDIENCE, expiresIn: `${minutes}m` },
    );
    const member = await this.findMember(profile.lineUserId);
    return {
      token,
      expiresInSeconds: minutes * 60,
      displayName: profile.displayName,
      member: member && toMemberView(member),
    };
  }

  async me(lineUser: LineProfile) {
    const member = await this.findMember(lineUser.lineUserId);
    return { displayName: lineUser.displayName, member: member && toMemberView(member) };
  }

  // ---------- Sign-up ----------

  /** Text a 6-digit code to the phone (only when phone checking is switched on). */
  async sendCode(lineUser: LineProfile, phone: string) {
    if (!(await this.settings.get('memberSignup')).verifyPhone) {
      throw new BadRequestException('ไม่ต้องยืนยันเบอร์โทรด้วย SMS');
    }
    const hourAgo = new Date(Date.now() - 60 * 60_000);
    const recent = await this.prisma.phoneVerification.findMany({
      where: {
        OR: [{ lineUserId: lineUser.lineUserId }, { phone }],
        createdAt: { gte: hourAgo },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const wait = recent[0] ? recent[0].createdAt.getTime() + CODE_RESEND_MS - Date.now() : 0;
    if (wait > 0) {
      throw new HttpException(
        { message: `กรุณารอ ${Math.ceil(wait / 1000)} วินาที แล้วขอรหัสใหม่`, code: 'CODE_WAIT' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (recent.length >= CODES_PER_HOUR) {
      throw new HttpException(
        { message: 'ขอรหัสบ่อยเกินไป กรุณาลองใหม่ในอีก 1 ชั่วโมง', code: 'CODE_LIMIT' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.sms.send(phone, `รหัสยืนยัน GET POINT ของคุณคือ ${code} (ใช้ได้ 5 นาที)`);
    await this.prisma.phoneVerification.create({
      data: {
        lineUserId: lineUser.lineUserId,
        phone,
        codeHash: hashCode(phone, code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });
    return {
      phone: maskThaiMobile(phone),
      expiresInSeconds: CODE_TTL_MS / 1000,
      resendAfterSeconds: CODE_RESEND_MS / 1000,
    };
  }

  /**
   * Sign up, or link this LINE account to the member staff already added with this phone.
   * The stored name of an existing member is never shown back (the phone alone proves little).
   */
  async register(lineUser: LineProfile, dto: RegisterDto) {
    if (await this.findMember(lineUser.lineUserId)) {
      throw new ConflictException('บัญชี LINE นี้สมัครสมาชิกแล้ว');
    }
    const community = await this.prisma.community.findUnique({ where: { id: dto.communityId } });
    if (!community || community.status !== 'ACTIVE') {
      throw new BadRequestException('Community นี้ไม่เปิดรับสมาชิก');
    }
    const verification = (await this.settings.get('memberSignup')).verifyPhone
      ? await this.checkCode(lineUser.lineUserId, dto.phone, dto.code)
      : null;

    const { member, linked } = await this.prisma
      .$transaction(async (tx) => {
        const existing = await tx.member.findUnique({
          where: { communityId_phone: { communityId: dto.communityId, phone: dto.phone } },
        });
        if (existing?.lineUserId) throw new ConflictException(PHONE_LINKED_ELSEWHERE);
        if (verification) {
          await tx.phoneVerification.update({
            where: { id: verification },
            data: { usedAt: new Date() },
          });
        }
        if (existing) {
          const saved = await tx.member.update({
            where: { id: existing.id },
            data: { lineUserId: lineUser.lineUserId },
            include: memberInclude,
          });
          await this.audit.log(
            {
              action: 'member.line_linked',
              entityType: 'member',
              entityId: saved.id,
              metadata: { code: saved.code, phoneVerified: Boolean(verification) },
            },
            tx,
          );
          return { member: saved, linked: true };
        }
        const created = await tx.member.create({
          data: {
            communityId: dto.communityId,
            phone: dto.phone,
            firstName: dto.firstName,
            lastName: dto.lastName ?? null,
            channel: 'LINE',
            lineUserId: lineUser.lineUserId,
          },
          include: memberInclude,
        });
        await this.audit.log(
          {
            action: 'member.registered_line',
            entityType: 'member',
            entityId: created.id,
            metadata: {
              code: created.code,
              phone: maskThaiMobile(created.phone),
              phoneVerified: Boolean(verification),
            },
          },
          tx,
        );
        return { member: created, linked: false };
      })
      .catch((err: unknown) => {
        // Two taps at once, or the same phone/LINE account racing: the unique indexes decide.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException(PHONE_LINKED_ELSEWHERE);
        }
        throw err;
      });

    // Outside the transaction: LOGA being slow or down must not lose the sign-up.
    await this.members.linkMember(member, null);
    const fresh = await this.findMember(lineUser.lineUserId);
    return { linkedExisting: linked, member: toMemberView(fresh ?? member) };
  }

  /** Returns the verification id to mark used, or throws with a message for the member. */
  private async checkCode(lineUserId: string, phone: string, code: string | undefined) {
    if (!code) {
      throw new BadRequestException({
        message: 'กรุณากรอกรหัสยืนยันจาก SMS',
        code: 'CODE_REQUIRED',
      });
    }
    const latest = await this.prisma.phoneVerification.findFirst({
      where: { lineUserId, phone, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest || latest.expiresAt <= new Date() || latest.attempts >= CODE_MAX_GUESSES) {
      throw new BadRequestException({
        message: 'รหัสยืนยันหมดอายุ กรุณาขอรหัสใหม่',
        code: 'CODE_EXPIRED',
      });
    }
    const expected = Buffer.from(latest.codeHash, 'hex');
    const given = Buffer.from(hashCode(phone, code), 'hex');
    if (!timingSafeEqual(expected, given)) {
      await this.prisma.phoneVerification.update({
        where: { id: latest.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException({ message: 'รหัสยืนยันไม่ถูกต้อง', code: 'CODE_WRONG' });
    }
    return latest.id;
  }

  // ---------- Receipts and points ----------

  async submit(lineUser: LineProfile, files: Buffer[]) {
    const member = await this.requireMember(lineUser);
    const today = await this.prisma.receipt.count({
      where: { memberId: member.id, submittedAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } },
    });
    if (today + files.length > RECEIPTS_PER_DAY) {
      throw new HttpException(
        {
          message: `ส่งใบเสร็จได้สูงสุด ${RECEIPTS_PER_DAY} ใบต่อวัน กรุณาลองใหม่พรุ่งนี้`,
          code: 'DAILY_LIMIT',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const submission = await this.receipts.createSubmission(member.id, files, { channel: 'LIFF' });
    await this.audit.log({
      action: 'receipt.submitted',
      entityType: 'member',
      entityId: member.id,
      metadata: {
        code: submission.receipts.map((r) => r.code).join(', '),
        memberCode: member.code,
        files: files.length,
      },
    });
    return { receipts: submission.receipts.map((r) => ({ code: r.code })) };
  }

  /** The member's latest receipts with what happened to each. */
  async myReceipts(lineUser: LineProfile) {
    const member = await this.requireMember(lineUser);
    const [rows, reasons] = await Promise.all([
      this.prisma.receipt.findMany({
        where: { memberId: member.id },
        orderBy: { submittedAt: 'desc' },
        take: 30,
        select: {
          code: true,
          status: true,
          submittedAt: true,
          amount: true,
          rejectReason: true,
          shop: { select: { name: true } },
          transaction: { select: { points: true, transferStatus: true } },
        },
      }),
      this.settings.get('rejectReasons'),
    ]);
    return rows.map((r) => ({
      code: r.code,
      // Waiting and "needs another look" are the same to the member.
      status: r.status === 'NEEDS_CHECK' ? 'PENDING_REVIEW' : r.status,
      submittedAt: r.submittedAt,
      shop: r.shop?.name ?? null,
      amount: r.amount?.toNumber() ?? null,
      points: r.transaction?.points ?? null,
      pointsAdded: r.transaction?.transferStatus === 'SUCCEEDED',
      rejectMessage: r.rejectReason ? reasons[r.rejectReason].memberMessage : null,
    }));
  }

  /** Live points from LOGA (links the member to LOGA first if that hasn't worked yet). */
  async points(lineUser: LineProfile) {
    let member = await this.requireMember(lineUser);
    if (member.logaLinkStatus !== 'LINKED') {
      await this.members.linkMember(member, null);
      member = (await this.findMember(lineUser.lineUserId))!;
      if (member.logaLinkStatus !== 'LINKED')
        return { status: 'UNAVAILABLE' as const, points: null };
    }
    try {
      const customer = await this.loga.getCustomer({
        uid: member.logaUid,
        pcardId: member.logaPcardId,
      });
      return customer
        ? { status: 'OK' as const, points: customer.points }
        : { status: 'UNAVAILABLE' as const, points: null };
    } catch {
      return { status: 'UNAVAILABLE' as const, points: null };
    }
  }

  private findMember(lineUserId: string) {
    return this.prisma.member.findUnique({ where: { lineUserId }, include: memberInclude });
  }

  private async requireMember(lineUser: LineProfile) {
    const member = await this.findMember(lineUser.lineUserId);
    if (!member) throw new ForbiddenException(NOT_REGISTERED);
    if (member.status !== 'ACTIVE') {
      throw new ForbiddenException({
        message: 'บัญชีสมาชิกถูกระงับ กรุณาติดต่อเจ้าหน้าที่',
        code: 'SUSPENDED',
      });
    }
    return member;
  }
}
