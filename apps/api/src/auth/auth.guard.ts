import { hasPermission, type Menu, type PermissionLevel } from '@getpoint/shared';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { authUserInclude, toAuthUser } from './auth-user';
import {
  ALLOW_PENDING_PASSWORD_CHANGE,
  type AuthedRequest,
  IS_PUBLIC,
  REQUIRED_PERMISSION,
} from './decorators';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
}

/**
 * Global guard. For every non-public route it:
 * 1. verifies the Bearer access token,
 * 2. reloads the session + user from the database, so logout, suspension and
 *    permission edits take effect immediately,
 * 3. enforces @RequirePermission and the forced password change.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new UnauthorizedException('กรุณาเข้าสู่ระบบ');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sid },
      include: { user: { include: authUserInclude } },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }

    req.user = { ...toAuthUser(session.user), sessionId: session.id };

    if (
      req.user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_CHANGE, targets)
    ) {
      throw new ForbiddenException('กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน');
    }

    const required = this.reflector.getAllAndOverride<
      { menus: Menu[]; level: PermissionLevel } | undefined
    >(REQUIRED_PERMISSION, targets);
    if (
      required &&
      !required.menus.some((menu) => hasPermission(req.user.permissions, menu, required.level))
    ) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์ใช้งานส่วนนี้');
    }

    return true;
  }
}
