import { Global, Module } from '@nestjs/common';
import { TransfersModule } from '../transfers/transfers.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/** Global: receipts, point rules and transfers read settings. */
@Global()
@Module({
  imports: [TransfersModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
