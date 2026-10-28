import type { Menu, PermissionLevel } from '@getpoint/shared';
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from './auth-user';

export const IS_PUBLIC = 'isPublic';
export const REQUIRED_PERMISSION = 'requiredPermission';
export const ALLOW_PENDING_PASSWORD_CHANGE = 'allowPendingPasswordChange';

/** Route needs no login. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route needs view/manage on a CMS menu. Checked on the server, regardless of what the UI hides. */
export const RequirePermission = (menu: Menu, level: PermissionLevel) =>
  SetMetadata(REQUIRED_PERMISSION, { menu, level });

/** Route stays usable while the user still has to replace a temporary password. */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE, true);

export interface AuthedRequest extends Request {
  user: RequestUser;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RequestUser =>
    ctx.switchToHttp().getRequest<AuthedRequest>().user,
);
