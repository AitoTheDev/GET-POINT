import type { ScopeInput, UserRow } from '../../api/users';

// TreeSelect values: "c:<communityId>" for a whole Community, "l:<locationId>" for one Location.
export const communityValue = (id: string) => `c:${id}`;
export const locationValue = (id: string) => `l:${id}`;

export function scopeToTreeValues(scope: ScopeInput): string[] {
  return [...scope.communityIds.map(communityValue), ...scope.locationIds.map(locationValue)];
}

export function treeValuesToScope(values: string[], all: boolean): ScopeInput {
  return {
    all,
    communityIds: values.filter((v) => v.startsWith('c:')).map((v) => v.slice(2)),
    locationIds: values.filter((v) => v.startsWith('l:')).map((v) => v.slice(2)),
  };
}

export function rowToScope(user: UserRow): ScopeInput {
  return {
    all: user.scope.all,
    communityIds: user.scope.communities.map((c) => c.id),
    locationIds: user.scope.locations.map((l) => l.id),
  };
}

/** Short text for the "สถานที่" column, e.g. "ทุกสถานที่" or "Community Mall A, +2". */
export function describeScope(scope: UserRow['scope']): string {
  if (scope.all) return 'ทุกสถานที่';
  const names = [
    ...scope.communities.map((c) => `${c.name} (ทั้งหมด)`),
    ...scope.locations.map((l) => l.name),
  ];
  if (names.length === 0) return '-';
  return names.length > 2
    ? `${names.slice(0, 2).join(', ')} +${names.length - 2}`
    : names.join(', ');
}
