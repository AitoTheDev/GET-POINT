import { MENUS, type AuthUser, type Menu, type MenuPermission } from '@getpoint/shared';
import { Prisma } from '@prisma/client';

/** Prisma include that loads everything needed to build an AuthUser. */
export const authUserInclude = {
  role: { include: { permissions: true } },
  scopes: true,
} satisfies Prisma.UserInclude;

export type UserWithAccess = Prisma.UserGetPayload<{ include: typeof authUserInclude }>;

/** The authenticated user attached to each request. */
export interface RequestUser extends AuthUser {
  sessionId: string;
}

/** Normalise stored grants into one entry per known menu (unknown menus are dropped). */
export function toMenuPermissions(
  grants: { menu: string; canView: boolean; canManage: boolean }[],
): MenuPermission[] {
  return MENUS.map((menu: Menu) => {
    const grant = grants.find((g) => g.menu === menu);
    // "manage" implies "view"
    return {
      menu,
      canView: Boolean(grant && (grant.canView || grant.canManage)),
      canManage: Boolean(grant?.canManage),
    };
  });
}

export function toAuthUser(user: UserWithAccess): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    mustChangePassword: user.mustChangePassword,
    role: { id: user.role.id, key: user.role.key, name: user.role.name },
    permissions: toMenuPermissions(user.role.permissions),
    scope: {
      all: user.scopeAll,
      communityIds: user.scopes.flatMap((s) => (s.communityId ? [s.communityId] : [])),
      locationIds: user.scopes.flatMap((s) => (s.locationId ? [s.locationId] : [])),
    },
  };
}
