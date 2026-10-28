import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TransferService } from './transfer.service';

const EVERY_MS = 60_000;

/** Once a minute: send transfers that are due (new, or waiting to be retried). */
@Injectable()
export class TransferScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Transfers');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly transfers: TransferService) {}

  onModuleInit() {
    // Automated tests drive sending themselves.
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), EVERY_MS);
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return; // never overlap runs
    this.running = true;
    try {
      const attempted = await this.transfers.runDue();
      if (attempted) this.logger.log(`Sent ${attempted} transfer(s) to LOGA`);
    } catch (err) {
      this.logger.error('Transfer run failed', err as Error);
    } finally {
      this.running = false;
    }
  }
}
