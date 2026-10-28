import { Controller, Get } from '@nestjs/common';
import type { RequestUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import { NotificationsService } from './notifications.service';

/** Any logged-in user; the list only holds what their permissions allow them to act on. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.notifications.list(user);
  }
}
