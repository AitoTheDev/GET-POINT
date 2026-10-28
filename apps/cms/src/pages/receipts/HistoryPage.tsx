import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShopOutlined,
  StarFilled,
} from '@ant-design/icons';
import {
  formatMoney,
  formatNumber,
  formatThaiShortDateTime,
  maskThaiMobile,
  type ReceiptStatus,
  ReceiptStatusLabel,
} from '@getpoint/shared';
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Empty,
  Flex,
  Input,
  Pagination,
  Row,
  Select,
  Table,
  Typography,
} from 'antd';
import type { SortOrder } from 'antd/es/table/interface';
import dayjs, { type Dayjs } from 'dayjs';
import buddhistEra from 'dayjs/plugin/buddhistEra';
import { useState } from 'react';
import { apiDownload, errorMessage } from '../../api/client';
import { toQuery } from '../../api/org';
import {
  type Receipt,
  type ReceiptFilters,
  useReceipt,
  useReceiptLocations,
  useReceipts,
  useReceiptShops,
  useReceiptSummary,
} from '../../api/receipts';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { colors } from '../../theme';
import { ReceiptDetails } from './ReceiptDetails';
import { ReceiptStatusPill, ReceiptThumb } from './receiptDisplay';
import { ReceiptViewer } from './ReceiptViewer';

dayjs.extend(buddhistEra);

interface Draft {
  search: string;
  locationId?: string;
  shopId?: string;
  status?: ReceiptStatus;
  range: [Dayjs, Dayjs] | null;
}
const EMPTY: Draft = { search: '', range: null };

