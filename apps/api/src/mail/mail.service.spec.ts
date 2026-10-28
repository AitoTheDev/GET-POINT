import type { ConfigService } from '@nestjs/config';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Env } from '../config/env';
import { MailService } from './mail.service';

const config = (values: Partial<Env>) =>
  ({ get: (key: keyof Env) => values[key] }) as unknown as ConfigService<Env, true>;

describe('MailService without SMTP', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'gp-mail-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('saves development emails as text files', async () => {
    const mail = new MailService(config({ NODE_ENV: 'development' }));
    mail.devMailDir = join(dir, 'dev-mail');
    expect(mail.isConfigured).toBe(false);

    await mail.send({
      to: 'staff@test.local',
      subject: 'Reset',
      text: 'link: http://x/reset?token=abc',
    });

    const files = await readdir(mail.devMailDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/_staff@test\.local\.txt$/);
    const body = await readFile(join(mail.devMailDir, files[0]), 'utf8');
    expect(body).toContain('To: staff@test.local');
    expect(body).toContain('token=abc');
  });

  it('never writes emails to disk in production', async () => {
    const mail = new MailService(config({ NODE_ENV: 'production' }));
    mail.devMailDir = join(dir, 'dev-mail');
    await mail.send({ to: 'a@b.c', subject: 'Reset', text: 'secret link' });
    await expect(readdir(mail.devMailDir)).rejects.toThrow();
  });
});
