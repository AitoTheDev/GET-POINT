import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Balance, Member, MemberCommunity } from '../../api/members';
import { adminUser, renderApp, staffUser } from '../../test-utils';

afterEach(() => vi.unstubAllGlobals());

const community: MemberCommunity = {
  id: 'c1',
  code: 'COM001',
  name: 'GET POINT Community',
  status: 'ACTIVE',
};

const member = (overrides: Partial<Member>): Member => ({
  id: 'm1',
  code: 'M0001',
  phone: '0812341234',
  firstName: 'สมชาย',
  lastName: 'ใจดี',
  status: 'ACTIVE',
  channel: 'CMS',
  note: null,
  lineLinked: false,
  logaId: '100001',
  logaLinkStatus: 'LINKED',
  logaLinkError: null,
  logaCheckedAt: '2026-10-01T03:00:00Z',
  receiptCount: 0,
  communityId: 'c1',
  community: { id: 'c1', code: 'COM001', name: community.name },
  createdBy: { id: 'u-admin', name: 'ผู้ดูแล ทดสอบ' },
  createdAt: '2026-10-01T03:00:00Z',
  updatedAt: '2026-10-01T03:00:00Z',
  ...overrides,
});

const members = [
  member({}),
  member({
    id: 'm5',
    code: 'M0005',
    phone: '0812347890',
    firstName: 'ธนพล',
    lastName: 'แสงทอง',
    status: 'SUSPENDED',
    logaId: null,
    logaLinkStatus: 'ERROR',
    logaLinkError: 'ไม่สามารถเชื่อมต่อ LOGA ได้ในขณะนี้',
    createdAt: '2026-10-08T03:00:00Z',
  }),
];
const balances: Balance[] = [
  { id: 'm1', status: 'OK', points: 520 },
  { id: 'm5', status: 'NOT_LINKED', points: null },
];

type Handler = (url: string, init?: RequestInit) => { status: number; body?: unknown } | undefined;
const api =
  (extra?: Handler): Handler =>
  (url, init) => {
    const custom = extra?.(url, init);
    if (custom) return custom;
    if (url === '/api/members/summary')
      return {
        status: 200,
        body: { total: 1248, newThisMonth: 86, withReceipts: 0, active: 1230 },
      };
    if (url === '/api/members/communities') return { status: 200, body: [community] };
    if (url.startsWith('/api/members/balances')) return { status: 200, body: balances };
    if (url.startsWith('/api/members?'))
      return { status: 200, body: { items: members, total: 2, page: 1, pageSize: 20 } };
    if (url === '/api/members/m1') return { status: 200, body: members[0] };
    if (url === '/api/members/m5') return { status: 200, body: members[1] };
    if (url === '/api/members/m1/loga')
      return {
        status: 200,
        body: {
          status: 'OK',
          customer: {
            uid: '100001',
            pcardId: null,
            name: null,
            birthday: null,
            level: 'Gold',
            points: 520,
          },
        },
      };
    return undefined;
  };

