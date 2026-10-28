import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { LocationsService } from './locations.service';
import { OrgController } from './org.controller';
import { ShopsService } from './shops.service';

@Module({
  controllers: [OrgController],
  providers: [LocationsService, ShopsService, CategoriesService],
  exports: [LocationsService],
})
export class OrgModule {}
