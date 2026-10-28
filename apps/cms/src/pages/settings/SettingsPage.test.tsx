import { DEFAULT_SETTINGS, Menu, MENUS } from '@getpoint/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SettingsPage } from '../../api/settings';
import { adminUser, renderApp } from '../../test-utils';

afterEach(() => vi.unstubAllGlobals());

const page: SettingsPage = {
  values: structuredClone(DEFAULT_SETTINGS),
  defaults: DEFAULT_SETTINGS,
  changes: { transferRetry: { at: '2026-10-27T03:00:00Z', by: 'ผู้ดูแลระบบ' } },
  loga: {
    mode: 'mock',
    baseUrl: 'https://loga.app/api',
    cardId: null,
    deviceId: 'GETPOINT-API',
    credentialsSet: false,
    mockTransferMode: 'SUCCESS',
    transfers: { pending: 2, failed: 1, unknown: 0, succeeded: 7, lastSentAt: null },
  },
  email: { configured: false, host: null, from: 'GET POINT <no-reply@getpoint.local>' },
  line: { mode: 'mock', liffId: null, channelIdSet: false },
  sms: { provider: 'mock', ready: true },
  system: {
    database: 'up',
    environment: 'development',
    nodeVersion: 'v24.13.0',
    startedAt: '2026-10-27T02:00:00Z',
    receipts: 12,
    storage: { bytes: 1_572_864, files: 12 },
  },
};

type Handler = (url: string, init?: RequestInit) => { status: number; body?: unknown } | undefined;
const api =
  (calls: { url: string; method?: string; body?: unknown }[]): Handler =>
  (url, init) => {
    if (url.startsWith('/api/settings')) {
      calls.push({ url, method: init?.method, body: init?.body && JSON.parse(String(init.body)) });
    }
    if (url === '/api/settings' && !init?.method) return { status: 200, body: page };
    if (url === '/api/settings/loga/test')
      return {
        status: 200,
        body: {
          ok: true,
          message: 'เชื่อมต่อ LOGA สำเร็จ',
          cardName: 'GET POINT (LOGA จำลอง)',
          durationMs: 120,
        },
      };
    if (url === '/api/settings/loga/mock-mode') return { status: 200, body: { mode: 'FAIL' } };
    if (url.startsWith('/api/settings/') && init?.method === 'PUT')
      return { status: 200, body: {} };
    return undefined;
  };

