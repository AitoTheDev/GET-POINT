import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from './App';

function renderAt(path: string) {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AntApp>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    </AntApp>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('CMS shell', () => {
  it('shows every sidebar menu item from the mockups', () => {
    renderAt('/');
    for (const label of [
      'ตรวจสอบใบเสร็จ',
      'ประวัติใบเสร็จ',
      'สมาชิก',
      'เงื่อนไขการให้แต้ม',
      'ร้านค้าและสถานที่',
      'รายงาน',
      'ผู้ใช้งานและสิทธิ์',
      'Activity Log',
      'ตั้งค่า',
      'ออกจากระบบ',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('shows the page title and its planned session', () => {
    renderAt('/members');
    // Title appears in the header and the page header
    expect(screen.getAllByText('สมาชิก').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('หน้านี้จะพัฒนาใน Session 3')).toBeInTheDocument();
  });

  it('shows a 404 page for unknown routes', () => {
    renderAt('/does-not-exist');
    expect(screen.getByText('ไม่พบหน้าที่ต้องการ')).toBeInTheDocument();
  });
});
