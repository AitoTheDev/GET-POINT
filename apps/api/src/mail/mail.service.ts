import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Where unsent development emails are saved (apps/api/tmp is git-ignored). */
export const DEV_MAIL_DIR = join(__dirname, '..', '..', 'tmp', 'dev-mail');

/**
 * Sends email through SMTP when SMTP_HOST is configured.
 * Without SMTP (development), the message is printed to the API console and saved as a
 * text file in apps/api/tmp/dev-mail/ so it can be opened even when the console isn't visible.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: Transporter;
  /** Overridable in tests so they never touch the real dev-mail folder. */
  devMailDir = DEV_MAIL_DIR;

  constructor(private readonly config: ConfigService<Env, true>) {
    const host = config.get('SMTP_HOST', { infer: true });
    if (host) {
      const user = config.get('SMTP_USER', { infer: true });
      this.transporter = nodemailer.createTransport({
        host,
        port: config.get('SMTP_PORT', { infer: true }),
        secure: config.get('SMTP_SECURE', { infer: true }),
        auth: user ? { user, pass: config.get('SMTP_PASS', { infer: true }) } : undefined,
      });
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.transporter);
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
        this.logger.warn(`SMTP is not configured; email "${message.subject}" was not sent`);
        return;
      }
      await this.saveDevMail(message);
      return;
    }
    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', { infer: true }),
      ...message,
    });
  }

  private async saveDevMail(message: MailMessage): Promise<void> {
    const body = `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(this.devMailDir, `${stamp}_${message.to.replace(/[^\w.@-]/g, '_')}.txt`);
    try {
      await mkdir(this.devMailDir, { recursive: true });
      await writeFile(file, body, 'utf8');
    } catch (err) {
      this.logger.warn(`Could not save dev email to ${file}: ${String(err)}`);
    }
    this.logger.log(
      `\n----- EMAIL (dev, not sent) -----\n${body}Saved to: ${file}\n---------------------------------`,
    );
  }
}
