import type {
  ActiveStatus,
  PointCalculation,
  PointRuleLevel,
  RoundingMode,
} from '@getpoint/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend } from './client';
import { toQuery } from './org';

interface Ref {
  id: string;
  code: string;
  name: string;
}

export interface PointRule {
  id: string;
  level: PointRuleLevel;
  community: Ref | null;
  location: (Ref & { communityId: string }) | null;
  shop: (Ref & { location: Ref & { communityId: string } }) | null;
  spendAmount: number;
  points: number;
  rounding: RoundingMode;
  maxPoints: number | null;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string | null;
  status: ActiveStatus;
  version: number;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  /** The user may edit this rule. */
  canManage: boolean;
}

export interface RuleVersion {
  id: string;
  version: number;
  spendAmount: number;
  points: number;
  rounding: RoundingMode;
  maxPoints: number | null;
  startDate: string;
  endDate: string | null;
  status: ActiveStatus;
  changedBy: { id: string; name: string } | null;
  createdAt: string;
}

export interface RuleOptions {
  communities: (Ref & { status: ActiveStatus; canManage: boolean })[];
  locations: (Ref & { status: ActiveStatus; communityId: string })[];
}

export interface RuleShop extends Ref {
  participating: boolean;
  status: ActiveStatus;
}

export interface Resolution {
  shop: RuleShop;
  date: string;
  rule: PointRule | null;
  calculation: PointCalculation | null;
}

export const useRuleOptions = () =>
  useQuery({
    queryKey: ['point-rules', 'options'],
    queryFn: () => apiGet<RuleOptions>('/point-rules/options'),
  });

export const useRuleShops = (locationId: string | undefined) =>
  useQuery({
    queryKey: ['point-rules', 'shops', locationId],
    queryFn: () => apiGet<RuleShop[]>(`/point-rules/shops?locationId=${locationId}`),
    enabled: Boolean(locationId),
  });

export const usePointRules = (filters: { locationId?: string } = {}) =>
  useQuery({
    queryKey: ['point-rules', 'list', filters],
    queryFn: () => apiGet<PointRule[]>(`/point-rules?${toQuery(filters)}`),
  });

export const useRuleVersions = (id: string) =>
  useQuery({
    queryKey: ['point-rules', 'versions', id],
    queryFn: () => apiGet<RuleVersion[]>(`/point-rules/${id}/versions`),
  });

export interface RuleInput {
  spendAmount: number;
  points: number;
  rounding: RoundingMode;
  maxPoints: number | null;
  startDate: string;
  endDate: string | null;
  status: ActiveStatus;
}

export const useSaveRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      level,
      targetId,
      ...body
    }: RuleInput & { id?: string; level?: PointRuleLevel; targetId?: string }) =>
      id
        ? apiSend<PointRule>('PATCH', `/point-rules/${id}`, body)
        : apiSend<PointRule>('POST', '/point-rules', { level, targetId, ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['point-rules'] }),
  });
};

/** Which rule a receipt would use; asked on demand from the tester card. */
export const resolveRule = (query: { shopId: string; date: string; amount: number }) =>
  apiGet<Resolution>(`/point-rules/resolve?${toQuery(query)}`);
