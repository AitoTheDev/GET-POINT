import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiffConfig, MemberView, MyReceipt } from './api';
import { setToken } from './api';
import { App } from './App';
import { setMockUser } from './line';
import { SessionProvider } from './session';

const config: LiffConfig = {
  lineMode: 'mock',
  liffId: null,
  verifyPhone: false,
  uploadLimits: { maxFileMb: 10, maxFiles: 10 },
  supportContact: { phone: '02-123-4567', lineId: '@getpoint' },
  communities: [{ id: 'c1', name: 'GET POINT Community' }],
};
const member: MemberView = {
  code: 'M0007',
  phone: '0815551234',
  community: { id: 'c1', name: 'GET POINT Community' },
  status: 'ACTIVE',
  logaLinked: true,
};

type Call = { url: string; method: string; body: unknown };
type Reply = { status: number; body?: unknown };

/** Render the app at `path` with the API answered by `handler` (unhandled: 404). */
function renderAt(
  path: string,
  handler: (url: string, init: RequestInit | undefined) => Reply | undefined,
  options: { config?: Partial<LiffConfig>; member?: MemberView | null } = {},
) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body =
      init?.body instanceof FormData
        ? init.body
        : init?.body
          ? JSON.parse(String(init.body))
          : undefined;
    calls.push({ url, method: init?.method ?? 'GET', body });
    const reply =
      handler(url, init) ??
      (url === '/api/liff/config'
        ? { status: 200, body: { ...config, ...options.config } }
        : url === '/api/liff/session'
          ? {
              status: 200,
              body: { token: 't', displayName: 'น้องเอ', member: options.member ?? null },
            }
          : { status: 404, body: { message: 'not found' } });
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  const Router = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SessionProvider>
        <App Router={Router} />
      </SessionProvider>
    </QueryClientProvider>,
  );
  return calls;
}

const jpg = (name: string, bytes = 2048) =>
  new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' });

