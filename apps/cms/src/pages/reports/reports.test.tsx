import { type AuthUser, Menu, MENUS } from '@getpoint/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Dashboard, LogaReport, MembersReport, ReceiptsReport } from '../../api/reports';
import { labelIndexes, niceTicks } from '../../components/charts/chartUtils';
import { rangeText } from '../../components/dateRange';
import { adminUser, renderApp, staffUser } from '../../test-utils';

afterEach(() => vi.unstubAllGlobals());

const days = (n: number, count = (i: number) => i) =>
  Array.from({ length: n }, (_, i) => ({
    day: `2026-10-${String(i + 1).padStart(2, '0')}`,
    count: count(i),
  }));

const dashboard: Dashboard = {
  range: { from: '2026-10-01', to: '2026-10-27' },
  kpis: { members: 1248, receiptsSubmitted: 386, waiting: 24, pointsGiven: 18420 },
  trend: days(27),
  statuses: { approved: 342, waiting: 24, rejected: 20, total: 386 },
  recentWaiting: [
    {
      id: 'r1',
      code: 'GP002',
      status: 'PENDING_REVIEW',
      submittedAt: '2026-10-10T07:32:00Z',
      amount: 250,
      shop: { name: 'ร้านกาแฟ A' },
      member: { phone: '08X-XXX-1234' },
    },
  ],
};

const receiptsReport: ReceiptsReport = {
  range: dashboard.range,
  status: 'APPROVED',
  kpis: { receipts: 342, amount: 128450, members: 186, pointsSent: 5138 },
  daily: days(27),
  byShop: [
    {
      shop: { id: 's1', code: 'S001', name: 'ร้านกาแฟ A' },
      receipts: 85,
      members: 52,
      amount: 18500,
      pointsSent: 740,
    },
    {
      shop: { id: 's2', code: 'S002', name: 'ร้านอาหาร B' },
      receipts: 110,
      members: 78,
      amount: 42750,
      pointsSent: 1710,
    },
  ],
  truncated: false,
};

const membersReport: MembersReport = {
  range: dashboard.range,
  kpis: { totalAtEnd: 1248, newInRange: 86, sendersInRange: 186, newSenders: 32 },
  dailyNew: days(27),
  newMembersSending: { sent: 32, notYet: 54 },
  items: [
    {
      id: 'm1',
      code: 'M0001',
      name: 'สมชาย ใจดี',
      phone: '08X-XXX-1234',
      community: 'Community Mall A',
      status: 'ACTIVE',
      createdAt: '2026-10-01T03:00:00Z',
      receiptsInRange: 3,
      approvedAmountInRange: 1250,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
};

const logaReport: LogaReport = {
  range: dashboard.range,
  kpis: { pointsSent: 5138, succeeded: 330, pending: 8, failed: 3, unknown: 1, total: 342 },
  items: [
    {
      id: 't1',
      receiptId: 'r9',
      code: 'GP004',
      phone: '06X-XXX-7890',
      location: 'Community Mall C',
      points: 15,
      transferStatus: 'FAILED',
      lastError: 'เชื่อมต่อไม่สำเร็จ',
      attempts: 3,
      lastAttemptAt: '2026-10-10T06:10:00Z',
      sentAt: null,
      reference: null,
      approvedAt: '2026-10-10T06:00:00Z',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
};

const api =
  (calls: string[]) =>
  (url: string): { status: number; body?: unknown } | undefined => {
    if (url.startsWith('/api/reports') || url.startsWith('/api/activity-log')) calls.push(url);
    if (url === '/api/reports/locations')
      return { status: 200, body: [{ id: 'loc-a', code: 'LOC001', name: 'Mall A' }] };
    if (url.startsWith('/api/reports/dashboard?')) return { status: 200, body: dashboard };
    if (url.startsWith('/api/reports/receipts?')) return { status: 200, body: receiptsReport };
    if (url.startsWith('/api/reports/members?')) return { status: 200, body: membersReport };
    if (url.startsWith('/api/reports/loga?')) return { status: 200, body: logaReport };
    if (url === '/api/notifications') return { status: 200, body: { total: 0, items: [] } };
    return undefined;
  };

describe('chart helpers', () => {
  it('rounds the axis and thins day labels', () => {
    expect(niceTicks(86)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(0)).toEqual([0, 1]);
    // Counts never get half steps.
    expect(niceTicks(2)).toEqual([0, 1, 2]);
    expect(niceTicks(10)).toEqual([0, 5, 10]);
    expect(niceTicks(12)).toEqual([0, 5, 10, 15]);
    const shown = labelIndexes(31, 480);
    expect(shown.has(0)).toBe(true);
    expect(shown.has(30)).toBe(true);
    expect(shown.size).toBeLessThanOrEqual(10);
  });

  it('writes ranges in Buddhist-era Thai', () => {
    expect(rangeText('2026-10-01', '2026-10-27')).toBe('1 – 27 ต.ค. 2569');
    expect(rangeText('2026-09-28', '2026-10-27')).toBe('28 ก.ย. – 27 ต.ค. 2569');
    expect(rangeText('2025-12-30', '2026-01-02')).toBe('30 ธ.ค. 2568 – 2 ม.ค. 2569');
  });
});

describe('Dashboard', () => {
  it('shows the KPIs, status shares and waiting receipts for this month', async () => {
    const calls: string[] = [];
    renderApp('/', adminUser, api(calls));
    expect(await screen.findByText('1,248')).toBeInTheDocument();
    expect(screen.getByText('18,420')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'อนุมัติแล้ว 342, รอตรวจสอบ 24, ไม่อนุมัติ 20' }),
    ).toBeInTheDocument();
    expect(screen.getByText('#GP002')).toBeInTheDocument();
    expect(screen.getByText('250.00 บาท')).toBeInTheDocument();
    // This month, all places.
    expect(calls.find((c) => c.startsWith('/api/reports/dashboard'))).toMatch(
      /from=\d{4}-\d{2}-01&to=/,
    );
  });

  it('changes the date range with a preset and reloads', async () => {
    const calls: string[] = [];
    renderApp('/', adminUser, api(calls));
    await screen.findByText('1,248');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'ช่วงวันที่' }));
    fireEvent.click(await screen.findByText('วันนี้'));
    await waitFor(() => {
      const last = calls.filter((c) => c.startsWith('/api/reports/dashboard')).at(-1)!;
      const q = new URLSearchParams(last.split('?')[1]);
      expect(q.get('from')).toBe(q.get('to'));
    });
  });
});

