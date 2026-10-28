import { type AuthUser, Menu, MENUS, type MenuPermission } from '@getpoint/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AppRoutes } from './App';
import { AuthProvider } from './auth/AuthProvider';

const grant = (menus: Menu[], manage = false): MenuPermission[] =>
  MENUS.map((menu) => ({
    menu,
    canView: menus.includes(menu),
    canManage: manage && menus.includes(menu),
  }));

export const adminUser: AuthUser = {
  id: 'u-admin',
  email: 'admin@test.local',
  name: 'ผู้ดูแล ทดสอบ',
  mustChangePassword: false,
  role: { id: 'r-admin', key: 'ADMIN', name: 'ผู้ดูแลระบบ' },
  permissions: grant(MENUS, true),
  scope: { all: true, communityIds: [], locationIds: [] },
};

export const staffUser: AuthUser = {
  ...adminUser,
  id: 'u-staff',
  email: 'staff@test.local',
  name: 'เจ้าหน้าที่ ทดสอบ',
  role: { id: 'r-staff', key: 'STAFF', name: 'เจ้าหน้าที่' },
  permissions: grant([
    Menu.DASHBOARD,
    Menu.RECEIPT_REVIEW,
    Menu.RECEIPT_HISTORY,
    Menu.MEMBERS,
    Menu.REPORTS,
  ]),
  scope: { all: false, communityIds: [], locationIds: ['loc-a'] },
};

type Handler = (url: string, init?: RequestInit) => { status: number; body?: unknown } | undefined;

const json = (status: number, body?: unknown) =>
  Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

/**
 * Render the whole app at `path`. `user` = logged in via the refresh cookie (null = logged out).
 * `handler` can answer extra API calls; anything unhandled returns 404.
 */
export function renderApp(path: string, user: AuthUser | null, handler?: Handler) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const custom = handler?.(url, init);
    if (custom) return json(custom.status, custom.body);
    if (url === '/api/auth/refresh') {
      return user
        ? json(200, { accessToken: 'token', user })
        : json(401, { message: 'no session' });
    }
    if (url === '/api/health')
      return json(200, { status: 'ok', database: 'up', timestamp: new Date().toISOString() });
    return json(404, { statusCode: 404, message: 'not found' });
  });
  vi.stubGlobal('fetch', fetchMock);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <AntApp>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </AntApp>,
  );
  return { ...utils, fetchMock };
}
