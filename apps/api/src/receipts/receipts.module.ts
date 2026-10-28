import { Module } from '@nestjs/common';
import { PointRulesModule } from '../point-rules/point-rules.module';
import { ReceiptStorageService } from './receipt-storage.service';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';

@Module({
  imports: [PointRulesModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptStorageService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
