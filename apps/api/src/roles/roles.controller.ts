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
} from '@nestjs/common';
import type { RequestUser } from '../auth/auth-user';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import { CreateRoleDto, UpdateRoleDto } from './dto';
import { RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @RequirePermission(Menu.USERS, 'view')
  @Get()
  list() {
    return this.roles.list();
  }

  @RequirePermission(Menu.USERS, 'manage')
  @Post()
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: RequestUser) {
    return this.roles.create(dto, user.id);
  }

  @RequirePermission(Menu.USERS, 'manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.roles.update(id, dto, user.id);
  }

  @RequirePermission(Menu.USERS, 'manage')
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.roles.remove(id, user.id);
  }
}
