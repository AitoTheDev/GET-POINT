import type { AuthUser } from '@getpoint/shared';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../audit/audit.service';
import type { Env } from '../config/env';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from './auth.guard';
import { authUserInclude, type RequestUser, toAuthUser } from './auth-user';
import {
  DUMMY_PASSWORD_HASH,
  generateToken,
  hashPassword,
  sha256,
  verifyPassword,
} from './crypto.util';

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  rememberMe: boolean;
  expiresAt: Date;
  user: AuthUser;
}

const INVALID_LOGIN = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async login(
    email: string,
    password: string,
    rememberMe: boolean,
    meta: ClientMeta,
  ): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: authUserInclude,
    });

    // Always run bcrypt so response time doesn't reveal whether the email exists.
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !ok) {
      await this.audit.log({
        action: 'auth.login_failed',
        actorId: user?.id,
        metadata: { email },
        ip: meta.ip,
      });
      throw new UnauthorizedException(INVALID_LOGIN);
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('บัญชีนี้ถูกระงับ กรุณาติดต่อผู้ดูแลระบบ');
    }

    const refreshToken = generateToken();
    const expiresAt = new Date(Date.now() + this.sessionLengthMs(rememberMe));
    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.authSession.create({
        data: {
          userId: user.id,
          tokenHash: sha256(refreshToken),
          rememberMe,
          expiresAt,
          ip: meta.ip,
          userAgent: meta.userAgent?.slice(0, 255),
        },
      });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await this.audit.log(
        {
          action: 'auth.login',
          actorId: user.id,
          entityType: 'user',
          entityId: user.id,
          ip: meta.ip,
        },
        tx,
      );
      return created;
    });

    return {
      accessToken: await this.signAccessToken(user.id, session.id),
      refreshToken,
      rememberMe,
      expiresAt,
      user: toAuthUser(user),
    };
  }

  /** Exchange a refresh token for a new access token. The refresh token is rotated each time. */
  async refresh(refreshToken: string): Promise<IssuedSession> {
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: { include: authUserInclude } },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }

    const nextToken = generateToken();
    // Conditional update: if two refreshes race with the same token, only one wins.
    const { count } = await this.prisma.authSession.updateMany({
      where: { id: session.id, tokenHash: session.tokenHash, revokedAt: null },
      data: { tokenHash: sha256(nextToken) },
    });
    if (count === 0) throw new UnauthorizedException('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');

    return {
      accessToken: await this.signAccessToken(session.userId, session.id),
      refreshToken: nextToken,
      rememberMe: session.rememberMe,
      expiresAt: session.expiresAt,
      user: toAuthUser(session.user),
    };
  }

  async logout(sessionId: string, actorId: string, ip?: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({ action: 'auth.logout', actorId, ip });
  }

  /** Logout using only the refresh cookie (e.g. when the access token has already expired). */
  async logoutByRefreshToken(refreshToken: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Used for both a voluntary change and the forced change after an admin reset. */
  async changePassword(
    user: RequestUser,
    currentPassword: string,
    newPassword: string,
    ip?: string,
  ): Promise<AuthUser> {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(currentPassword, record.passwordHash))) {
      throw new BadRequestException('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    }
    if (await verifyPassword(newPassword, record.passwordHash)) {
      throw new BadRequestException('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');
    }

    const passwordHash = await hashPassword(newPassword);
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
        include: authUserInclude,
      });
      // Sign out every other device; keep the current session.
      await tx.authSession.updateMany({
        where: { userId: user.id, revokedAt: null, id: { not: user.sessionId } },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(
        {
          action: 'auth.password_changed',
          actorId: user.id,
          entityType: 'user',
          entityId: user.id,
          ip,
        },
        tx,
      );
      return saved;
    });
    return toAuthUser(updated);
  }

  /** Always succeeds from the caller's point of view, so it can't be used to find out which emails exist. */
  async requestPasswordReset(email: string, ip?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user || user.status !== 'ACTIVE') return;

    const token = generateToken();
    const ttlMinutes = this.config.get('PASSWORD_RESET_TTL_MINUTES', { infer: true });
    await this.prisma.$transaction([
      // Only the newest link works.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
        },
      }),
    ]);

    const link = `${this.config.get('CMS_URL', { infer: true })}/reset-password?token=${token}`;
    await this.mail.send({
      to: user.email,
      subject: 'GET POINT CMS - ตั้งรหัสผ่านใหม่',
      text: [
        `สวัสดีคุณ ${user.name}`,
        '',
        'มีการขอตั้งรหัสผ่านใหม่สำหรับบัญชี GET POINT CMS ของคุณ',
        `กดลิงก์นี้ภายใน ${ttlMinutes} นาทีเพื่อตั้งรหัสผ่านใหม่:`,
        link,
        '',
        'หากคุณไม่ได้เป็นผู้ขอ สามารถละเว้นอีเมลนี้ได้',
      ].join('\n'),
    });
    await this.audit.log({
      action: 'auth.password_reset_requested',
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      ip,
    });
  }

  async resetPasswordWithToken(token: string, newPassword: string, ip?: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (
      !record ||
      record.usedAt ||
      record.expiresAt <= new Date() ||
      record.user.status !== 'ACTIVE'
    ) {
      throw new BadRequestException('ลิงก์ตั้งรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว');
    }

    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction(async (tx) => {
      // Conditional: a link can only be used once even if submitted twice at the same time.
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count === 0) throw new BadRequestException('ลิงก์ตั้งรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว');

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, mustChangePassword: false },
      });
      await tx.authSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(
        {
          action: 'auth.password_reset_completed',
          actorId: record.userId,
          entityType: 'user',
          entityId: record.userId,
          ip,
        },
        tx,
      );
    });
  }

  sessionLengthMs(rememberMe: boolean): number {
    return rememberMe
      ? this.config.get('REMEMBER_ME_TTL_DAYS', { infer: true }) * 24 * HOUR_MS
      : this.config.get('SESSION_TTL_HOURS', { infer: true }) * HOUR_MS;
  }

  private signAccessToken(userId: string, sessionId: string): Promise<string> {
    const payload: AccessTokenPayload = { sub: userId, sid: sessionId };
    return this.jwt.signAsync(payload);
  }
}
