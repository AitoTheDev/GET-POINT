import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  FileDoneOutlined,
  SearchOutlined,
  SendOutlined,
} from '@ant-design/icons';
import {
  formatNumber,
  formatThaiShortDateTime,
  Menu,
  type TransferStatus,
  TransferStatusLabel,
} from '@getpoint/shared';
import { Alert, Button, Card, Col, Flex, Input, Row, Select, Table, Typography } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import {
  type LogaReportFilters,
  type TransferRow,
  useLogaReport,
  useReportLocations,
} from '../../api/reports';
import { useAuth } from '../../auth/useAuth';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import type { RangeValue } from '../../components/dateRange';
import { StatCard } from '../../components/StatCard';
import { colors } from '../../theme';
import { ReceiptDrawer } from '../receipts/HistoryPage';
import { TransferStatusPill } from '../receipts/TransferPanel';
import { Note, ReportFilterBar } from './ReportFilterBar';

interface Draft {
  range: RangeValue;
  locationId?: string;
  transferStatus?: TransferStatus;
  search: string;
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
      }}
    />
  );
}

/** "รายงานแต้มที่ส่งไป Loga" (mockup image 61): sending status, not LOGA balances. */
export function LogaReportTab({
  range,
  filters,
  onChange,
}: {
  range: RangeValue;
  filters: LogaReportFilters;
  onChange: (filters: LogaReportFilters, range?: RangeValue) => void;
}) {
  const { can } = useAuth();
  const canOpen = can(Menu.RECEIPT_HISTORY) || can(Menu.RECEIPT_REVIEW);
  const [draft, setDraft] = useState<Draft>({
    range,
    locationId: filters.locationId,
    transferStatus: filters.transferStatus,
    search: filters.search ?? '',
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const locations = useReportLocations();
  const report = useLogaReport(filters);
  const r = report.data;
  const loading = report.isLoading;

  const apply = () =>
    onChange(
      {
        ...filters,
        from: draft.range.from,
        to: draft.range.to,
        locationId: draft.locationId,
        transferStatus: draft.transferStatus,
        search: draft.search.trim() || undefined,
        page: 1,
      },
      draft.range,
    );

  const summary = r && [
    { label: 'ส่งสำเร็จ', value: r.kpis.succeeded, color: colors.success },
    { label: 'รอส่ง', value: r.kpis.pending, color: colors.warning },
    { label: 'ส่งไม่สำเร็จ', value: r.kpis.failed, color: colors.danger },
    { label: 'ไม่ทราบผล', value: r.kpis.unknown, color: colors.textMuted },
  ];

  return (
    <>
      <ReportFilterBar onApply={apply}>
        <Input
          size="large"
          allowClear
          prefix={<SearchOutlined />}
          placeholder="ค้นหาเลขใบเสร็จหรือเบอร์โทร"
          aria-label="ค้นหาเลขใบเสร็จหรือเบอร์โทร"
          value={draft.search}
          onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
          onPressEnter={apply}
          style={{ flex: '1 1 240px' }}
        />
        <Select
          size="large"
          aria-label="สถานที่"
          allowClear
          placeholder="ทุกสถานที่"
          suffixIcon={<EnvironmentOutlined />}
          value={draft.locationId}
          onChange={(locationId) => setDraft((d) => ({ ...d, locationId }))}
          options={locations.data?.map((l) => ({ value: l.id, label: l.name }))}
          style={{ flex: '1 1 180px' }}
        />
        <DateRangeFilter
          value={draft.range}
          onChange={(range) => setDraft((d) => ({ ...d, range }))}
          style={{ flex: '1 1 240px' }}
        />
        <Select<TransferStatus>
          size="large"
          aria-label="สถานะการส่ง"
          allowClear
          placeholder="ทุกสถานะการส่ง"
          suffixIcon={<CheckCircleOutlined />}
          value={draft.transferStatus}
          onChange={(transferStatus) => setDraft((d) => ({ ...d, transferStatus }))}
          options={(['SUCCEEDED', 'PENDING', 'PROCESSING', 'FAILED', 'UNKNOWN'] as const).map(
            (s) => ({
              value: s,
              label: TransferStatusLabel[s],
            }),
          )}
          style={{ flex: '1 1 180px' }}
        />
      </ReportFilterBar>

      {report.isError && (
        <Alert
          type="error"
          showIcon
          message={errorMessage(report.error)}
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<SendOutlined />}
            label="แต้มที่ส่งสำเร็จ"
            value={r?.kpis.pointsSent}
            unit="แต้ม"
            loading={loading}
            tone="success"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<FileDoneOutlined />}
            label="รายการส่งสำเร็จ"
            value={r?.kpis.succeeded}
            unit="รายการ"
            loading={loading}
            tone="success"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<ClockCircleOutlined />}
            label="รอส่ง"
            value={r?.kpis.pending}
            unit="รายการ"
            loading={loading}
            tone="warning"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<CloseCircleOutlined />}
            label="ส่งไม่สำเร็จ / ไม่ทราบผล"
            value={r ? r.kpis.failed + r.kpis.unknown : undefined}
            unit="รายการ"
            loading={loading}
            tone="danger"
          />
        </Col>
      </Row>
      <Typography.Text
        type="secondary"
        style={{ display: 'block', textAlign: 'right', margin: '8px 0 16px' }}
      >
        {r ? `รวม ${formatNumber(r.kpis.total)} รายการจากใบเสร็จที่อนุมัติในช่วงที่เลือก` : ' '}
      </Typography.Text>

      <Card styles={{ body: { padding: '18px 24px' } }} style={{ marginBottom: 16 }}>
        <Flex justify="space-between" align="center" wrap gap={16}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            สรุปสถานะการส่งทั้งหมด
          </Typography.Title>
          <Flex gap={28} wrap>
            {summary?.map((s) => (
              <Flex key={s.label} align="center" gap={8}>
                <Dot color={s.color} />
                <span>{s.label}</span>
                <strong style={{ fontSize: 18 }}>{formatNumber(s.value)}</strong>
                <span>รายการ</span>
              </Flex>
            ))}
          </Flex>
        </Flex>
      </Card>

      <Card title="ประวัติการส่งแต้ม" styles={{ body: { paddingTop: 0 } }}>
        <Table<TransferRow>
          rowKey="id"
          loading={report.isFetching}
          dataSource={r?.items}
          size="middle"
          scroll={{ x: 1000 }}
          locale={{ emptyText: 'ไม่มีรายการส่งแต้มในช่วงที่เลือก' }}
          pagination={{
            current: filters.page,
            pageSize: filters.pageSize,
            total: r?.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            locale: { items_per_page: 'รายการ/หน้า' },
            onChange: (page, pageSize) =>
              onChange({ ...filters, page: pageSize === filters.pageSize ? page : 1, pageSize }),
          }}
          columns={[
            { title: 'เลขรายการ', dataIndex: 'code' },
            { title: 'เบอร์โทร', dataIndex: 'phone' },
            { title: 'สถานที่', dataIndex: 'location', render: (v: string | null) => v ?? '-' },
            { title: 'แต้ม', dataIndex: 'points', align: 'center', render: formatNumber },
            {
              title: 'สถานะการส่ง',
              dataIndex: 'transferStatus',
              render: (status: TransferStatus, t) => (
                <Flex vertical align="flex-start" gap={2}>
                  <TransferStatusPill status={status} />
                  {status !== 'SUCCEEDED' && t.lastError && (
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: 12, maxWidth: 220 }}
                      ellipsis={{ tooltip: t.lastError }}
                    >
                      {t.lastError}
                    </Typography.Text>
                  )}
                </Flex>
              ),
            },
            {
              title: 'ส่งล่าสุด',
              dataIndex: 'lastAttemptAt',
              render: (v: string | null) => (v ? formatThaiShortDateTime(v) : '-'),
            },
            {
              title: 'อ้างอิง Loga',
              dataIndex: 'reference',
              render: (v: string | null) => v ?? '-',
            },
            ...(canOpen
              ? [
                  {
                    title: 'รายละเอียด',
                    key: 'open',
                    align: 'center' as const,
                    render: (_: unknown, t: TransferRow) => (
                      <Button
                        type="text"
                        aria-label={`ดูใบเสร็จ ${t.code}`}
                        icon={<EyeOutlined style={{ fontSize: 18 }} />}
                        onClick={() => setOpenId(t.receiptId)}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
        <Note>
          รายงานนี้แสดงสถานะการส่งแต้ม ไม่ใช่แต้มคงเหลือใน Loga · นับตามวันที่อนุมัติใบเสร็จ
        </Note>
      </Card>

      {openId && <ReceiptDrawer id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
