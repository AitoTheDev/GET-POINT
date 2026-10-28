import { Menu } from '@getpoint/shared';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { RequestUser } from '../auth/auth-user';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import {
  CreatePointRuleDto,
  ListPointRulesQuery,
  ResolveQuery,
  ShopsQuery,
  UpdatePointRuleDto,
} from './dto';
import { PointRulesService } from './point-rules.service';

/** "เงื่อนไขการให้แต้ม": how many points a receipt earns. */
@Controller('point-rules')
export class PointRulesController {
  constructor(private readonly rules: PointRulesService) {}

  @RequirePermission(Menu.POINT_RULES, 'view')
  @Get('options')
  options(@CurrentUser() user: RequestUser) {
    return this.rules.options(user);
  }

  @RequirePermission(Menu.POINT_RULES, 'view')
  @Get('shops')
  shops(@Query() query: ShopsQuery, @CurrentUser() user: RequestUser) {
    return this.rules.shops(query.locationId, user);
  }

  @RequirePermission(Menu.POINT_RULES, 'view')
  @Get('resolve')
  resolve(@Query() query: ResolveQuery, @CurrentUser() user: RequestUser) {
    return this.rules.resolve(query, user);
  }

  @RequirePermission(Menu.POINT_RULES, 'view')
  @Get()
  list(@Query() query: ListPointRulesQuery, @CurrentUser() user: RequestUser) {
    return this.rules.list(query, user);
  }

  @RequirePermission(Menu.POINT_RULES, 'manage')
  @Post()
  create(@Body() dto: CreatePointRuleDto, @CurrentUser() user: RequestUser) {
    return this.rules.create(dto, user);
  }

  @RequirePermission(Menu.POINT_RULES, 'view')
  @Get(':id/versions')
  versions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.rules.versions(id, user);
  }

  @RequirePermission(Menu.POINT_RULES, 'manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePointRuleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.rules.update(id, dto, user);
  }
}
