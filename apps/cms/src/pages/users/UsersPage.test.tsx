import { Menu, MENUS } from '@getpoint/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role, UserRow } from '../../api/users';
import { adminUser, renderApp } from '../../test-utils';

afterEach(() => vi.unstubAllGlobals());

const allPerms = MENUS.map((menu) => ({ menu, canView: true, canManage: true }));
const roles: Role[] = [
  {
    id: 'r-admin',
    key: 'ADMIN',
    name: 'ผู้ดูแลระบบ',
    description: null,
    isSystem: true,
    userCount: 1,
    permissions: allPerms,
  },
  {
    id: 'r-staff',
    key: 'STAFF',
    name: 'เจ้าหน้าที่',
    description: null,
    isSystem: true,
    userCount: 1,
    permissions: MENUS.map((menu) => ({ menu, canView: menu === Menu.MEMBERS, canManage: false })),
  },
];

const users: UserRow[] = [
  {
    id: 'u-admin',
    name: 'อรทัย ผู้ดูแล',
    email: 'admin@example.com',
    status: 'ACTIVE',
    mustChangePassword: false,
    lastLoginAt: null,
    lockedUntil: null,
    createdAt: '2026-10-01T00:00:00Z',
    role: { id: 'r-admin', key: 'ADMIN', name: 'ผู้ดูแลระบบ' },
    scope: { all: true, communities: [], locations: [] },
  },
  {
    id: 'u-2',
    name: 'พีช ผู้ตรวจ',
    email: 'reviewer@example.com',
    status: 'SUSPENDED',
    mustChangePassword: false,
    lastLoginAt: null,
    lockedUntil: null,
    createdAt: '2026-10-02T00:00:00Z',
    role: { id: 'r-staff', key: 'STAFF', name: 'เจ้าหน้าที่' },
    scope: {
      all: false,
      communities: [],
      locations: [{ id: 'loc-a', code: 'LOC001', name: 'Community Mall A' }],
    },
  },
];

const api =
  (extra?: (url: string, init?: RequestInit) => { status: number; body?: unknown } | undefined) =>
  (url: string, init?: RequestInit) => {
    const custom = extra?.(url, init);
    if (custom) return custom;
    if (url.startsWith('/api/users?'))
      return { status: 200, body: { items: users, total: 2, page: 1, pageSize: 20 } };
    if (url === '/api/roles') return { status: 200, body: roles };
    if (url === '/api/users/scope-options')
      return {
        status: 200,
        body: [
          {
            id: 'c1',
            code: 'COM001',
            name: 'Community',
            locations: [{ id: 'loc-a', code: 'LOC001', name: 'Community Mall A' }],
          },
        ],
      };
    return undefined;
  };

describe('Users & Permissions page', () => {
  it('lists users with role, location and status like the mockup', async () => {
    renderApp('/users', adminUser, api());
    const row = (await screen.findByText('พีช ผู้ตรวจ')).closest('tr')!;
    expect(within(row).getByText('เจ้าหน้าที่')).toBeInTheDocument();
    expect(within(row).getByText('Community Mall A')).toBeInTheDocument();
    expect(within(row).getByText('ระงับ')).toBeInTheDocument();
    expect(screen.getByText('ทุกสถานที่')).toBeInTheDocument();
  });

  it('opens the permission panel for the clicked user, with the role matrix', async () => {
    renderApp('/users', adminUser, api());
    fireEvent.click(await screen.findByText('พีช ผู้ตรวจ'));
    const panel = (await screen.findByText('กำหนดสิทธิ์ผู้ใช้งาน')).closest(
      '.ant-card',
    ) as HTMLElement;
    expect(within(panel).getByText('reviewer@example.com')).toBeInTheDocument();
    expect(within(panel).getByText('สิทธิ์ตามบทบาท')).toBeInTheDocument();
    // Staff role matrix: only "สมาชิก" can be viewed
    expect(within(panel).getAllByLabelText('มีสิทธิ์')).toHaveLength(1);
    expect(within(panel).getByRole('button', { name: 'บันทึก' })).toBeInTheDocument();
  });

  it('creates a user and shows the temporary password once', async () => {
    let posted: unknown;
    renderApp(
      '/users',
      adminUser,
      api((url, init) => {
        if (url === '/api/users' && init?.method === 'POST') {
          posted = JSON.parse(init.body as string);
          return {
            status: 201,
            body: {
              user: { ...users[1], id: 'u-new', name: 'ใหม่', email: 'new@example.com' },
              temporaryPassword: 'AbCdEf234567',
            },
          };
        }
        return undefined;
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /เพิ่มผู้ใช้งาน/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('ชื่อผู้ใช้งาน'), { target: { value: 'ใหม่' } });
    fireEvent.change(within(dialog).getByLabelText('อีเมล'), {
      target: { value: 'new@example.com' },
    });
    // choose role "ผู้ดูแลระบบ" (admin => all locations, no picker needed)
    fireEvent.mouseDown(within(dialog).getByLabelText('บทบาท'));
    fireEvent.click(await screen.findByTitle('ผู้ดูแลระบบ'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'เพิ่มผู้ใช้งาน' }));

    expect(await screen.findByText('AbCdEf234567')).toBeInTheDocument();
    expect(screen.getByText(/จะแสดงเพียงครั้งเดียว/)).toBeInTheDocument();
    await waitFor(() =>
      expect(posted).toMatchObject({
        name: 'ใหม่',
        email: 'new@example.com',
        roleId: 'r-admin',
        status: 'ACTIVE',
      }),
    );
  });

  it('is read-only for a role with view but not manage', async () => {
    const viewer = {
      ...adminUser,
      permissions: MENUS.map((menu) => ({ menu, canView: menu === Menu.USERS, canManage: false })),
    };
    renderApp('/users', viewer, api());
    fireEvent.click(await screen.findByText('พีช ผู้ตรวจ'));
    await screen.findByText('กำหนดสิทธิ์ผู้ใช้งาน');
    expect(screen.queryByRole('button', { name: /เพิ่มผู้ใช้งาน/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'บันทึก' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /รีเซ็ตรหัสผ่าน/ })).not.toBeInTheDocument();
  });
});
