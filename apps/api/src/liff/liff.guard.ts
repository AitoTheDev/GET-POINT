import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Env } from '../config/env';
import type { LineProfile } from './line-login.service';

/** Member-app tokens use their own key, so they can never pass as a staff token (and back). */
export const liffSecret = (config: ConfigService<Env, true>) =>
  `${config.get('JWT_ACCESS_SECRET', { infer: true })}:liff`;
export const LIFF_AUDIENCE = 'getpoint-liff';

interface LiffTokenPayload {
  sub: string;
  name: string | null;
}

interface LiffRequest extends Request {
  lineUser: LineProfile;
}

/** Routes of the member app: needs the token from POST /liff/session (staff tokens don't work). */
@Injectable()
export class LiffGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<LiffRequest>();
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token)
      throw new UnauthorizedException({ message: 'กรุณาเข้าสู่ระบบ LINE', code: 'LIFF_LOGIN' });
    try {
      const payload = await this.jwt.verifyAsync<LiffTokenPayload>(token, {
        secret: liffSecret(this.config),
        audience: LIFF_AUDIENCE,
      });
      req.lineUser = { lineUserId: payload.sub, displayName: payload.name };
      return true;
    } catch {
      throw new UnauthorizedException({
        message: 'การเข้าสู่ระบบหมดอายุ กรุณาเปิดหน้านี้ใหม่',
        code: 'LIFF_LOGIN',
      });
    }
  }
}

export const LineUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): LineProfile =>
    ctx.switchToHttp().getRequest<LiffRequest>().lineUser,
);
