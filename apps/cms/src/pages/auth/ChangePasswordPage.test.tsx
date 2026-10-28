import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, staffUser } from '../../test-utils';

afterEach(() => vi.unstubAllGlobals());

describe('Forced password change', () => {
  it('sends only currentPassword and newPassword, then opens the CMS', async () => {
    let sent: unknown;
    renderApp('/', { ...staffUser, mustChangePassword: true }, (url, init) => {
      if (url === '/api/auth/change-password') {
        sent = JSON.parse(init!.body as string);
        return { status: 200, body: { ...staffUser, mustChangePassword: false } };
      }
      return undefined;
    });

    await screen.findByText('ตั้งรหัสผ่านของคุณ');
    const [current, next, confirm] =
      document.querySelectorAll<HTMLInputElement>('input[type="password"]');
    fireEvent.change(current, { target: { value: 'TempPass2345' } });
    fireEvent.change(next, { target: { value: 'MyNewPass123' } });
    fireEvent.change(confirm, { target: { value: 'MyNewPass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }));

    expect(await screen.findByText('สถานะระบบ')).toBeInTheDocument();
    await waitFor(() =>
      expect(sent).toEqual({ currentPassword: 'TempPass2345', newPassword: 'MyNewPass123' }),
    );
  });

  it('blocks mismatched confirmation before calling the API', async () => {
    const { fetchMock } = renderApp('/', { ...staffUser, mustChangePassword: true });
    await screen.findByText('ตั้งรหัสผ่านของคุณ');
    const [current, next, confirm] =
      document.querySelectorAll<HTMLInputElement>('input[type="password"]');
    fireEvent.change(current, { target: { value: 'TempPass2345' } });
    fireEvent.change(next, { target: { value: 'MyNewPass123' } });
    fireEvent.change(confirm, { target: { value: 'Different123' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }));

    expect(await screen.findByText('รหัสผ่านไม่ตรงกัน')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/change-password')).toBe(false);
  });
});
