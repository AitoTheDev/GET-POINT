import type { AuthUser } from '@getpoint/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../config/env';
import type { RequestUser } from './auth-user';
import { AuthService, type ClientMeta, type IssuedSession } from './auth.service';
import { AllowPendingPasswordChange, CurrentUser, Public } from './decorators';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, ResetPasswordDto } from './dto';

export const REFRESH_COOKIE = 'gp_refresh';

/**
 * Stricter per-IP limits for endpoints that can be brute-forced or abused.
 * Kept loose enough for an office where many staff share one public IP.
 * /auth/refresh is deliberately NOT limited this way: every page load calls it.
 */
const LOGIN_LIMIT = { default: { limit: 20, ttl: 60_000 } };
const EMAIL_LIMIT = { default: { limit: 5, ttl: 15 * 60_000 } };

interface SessionResponse {
  accessToken: string;
  user: AuthUser;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Throttle(LOGIN_LIMIT)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const session = await this.auth.login(
      dto.email,
      dto.password,
      dto.rememberMe ?? false,
      meta(req),
    );
    return this.respondWithSession(res, session);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException('กรุณาเข้าสู่ระบบ');
    try {
      return this.respondWithSession(res, await this.auth.refresh(token));
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, this.cookieBase());
      throw err;
    }
  }

  /** Public so it also works after the access token expired; the cookie identifies the session. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await this.auth.logoutByRefreshToken(token);
    res.clearCookie(REFRESH_COOKIE, this.cookieBase());
  }

  @AllowPendingPasswordChange()
  @Get('me')
  me(@CurrentUser() user: RequestUser): AuthUser {
    const { sessionId: _sessionId, ...authUser } = user;
    return authUser;
  }

  @AllowPendingPasswordChange()
  @Post('change-password')
  @HttpCode(200)
  changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<AuthUser> {
    return this.auth.changePassword(user, dto.currentPassword, dto.newPassword, meta(req).ip);
  }

  @Public()
  @Throttle(EMAIL_LIMIT)
  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    await this.auth.requestPasswordReset(dto.email, meta(req).ip);
    return { message: 'หากอีเมลนี้มีอยู่ในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปแล้ว' };
  }

  @Public()
  @Throttle(LOGIN_LIMIT)
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    await this.auth.resetPasswordWithToken(dto.token, dto.newPassword, meta(req).ip);
    return { message: 'ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว' };
  }

  private respondWithSession(res: Response, session: IssuedSession): SessionResponse {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...this.cookieBase(),
      // Without "remember me" it is a browser-session cookie (gone when the browser closes).
      ...(session.rememberMe && { expires: session.expiresAt }),
    });
    return { accessToken: session.accessToken, user: session.user };
  }

  private cookieBase(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      path: '/api/auth',
    };
  }
}

function meta(req: Request): ClientMeta {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}
