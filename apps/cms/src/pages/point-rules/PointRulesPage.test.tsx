import { Menu, MENUS } from '@getpoint/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PointRule, RuleOptions, RuleShop } from '../../api/pointRules';
import { adminUser, renderApp } from '../../test-utils';
import { dayLabel, todayInBangkok } from './ruleDisplay';

afterEach(() => vi.unstubAllGlobals());

const options: RuleOptions = {
  communities: [
    { id: 'c1', code: 'COM001', name: 'GET POINT Community', status: 'ACTIVE', canManage: true },
  ],
  locations: [
    { id: 'l1', code: 'LOC001', name: 'Community Mall A', status: 'ACTIVE', communityId: 'c1' },
    { id: 'l2', code: 'LOC002', name: 'Community Mall B', status: 'ACTIVE', communityId: 'c1' },
  ],
};
const shops: RuleShop[] = [
  { id: 's1', code: 'S001', name: 'ร้านกาแฟ A', participating: true, status: 'ACTIVE' },
  { id: 's5', code: 'S005', name: 'ร้านบริการ E', participating: false, status: 'INACTIVE' },
];

const rule = (overrides: Partial<PointRule>): PointRule => ({
  id: 'r1',
  level: 'LOCATION',
  community: null,
  location: { id: 'l1', code: 'LOC001', name: 'Community Mall A', communityId: 'c1' },
  shop: null,
  spendAmount: 25,
  points: 1,
  rounding: 'FLOOR',
  maxPoints: null,
  startDate: '2026-10-01',
  endDate: null,
  status: 'ACTIVE',
  version: 1,
  createdBy: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  canManage: true,
  ...overrides,
});
const rules = [
  rule({}),
  rule({
    id: 'r2',
    location: { id: 'l2', code: 'LOC002', name: 'Community Mall B', communityId: 'c1' },
    spendAmount: 50,
    maxPoints: 100,
    version: 3,
  }),
];

type Handler = (url: string, init?: RequestInit) => { status: number; body?: unknown } | undefined;
const api =
  (extra?: Handler): Handler =>
  (url, init) => {
    const custom = extra?.(url, init);
    if (custom) return custom;
    if (url === '/api/point-rules/options') return { status: 200, body: options };
    if (url.startsWith('/api/point-rules/shops')) return { status: 200, body: shops };
    if (url.startsWith('/api/point-rules?')) return { status: 200, body: rules };
    if (url === '/api/point-rules/r2/versions')
      return {
        status: 200,
        body: [
          { ...rules[1], id: 'v3', version: 3, changedBy: { id: 'u', name: 'ผู้จัดการ' } },
          { ...rules[1], id: 'v1', version: 1, spendAmount: 40, changedBy: null },
        ],
      };
    return undefined;
  };

const previewPoints = () => screen.getByTestId('preview-points').textContent;

