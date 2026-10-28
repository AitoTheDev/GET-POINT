import type { SettingKey, SettingsValues } from '@getpoint/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend } from './client';

export type MockTransferMode = 'SUCCESS' | 'FAIL' | 'TIMEOUT' | 'LOST_RESPONSE';

export interface SettingsPage {
  values: SettingsValues;
  defaults: SettingsValues;
  /** Last change per item. */
  changes: Partial<Record<SettingKey, { at: string; by: string | null }>>;
  loga: {
    mode: 'mock' | 'live';
    baseUrl: string;
    cardId: string | null;
    deviceId: string;
    credentialsSet: boolean;
    mockTransferMode: MockTransferMode | null;
    transfers: {
      pending: number;
      failed: number;
      unknown: number;
      succeeded: number;
      lastSentAt: string | null;
    };
  };
  email: { configured: boolean; host: string | null; from: string };
  system: {
    database: 'up' | 'down';
    environment: string;
    nodeVersion: string;
    startedAt: string;
    receipts: number;
    storage: { bytes: number; files: number };
  };
}

export const useSettings = () =>
  useQuery({ queryKey: ['settings'], queryFn: () => apiGet<SettingsPage>('/settings') });

export function useSaveSetting() {
  const qc = useQueryClient();
  return useMutation({
    // The server validates each item's value.
    mutationFn: ({ key, value }: { key: SettingKey; value: SettingsValues[SettingKey] }) =>
      apiSend<{ key: SettingKey; value: unknown }>('PUT', `/settings/${key}`, { value }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['settings'] }),
        // Reasons, limits and the default age are used on other pages.
        qc.invalidateQueries({ queryKey: ['receipts', 'config'] }),
        qc.invalidateQueries({ queryKey: ['point-rules', 'options'] }),
      ]),
  });
}

export interface CheckResult {
  ok: boolean;
  message: string;
  cardName?: string | null;
  durationMs?: number;
}

/** Checks the connection only; nothing on the page changes. */
export const useTestLoga = () =>
  useMutation({ mutationFn: () => apiSend<CheckResult>('POST', '/settings/loga/test') });

export function useMockMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: MockTransferMode) =>
      apiSend<{ mode: MockTransferMode }>('POST', '/settings/loga/mock-mode', { mode }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}

export const useTestEmail = () =>
  useMutation({
    mutationFn: () => apiSend<CheckResult & { to?: string }>('POST', '/settings/email/test'),
  });
