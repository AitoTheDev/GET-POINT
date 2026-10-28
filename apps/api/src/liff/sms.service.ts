import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

/** One SMS provider. Add a real one (and its env keys) next to the mock when GET POINT picks it. */
export interface SmsSender {
  readonly name: string;
  send(phone: string, text: string): Promise<void>;
}

/** Development only: prints the message in the API console instead of sending it. */
class MockSmsSender implements SmsSender {
  readonly name = 'mock';
  private readonly logger = new Logger('MockSms');
  readonly sent: { phone: string; text: string }[] = [];

  async send(phone: string, text: string) {
    this.sent.push({ phone, text });
    this.logger.log(`[SMS จำลอง] ถึง ${phone}: ${text}`);
  }
}

@Injectable()
export class SmsService {
  private readonly sender: SmsSender;

  constructor(private readonly config: ConfigService<Env, true>) {
    // Only "mock" exists so far (see SMS_PROVIDER in .env.example).
    this.sender = new MockSmsSender();
  }

  get provider() {
    return this.sender.name;
  }

  /** The mock prints codes in the log, so it must never run in production. */
  get ready() {
    return !(
      this.sender.name === 'mock' && this.config.get('NODE_ENV', { infer: true }) === 'production'
    );
  }

  /** Messages the mock "sent" (tests and the development console). */
  get mock() {
    return this.sender instanceof MockSmsSender ? this.sender : null;
  }

  async send(phone: string, text: string) {
    if (!this.ready) {
      throw new ServiceUnavailableException('ยังไม่ได้ตั้งค่าการส่ง SMS กรุณาติดต่อเจ้าหน้าที่');
    }
    await this.sender.send(phone, text);
  }
}
