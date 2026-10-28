import type { AuthUser } from '@getpoint/shared';
import { Prisma } from '@prisma/client';

/**
 * Data-access scope of a staff user (Admins and "ทุกสถานที่" users see everything).
 * A Community grant covers all of its Locations, including ones added later.
 * These helpers build Prisma filters so every query is limited on the server.
 */
export type Scope = AuthUser['scope'];

/** Locations the user may see and manage. */
export function locationWhere(scope: Scope): Prisma.LocationWhereInput {
  if (scope.all) return {};
  return {
    OR: [{ communityId: { in: scope.communityIds } }, { id: { in: scope.locationIds } }],
  };
}

/** Communities the user can see: granted whole, or containing a granted Location. */
export function communityWhere(scope: Scope): Prisma.CommunityWhereInput {
  if (scope.all) return {};
  return {
    OR: [
      { id: { in: scope.communityIds } },
      { locations: { some: { id: { in: scope.locationIds } } } },
    ],
  };
}

/** Creating/editing a Community or adding Locations to it needs the whole Community. */
export function hasWholeCommunity(scope: Scope, communityId: string): boolean {
  return scope.all || scope.communityIds.includes(communityId);
}