/** "ประวัติใบเสร็จ" (mockup image 55). */
export function HistoryPage() {
  const { message } = App.useApp();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [filters, setFilters] = useState<ReceiptFilters>({ page: 1, pageSize: 20 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const summary = useReceiptSummary();
  const locations = useReceiptLocations();
  const shops = useReceiptShops(draft.locationId);
  const list = useReceipts(filters);

  const apply = (d: Draft) =>
    setFilters((f) => ({
      ...f,
      page: 1,
      search: d.search.trim() || undefined,
      locationId: d.locationId,
      shopId: d.shopId,
      status: d.status,
      submittedFrom: d.range?.[0].format('YYYY-MM-DD'),
      submittedTo: d.range?.[1].format('YYYY-MM-DD'),
    }));

  const exportExcel = async () => {
    setExporting(true);
    try {
      const { page: _p, pageSize: _s, ...rest } = filters;
      const date = new Date().toISOString().slice(0, 10);
      await apiDownload(`/receipts/export?${toQuery(rest)}`, `ใบเสร็จ-${date}.xlsx`);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const sortOrder = (key: ReceiptFilters['sort']): SortOrder | undefined =>
    (filters.sort ?? 'submittedAt') === key
      ? (filters.order ?? 'desc') === 'asc'
        ? 'ascend'
        : 'descend'
      : undefined;

  const total = list.data?.total ?? 0;
  const from = total === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
  const to = Math.min(filters.page * filters.pageSize, total);
  const s = summary.data;

  return (
    <>
      <PageHeader
        title="ประวัติใบเสร็จ"
        extra={
          <Button
            size="large"
            icon={<FileExcelOutlined />}
            loading={exporting}
            onClick={exportExcel}
          >
            Export Excel
          </Button>
        }
      />

      <Row gutter={[20, 20]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<FileTextOutlined />}
            label="ทั้งหมด"
            value={s?.total}
            loading={summary.isLoading}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<CheckCircleOutlined />}
            label="อนุมัติแล้ว"
            value={s?.APPROVED}
            loading={summary.isLoading}
            tone="success"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<ClockCircleOutlined />}
            label="รอตรวจสอบ"
            value={s && s.PENDING_REVIEW + s.NEEDS_CHECK}
            loading={summary.isLoading}
            tone="warning"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<CloseCircleOutlined />}
            label="ไม่อนุมัติ"
            value={s?.REJECTED}
            loading={summary.isLoading}
            tone="danger"
          />
        </Col>
      </Row>

      <Card styles={{ body: { padding: 20 } }} style={{ marginBottom: 20 }}>
        <Flex gap={12} wrap>
          <Input
            size="large"
            allowClear
            prefix={<SearchOutlined />}
            placeholder="ค้นหาเลขรายการ เบอร์โทร หรือเลขใบเสร็จ"
            value={draft.search}
            onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
            onPressEnter={() => apply(draft)}
            style={{ flex: '2 1 280px' }}
          />
          <Select
            size="large"
            aria-label="กรองตามสถานที่"
            allowClear
            placeholder="ทุกสถานที่"
            suffixIcon={<EnvironmentOutlined />}
            value={draft.locationId}
            onChange={(locationId) => setDraft((d) => ({ ...d, locationId, shopId: undefined }))}
            options={locations.data?.map((l) => ({ value: l.id, label: l.name }))}
            style={{ flex: '1 1 180px' }}
          />
          <Select
            size="large"
            aria-label="กรองตามร้านค้า"
            allowClear
            placeholder="ทุกร้านค้า"
            suffixIcon={<ShopOutlined />}
            disabled={!draft.locationId}
            value={draft.shopId}
            onChange={(shopId) => setDraft((d) => ({ ...d, shopId }))}
            options={shops.data?.map((sh) => ({ value: sh.id, label: sh.name }))}
            style={{ flex: '1 1 180px' }}
          />
          <Select<ReceiptStatus>
            size="large"
            aria-label="กรองตามสถานะ"
            allowClear
            placeholder="ทุกสถานะ"
            suffixIcon={<ClockCircleOutlined />}
            value={draft.status}
            onChange={(status) => setDraft((d) => ({ ...d, status }))}
            options={(['PENDING_REVIEW', 'NEEDS_CHECK', 'APPROVED', 'REJECTED'] as const).map(
              (v) => ({
                value: v,
                label: ReceiptStatusLabel[v],
              }),
            )}
            style={{ flex: '1 1 160px' }}
          />
          <DatePicker.RangePicker
            size="large"
            aria-label="วันที่ส่ง"
            placeholder={['ส่งตั้งแต่', 'ถึงวันที่']}
            format="DD/MM/BBBB"
            suffixIcon={<CalendarOutlined />}
            value={draft.range}
            onChange={(r) =>
              setDraft((d) => ({ ...d, range: r?.[0] && r[1] ? [r[0], r[1]] : null }))
            }
            style={{ flex: '1 1 260px' }}
          />
          <Button
            type="primary"
            size="large"
            icon={<SearchOutlined />}
            onClick={() => apply(draft)}
            style={{ minWidth: 140 }}
          >
            ค้นหา
          </Button>
          <Button
            size="large"
            type="text"
            icon={<ReloadOutlined />}
            onClick={() => {
              setDraft(EMPTY);
              setFilters((f) => ({ page: 1, pageSize: f.pageSize }));
            }}
          >
            ล้างตัวกรอง
          </Button>
        </Flex>
      </Card>

      <Card styles={{ body: { padding: 24 } }}>
        <Flex align="baseline" gap={16} wrap style={{ marginBottom: 16 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            รายการใบเสร็จ
          </Typography.Title>
          <Typography.Text type="secondary">
            แสดง {from} – {to} จาก {total.toLocaleString('en-US')} รายการ
          </Typography.Text>
        </Flex>
        <Table<Receipt>
          rowKey="id"
          scroll={{ x: 'max-content' }}
          loading={list.isFetching}
          dataSource={list.data?.items}
          pagination={false}
          locale={{
            emptyText: (
              <Empty
                description={
                  list.isError ? errorMessage(list.error) : 'ไม่พบใบเสร็จตามเงื่อนไขที่เลือก'
                }
              />
            ),
          }}
          onChange={(_, __, sorter) => {
            const one = Array.isArray(sorter) ? sorter[0] : sorter;
            setFilters((f) => ({
              ...f,
              page: 1,
              sort: one.order ? (one.columnKey as ReceiptFilters['sort']) : undefined,
              order: one.order ? (one.order === 'ascend' ? 'asc' : 'desc') : undefined,
            }));
          }}
          columns={[
            {
              key: 'thumb',
              width: 56,
              render: (_, r) => <ReceiptThumb id={r.id} mime={r.imageMime} size={36} />,
            },
            {
              title: 'เลขรายการ',
              render: (_, r) => <Typography.Text strong>#{r.code}</Typography.Text>,
            },
            {
              title: 'วันที่ส่ง',
              key: 'submittedAt',
              sorter: true,
              sortOrder: sortOrder('submittedAt'),
              render: (_, r) => formatThaiShortDateTime(r.submittedAt),
            },
            { title: 'เบอร์โทร', render: (_, r) => maskThaiMobile(r.member.phone) },
            { title: 'ร้านค้า', render: (_, r) => r.shop?.name ?? '-' },
            {
              title: 'ยอดชำระ',
              key: 'amount',
              sorter: true,
              sortOrder: sortOrder('amount'),
              render: (_, r) => (r.amount !== null ? `${formatMoney(r.amount)} บาท` : '-'),
            },
            {
              title: 'แต้ม',
              key: 'points',
              sorter: true,
              sortOrder: sortOrder('points'),
              align: 'center',
              render: (_, r) =>
                r.transaction
                  ? formatNumber(r.transaction.points)
                  : r.status === 'APPROVED'
                    ? '0'
                    : '-',
            },
            {
              title: 'สถานะ',
              key: 'status',
              sorter: true,
              sortOrder: sortOrder('status'),
              render: (_, r) => <ReceiptStatusPill status={r.status} />,
            },
            {
              title: 'จัดการ',
              render: (_, r) => (
                <Button
                  type="text"
                  icon={<EyeOutlined />}
                  onClick={() => setOpenId(r.id)}
                  aria-label={`ดูรายละเอียด ${r.code}`}
                >
                  ดูรายละเอียด
                </Button>
              ),
            },
          ]}
        />
        <Flex justify="flex-end" style={{ marginTop: 16 }}>
          <Pagination
            current={filters.page}
            pageSize={filters.pageSize}
            total={total}
            showSizeChanger
            pageSizeOptions={[10, 20, 50, 100]}
            locale={{ items_per_page: 'รายการ / หน้า' }}
            onChange={(page, pageSize) =>
              setFilters((f) => ({ ...f, page: pageSize === f.pageSize ? page : 1, pageSize }))
            }
          />
        </Flex>
      </Card>

      <Flex
        gap={14}
        align="center"
        style={{ marginTop: 20, background: '#F0F1F3', borderRadius: 14, padding: '16px 22px' }}
      >
        <StarFilled style={{ fontSize: 24, color: colors.ink }} />
        <Typography.Text strong>ตรวจสอบและให้แต้มแยกตามใบเสร็จ</Typography.Text>
        <Typography.Text type="secondary">
          ระบบจะแสดงประวัติการตรวจสอบใบเสร็จแต่ละรายการ พร้อมสถานะและแต้มที่ได้รับ
        </Typography.Text>
      </Flex>

      {openId && <HistoryDrawer id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function HistoryDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const receipt = useReceipt(id);
  return (
    <Drawer
      open
      width="min(980px, 100vw)"
      onClose={onClose}
      title={receipt.data ? `ใบเสร็จ #${receipt.data.code}` : 'ใบเสร็จ'}
    >
      {receipt.data && (
        <Row gutter={[20, 20]}>
          <Col xs={24} lg={11}>
            <ReceiptViewer id={id} mime={receipt.data.imageMime} height={560} />
          </Col>
          <Col xs={24} lg={13}>
            <ReceiptDetails receipt={receipt.data} />
          </Col>
        </Row>
      )}
    </Drawer>
  );
}
