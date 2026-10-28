import { Menu, MENUS } from '@getpoint/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Community, Location, Shop, ShopCategory } from '../../api/org';
import { adminUser, renderApp } from '../../test-utils';

afterEach(() => vi.unstubAllGlobals());

const community: Community = {
  id: 'c1',
  code: 'COM001',
  name: 'GET POINT Community',
  status: 'ACTIVE',
  locationCount: 2,
  canManage: true,
};
const loc = (id: string, code: string, name: string, shopCount: number): Location => ({
  id,
  code,
  name,
  province: 'กรุงเทพมหานคร',
  status: 'ACTIVE',
  communityId: 'c1',
  community: { id: 'c1', code: 'COM001', name: community.name },
  shopCount,
  canManageCommunity: true,
});
const locations = [
  loc('l1', 'LOC001', 'Community Mall A', 2),
  loc('l2', 'LOC002', 'Community Mall B', 0),
];
const categories: ShopCategory[] = [
  { id: 'cat1', name: 'คาเฟ่', sortOrder: 1, status: 'ACTIVE', shopCount: 1 },
];
const shops: Shop[] = [
  {
    id: 's1',
    code: 'S001',
    name: 'ร้านกาแฟ A',
    receiptName: 'CAFE A',
    participating: true,
    status: 'ACTIVE',
    locationId: 'l1',
    categoryId: 'cat1',
    category: { id: 'cat1', name: 'คาเฟ่' },
    location: { id: 'l1', code: 'LOC001', name: 'Community Mall A' },
  },
  {
    id: 's2',
    code: 'S002',
    name: 'ร้านบริการ E',
    receiptName: null,
    participating: false,
    status: 'INACTIVE',
    locationId: 'l1',
    categoryId: null,
    category: null,
    location: { id: 'l1', code: 'LOC001', name: 'Community Mall A' },
  },
];

type Handler = (url: string, init?: RequestInit) => { status: number; body?: unknown } | undefined;
const api =
  (extra?: Handler): Handler =>
  (url, init) => {
    const custom = extra?.(url, init);
    if (custom) return custom;
    if (url === '/api/org/summary')
      return { status: 200, body: { locations: 2, shops: 2, participatingShops: 1 } };
    if (url === '/api/communities') return { status: 200, body: [community] };
    if (url.startsWith('/api/locations')) return { status: 200, body: locations };
    if (url === '/api/shop-categories') return { status: 200, body: categories };
    if (url.startsWith('/api/shops?')) {
      const items = url.includes('locationId=l1') ? shops : [];
      return { status: 200, body: { items, total: items.length, page: 1, pageSize: 20 } };
    }
    return undefined;
  };

describe('Shops & Locations page', () => {
  it('shows summary cards, the location list and the first location’s shops', async () => {
    renderApp('/shops', adminUser, api());
    expect(await screen.findByText('ร้านกาแฟ A')).toBeInTheDocument();
    expect(screen.getByText('สถานที่ทั้งหมด')).toBeInTheDocument();
    expect(screen.getByText('ร้านค้าที่ร่วมรายการ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Community Mall B/ })).toBeInTheDocument();

    const row = screen.getByText('ร้านกาแฟ A').closest('tr')!;
    expect(within(row).getByText('S001')).toBeInTheDocument();
    expect(within(row).getByText('CAFE A')).toBeInTheDocument();
    expect(within(row).getByText('ใช่')).toBeInTheDocument();
    const inactive = screen.getByText('ร้านบริการ E').closest('tr')!;
    expect(within(inactive).getByText('ไม่')).toBeInTheDocument();
    expect(within(inactive).getByText('ปิดใช้งาน')).toBeInTheDocument();
  });

  it('switches location when another card is clicked', async () => {
    renderApp('/shops', adminUser, api());
    await screen.findByText('ร้านกาแฟ A');
    fireEvent.click(screen.getByRole('button', { name: /Community Mall B/ }));
    expect(await screen.findByText('ยังไม่มีร้านค้าในสถานที่นี้')).toBeInTheDocument();
  });

  it('adds a shop to the selected location with the form values', async () => {
    let posted: unknown;
    renderApp(
      '/shops',
      adminUser,
      api((url, init) => {
        if (url === '/api/shops' && init?.method === 'POST') {
          posted = JSON.parse(init.body as string);
          return { status: 201, body: { ...shops[0], id: 's3', code: 'S003', name: 'ร้านใหม่' } };
        }
        return undefined;
      }),
    );
    await screen.findByText('ร้านกาแฟ A');
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มร้านค้า/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('ชื่อร้านค้า'), {
      target: { value: 'ร้านใหม่' },
    });
    fireEvent.change(within(dialog).getByLabelText('ชื่อร้านบนใบเสร็จ'), {
      target: { value: '  NEW SHOP ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'เพิ่มร้านค้า' }));

    await waitFor(() =>
      expect(posted).toEqual({
        locationId: 'l1',
        name: 'ร้านใหม่',
        categoryId: null,
        receiptName: 'NEW SHOP',
        participating: true,
        status: 'ACTIVE',
      }),
    );
    expect(await screen.findByText('เพิ่มร้านค้า S003 เรียบร้อยแล้ว')).toBeInTheDocument();
  });

  it('shows the server message when a shop name already exists', async () => {
    renderApp(
      '/shops',
      adminUser,
      api((url, init) =>
        url === '/api/shops' && init?.method === 'POST'
          ? {
              status: 409,
              body: { statusCode: 409, message: 'มีร้านค้าชื่อนี้ในสถานที่นี้อยู่แล้ว' },
            }
          : undefined,
      ),
    );
    await screen.findByText('ร้านกาแฟ A');
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มร้านค้า/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('ชื่อร้านค้า'), {
      target: { value: 'ร้านกาแฟ A' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'เพิ่มร้านค้า' }));
    expect(
      await within(dialog).findByText('มีร้านค้าชื่อนี้ในสถานที่นี้อยู่แล้ว'),
    ).toBeInTheDocument();
  });

  it('is read-only with view permission only, and hides categories without Settings', async () => {
    const viewer = {
      ...adminUser,
      permissions: MENUS.map((menu) => ({ menu, canView: menu === Menu.SHOPS, canManage: false })),
    };
    renderApp('/shops', viewer, api());
    await screen.findByText('ร้านกาแฟ A');
    expect(screen.getByRole('button', { name: /Export Excel/ })).toBeInTheDocument();
    for (const name of [/เพิ่มสถานที่/, /เพิ่มร้านค้า/, /แก้ไขสถานที่/, /หมวดหมู่ร้านค้า/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryAllByRole('button', { name: /แก้ไข/ })).toHaveLength(0);
  });
});