describe('Members page', () => {
  it('shows KPI cards and the member list with masked phones, Thai dates and live points', async () => {
    renderApp('/members', adminUser, api());

    const row = (await screen.findByText('สมชาย ใจดี')).closest('tr')!;
    expect(within(row).getByText('M0001')).toBeInTheDocument();
    expect(within(row).getByText('08X-XXX-1234')).toBeInTheDocument();
    expect(within(row).getByText('01/10/2569')).toBeInTheDocument();
    expect(await within(row).findByText('520')).toBeInTheDocument();
    expect(within(row).getByText('ใช้งาน')).toBeInTheDocument();

    const suspended = screen.getByText('ธนพล แสงทอง').closest('tr')!;
    expect(within(suspended).getByText('ระงับ')).toBeInTheDocument();
    expect(within(suspended).getByText('ยังไม่เชื่อม')).toBeInTheDocument();

    expect(screen.getByText('1,248')).toBeInTheDocument();
    expect(screen.getByText('สมาชิกใหม่เดือนนี้')).toBeInTheDocument();
    expect(screen.getByText(/แสดง 1 – 2 จาก 2 คน/)).toBeInTheDocument();
    // Only one Community: no Community filter or column.
    expect(screen.queryByLabelText('กรองตาม Community')).not.toBeInTheDocument();
  });

  it('asks LOGA only for the members on screen', async () => {
    const { fetchMock } = renderApp('/members', adminUser, api());
    await screen.findByText('สมชาย ใจดี');
    await waitFor(() =>
      expect(fetchMock.mock.calls.map((c) => String(c[0]))).toContain(
        '/api/members/balances?ids=m1,m5',
      ),
    );
  });

  it('searches when ค้นหา is pressed, and clears filters', async () => {
    const { fetchMock } = renderApp('/members', adminUser, api());
    await screen.findByText('สมชาย ใจดี');
    const listUrls = () =>
      fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith('/api/members?'));

    fireEvent.change(screen.getByPlaceholderText('ค้นหาชื่อ เบอร์โทร หรือรหัสสมาชิก'), {
      target: { value: ' 081-234 ' },
    });
    expect(listUrls()).toHaveLength(1); // typing alone doesn't search
    fireEvent.click(screen.getByRole('button', { name: /ค้นหา/ }));
    await waitFor(() => expect(listUrls().at(-1)).toContain('search=081-234'));
    expect(listUrls().at(-1)).toContain('page=1');

    fireEvent.click(screen.getByRole('button', { name: /ล้างตัวกรอง/ }));
    await waitFor(() => expect(listUrls().at(-1)).not.toContain('search='));
    expect(screen.getByPlaceholderText('ค้นหาชื่อ เบอร์โทร หรือรหัสสมาชิก')).toHaveValue('');
  });

  it('opens the member detail with LOGA points', async () => {
    renderApp('/members', adminUser, api());
    fireEvent.click(await screen.findByRole('button', { name: 'ดูรายละเอียด M0001' }));

    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText('สมาชิก M0001')).toBeInTheDocument();
    expect(within(drawer).getByText('081-234-1234')).toBeInTheDocument();
    expect(await within(drawer).findByText('Gold')).toBeInTheDocument();
    expect(within(drawer).getByText('เชื่อม LOGA แล้ว')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /ระงับ/ })).toBeInTheDocument();
  });

  it('shows a LOGA link error with a retry button that calls the API', async () => {
    const { fetchMock } = renderApp(
      '/members',
      adminUser,
      api((url, init) =>
        url === '/api/members/m5/loga-link' && init?.method === 'POST'
          ? { status: 200, body: { ...members[1], logaLinkStatus: 'LINKED', logaId: 'P770001' } }
          : undefined,
      ),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'ดูรายละเอียด M0005' }));
    const drawer = await screen.findByRole('dialog');
    expect(
      await within(drawer).findByText('ไม่สามารถเชื่อมต่อ LOGA ได้ในขณะนี้'),
    ).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole('button', { name: /ลองอีกครั้ง/ }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/members/m5/loga-link',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    // Suspended member: the action is "เปิดใช้งาน" instead of "ระงับ".
    expect(within(drawer).getByRole('button', { name: /เปิดใช้งาน/ })).toBeInTheDocument();
  });

  it('adds a member: checks the phone, sends it normalised and opens the new member', async () => {
    const created = member({
      id: 'm9',
      code: 'M0009',
      phone: '0861112222',
      firstName: 'ลูกค้า',
      lastName: null,
    });
    const { fetchMock } = renderApp(
      '/members',
      adminUser,
      api((url, init) => {
        if (url === '/api/members' && init?.method === 'POST')
          return { status: 201, body: created };
        if (url === '/api/members/m9') return { status: 200, body: created };
        return undefined;
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /เพิ่มสมาชิก/ }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByPlaceholderText('เช่น 0812345678'), {
      target: { value: '02-123-4567' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('เช่น สมชาย'), {
      target: { value: 'ลูกค้า' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'เพิ่มสมาชิก' }));
    expect(
      await within(dialog).findByText('เบอร์มือถือต้องมี 10 หลัก และขึ้นต้นด้วย 06, 08 หรือ 09'),
    ).toBeInTheDocument();

    fireEvent.change(within(dialog).getByPlaceholderText('เช่น 0812345678'), {
      target: { value: '+66 86 111 2222' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'เพิ่มสมาชิก' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (c) => c[0] === '/api/members' && c[1]?.method === 'POST',
      );
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({
        communityId: 'c1',
        phone: '0861112222',
        firstName: 'ลูกค้า',
        lastName: null,
        note: null,
      });
    });
    expect(await screen.findByText('สมาชิก M0009')).toBeInTheDocument();
  });

  it('hides add/edit/suspend from users who can only view members', async () => {
    renderApp('/members', staffUser, api());
    fireEvent.click(await screen.findByRole('button', { name: 'ดูรายละเอียด M0001' }));
    const drawer = await screen.findByRole('dialog');
    await within(drawer).findByText('สมาชิก M0001');

    expect(screen.queryByRole('button', { name: /เพิ่มสมาชิก/ })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: /แก้ไข/ })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: /ระงับ/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export Excel/ })).toBeInTheDocument();
  });
});
