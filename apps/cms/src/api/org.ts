import type { ActiveStatus } from '@getpoint/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend } from './client';
import type { Paginated } from './users';

export interface Community {
  id: string;
  code: string;
  name: string;
  status: ActiveStatus;
  locationCount: number;
  /** The user may edit it and add Locations to it. */
  canManage: boolean;
}

export interface Location {
  id: string;
  code: string;
  name: string;
  province: string | null;
  status: ActiveStatus;
  communityId: string;
  community: { id: string; code: string; name: string };
  shopCount: number;
  canManageCommunity: boolean;
}

export interface ShopCategory {
  id: string;
  name: string;
  sortOrder: number;
  status: ActiveStatus;
  shopCount: number;
}

export interface Shop {
  id: string;
  code: string;
  name: string;
  receiptName: string | null;
  participating: boolean;
  status: ActiveStatus;
  locationId: string;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  location: { id: string; code: string; name: string };
}

export interface OrgSummary {
  locations: number;
  shops: number;
  participatingShops: number;
}

export interface ShopFilters {
  locationId?: string;
  search?: string;
  categoryId?: string;
  status?: ActiveStatus;
  page: number;
  pageSize: number;
}

export const toQuery = (params: object) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  return q.toString();
};

export const useOrgSummary = () =>
  useQuery({ queryKey: ['org', 'summary'], queryFn: () => apiGet<OrgSummary>('/org/summary') });

export const useCommunities = () =>
  useQuery({
    queryKey: ['org', 'communities'],
    queryFn: () => apiGet<Community[]>('/communities'),
  });

export const useLocations = (filters: { communityId?: string; search?: string } = {}) =>
  useQuery({
    queryKey: ['org', 'locations', filters],
    queryFn: () => apiGet<Location[]>(`/locations?${toQuery(filters)}`),
    placeholderData: keepPreviousData,
  });

export const useShops = (filters: ShopFilters, enabled = true) =>
  useQuery({
    queryKey: ['org', 'shops', filters],
    queryFn: () => apiGet<Paginated<Shop>>(`/shops?${toQuery(filters)}`),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useShopCategories = () =>
  useQuery({
    queryKey: ['org', 'categories'],
    queryFn: () => apiGet<ShopCategory[]>('/shop-categories'),
  });

/** Every org change can affect counts on the page, so refresh all org queries. */
function useOrgMutation<TBody, TResult>(fn: (body: TBody) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['org'] }),
        // Users' scope picker lists Communities and Locations too.
        qc.invalidateQueries({ queryKey: ['users', 'scope-options'] }),
      ]),
  });
}

export interface CommunityInput {
  name: string;
  status: ActiveStatus;
}
export const useSaveCommunity = () =>
  useOrgMutation(({ id, ...body }: CommunityInput & { id?: string }) =>
    id
      ? apiSend<Community>('PATCH', `/communities/${id}`, body)
      : apiSend<Community>('POST', '/communities', body),
  );

export interface LocationInput {
  communityId: string;
  name: string;
  province: string | null;
  status: ActiveStatus;
}
export const useSaveLocation = () =>
  useOrgMutation(({ id, ...body }: LocationInput & { id?: string }) =>
    id
      ? apiSend<Location>('PATCH', `/locations/${id}`, body)
      : apiSend<Location>('POST', '/locations', body),
  );

export interface ShopInput {
  locationId: string;
  name: string;
  categoryId: string | null;
  receiptName: string | null;
  participating: boolean;
  status: ActiveStatus;
}
export const useSaveShop = () =>
  useOrgMutation(({ id, ...body }: ShopInput & { id?: string }) =>
    id ? apiSend<Shop>('PATCH', `/shops/${id}`, body) : apiSend<Shop>('POST', '/shops', body),
  );

export interface CategoryInput {
  name: string;
  sortOrder?: number;
  status?: ActiveStatus;
}
export const useSaveCategory = () =>
  useOrgMutation(({ id, ...body }: CategoryInput & { id?: string }) =>
    id
      ? apiSend<ShopCategory>('PATCH', `/shop-categories/${id}`, body)
      : apiSend<ShopCategory>('POST', '/shop-categories', body),
  );

export const useDeleteCategory = () =>
  useOrgMutation((id: string) => apiSend<void>('DELETE', `/shop-categories/${id}`));
