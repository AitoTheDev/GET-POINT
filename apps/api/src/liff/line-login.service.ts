import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

export interface LineProfile {
  /** LINE user ID ("U" + 32 hex characters for real accounts). */
  lineUserId: string;
  displayName: string | null;
}

/** Development tokens: "mock:<user id>:<display name>" (only when LINE_MODE=mock). */
const MOCK_TOKEN = /^mock:([A-Za-z0-9_-]{1,64}):(.{0,60})$/;
const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';

/**
 * Turns the ID token the LIFF app got from LINE into a verified LINE user.
 * Live: LINE checks the signature, expiry and that it was issued for our channel.
 */
@Injectable()
export class LineLoginService {
  private readonly logger = new Logger(LineLoginService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  get mode() {
    return this.config.get('LINE_MODE', { infer: true });
  }

  async verify(idToken: string): Promise<LineProfile> {
    if (this.mode === 'mock') {
      const match = MOCK_TOKEN.exec(idToken);
      if (!match) throw new UnauthorizedException('เข้าสู่ระบบ LINE ไม่สำเร็จ');
      return { lineUserId: match[1], displayName: match[2] || null };
    }

    let res: Response;
    try {
      res = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          id_token: idToken,
          client_id: this.config.get('LINE_CHANNEL_ID', { infer: true })!,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      this.logger.warn(`LINE verify unreachable: ${String(err)}`);
      throw new ServiceUnavailableException('เชื่อมต่อ LINE ไม่ได้ กรุณาลองใหม่อีกครั้ง');
    }
    if (!res.ok) {
      // Expired, forged, or issued for another channel. Never log the token itself.
      throw new UnauthorizedException('การเข้าสู่ระบบ LINE หมดอายุ กรุณาเปิดหน้านี้ใหม่');
    }
    const body = (await res.json()) as { sub?: string; name?: string };
    if (!body.sub) throw new UnauthorizedException('เข้าสู่ระบบ LINE ไม่สำเร็จ');
    return { lineUserId: body.sub, displayName: body.name ?? null };
  }
}
