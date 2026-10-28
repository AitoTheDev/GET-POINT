import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Env } from '../config/env';
import type { CheckedFile } from './receipt-files';

/**
 * Receipt files on local disk under RECEIPT_STORAGE_DIR (git-ignored). Files get random names
 * and are only ever read back through the API, which checks the user's access first.
 */
@Injectable()
export class ReceiptStorageService {
  readonly root: string;

  constructor(config: ConfigService<Env, true>) {
    this.root = resolve(config.get('RECEIPT_STORAGE_DIR', { infer: true }));
  }

  /** Save a checked file; returns its path relative to the storage root ("2026/10/<uuid>.jpg"). */
  async save(file: CheckedFile, now = new Date()): Promise<string> {
    const month = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const path = `${month}/${randomUUID()}.${file.extension}`;
    const full = this.resolve(path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, file.buffer, { flag: 'wx' });
    return path;
  }

  /** Stream a stored file; 404 if it is missing. */
  async open(path: string) {
    const full = this.resolve(path);
    try {
      const info = await stat(full);
      return { stream: createReadStream(full), size: info.size };
    } catch {
      throw new NotFoundException('ไม่พบไฟล์ใบเสร็จ');
    }
  }

  /** Delete a stored file (missing files are ignored). */
  async remove(path: string) {
    await rm(this.resolve(path), { force: true });
  }

  /** Absolute path, refusing anything that would leave the storage folder. */
  private resolve(path: string) {
    const full = resolve(this.root, path);
    const rel = relative(this.root, full);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
      throw new NotFoundException('ไม่พบไฟล์ใบเสร็จ');
    }
    return join(this.root, rel);
  }
}
