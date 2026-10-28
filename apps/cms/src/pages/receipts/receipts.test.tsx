import { Menu, MENUS } from '@getpoint/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CheckResult, Receipt, ReceiptLocation, ReceiptShop } from '../../api/receipts';
import { adminUser, renderApp, staffUser } from '../../test-utils';

afterEach(() => vi.unstubAllGlobals());

const receipt = (overrides: Partial<Receipt>): Receipt => ({
  id: 'r1',
  code: 'GP001',
  sequence: 1,
  status: 'PENDING_REVIEW',
  submittedAt: '2026-10-10T07:32:00Z',
  imageMime: 'image/jpeg',
  imageSize: 1000,
  imageSha256: 'x',
  member: {
    id: 'm1',
    code: 'M0001',
    name: 'สมชาย ใจดี',
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    phone: '0812341234',
    status: 'ACTIVE',
    communityId: 'c1',
  },
  submission: { id: 's1', count: 3 },
  location: null,
  shop: null,
  receiptNo: null,
  receiptDate: null,
  amount: null,
  staffNote: null,
  rejectReason: null,
  rejectNote: null,
  rejectLabel: null,
  memberMessage: null,
  reviewedBy: null,
  reviewedAt: null,
  transaction: null,
  ...overrides,
});

const pending = [
  receipt({}),
  receipt({
    id: 'r2',
    code: 'GP002',
    sequence: 2,
    member: { ...receipt({}).member, phone: '0812345678' },
  }),
];
const approved = receipt({
  id: 'r9',
  code: 'GP009',
  status: 'APPROVED',
  location: { id: 'l1', code: 'LOC001', name: 'Community Mall A', communityId: 'c1' },
  shop: { id: 's1', code: 'S001', name: 'ร้านกาแฟ A', participating: true, status: 'ACTIVE' },
  receiptNo: 'A00125',
  receiptDate: '2026-10-10',
  amount: 680,
  reviewedBy: { id: 'u', name: 'ผู้ดูแล' },
  reviewedAt: '2026-10-11T03:00:00Z',
  transaction: {
    points: 27,
    transferStatus: 'PENDING',
    rule: { spendAmount: 25, points: 1, place: 'Community Mall A', level: 'LOCATION' },
    calculation: { exact: 27.2, capped: false },
  },
});
const rejected = receipt({
  id: 'r8',
  code: 'GP008',
  status: 'REJECTED',
  rejectReason: 'OTHER',
  rejectNote: 'ลูกค้าขอยกเลิก',
  rejectLabel: 'อื่นๆ (ระบุเหตุผล)',
  memberMessage: 'ใบเสร็จไม่ผ่านการตรวจสอบ กรุณาติดต่อเจ้าหน้าที่',
});
const locations: ReceiptLocation[] = [
  { id: 'l1', code: 'LOC001', name: 'Community Mall A', communityId: 'c1', status: 'ACTIVE' },
  { id: 'lx', code: 'LOC009', name: 'Other Mall', communityId: 'c2', status: 'ACTIVE' },
];
const shops: ReceiptShop[] = [
  {
    id: 's1',
    code: 'S001',
    name: 'ร้านกาแฟ A',
    receiptName: 'CAFE A',
    participating: true,
    status: 'ACTIVE',
  },
];
const ok: CheckResult = {
  rule: {
    id: 'rule',
    version: 1,
    level: 'LOCATION',
    label: '25 บาท = 1 แต้ม',
    spendAmount: 25,
    points: 1,
    rounding: 'FLOOR',
    maxPoints: null,
    claimDays: 30,
    place: 'Community Mall A',
  },
  calculation: { points: 27, exact: 27.2, capped: false },
  problems: [],
  submittedDay: '2026-10-10',
};

type Handler = (url: string, init?: RequestInit) => { status: number; body?: unknown } | undefined;
const api =
  (extra?: Handler): Handler =>
  (url, init) => {
    const custom = extra?.(url, init);
    if (custom) return custom;
    if (url === '/api/receipts/summary')
      return {
        status: 200,
        body: { PENDING_REVIEW: 24, NEEDS_CHECK: 2, APPROVED: 342, REJECTED: 20, total: 388 },
      };
    if (url === '/api/receipts/locations') return { status: 200, body: locations };
    if (url.startsWith('/api/receipts/shops')) return { status: 200, body: shops };
    if (url.includes('/image')) return { status: 200, body: {} };
    if (url.includes('/check')) return { status: 200, body: ok };
    if (url.startsWith('/api/receipts?')) {
      const items = url.includes('status=APPROVED')
        ? [approved]
        : url.includes('status=PENDING_REVIEW')
          ? pending
          : [approved, rejected, ...pending];
      return { status: 200, body: { items, total: items.length, page: 1, pageSize: 20 } };
    }
    if (url === '/api/receipts/r8') return { status: 200, body: rejected };
    return undefined;
  };

