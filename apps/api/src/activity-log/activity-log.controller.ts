import { Menu } from '@getpoint/shared';
import { Controller, Get, Query } from '@nestjs/common';
import type { RequestUser } from '../auth/auth-user';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogQuery } from './dto';

/** Activity Log: your own actions, or everyone's with "manage". */
@Controller('activity-log')
export class ActivityLogController {
  constructor(private readonly activity: ActivityLogService) {}

  @RequirePermission(Menu.ACTIVITY_LOG, 'view')
  @Get('actors')
  actors(@CurrentUser() user: RequestUser) {
    return this.activity.actors(user);
  }

  @RequirePermission(Menu.ACTIVITY_LOG, 'view')
  @Get('groups')
  groups() {
    return this.activity.groups();
  }

  @RequirePermission(Menu.ACTIVITY_LOG, 'view')
  @Get()
  list(@Query() query: ActivityLogQuery, @CurrentUser() user: RequestUser) {
    return this.activity.list(query, user);
  }
}
