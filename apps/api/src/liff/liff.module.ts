import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { LiffController } from './liff.controller';
import { LiffGuard } from './liff.guard';
import { LiffService } from './liff.service';
import { LineLoginService } from './line-login.service';
import { SmsService } from './sms.service';

@Module({
  imports: [MembersModule, ReceiptsModule],
  controllers: [LiffController],
  providers: [LiffService, LiffGuard, LineLoginService, SmsService],
  exports: [LineLoginService, SmsService],
})
export class LiffModule {}