async function fillReceipt() {
  // The member's only Location is pre-selected; choose the shop and type the rest.
  fireEvent.mouseDown(await screen.findByLabelText('ร้านค้า'));
  fireEvent.click(await screen.findByTitle('ร้านกาแฟ A · CAFE A'));
  fireEvent.change(screen.getByLabelText('เลขที่ใบเสร็จ'), { target: { value: 'A00125' } });
  const date = screen.getByLabelText('วันที่ใบเสร็จ');
  fireEvent.mouseDown(date);
  fireEvent.change(date, { target: { value: '10/10/2569' } });
  fireEvent.keyDown(date, { key: 'Enter', code: 'Enter' });
  fireEvent.change(screen.getByLabelText('ยอดชำระ'), { target: { value: '680' } });
}

describe('Receipt review page', () => {
  it('shows tabs with counts, the queue and the first receipt like the mockup', async () => {
    renderApp('/receipts/review', adminUser, api());
    expect(await screen.findByRole('button', { name: 'ใบเสร็จ GP001' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: 'ใบเสร็จ GP002' })).toBeInTheDocument();
    expect(screen.getByText('รายการใบเสร็จ')).toBeInTheDocument();
    expect(screen.getByText('ใบที่ 1 จาก 3')).toBeInTheDocument();
    expect(screen.getAllByText('08X-XXX-1234').length).toBeGreaterThan(0);
    expect(await screen.findByAltText('ภาพใบเสร็จ')).toHaveAttribute('src', 'blob:receipt');
    // Sidebar badge and tab count.
    expect(screen.getByLabelText('รอตรวจสอบ 24 ใบ')).toBeInTheDocument();
    // Only Locations of the member's Community are offered.
    fireEvent.mouseDown(screen.getByLabelText('สถานที่'));
    expect(screen.queryByTitle('Other Mall')).not.toBeInTheDocument();
  });

  it('checks as staff type, shows 27 points, and approves with the typed fields', async () => {
    let approvedBody: unknown;
    renderApp(
      '/receipts/review',
      adminUser,
      api((url, init) => {
        if (url === '/api/receipts/r1/approve' && init?.method === 'POST') {
          approvedBody = JSON.parse(String(init.body));
          return { status: 200, body: { ...approved, id: 'r1', code: 'GP001' } };
        }
        return undefined;
      }),
    );
    await screen.findByText('ใบที่ 1 จาก 3');
    expect(screen.getByRole('button', { name: /อนุมัติและให้แต้ม/ })).toBeDisabled();
    await fillReceipt();

    expect(await screen.findByText('ไม่พบใบเสร็จซ้ำ')).toBeInTheDocument();
    expect(screen.getByTestId('review-points')).toHaveTextContent('27 แต้ม');
    expect(screen.getByText('25 บาท = 1 แต้ม')).toBeInTheDocument();

    const button = screen.getByRole('button', { name: /อนุมัติและให้แต้ม/ });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() =>
      expect(approvedBody).toEqual({
        locationId: 'l1',
        shopId: 's1',
        receiptNo: 'A00125',
        receiptDate: '2026-10-10',
        amount: 680,
        staffNote: null,
      }),
    );
    // Moves on to the next receipt in the queue.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'ใบเสร็จ GP002' })).toHaveAttribute(
        'aria-current',
        'true',
      ),
    );
  });

  it('blocks approval on a problem and pre-selects the matching reject reason', async () => {
    let rejectedBody: unknown;
    renderApp(
      '/receipts/review',
      adminUser,
      api((url, init) => {
        if (url.includes('/check'))
          return {
            status: 200,
            body: {
              ...ok,
              problems: [
                {
                  code: 'TOO_OLD',
                  message: 'ส่งใบเสร็จหลังวันที่บนใบเสร็จ 41 วัน เกินกำหนด 30 วัน',
                  blocking: true,
                  suggestedReason: 'TOO_OLD',
                },
              ],
            },
          };
        if (url === '/api/receipts/r1/reject') {
          rejectedBody = JSON.parse(String(init!.body));
          return { status: 200, body: { ...rejected, id: 'r1', rejectReason: 'TOO_OLD' } };
        }
        return undefined;
      }),
    );
    await screen.findByText('ใบที่ 1 จาก 3');
    await fillReceipt();
    expect(
      await screen.findByText('ส่งใบเสร็จหลังวันที่บนใบเสร็จ 41 วัน เกินกำหนด 30 วัน'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /อนุมัติและให้แต้ม/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /ปฏิเสธ/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('ใบเสร็จเกินระยะเวลาที่กำหนด')).toBeChecked();
    expect(
      within(dialog).getByText('สมาชิกจะเห็นข้อความ: “ใบเสร็จเกินระยะเวลาที่กำหนด”'),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'ยืนยันไม่อนุมัติ' }));
    // What was typed is kept with the rejection.
    await waitFor(() =>
      expect(rejectedBody).toEqual({
        reason: 'TOO_OLD',
        note: null,
        locationId: 'l1',
        shopId: 's1',
        receiptNo: 'A00125',
        receiptDate: '2026-10-10',
        amount: 680,
      }),
    );
  });

  it('asks for a note when rejecting with "Other"', async () => {
    const { fetchMock } = renderApp('/receipts/review', adminUser, api());
    fireEvent.click(await screen.findByRole('button', { name: /ปฏิเสธ/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText('อื่นๆ (ระบุเหตุผล)'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'ยืนยันไม่อนุมัติ' }));
    expect(
      await within(dialog).findByText('กรุณาระบุเหตุผลเมื่อเลือก "อื่นๆ"'),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/reject'))).toBe(false);
    expect(
      within(dialog).getByText(
        'สมาชิกจะเห็นข้อความ: “ใบเสร็จไม่ผ่านการตรวจสอบ กรุณาติดต่อเจ้าหน้าที่”',
      ),
    ).toBeInTheDocument();
  });

  it('shows decided receipts read-only, with the points and rule used', async () => {
    renderApp('/receipts/review', adminUser, api());
    fireEvent.click(
      await screen.findByText(/อนุมัติแล้ว/, { selector: '.ant-segmented-item-label span' }),
    );
    expect(await screen.findByText('27 แต้ม')).toBeInTheDocument();
    expect(screen.getByText(/25 บาท = 1 แต้ม · ระดับสถานที่/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /อนุมัติและให้แต้ม/ })).not.toBeInTheDocument();
  });

  it('is read-only for users who can view but not decide', async () => {
    const viewer = {
      ...staffUser,
      permissions: MENUS.map((menu) => ({
        menu,
        canView: menu === Menu.RECEIPT_REVIEW,
        canManage: false,
      })),
    };
    renderApp('/receipts/review', viewer, api());
    await screen.findByText('ใบที่ 1 จาก 3');
    expect(screen.queryByRole('button', { name: /อนุมัติและให้แต้ม/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ปฏิเสธ/ })).not.toBeInTheDocument();
  });
});

