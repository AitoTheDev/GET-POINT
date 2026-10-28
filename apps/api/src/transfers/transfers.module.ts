import { Module } from '@nestjs/common';
import { TransferScheduler } from './transfer.scheduler';
import { TransferService } from './transfer.service';

@Module({
  providers: [TransferService, TransferScheduler],
  exports: [TransferService],
})
export class TransfersModule {}
