import { Module } from '@nestjs/common';
import { PointRulesController } from './point-rules.controller';
import { PointRulesService } from './point-rules.service';

@Module({
  controllers: [PointRulesController],
  providers: [PointRulesService],
  // Receipt approval (Session 5) uses findApplicableRule().
  exports: [PointRulesService],
})
export class PointRulesModule {}
