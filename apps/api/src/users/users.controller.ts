import { Menu } from '@getpoint/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { RequestUser } from '../auth/auth-user';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import { AdminResetPasswordDto, CreateUserDto, ListUsersQuery, UpdateUserDto } from './dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RequirePermission(Menu.USERS, 'view')
  @Get()
  list(@Query() query: ListUsersQuery) {
    return this.users.list(query);
  }

  /** Communities and Locations that can be granted to a user. */
  @RequirePermission(Menu.USERS, 'view')
  @Get('scope-options')
  scopeOptions() {
    return this.users.scopeOptions();
  }

  @RequirePermission(Menu.USERS, 'view')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }

  @RequirePermission(Menu.USERS, 'manage')
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: RequestUser) {
    return this.users.create(dto, user.id);
  }

  @RequirePermission(Menu.USERS, 'manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.users.update(id, dto, user);
  }

  @RequirePermission(Menu.USERS, 'manage')
  @Post(':id/reset-password')
  @HttpCode(200)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminResetPasswordDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.users.resetPassword(id, dto.method, user.id);
  }
}