beforeEach(() => {
  setToken(null);
  setMockUser({ lineUserId: 'Utest', displayName: 'น้องเอ' });
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('sign-in', () => {
  it('shows the test LINE login in mock mode, then signs in with a mock token', async () => {
    setMockUser(null);
    const calls = renderAt('/', () => undefined);
    expect(await screen.findByText('เข้าสู่ระบบ LINE (จำลอง)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('LINE User ID'), { target: { value: 'Uabc' } });
    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
    expect(await screen.findByText('สวัสดี น้องเอ')).toBeInTheDocument();
    expect(calls.find((c) => c.url === '/api/liff/session')?.body).toEqual({
      idToken: 'mock:Uabc:ผู้ทดสอบ',
    });
  });

  it('home offers sign-up until the member has signed up', async () => {
    renderAt('/', () => undefined);
    expect(await screen.findByRole('link', { name: /สมัครสมาชิก/ })).toHaveAttribute(
      'href',
      '/register',
    );
  });
});

describe('sign-up', () => {
  it('checks the fields, then registers and offers scanning', async () => {
    const calls = renderAt('/register', (url) =>
      url === '/api/liff/register'
        ? { status: 201, body: { linkedExisting: false, member } }
        : undefined,
    );
    const submit = await screen.findByRole('button', { name: 'สมัครสมาชิก' });
    fireEvent.click(submit);
    expect(await screen.findByText('กรุณากรอกชื่อ')).toBeInTheDocument();
    expect(calls.some((c) => c.url === '/api/liff/register')).toBe(false);

    fireEvent.change(screen.getByPlaceholderText('กรอกเบอร์โทร 10 หลัก'), {
      target: { value: '081-555-1234' },
    });
    fireEvent.change(screen.getByLabelText('ชื่อ'), { target: { value: 'เอ' } });
    fireEvent.click(submit);
    expect(await screen.findByText('สมัครสมาชิกสำเร็จ')).toBeInTheDocument();
    expect(calls.find((c) => c.url === '/api/liff/register')?.body).toEqual({
      communityId: 'c1',
      phone: '0815551234',
      firstName: 'เอ',
      lastName: null,
    });
  });

  it('says so when the phone was linked to an existing member', async () => {
    renderAt('/register', (url) =>
      url === '/api/liff/register'
        ? { status: 201, body: { linkedExisting: true, member } }
        : undefined,
    );
    fireEvent.change(await screen.findByPlaceholderText('กรอกเบอร์โทร 10 หลัก'), {
      target: { value: '0815551234' },
    });
    fireEvent.change(screen.getByLabelText('ชื่อ'), { target: { value: 'เอ' } });
    fireEvent.click(screen.getByRole('button', { name: 'สมัครสมาชิก' }));
    expect(await screen.findByText('เชื่อมบัญชีสำเร็จ')).toBeInTheDocument();
  });

  it('with SMS checking on: sends a code and shows a wrong-code message on the code field', async () => {
    const calls = renderAt(
      '/register',
      (url) =>
        url === '/api/liff/phone-code'
          ? {
              status: 200,
              body: { phone: '08X-XXX-1234', expiresInSeconds: 300, resendAfterSeconds: 60 },
            }
          : url === '/api/liff/register'
            ? { status: 400, body: { message: 'รหัสยืนยันไม่ถูกต้อง', code: 'CODE_WRONG' } }
            : undefined,
      { config: { verifyPhone: true } },
    );
    fireEvent.change(await screen.findByPlaceholderText('กรอกเบอร์โทร 10 หลัก'), {
      target: { value: '0815551234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ส่งรหัส' }));
    expect(await screen.findByText(/ส่งรหัสไปที่ 08X-XXX-1234 แล้ว/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ส่งใหม่ \(\d+\)/ })).toBeDisabled();
    expect(calls.find((c) => c.url === '/api/liff/phone-code')?.body).toEqual({
      phone: '0815551234',
    });

    fireEvent.change(screen.getByPlaceholderText('รหัส 6 หลัก'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('ชื่อ'), { target: { value: 'เอ' } });
    fireEvent.click(screen.getByRole('button', { name: 'สมัครสมาชิก' }));
    expect(await screen.findByText('รหัสยืนยันไม่ถูกต้อง')).toBeInTheDocument();
  });
});

describe('scan receipts', () => {
  it('sends members who have not signed up to sign-up first', async () => {
    renderAt('/scan', () => undefined);
    expect(await screen.findByRole('heading', { name: 'สมัครสมาชิก' })).toBeInTheDocument();
  });

  it('lists the chosen files, blocks ones too big, and sends the rest', async () => {
    const calls = renderAt(
      '/scan',
      (url) =>
        url === '/api/liff/receipts'
          ? { status: 201, body: { receipts: [{ code: 'GP021' }, { code: 'GP022' }] } }
          : undefined,
      { member },
    );
    expect(await screen.findByDisplayValue('081-555-1234')).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'ส่งใบเสร็จสะสมแต้ม' });
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [jpg('a.jpg'), jpg('b.jpg'), jpg('big.jpg', 11 * 1024 * 1024)] },
    });
    expect(screen.getByText('3 ใบ')).toBeInTheDocument();
    expect(screen.getAllByText('พร้อมส่ง')).toHaveLength(2);
    expect(screen.getByText(/ไฟล์ใหญ่เกิน 10 MB/)).toBeInTheDocument();
    expect(send).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'ลบใบเสร็จ 3' }));
    expect(send).toBeEnabled();
    fireEvent.click(send);
    expect(await screen.findByText('ส่งใบเสร็จสำเร็จ')).toBeInTheDocument();
    expect(screen.getByText(/GP021, GP022/)).toBeInTheDocument();
    const sent = calls.find((c) => c.url === '/api/liff/receipts')!.body as FormData;
    expect(sent.getAll('files')).toHaveLength(2);
  });

  it('on failure shows the reason, and "ส่งใหม่" keeps the chosen files', async () => {
    renderAt(
      '/scan',
      (url) =>
        url === '/api/liff/receipts'
          ? {
              status: 429,
              body: { message: 'ส่งใบเสร็จได้สูงสุด 50 ใบต่อวัน', code: 'DAILY_LIMIT' },
            }
          : undefined,
      { member },
    );
    fireEvent.change(await screen.findByTestId('file-input'), {
      target: { files: [jpg('a.jpg')] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ส่งใบเสร็จสะสมแต้ม' }));
    expect(await screen.findByText('ส่งใบเสร็จไม่สำเร็จ')).toBeInTheDocument();
    expect(screen.getByText('ส่งใบเสร็จได้สูงสุด 50 ใบต่อวัน')).toBeInTheDocument();
    expect(screen.getByText(/02-123-4567/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ส่งใหม่' }));
    expect(await screen.findByText('1 ใบ')).toBeInTheDocument();
  });
});

describe('my points', () => {
  it('shows live points and each receipt with its outcome', async () => {
    const receipts: MyReceipt[] = [
      {
        code: 'GP002',
        status: 'REJECTED',
        submittedAt: '2026-10-27T03:00:00Z',
        shop: null,
        amount: null,
        points: null,
        pointsAdded: false,
        rejectMessage: 'รูปภาพไม่ชัดเจน อ่านไม่ได้',
      },
      {
        code: 'GP001',
        status: 'APPROVED',
        submittedAt: '2026-10-26T03:00:00Z',
        shop: 'ร้านกาแฟ A',
        amount: 680,
        points: 27,
        pointsAdded: true,
        rejectMessage: null,
      },
    ];
    renderAt(
      '/points',
      (url) =>
        url === '/api/liff/points'
          ? { status: 200, body: { status: 'OK', points: 547 } }
          : url === '/api/liff/receipts'
            ? { status: 200, body: receipts }
            : undefined,
      { member },
    );
    expect(await screen.findByText('547')).toBeInTheDocument();
    expect(await screen.findByText('รูปภาพไม่ชัดเจน อ่านไม่ได้')).toBeInTheDocument();
    expect(screen.getByText('+27 แต้ม')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/ร้านกาแฟ A · 680.00 บาท/)).toBeInTheDocument());
  });
});