describe('Point rules page', () => {
  it('lists saved rules like the mockup and previews 680 baht → 27 points', async () => {
    renderApp('/point-rules', adminUser, api());

    const row = (await screen.findByText('Community Mall B')).closest('tr')!;
    expect(within(row).getByText('ทุกร้านค้า')).toBeInTheDocument();
    expect(within(row).getByText('50 บาท = 1 แต้ม')).toBeInTheDocument();
    expect(within(row).getByText('สูงสุด 100 แต้ม/ใบเสร็จ')).toBeInTheDocument();
    expect(within(row).getByText('01/10/2569 – ไม่กำหนด')).toBeInTheDocument();
    expect(within(row).getByText('เปิดใช้งาน')).toBeInTheDocument();

    expect(previewPoints()).toBe('27 แต้ม');
    expect(screen.getByText(/680 ÷ 25 = 27.2/)).toBeInTheDocument();
    expect(screen.getByText('การเพิ่ม–ลดแต้มสมาชิกดำเนินการใน Loga')).toBeInTheDocument();
  });

  it('updates the preview as the rate and amount change, including the cap', async () => {
    renderApp('/point-rules', adminUser, api());
    await screen.findByText('Community Mall B');

    fireEvent.change(screen.getByLabelText('ยอดใช้จ่ายทุก (บาท)'), { target: { value: '50' } });
    await waitFor(() => expect(previewPoints()).toBe('13 แต้ม'));

    fireEvent.change(screen.getByLabelText('ยอดใบเสร็จตัวอย่าง'), { target: { value: '5000' } });
    await waitFor(() => expect(previewPoints()).toBe('100 แต้ม'));

    fireEvent.click(screen.getByLabelText('กำหนดแต้มสูงสุดต่อใบเสร็จ'));
    fireEvent.change(await screen.findByLabelText('แต้มสูงสุดต่อใบเสร็จ'), {
      target: { value: '60' },
    });
    await waitFor(() => expect(previewPoints()).toBe('60 แต้ม'));
    expect(screen.getByText(/สูงสุด 60 แต้มต่อใบเสร็จ/)).toBeInTheDocument();
  });

  it('saves a new shop rule with the right level, place and dates', async () => {
    let posted: unknown;
    renderApp(
      '/point-rules',
      adminUser,
      api((url, init) => {
        if (url === '/api/point-rules' && init?.method === 'POST') {
          posted = JSON.parse(String(init.body));
          return { status: 201, body: rule({ id: 'new' }) };
        }
        return undefined;
      }),
    );
    await screen.findByText('Community Mall B');

    fireEvent.mouseDown(screen.getByLabelText('สถานที่'));
    fireEvent.click(await screen.findByTitle('Community Mall A'));
    fireEvent.mouseDown(screen.getByLabelText('ร้านค้าที่ร่วมรายการ'));
    // Only participating, open shops are offered.
    fireEvent.click(await screen.findByTitle('ร้านกาแฟ A (S001)'));
    expect(screen.queryByTitle('ร้านบริการ E (S005)')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('ได้รับ (แต้ม)'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกเงื่อนไข' }));

    await waitFor(() =>
      expect(posted).toEqual({
        level: 'SHOP',
        targetId: 's1',
        spendAmount: 25,
        points: 2,
        rounding: 'FLOOR',
        maxPoints: null,
        startDate: todayInBangkok(),
        endDate: null,
        status: 'ACTIVE',
      }),
    );
  });

  it('asks for a place before saving', async () => {
    const { fetchMock } = renderApp('/point-rules', adminUser, api());
    await screen.findByText('Community Mall B');
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกเงื่อนไข' }));
    expect(await screen.findByText('กรุณาเลือกสถานที่')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some((c) => c[0] === '/api/point-rules' && c[1]?.method === 'POST'),
    ).toBe(false);
  });

  it('edits a rule: loads it into the form and sends only the formula', async () => {
    let patched: unknown;
    renderApp(
      '/point-rules',
      adminUser,
      api((url, init) => {
        if (url === '/api/point-rules/r2' && init?.method === 'PATCH') {
          patched = JSON.parse(String(init.body));
          return { status: 200, body: rules[1] };
        }
        return undefined;
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'แก้ไขเงื่อนไข Community Mall B ทุกร้านค้า',
      }),
    );
    expect(await screen.findByText('แก้ไขเงื่อนไขการให้แต้ม')).toBeInTheDocument();
    expect(screen.getByLabelText('ยอดใช้จ่ายทุก (บาท)')).toHaveValue('50.00');
    expect(screen.getByLabelText('แต้มสูงสุดต่อใบเสร็จ')).toHaveValue('100');

    fireEvent.click(screen.getByLabelText('สถานะเงื่อนไข'));
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกเงื่อนไข' }));
    await waitFor(() =>
      expect(patched).toEqual({
        spendAmount: 50,
        points: 1,
        rounding: 'FLOOR',
        maxPoints: 100,
        startDate: '2026-10-01',
        endDate: null,
        status: 'INACTIVE',
      }),
    );
  });

  it('shows the version history', async () => {
    renderApp('/point-rules', adminUser, api());
    fireEvent.click(
      await screen.findByRole('button', { name: 'ประวัติ Community Mall B ทุกร้านค้า' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('40 บาท = 1 แต้ม')).toBeInTheDocument();
    expect(within(dialog).getByText('ผู้จัดการ')).toBeInTheDocument();
  });

  it('is read-only with view permission: no form, no edit buttons', async () => {
    const viewer = {
      ...adminUser,
      permissions: MENUS.map((menu) => ({
        menu,
        canView: menu === Menu.POINT_RULES,
        canManage: false,
      })),
    };
    renderApp('/point-rules', viewer, api());
    await screen.findByText('Community Mall B');
    expect(screen.queryByText('ตั้งค่าเงื่อนไขการให้แต้ม')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^แก้ไขเงื่อนไข/ })).not.toBeInTheDocument();
    expect(screen.getByText('ทดสอบเงื่อนไขกับใบเสร็จ')).toBeInTheDocument();
  });
});

describe('dayLabel', () => {
  it('shows calendar days in the Buddhist era without time-zone shifts', () => {
    expect(dayLabel('2026-10-01')).toBe('01/10/2569');
    expect(dayLabel('2026-12-31')).toBe('31/12/2569');
  });
});
