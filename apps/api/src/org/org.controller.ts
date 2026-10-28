import { Menu } from '@getpoint/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequestUser } from '../auth/auth-user';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  CreateCommunityDto,
  CreateLocationDto,
  CreateShopDto,
  ExportShopsQuery,
  ListLocationsQuery,
  ListShopsQuery,
  UpdateCategoryDto,
  UpdateCommunityDto,
  UpdateLocationDto,
  UpdateShopDto,
} from './dto';
import { LocationsService } from './locations.service';
import { ShopsService } from './shops.service';

/** "ร้านค้าและสถานที่": Communities, Locations, Shops and shop categories. */
@Controller()
export class OrgController {
  constructor(
    private readonly locations: LocationsService,
    private readonly shops: ShopsService,
    private readonly categories: CategoriesService,
  ) {}

  // ---------- Summary ----------

  @RequirePermission(Menu.SHOPS, 'view')
  @Get('org/summary')
  summary(@CurrentUser() user: RequestUser) {
    return this.locations.summary(user);
  }

  // ---------- Communities ----------

  @RequirePermission(Menu.SHOPS, 'view')
  @Get('communities')
  listCommunities(@CurrentUser() user: RequestUser) {
    return this.locations.listCommunities(user);
  }

  @RequirePermission(Menu.SHOPS, 'manage')
  @Post('communities')
  createCommunity(@Body() dto: CreateCommunityDto, @CurrentUser() user: RequestUser) {
    return this.locations.createCommunity(dto, user);
  }

  @RequirePermission(Menu.SHOPS, 'manage')
  @Patch('communities/:id')
  updateCommunity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommunityDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.locations.updateCommunity(id, dto, user);
  }

  // ---------- Locations ----------

  @RequirePermission(Menu.SHOPS, 'view')
  @Get('locations')
  listLocations(@Query() query: ListLocationsQuery, @CurrentUser() user: RequestUser) {
    return this.locations.listLocations(query, user);
  }

  @RequirePermission(Menu.SHOPS, 'manage')
  @Post('locations')
  createLocation(@Body() dto: CreateLocationDto, @CurrentUser() user: RequestUser) {
    return this.locations.createLocation(dto, user);
  }

  @RequirePermission(Menu.SHOPS, 'manage')
  @Patch('locations/:id')
  updateLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.locations.updateLocation(id, dto, user);
  }

  // ---------- Shops ----------

  @RequirePermission(Menu.SHOPS, 'view')
  @Get('shops')
  listShops(@Query() query: ListShopsQuery, @CurrentUser() user: RequestUser) {
    return this.shops.list(query, user);
  }

  @RequirePermission(Menu.SHOPS, 'view')
  @Get('shops/export')
  async exportShops(
    @Query() query: ExportShopsQuery,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const file = await this.shops.exportXlsx(query, user);
    const date = new Date().toISOString().slice(0, 10);
    res
      .set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="shops-${date}.xlsx"`,
      })
      .send(file);
  }

  @RequirePermission(Menu.SHOPS, 'manage')
  @Post('shops')
  createShop(@Body() dto: CreateShopDto, @CurrentUser() user: RequestUser) {
    return this.shops.create(dto, user);
  }

  @RequirePermission(Menu.SHOPS, 'manage')
  @Patch('shops/:id')
  updateShop(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShopDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.shops.update(id, dto, user);
  }

  // ---------- Categories (edited from Settings permission = admins) ----------

  @RequirePermission(Menu.SHOPS, 'view')
  @Get('shop-categories')
  listCategories() {
    return this.categories.list();
  }

  @RequirePermission(Menu.SETTINGS, 'manage')
  @Post('shop-categories')
  createCategory(@Body() dto: CreateCategoryDto, @CurrentUser() user: RequestUser) {
    return this.categories.create(dto, user.id);
  }

  @RequirePermission(Menu.SETTINGS, 'manage')
  @Patch('shop-categories/:id')
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.categories.update(id, dto, user.id);
  }

  @RequirePermission(Menu.SETTINGS, 'manage')
  @Delete('shop-categories/:id')
  @HttpCode(204)
  removeCategory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.categories.remove(id, user.id);
  }
}
