import type { MenuPermission } from '@getpoint/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend } from './client';

export type UserStatus = 'ACTIVE' | 'SUSPENDED';

export interface Ref {
  id: string;
  code: string;
  name: string;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: { id: string; key: string; name: string };
  scope: { all: boolean; communities: Ref[]; locations: Ref[] };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: MenuPermission[];
}

export interface ScopeInput {
  all: boolean;
  communityIds: string[];
  locationIds: string[];
}

export interface CommunityOption extends Ref {
  locations: Ref[];
}

export interface UserFilters {
  search?: string;
  roleId?: string;
  status?: UserStatus;
  page: number;
  pageSize: number;
}

const keys = {
  users: (f: UserFilters) => ['users', f] as const,
  roles: ['roles'] as const,
  scopeOptions: ['users', 'scope-options'] as const,
};

export function useUsers(filters: UserFilters) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters))
    if (v !== undefined && v !== '') params.set(k, String(v));
  return useQuery({
    queryKey: keys.users(filters),
    queryFn: () => apiGet<Paginated<UserRow>>(`/users?${params}`),
    placeholderData: keepPreviousData,
  });
}

export const useRoles = () =>
  useQuery({ queryKey: keys.roles, queryFn: () => apiGet<Role[]>('/roles') });

export const useScopeOptions = () =>
  useQuery({
    queryKey: keys.scopeOptions,
    queryFn: () => apiGet<CommunityOption[]>('/users/scope-options'),
    staleTime: 5 * 60_000,
  });

/** After any user/role change, refresh lists (role user counts depend on users too). */
function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['users'] }),
      qc.invalidateQueries({ queryKey: keys.roles }),
    ]);
}

export function useCreateUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: {
      name: string;
      email: string;
      roleId: string;
      status: UserStatus;
      scope: ScopeInput;
    }) => apiSend<{ user: UserRow; temporaryPassword: string }>('POST', '/users', body),
    onSuccess: invalidate,
  });
}

export function useUpdateUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      roleId?: string;
      status?: UserStatus;
      scope?: ScopeInput;
    }) => apiSend<UserRow>('PATCH', `/users/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, method }: { id: string; method: 'temporary' | 'email' }) =>
      apiSend<
        | { method: 'temporary'; temporaryPassword: string }
        | { method: 'email'; emailConfigured: boolean }
      >('POST', `/users/${id}/reset-password`, { method }),
  });
}

export function useSaveRole() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id?: string;
      name: string;
      description?: string;
      permissions?: MenuPermission[];
    }) =>
      id ? apiSend<Role>('PATCH', `/roles/${id}`, body) : apiSend<Role>('POST', '/roles', body),
    onSuccess: invalidate,
  });
}

export function useDeleteRole() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiSend<void>('DELETE', `/roles/${id}`),
    onSuccess: invalidate,
  });
}
