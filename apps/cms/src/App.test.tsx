import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminUser, renderApp, staffUser } from './test-utils';

afterEach(() => vi.unstubAllGlobals());

const sidebarLabels = async () => {
  const menu = (await screen.findAllByRole('menu'))[0];
  return within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent);
};

describe('CMS routing and auth', () => {
  it('sends logged-out visitors to the login page', async () => {
    renderApp('/users', null);
    expect(await screen.findByText('เข้าสู่ระบบ CMS')).toBeInTheDocument();
    expect(screen.getByText('ลืมรหัสผ่าน?')).toBeInTheDocument();
  });

  it('shows every menu to an admin, with their name and role in the header', async () => {
    renderApp('/', adminUser);
    expect(await sidebarLabels()).toEqual([
      'Dashboard',
      'ตรวจสอบใบเสร็จ',
      'ประวัติใบเสร็จ',
      'สมาชิก',
      'เงื่อนไขการให้แต้ม',
      'ร้านค้าและสถานที่',
      'รายงาน',
      'ผู้ใช้งานและสิทธิ์',
      'Activity Log',
    ]);
    expect(screen.getByText('ผู้ดูแล ทดสอบ')).toBeInTheDocument();
    expect(screen.getByText('ตั้งค่า')).toBeInTheDocument();
  });

  it('hides menus a staff member has no permission for', async () => {
    renderApp('/', staffUser);
    expect(await sidebarLabels()).toEqual([
      'Dashboard',
      'ตรวจสอบใบเสร็จ',
      'ประวัติใบเสร็จ',
      'สมาชิก',
      'รายงาน',
    ]);
    expect(screen.queryByText('ตั้งค่า')).not.toBeInTheDocument();
  });

  it('shows 403 when a staff member opens a page by URL', async () => {
    renderApp('/users', staffUser);
    expect(await screen.findByText('ไม่มีสิทธิ์เข้าถึงหน้านี้')).toBeInTheDocument();
  });

  it('forces a password change for temporary passwords', async () => {
    renderApp('/', { ...staffUser, mustChangePassword: true });
    expect(await screen.findByText('ตั้งรหัสผ่านของคุณ')).toBeInTheDocument();
    expect(screen.getByText('รหัสผ่านชั่วคราว')).toBeInTheDocument();
  });

  it('logs in and lands on the dashboard', async () => {
    const { fetchMock } = renderApp('/login', null, (url) =>
      url === '/api/auth/login'
        ? { status: 200, body: { accessToken: 't', user: adminUser } }
        : undefined,
    );
    fireEvent.change(await screen.findByPlaceholderText('name@company.com'), {
      target: { value: 'admin@test.local' },
    });
    fireEvent.change(screen.getByPlaceholderText('รหัสผ่าน'), { target: { value: 'Passw0rd' } });
    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));

    expect(await screen.findByText('ภาพรวม GET POINT')).toBeInTheDocument();
    const loginCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/login');
    expect(JSON.parse(loginCall![1]!.body as string)).toEqual({
      email: 'admin@test.local',
      password: 'Passw0rd',
      rememberMe: false,
    });
  });

  it('shows the API error message when login fails', async () => {
    renderApp('/login', null, (url) =>
      url === '/api/auth/login'
        ? { status: 401, body: { statusCode: 401, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' } }
        : undefined,
    );
    fireEvent.change(await screen.findByPlaceholderText('name@company.com'), {
      target: { value: 'admin@test.local' },
    });
    fireEvent.change(screen.getByPlaceholderText('รหัสผ่าน'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
    expect(await screen.findByText('อีเมลหรือรหัสผ่านไม่ถูกต้อง')).toBeInTheDocument();
  });

  it('shows a 404 page for unknown routes', async () => {
    renderApp('/does-not-exist', adminUser);
    expect(await screen.findByText('ไม่พบหน้าที่ต้องการ')).toBeInTheDocument();
  });

  it('retries a request once after renewing an expired access token', async () => {
    let usersCalls = 0;
    renderApp('/users', adminUser, (url) => {
      if (url.startsWith('/api/users?')) {
        usersCalls += 1;
        return usersCalls === 1
          ? { status: 401, body: { statusCode: 401, message: 'expired' } }
          : { status: 200, body: { items: [], total: 0, page: 1, pageSize: 20 } };
      }
      if (url === '/api/roles') return { status: 200, body: [] };
      return undefined;
    });
    expect(await screen.findByText('ไม่พบผู้ใช้งาน')).toBeInTheDocument();
    await waitFor(() => expect(usersCalls).toBe(2));
  });
});
