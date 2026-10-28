import type {
  ActiveStatus,
  MemberStatus,
  PointCalculation,
  PointRuleLevel,
  ReceiptStatus,
  RejectReason,
  RoundingMode,
  TransferStatus,
} from '@getpoint/shared';
import {
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiBlob, apiGet, apiPostForm, apiSend } from './client';
import { toQuery } from './org';
import type { Paginated } from './users';

interface Ref {
  id: string;
  code: string;
  name: string;
}

export interface Receipt {
  id: string;
  code: string;
  sequence: number;
  status: ReceiptStatus;
  submittedAt: string;
  imageMime: string;
  imageSize: number;
  imageSha256: string;
  member: {
    id: string;
    code: string;
    name: string;
    firstName: string;
    lastName: string | null;
    phone: string;
    status: MemberStatus;
    communityId: string;
  };
  submission: { id: string; count: number };
  location: (Ref & { communityId: string }) | null;
  shop: (Ref & { participating: boolean; status: ActiveStatus }) | null;
  receiptNo: string | null;
  /** YYYY-MM-DD */
  receiptDate: string | null;
  amount: number | null;
  staffNote: string | null;
  rejectReason: RejectReason | null;
  rejectNote: string | null;
  rejectLabel: string | null;
  /** What the member sees in LINE. */
  memberMessage: string | null;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  transaction: {
    points: number;
    transferStatus: TransferStatus;
    rule: { spendAmount: number; points: number; place: string | null; level: PointRuleLevel };
    calculation: { exact: number; capped: boolean };
  } | null;
}

export interface ReceiptSummary {
  PENDING_REVIEW: number;
  NEEDS_CHECK: number;
  APPROVED: number;
  REJECTED: number;
  total: number;
}

export interface Problem {
  code: string;
  message: string;
  blocking: boolean;
  suggestedReason?: RejectReason;
  receipts?: { id: string; code: string; status: ReceiptStatus }[];
}

export interface CheckResult {
  rule: {
    id: string;
    version: number;
    level: PointRuleLevel;
    label: string;
    spendAmount: number;
    points: number;
    rounding: RoundingMode;
    maxPoints: number | null;
    claimDays: number | null;
    place: string;
  } | null;
  calculation: PointCalculation | null;
  problems: Problem[];
  submittedDay: string;
}

export interface ReceiptFilters {
  status?: ReceiptStatus;
  search?: string;
  locationId?: string;
  shopId?: string;
  submittedFrom?: string;
  submittedTo?: string;
  sort?: 'submittedAt' | 'amount' | 'points' | 'status';
  order?: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export interface ReceiptFields {
  locationId?: string;
  shopId?: string;
  receiptNo?: string;
  receiptDate?: string;
  amount?: number;
}

export interface ReceiptLocation extends Ref {
  communityId: string;
  status: ActiveStatus;
}

export interface ReceiptShop extends Ref {
  receiptName: string | null;
  participating: boolean;
  status: ActiveStatus;
}

export const useReceiptSummary = (enabled = true) =>
  useQuery({
    queryKey: ['receipts', 'summary'],
    queryFn: () => apiGet<ReceiptSummary>('/receipts/summary'),
    enabled,
    refetchInterval: 60_000,
  });

export const useReceipts = (filters: ReceiptFilters) =>
  useQuery({
    queryKey: ['receipts', 'list', filters],
    queryFn: () => apiGet<Paginated<Receipt>>(`/receipts?${toQuery(filters)}`),
    placeholderData: keepPreviousData,
  });

export const useReceipt = (id: string | null) =>
  useQuery({
    queryKey: ['receipts', 'detail', id],
    queryFn: () => apiGet<Receipt>(`/receipts/${id}`),
    enabled: Boolean(id),
  });

export const useReceiptLocations = () =>
  useQuery({
    queryKey: ['receipts', 'locations'],
    queryFn: () => apiGet<ReceiptLocation[]>('/receipts/locations'),
    staleTime: 5 * 60_000,
  });

export const useReceiptShops = (locationId: string | undefined) =>
  useQuery({
    queryKey: ['receipts', 'shops', locationId],
    queryFn: () => apiGet<ReceiptShop[]>(`/receipts/shops?locationId=${locationId}`),
    enabled: Boolean(locationId),
    staleTime: 5 * 60_000,
  });

/** Rule, points and problems for what has been typed so far (asked again as fields change). */
export const useReceiptCheck = (id: string, fields: ReceiptFields, enabled: boolean) =>
  useQuery({
    queryKey: ['receipts', 'check', id, fields],
    queryFn: () => apiGet<CheckResult>(`/receipts/${id}/check?${toQuery(fields)}`),
    enabled,
    placeholderData: keepPreviousData,
  });

/**
 * One object URL per downloaded image, shared by the thumbnail and the viewer. It is released
 * only when the image query is dropped from the cache (5 minutes after it was last shown),
 * never while an <img> may still be using it.
 */
const objectUrls = new WeakMap<Blob, string>();
const watchedClients = new WeakSet<QueryClient>();

function objectUrlFor(blob: Blob): string {
  let url = objectUrls.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    objectUrls.set(blob, url);
  }
  return url;
}