describe('Adding a receipt by hand', () => {
  const members = [
    {
      id: 'm1',
      code: 'M0001',
      firstName: 'สมชาย',
      lastName: 'ใจดี',
      phone: '0812341234',
      communityId: 'c1',
    },
  ];
  const withMembers =
    (extra?: Handler): Handler =>
    (url, init) =>
      extra?.(url, init) ??
      (url.startsWith('/api/receipts/members') ? { status: 200, body: members } : undefined);

  async function openAndFill() {
    fireEvent.click(await screen.findByRole('button', { name: /เพิ่มใบเสร็จ/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.mouseDown(within(dialog).getByLabelText('สมาชิก'));
    fireEvent.click(await screen.findByTitle('สมชาย ใจดี (M0001) · 081-234-1234'));
    const input = dialog.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File([new Uint8Array([0xff, 0xd8, 0xff])], 'r.jpg', { type: 'image/jpeg' })],
      },
    });
    expect(await within(dialog).findByText(/r\.jpg/)).toBeInTheDocument();
    return dialog;
  }

  it('is offered to users who can decide receipts', async () => {
    renderApp('/receipts/review', adminUser, api());
    expect(await screen.findByRole('button', { name: /เพิ่มใบเสร็จ/ })).toBeInTheDocument();
  });

  it('needs every detail to add it as approved, then sends the file and fields', async () => {
    let sent: FormData | undefined;
    renderApp(
      '/receipts/review',
      adminUser,
      api(
        withMembers((url, init) => {
          if (url === '/api/receipts' && init?.method === 'POST') {
            sent = init.body as FormData;
            return { status: 201, body: { ...approved, id: 'new', code: 'GP011' } };
          }
          return undefined;
        }),
      ),
    );
    const dialog = await openAndFill();
    fireEvent.click(within(dialog).getByText('อนุมัติแล้ว'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'บันทึกใบเสร็จ' }));
    expect(await within(dialog).findByText('กรุณาเลือกร้านค้า')).toBeInTheDocument();
    expect(within(dialog).getByText('กรุณากรอกยอดชำระ')).toBeInTheDocument();
    expect(sent).toBeUndefined();

    fireEvent.mouseDown(within(dialog).getByLabelText('สถานที่'));
    // The review form behind also shows "Community Mall A"; click the dropdown option.
    const options = await screen.findAllByTitle('Community Mall A');
    fireEvent.click(options.find((el) => el.classList.contains('ant-select-item-option'))!);
    fireEvent.mouseDown(within(dialog).getByLabelText('ร้านค้า'));
    fireEvent.click(await screen.findByTitle('ร้านกาแฟ A'));
    fireEvent.change(within(dialog).getByLabelText('เลขที่ใบเสร็จ'), {
      target: { value: 'A00125' },
    });
    const date = within(dialog).getByLabelText('วันที่ใบเสร็จ (เพิ่มใบเสร็จ)');
    fireEvent.mouseDown(date);
    fireEvent.change(date, { target: { value: '10/10/2569' } });
    fireEvent.keyDown(date, { key: 'Enter', code: 'Enter' });
    fireEvent.change(within(dialog).getByLabelText('ยอดชำระ (เพิ่มใบเสร็จ)'), {
      target: { value: '680' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'บันทึกใบเสร็จ' }));

    await waitFor(() => expect(sent).toBeInstanceOf(FormData));
    expect(Object.fromEntries([...sent!.entries()].filter(([k]) => k !== 'file'))).toEqual({
      memberId: 'm1',
      status: 'APPROVED',
      locationId: 'l1',
      shopId: 's1',
      receiptNo: 'A00125',
      receiptDate: '2026-10-10',
      amount: '680',
    });
    expect((sent!.get('file') as File).name).toBe('r.jpg');
    expect(
      await screen.findByText('เพิ่มใบเสร็จ GP011 แล้ว (อนุมัติแล้ว ได้ 27 แต้ม)'),
    ).toBeInTheDocument();
  }, 15_000); // many form steps: longer than the 5 s default

  it('asks for a reason when added as rejected, and a note for needs-check', async () => {
    renderApp('/receipts/review', adminUser, api(withMembers()));
    const dialog = await openAndFill();
    fireEvent.click(within(dialog).getByText('ไม่อนุมัติ'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'บันทึกใบเสร็จ' }));
    expect(await within(dialog).findByText('กรุณาเลือกเหตุผล')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByText('ต้องตรวจเพิ่ม'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'บันทึกใบเสร็จ' }));
    expect(await within(dialog).findByText('กรุณาระบุสิ่งที่ต้องตรวจเพิ่ม')).toBeInTheDocument();
  });

  it('refuses files that are not JPG, PNG or PDF', async () => {
    renderApp('/receipts/review', adminUser, api(withMembers()));
    fireEvent.click(await screen.findByRole('button', { name: /เพิ่มใบเสร็จ/ }));
    const dialog = await screen.findByRole('dialog');
    const input = dialog.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'r.gif', { type: 'image/gif' })] },
    });
    expect(
      await within(dialog).findByText('รองรับไฟล์ JPG, PNG และ PDF เท่านั้น'),
    ).toBeInTheDocument();
  });
});

