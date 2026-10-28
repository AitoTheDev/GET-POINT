import type { ActiveStatus, LogaLinkStatus, MemberChannel, MemberStatus } from '@getpoint/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend } from './client';
import { toQuery } from './org';
import type { Paginated } from './users';

export interface Member {
  id: string;
  code: string;
  phone: string;
  firstName: string;
  lastName: string | null;
  status: MemberStatus;
  channel: MemberChannel;
  note: string | null;
  lineLinked: boolean;
  /** LOGA member ID (uid, or "P" + pcard_id); null until linked. */
  logaId: string | null;
  logaLinkStatus: LogaLinkStatus;
  logaLinkError: string | null;
  logaCheckedAt: string | null;
  receiptCount: number;
  communityId: string;
  community: { id: string; code: string; name: string };
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemberSummary {
  total: number;
  newThisMonth: number;
  withReceipts: number;
  active: number;
}

export interface MemberCommunity {
  id: string;
  code: string;
  name: string;
  status: ActiveStatus;
}

export type BalanceStatus = 'OK' | 'NOT_LINKED' | 'NOT_FOUND' | 'UNAVAILABLE';

export interface Balance {
  id: string;
  status: BalanceStatus;
  points: number | null;
}

export interface LogaDetail {
  status: BalanceStatus;
  customer: {
    uid: string | null;
    pcardId: string | null;
    name: string | null;
    birthday: string | null;
    level: string | null;
    points: number | null;
  } | null;
}

export interface MemberFilters {
  search?: string;
  communityId?: string;
  status?: MemberStatus;
  /** YYYY-MM-DD */
  registeredFrom?: string;
  registeredTo?: string;
  page: number;
  pageSize: number;
}

export const useMemberSummary = () =>
  useQuery({
    queryKey: ['members', 'summary'],
    queryFn: () => apiGet<MemberSummary>('/members/summary'),
  });

export const useMemberCommunities = () =>
  useQuery({
    queryKey: ['members', 'communities'],
    queryFn: () => apiGet<MemberCommunity[]>('/members/communities'),
  });

export const useMembers = (filters: MemberFilters) =>
  useQuery({
    queryKey: ['members', 'list', filters],
    queryFn: () => apiGet<Paginated<Member>>(`/members?${toQuery(filters)}`),
    placeholderData: keepPreviousData,
  });

/** Live LOGA points for the members on screen (loaded after the list, so the list is fast). */
export const useBalances = (ids: string[]) =>
  useQuery({
    queryKey: ['members', 'balances', ids],
    queryFn: async () => {
      const rows = await apiGet<Balance[]>(`/members/balances?ids=${ids.join(',')}`);
      return new Map(rows.map((b) => [b.id, b]));
    },
    enabled: ids.length > 0,
    staleTime: 60_000,
  });

export const useMember = (id: string) =>
  useQuery({
    queryKey: ['members', 'detail', id],
    queryFn: () => apiGet<Member>(`/members/${id}`),
  });

export const useMemberLoga = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: ['members', 'loga', id],
    queryFn: () => apiGet<LogaDetail>(`/members/${id}/loga`),
    enabled,
  });

function useMemberMutation<TBody>(fn: (body: TBody) => Promise<Member>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  });
}

export interface CreateMemberInput {
  communityId: string;
  phone: string;
  firstName: string;
  lastName: string | null;
  note: string | null;
}
export const useCreateMember = () =>
  useMemberMutation((body: CreateMemberInput) => apiSend<Member>('POST', '/members', body));

export interface UpdateMemberInput {
  phone?: string;
  firstName?: string;
  lastName?: string | null;
  note?: string | null;
  status?: MemberStatus;
}
export const useUpdateMember = () =>
  useMemberMutation(({ id, ...body }: UpdateMemberInput & { id: string }) =>
    apiSend<Member>('PATCH', `/members/${id}`, body),
  );

export const useLinkMember = () =>
  useMemberMutation((id: string) => apiSend<Member>('POST', `/members/${id}/loga-link`));