function releaseImagesWhenEvicted(qc: QueryClient) {
  if (watchedClients.has(qc)) return;
  watchedClients.add(qc);
  qc.getQueryCache().subscribe((event) => {
    if (event.type !== 'removed' || event.query.queryKey[1] !== 'image') return;
    const blob = event.query.state.data as Blob | undefined;
    const url = blob && objectUrls.get(blob);
    if (url) URL.revokeObjectURL(url);
  });
}

/** Displayable URL for a receipt's image/PDF (downloaded with the login token). */
export function useReceiptImage(id: string | null) {
  const qc = useQueryClient();
  releaseImagesWhenEvicted(qc);
  const blob = useQuery({
    queryKey: ['receipts', 'image', id],
    queryFn: () => apiBlob(`/receipts/${id}/image`),
    enabled: Boolean(id),
    // A receipt file never changes.
    staleTime: Infinity,
    gcTime: 5 * 60_000,
  });
  return {
    url: blob.data ? objectUrlFor(blob.data) : null,
    type: blob.data?.type ?? null,
    isLoading: blob.isLoading,
    error: blob.error,
  };
}

function useReceiptMutation<TBody>(fn: (body: TBody) => Promise<Receipt>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // Refresh lists, counts and checks; the files themselves don't change.
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ['receipts'],
        predicate: (q) => q.queryKey[1] !== 'image',
        refetchType: 'active',
      }),
  });
}

export interface ApproveInput {
  locationId: string;
  shopId: string;
  receiptNo: string;
  receiptDate: string;
  amount: number;
  staffNote: string | null;
}

export const useApproveReceipt = () =>
  useReceiptMutation(({ id, ...body }: ApproveInput & { id: string }) =>
    apiSend<Receipt>('POST', `/receipts/${id}/approve`, body),
  );

/** Reject; details typed so far are sent too, so history shows the shop and amount. */
export const useRejectReceipt = () =>
  useReceiptMutation(
    ({ id, ...body }: ReceiptFields & { id: string; reason: RejectReason; note: string | null }) =>
      apiSend<Receipt>('POST', `/receipts/${id}/reject`, body),
  );

export interface MemberOption {
  id: string;
  code: string;
  firstName: string;
  lastName: string | null;
  phone: string;
  communityId: string;
}

/** Active members to pick when adding a receipt by hand. */
export const useMemberOptions = (search: string, enabled: boolean) =>
  useQuery({
    queryKey: ['receipts', 'members', search],
    queryFn: () => apiGet<MemberOption[]>(`/receipts/members?${toQuery({ search })}`),
    enabled,
    placeholderData: keepPreviousData,
  });

export interface AddReceiptInput extends ReceiptFields {
  file: File;
  memberId: string;
  status: ReceiptStatus;
  staffNote?: string;
  rejectReason?: RejectReason;
  rejectNote?: string;
}

/** Staff add a receipt themselves, with the status they choose. */
export const useAddReceipt = () =>
  useReceiptMutation(({ file, ...fields }: AddReceiptInput) => {
    const form = new FormData();
    form.append('file', file);
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
    }
    return apiPostForm<Receipt>('/receipts', form);
  });

export const useNeedsCheck = () =>
  useReceiptMutation(({ id, ...body }: ReceiptFields & { id: string; staffNote: string }) =>
    apiSend<Receipt>('POST', `/receipts/${id}/needs-check`, body),
  );