describe('Settings page', () => {
  it('shows LOGA connection, transfer counts and tests the connection', async () => {
    const calls: { url: string; method?: string }[] = [];
    renderApp('/settings', adminUser, api(calls));
    expect(await screen.findByText('LOGA จำลอง (สำหรับทดสอบ)')).toBeInTheDocument();
    expect(screen.getByText('ยังไม่ได้ตั้งค่า')).toBeInTheDocument();
    expect(screen.getByText('ส่งไม่สำเร็จ')).toBeInTheDocument();
    // Nothing secret on the page.
    expect(document.body.textContent).not.toMatch(/password/i);

    fireEvent.click(screen.getByRole('button', { name: /ทดสอบการเชื่อมต่อ/ }));
    expect(await screen.findByText('เชื่อมต่อ LOGA สำเร็จ')).toBeInTheDocument();
    expect(screen.getByText(/บัตร: GET POINT \(LOGA จำลอง\)/)).toBeInTheDocument();
  });

  it('switches the mock LOGA behaviour', async () => {
    const calls: { url: string; method?: string; body?: unknown }[] = [];
    renderApp('/settings', adminUser, api(calls));
    fireEvent.click(await screen.findByText('LOGA ปฏิเสธ'));
    await waitFor(() =>
      expect(calls).toContainEqual({
        url: '/api/settings/loga/mock-mode',
        method: 'POST',
        body: { mode: 'FAIL' },
      }),
    );
  });

  it('saves the retry rule and the remark, with a live example', async () => {
    const calls: { url: string; method?: string; body?: unknown }[] = [];
    renderApp('/settings', adminUser, api(calls));
    expect(await screen.findByText(/แก้ไขล่าสุด .* โดย ผู้ดูแลระบบ/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('จำนวนครั้งที่ส่งสูงสุด'), { target: { value: '3' } });
    const retryCard = screen.getByText('การส่งซ้ำอัตโนมัติ').closest('.ant-card')!;
    fireEvent.click(within(retryCard as HTMLElement).getByRole('button', { name: /บันทึก/ }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        url: '/api/settings/transferRetry',
        method: 'PUT',
        body: { value: { maxAttempts: 3, intervalMinutes: 5 } },
      }),
    );

    fireEvent.change(screen.getByLabelText('ข้อความที่สมาชิกเห็นใน LOGA'), {
      target: { value: 'แต้มจาก {shop}' },
    });
    expect(await screen.findByText('ตัวอย่าง: “แต้มจาก ร้านกาแฟ A”')).toBeInTheDocument();
  });

  it('edits reject reasons; "Other" can’t be switched off', async () => {
    const calls: { url: string; method?: string; body?: unknown }[] = [];
    renderApp('/settings', adminUser, api(calls));
    fireEvent.click(await screen.findByRole('tab', { name: 'ใบเสร็จ' }));
    fireEvent.change(await screen.findByLabelText('ชื่อเหตุผล UNREADABLE'), {
      target: { value: 'ภาพเบลอ' },
    });
    fireEvent.click(screen.getByLabelText('ใช้งาน ALTERED'));
    expect(screen.getByLabelText('ใช้งาน OTHER')).toBeDisabled();

    const card = screen.getByText('เหตุผลที่ไม่อนุมัติ').closest('.ant-card') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /บันทึก/ }));
    await waitFor(() =>
      expect(calls.some((c) => c.url === '/api/settings/rejectReasons')).toBe(true),
    );
    const body = calls.find((c) => c.url === '/api/settings/rejectReasons')!.body as {
      value: Record<string, { label: string; enabled: boolean }>;
    };
    expect(body.value.UNREADABLE.label).toBe('ภาพเบลอ');
    expect(body.value.ALTERED.enabled).toBe(false);
    expect(Object.keys(body.value)).toHaveLength(9);
  });

  it('saves "no limit" as the default receipt age', async () => {
    const calls: { url: string; method?: string; body?: unknown }[] = [];
    renderApp('/settings', adminUser, api(calls));
    fireEvent.click(await screen.findByRole('tab', { name: 'ใบเสร็จ' }));
    const card = (await screen.findByText('ระยะเวลาส่งใบเสร็จ (ค่าเริ่มต้น)')).closest(
      '.ant-card',
    ) as HTMLElement;
    fireEvent.click(within(card).getByRole('checkbox', { name: 'ไม่จำกัด' }));
    fireEvent.click(within(card).getByRole('button', { name: /บันทึก/ }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        url: '/api/settings/defaultClaimDays',
        method: 'PUT',
        body: { value: null },
      }),
    );
  });

  it('shows system information', async () => {
    renderApp('/settings', adminUser, api([]));
    fireEvent.click(await screen.findByRole('tab', { name: 'ระบบ' }));
    expect(await screen.findByText('1.5 MB (12 ไฟล์)')).toBeInTheDocument();
    expect(screen.getByText('12 ใบ')).toBeInTheDocument();
  });

  it('is read-only with view permission', async () => {
    const viewer = {
      ...adminUser,
      permissions: MENUS.map((menu) => ({
        menu,
        canView: menu === Menu.SETTINGS,
        canManage: false,
      })),
    };
    renderApp('/settings', viewer, api([]));
    expect(await screen.findByText(/คุณดูการตั้งค่าได้อย่างเดียว/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /บันทึก/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ทดสอบการเชื่อมต่อ/ })).not.toBeInTheDocument();
  });
});
