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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequestUser } from '../auth/auth-user';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import {
  BalancesQuery,
  CreateMemberDto,
  ListMembersQuery,
  MemberFilterQuery,
  UpdateMemberDto,
} from './dto';
import { MembersService } from './members.service';

/** "สมาชิก": members of the Communities the user can access. */
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  // Fixed paths first so they aren't taken as an :id.

  @RequirePermission(Menu.MEMBERS, 'view')
  @Get('summary')
  summary(@CurrentUser() user: RequestUser) {
    return this.members.summary(user);
  }

  @RequirePermission(Menu.MEMBERS, 'view')
  @Get('communities')
  communities(@CurrentUser() user: RequestUser) {
    return this.members.communityOptions(user);
  }

  @RequirePermission(Menu.MEMBERS, 'view')
  @Get('balances')
  balances(@Query() query: BalancesQuery, @CurrentUser() user: RequestUser) {
    return this.members.balances(query.ids, user);
  }

  @RequirePermission(Menu.MEMBERS, 'view')
  @Get('export')
  async export(
    @Query() query: MemberFilterQuery,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const file = await this.members.exportXlsx(query, user);
    const date = new Date().toISOString().slice(0, 10);
    res
      .set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="members-${date}.xlsx"`,
      })
      .send(file);
  }

  @RequirePermission(Menu.MEMBERS, 'view')
  @Get()
  list(@Query() query: ListMembersQuery, @CurrentUser() user: RequestUser) {
    return this.members.list(query, user);
  }

  @RequirePermission(Menu.MEMBERS, 'manage')
  @Post()
  create(@Body() dto: CreateMemberDto, @CurrentUser() user: RequestUser) {
    return this.members.create(dto, user);
  }

  @RequirePermission(Menu.MEMBERS, 'view')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.members.get(id, user);
  }

  @RequirePermission(Menu.MEMBERS, 'view')
  @Get(':id/loga')
  loga(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.members.logaDetail(id, user);
  }

  @RequirePermission(Menu.MEMBERS, 'manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.members.update(id, dto, user);
  }

  /** Try linking to LOGA again (after an error, or for a member who isn't linked yet). */
  @RequirePermission(Menu.MEMBERS, 'manage')
  @Post(':id/loga-link')
  @HttpCode(200)
  link(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.members.link(id, user);
  }
}
