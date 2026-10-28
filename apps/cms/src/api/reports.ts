import type { MemberStatus, ReceiptStatus, TransferStatus } from '@getpoint/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiGet } from './client';
import { toQuery } from './org';
import type { ReceiptLocation, ReceiptShop } from './receipts';
import type { Paginated } from './users';

/** Bangkok calendar days, inclusive ("YYYY-MM-DD"). */
export interface DateRange {
  from: string;
  to: string;
}

export interface RangeFilters extends DateRange {
  locationId?: string;
}

export interface DayCount {
  day: string;
  count: number;
}

export interface Dashboard {
  range: DateRange;
  kpis: { members: number; receiptsSubmitted: number; waiting: number; pointsGiven: number };
  trend: DayCount[];
  statuses: { approved: number; waiting: number; rejected: number; total: number };
  recentWaiting: {
    id: string;
    code: string;
    status: ReceiptStatus;
    submittedAt: string;
    amount: number | null;
    shop: { name: string } | null;
    member: { phone: string };
  }[];
}

export type ReceiptsReportStatus = 'ALL' | ReceiptStatus;

export interface ReceiptsReportFilters extends RangeFilters {
  shopId?: string;
  status: ReceiptsReportStatus;
}

export interface ShopRow {
  shop: { id: string; code: string; name: string } | null;
  receipts: number;
  members: number;
  amount: number;
  pointsSent: number;
}

export interface ReceiptsReport {
  range: DateRange;
  status: ReceiptsReportStatus;
  kpis: { receipts: number; amount: number; members: number; pointsSent: number };
  daily: DayCount[];
  byShop: ShopRow[];
  truncated: boolean;
}

export interface MembersReportFilters extends RangeFilters {
  status?: MemberStatus;
  search?: string;
  page: number;
  pageSize: number;
}

export interface MemberReportRow {
  id: string;
  code: string;
  name: string;
  phone: string;
  community: string;
  status: MemberStatus;
  createdAt: string;
  receiptsInRange: number;
  approvedAmountInRange: number;
}

export interface MembersReport extends Paginated<MemberReportRow> {
  range: DateRange;
  kpis: { totalAtEnd: number; newInRange: number; sendersInRange: number; newSenders: number };
  dailyNew: DayCount[];
  newMembersSending: { sent: number; notYet: number };
}

export interface LogaReportFilters extends RangeFilters {
  transferStatus?: TransferStatus;
  search?: string;
  page: number;
  pageSize: number;
}

export interface TransferRow {
  id: string;
  receiptId: string;
  code: string;
  phone: string;
  location: string | null;
  points: number;
  transferStatus: TransferStatus;
  lastError: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  sentAt: string | null;
  reference: string | null;
  approvedAt: string;
}

export interface LogaReport extends Paginated<TransferRow> {
  range: DateRange;
  kpis: {
    pointsSent: number;
    succeeded: number;
    pending: number;
    failed: number;
    unknown: number;
    total: number;
  };
}

export const useReportLocations = () =>
  useQuery({
    queryKey: ['reports', 'locations'],
    queryFn: () => apiGet<ReceiptLocation[]>('/reports/locations'),
    staleTime: 5 * 60_000,
  });

export const useReportShops = (locationId: string | undefined) =>
  useQuery({
    queryKey: ['reports', 'shops', locationId],
    queryFn: () => apiGet<ReceiptShop[]>(`/reports/shops?locationId=${locationId}`),
    enabled: Boolean(locationId),
    staleTime: 5 * 60_000,
  });

export const useDashboard = (filters: RangeFilters) =>
  useQuery({
    queryKey: ['reports', 'dashboard', filters],
    queryFn: () => apiGet<Dashboard>(`/reports/dashboard?${toQuery(filters)}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

export const useReceiptsReport = (filters: ReceiptsReportFilters) =>
  useQuery({
    queryKey: ['reports', 'receipts', filters],
    queryFn: () => apiGet<ReceiptsReport>(`/reports/receipts?${toQuery(filters)}`),
    placeholderData: keepPreviousData,
  });

export const useMembersReport = (filters: MembersReportFilters) =>
  useQuery({
    queryKey: ['reports', 'members', filters],
    queryFn: () => apiGet<MembersReport>(`/reports/members?${toQuery(filters)}`),
    placeholderData: keepPreviousData,
  });

export const useLogaReport = (filters: LogaReportFilters) =>
  useQuery({
    queryKey: ['reports', 'loga', filters],
    queryFn: () => apiGet<LogaReport>(`/reports/loga?${toQuery(filters)}`),
    placeholderData: keepPreviousData,
  });

/** Query string for an Excel export (members' status is sent as `memberStatus`). */
export function exportQuery(filters: object) {
  const { page: _p, pageSize: _s, ...rest } = filters as { page?: number; pageSize?: number };
  return toQuery(rest);
}

// ---------- Activity Log ----------

export interface ActivityFilters {
  group?: string;
  actorId?: string;
  from?: string;
  to?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export interface ActivityItem {
  id: string;
  createdAt: string;
  action: string;
  actor: { id: string; name: string; email: string } | null;
  entityType: string | null;
  entityId: string | null;
  target: string | null;
  metadata: unknown;
  ip: string | null;
}

export interface ActivityPage extends Paginated<ActivityItem> {
  /** false = only the user's own actions are shown. */
  everyone: boolean;
}

export const useActivityLog = (filters: ActivityFilters) =>
  useQuery({
    queryKey: ['activity-log', filters],
    queryFn: () => apiGet<ActivityPage>(`/activity-log?${toQuery(filters)}`),
    placeholderData: keepPreviousData,
  });

export const useActivityActors = (enabled: boolean) =>
  useQuery({
    queryKey: ['activity-log', 'actors'],
    queryFn: () => apiGet<{ id: string; name: string; email: string }[]>('/activity-log/actors'),
    enabled,
    staleTime: 5 * 60_000,
  });

// ---------- Notifications ----------

export interface NotificationItem {
  key: 'transfers-stopped' | 'receipts-waiting';
  count: number;
  oldestAt: string | null;
}

export const useNotifications = () =>
  useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiGet<{ total: number; items: NotificationItem[] }>('/notifications'),
    refetchInterval: 60_000,
  });