describe('Reports', () => {
  it('receipts tab: approved by default, shop table with totals', async () => {
    const calls: string[] = [];
    renderApp('/reports', staffUser, api(calls));
    expect(await screen.findByText('สรุปผลแยกร้านค้า')).toBeInTheDocument();
    expect(calls.find((c) => c.startsWith('/api/reports/receipts'))).toContain('status=APPROVED');
    const table = screen.getByText('สรุปผลแยกร้านค้า').closest('.ant-card') as HTMLElement;
    expect(await within(table).findByText('รวม')).toBeInTheDocument();
    expect(within(table).getByText('128,450.00')).toBeInTheDocument();
  });

  it('members tab shows new-member sending and the member table', async () => {
    renderApp('/reports?tab=members', staffUser, api([]));
    expect(await screen.findByText('สมชาย ใจดี')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'ส่งใบเสร็จแล้ว 32, ยังไม่ส่งใบเสร็จ 54' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1,250.00')).toBeInTheDocument();
  });

  it('LOGA tab: filter applies only on "แสดงรายงาน"; failures show their reason', async () => {
    const calls: string[] = [];
    renderApp('/reports?tab=loga', staffUser, api(calls));
    expect(await screen.findByText('เชื่อมต่อไม่สำเร็จ')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('ค้นหาเลขใบเสร็จหรือเบอร์โทร'), {
      target: { value: 'GP004' },
    });
    expect(calls.some((c) => c.includes('search=GP004'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /แสดงรายงาน/ }));
    await waitFor(() => expect(calls.some((c) => c.includes('search=GP004'))).toBe(true));
  });
});

describe('Activity Log', () => {
  const page = (everyone: boolean) => ({
    everyone,
    total: 1,
    page: 1,
    pageSize: 20,
    items: [
      {
        id: 'a1',
        createdAt: '2026-10-27T03:00:00Z',
        action: 'receipt.approved',
        actor: { id: 'u-admin', name: 'ผู้ดูแล ทดสอบ', email: 'admin@test.local' },
        entityType: 'receipt',
        entityId: 'r1',
        target: 'GP001',
        metadata: { code: 'GP001', points: 27 },
        ip: '127.0.0.1',
      },
    ],
  });

  it('Admin sees who did it and can filter by person', async () => {
    renderApp('/activity-log', adminUser, (url) =>
      url.startsWith('/api/activity-log?')
        ? { status: 200, body: page(true) }
        : url === '/api/activity-log/actors'
          ? {
              status: 200,
              body: [{ id: 'u-admin', name: 'ผู้ดูแล ทดสอบ', email: 'admin@test.local' }],
            }
          : undefined,
    );
    expect(await screen.findByText('อนุมัติใบเสร็จ')).toBeInTheDocument();
    expect(screen.getByText('GP001')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'ผู้ใช้งาน' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('อนุมัติใบเสร็จ'));
    expect(await screen.findByText(/"points": 27/)).toBeInTheDocument();
  });

  it('other roles see only their own activity, with no person filter', async () => {
    const user: AuthUser = {
      ...staffUser,
      permissions: MENUS.map((menu) => ({
        menu,
        canView: menu === Menu.ACTIVITY_LOG,
        canManage: false,
      })),
    };
    renderApp('/activity-log', user, (url) =>
      url.startsWith('/api/activity-log?') ? { status: 200, body: page(false) } : undefined,
    );
    expect(await screen.findByText(/ประวัติการใช้งานของคุณ/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'ผู้ใช้งาน' })).not.toBeInTheDocument();
  });
});

describe('Notification bell', () => {
  it('counts what needs action and links to it', async () => {
    renderApp('/members', adminUser, (url) =>
      url === '/api/notifications'
        ? {
            status: 200,
            body: {
              total: 5,
              items: [
                { key: 'transfers-stopped', count: 2, oldestAt: '2026-10-26T03:00:00Z' },
                { key: 'receipts-waiting', count: 3, oldestAt: '2026-10-25T03:00:00Z' },
              ],
            },
          }
        : url.startsWith('/api/receipts')
          ? { status: 200, body: { items: [], total: 0, page: 1, pageSize: 20 } }
          : undefined,
    );
    const bell = await screen.findByRole('button', { name: 'การแจ้งเตือน 5 รายการ' });
    fireEvent.click(bell);
    fireEvent.click(await screen.findByText('ส่งแต้มไป LOGA ไม่สำเร็จ 2 รายการ'));
    expect(
      await screen.findByRole('heading', { name: 'ประวัติใบเสร็จ', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('รอส่งซ้ำด้วยตนเอง')).toBeInTheDocument();
  });
});