describe('Receipt history page', () => {
  it('shows KPI cards and the list with points, masked phones and statuses', async () => {
    renderApp('/receipts/history', adminUser, api());
    const row = (await screen.findByText('#GP009')).closest('tr')!;
    expect(within(row).getByText('ร้านกาแฟ A')).toBeInTheDocument();
    expect(within(row).getByText('680.00 บาท')).toBeInTheDocument();
    expect(within(row).getByText('27')).toBeInTheDocument();
    expect(within(row).getByText('อนุมัติแล้ว')).toBeInTheDocument();
    expect(
      within(screen.getByText('#GP008').closest('tr')!).getByText('ไม่อนุมัติ'),
    ).toBeInTheDocument();
    // "รอตรวจสอบ" card counts both open statuses (24 + 2).
    expect(screen.getByText('26')).toBeInTheDocument();
    expect(screen.getByText('342')).toBeInTheDocument();
  });

  it('sorts on the server when a column header is clicked', async () => {
    const { fetchMock } = renderApp('/receipts/history', adminUser, api());
    await screen.findByText('#GP009');
    fireEvent.click(screen.getByRole('columnheader', { name: /ยอดชำระ/ }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.map((c) => String(c[0])).some((u) => u.includes('sort=amount')),
      ).toBe(true),
    );
  });

  it('opens a receipt with its reject reason and what the member sees', async () => {
    renderApp('/receipts/history', adminUser, api());
    fireEvent.click(await screen.findByRole('button', { name: 'ดูรายละเอียด GP008' }));
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText('ไม่อนุมัติ: อื่นๆ (ระบุเหตุผล)')).toBeInTheDocument();
    expect(within(drawer).getByText('หมายเหตุ (ภายใน): ลูกค้าขอยกเลิก')).toBeInTheDocument();
    expect(
      within(drawer).getByText(
        'สมาชิกจะเห็นข้อความ: “ใบเสร็จไม่ผ่านการตรวจสอบ กรุณาติดต่อเจ้าหน้าที่”',
      ),
    ).toBeInTheDocument();
  });
});
