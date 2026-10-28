import {
  CheckCircleOutlined,
  DatabaseOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  ShopOutlined,
  StarOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { formatMoney, formatNumber, ReceiptStatusLabel } from '@getpoint/shared';
import { Alert, Card, Col, Row, Select, Skeleton, Table, Typography } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import {
  type ReceiptsReportFilters,
  type ReceiptsReportStatus,
  type ShopRow,
  useReceiptsReport,
  useReportLocations,
  useReportShops,
} from '../../api/reports';
import { BarList, DayChart } from '../../components/charts/Charts';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import type { RangeValue } from '../../components/dateRange';
import { StatCard } from '../../components/StatCard';
import { Note, ReportFilterBar } from './ReportFilterBar';

const STATUSES: ReceiptsReportStatus[] = [
  'APPROVED',
  'PENDING_REVIEW',
  'NEEDS_CHECK',
  'REJECTED',
  'ALL',
];
const statusLabel = (s: ReceiptsReportStatus) => (s === 'ALL' ? 'ทุกสถานะ' : ReceiptStatusLabel[s]);
/** "ใบเสร็จอนุมัติ", "ใบเสร็จรอตรวจสอบ", or just "ใบเสร็จ" for all statuses. */
const receiptWord = (s: ReceiptsReportStatus) =>
  s === 'ALL' ? 'ใบเสร็จ' : s === 'APPROVED' ? 'ใบเสร็จอนุมัติ' : `ใบเสร็จ${ReceiptStatusLabel[s]}`;

interface Draft {
  range: RangeValue;
  locationId?: string;
  shopId?: string;
  status: ReceiptsReportStatus;
}

/** "รายงานใบเสร็จ" (mockup image 59). */
export function ReceiptsReportTab({
  range,
  filters,
  onApply,
}: {
  range: RangeValue;
  filters: ReceiptsReportFilters;
  onApply: (filters: ReceiptsReportFilters, range: RangeValue) => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    range,
    locationId: filters.locationId,
    shopId: filters.shopId,
    status: filters.status,
  });
  const locations = useReportLocations();
  const shops = useReportShops(draft.locationId);
  const report = useReceiptsReport(filters);
  const r = report.data;
  const word = receiptWord(filters.status);
  const loading = report.isLoading;

  const apply = () =>
    onApply(
      {
        from: draft.range.from,
        to: draft.range.to,
        locationId: draft.locationId,
        shopId: draft.shopId,
        status: draft.status,
      },
      draft.range,
    );

  return (
    <>
      <ReportFilterBar onApply={apply}>
        <Select
          size="large"
          aria-label="สถานที่"
          allowClear
          placeholder="ทุกสถานที่"
          suffixIcon={<EnvironmentOutlined />}
          value={draft.locationId}
          onChange={(locationId) => setDraft((d) => ({ ...d, locationId, shopId: undefined }))}
          options={locations.data?.map((l) => ({ value: l.id, label: l.name }))}
          style={{ flex: '1 1 200px' }}
        />
        <Select
          size="large"
          aria-label="ร้านค้า"
          allowClear
          disabled={!draft.locationId}
          placeholder={draft.locationId ? 'ทุกร้านค้า' : 'ทุกร้านค้า (เลือกสถานที่ก่อน)'}
          suffixIcon={<ShopOutlined />}
          value={draft.shopId}
          onChange={(shopId) => setDraft((d) => ({ ...d, shopId }))}
          options={shops.data?.map((s) => ({ value: s.id, label: s.name }))}
          style={{ flex: '1 1 200px' }}
        />
        <DateRangeFilter
          value={draft.range}
          onChange={(range) => setDraft((d) => ({ ...d, range }))}
          style={{ flex: '1 1 240px' }}
        />
        <Select<ReceiptsReportStatus>
          size="large"
          aria-label="สถานะใบเสร็จ"
          suffixIcon={<CheckCircleOutlined />}
          value={draft.status}
          onChange={(status) => setDraft((d) => ({ ...d, status }))}
          options={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
          style={{ flex: '1 1 160px' }}
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
      {r?.truncated && (
        <Alert
          type="warning"
          showIcon
          message="ข้อมูลมีมากเกินไป ตัวเลขอาจไม่ครบ กรุณาเลือกช่วงวันที่ให้สั้นลง"
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<FileTextOutlined />}
            label={word}
            value={r?.kpis.receipts}
            unit="ใบ"
            loading={loading}
            tone="success"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<DatabaseOutlined />}
            label={`ยอดใช้จ่ายจาก${word}`}
            value={r ? Math.round(r.kpis.amount) : undefined}
            unit="บาท"
            loading={loading}
            tone="success"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<TeamOutlined />}
            label={`สมาชิกที่ส่ง${word}`}
            value={r?.kpis.members}
            unit="คน"
            loading={loading}
            tone="success"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<StarOutlined />}
            label="แต้มที่ส่งสำเร็จไป Loga"
            value={r?.kpis.pointsSent}
            unit="แต้ม"
            loading={loading}
            tone="success"
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} xl={14}>
          <Card title={`${word}รายวัน`} style={{ height: '100%' }}>
            <Typography.Text type="secondary">จำนวนใบเสร็จ</Typography.Text>
            {r ? <DayChart data={r.daily} kind="columns" unit="ใบ" /> : <Skeleton active />}
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card
            title="ยอดใช้จ่ายแยกร้านค้า"
            extra={<Typography.Text type="secondary">ยอดใช้จ่าย (บาท)</Typography.Text>}
            style={{ height: '100%' }}
          >
            {r ? (
              <BarList
                rows={r.byShop.map((s) => ({
                  key: s.shop?.id ?? '-',
                  label: s.shop?.name ?? 'ยังไม่ระบุร้าน',
                  value: s.amount,
                }))}
                format={(v) => formatNumber(Math.round(v))}
              />
            ) : (
              <Skeleton active />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="สรุปผลแยกร้านค้า" styles={{ body: { paddingTop: 0 } }}>
        <Table<ShopRow>
          rowKey={(s) => s.shop?.id ?? '-'}
          loading={loading}
          dataSource={r?.byShop}
          pagination={false}
          scroll={{ x: 720 }}
          size="middle"
          locale={{ emptyText: 'ไม่มีข้อมูลในช่วงที่เลือก' }}
          columns={[
            { title: 'ร้านค้า', render: (_, s) => s.shop?.name ?? 'ยังไม่ระบุร้าน' },
            { title: `${word} (ใบ)`, dataIndex: 'receipts', align: 'center', render: formatNumber },
            {
              title: 'สมาชิกไม่ซ้ำ (คน)',
              dataIndex: 'members',
              align: 'center',
              render: formatNumber,
            },
            {
              title: 'ยอดใช้จ่าย (บาท)',
              dataIndex: 'amount',
              align: 'center',
              render: formatMoney,
            },
            {
              title: 'แต้มส่งสำเร็จไป Loga (แต้ม)',
              dataIndex: 'pointsSent',
              align: 'center',
              render: formatNumber,
            },
          ]}
          summary={() =>
            r && r.byShop.length > 0 ? (
              <Table.Summary.Row style={{ background: '#F2F3F5', fontWeight: 700 }}>
                <Table.Summary.Cell index={0}>รวม</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="center">
                  {formatNumber(r.kpis.receipts)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="center">
                  {formatNumber(r.kpis.members)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="center">
                  {formatMoney(r.kpis.amount)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="center">
                  {formatNumber(r.kpis.pointsSent)}
                </Table.Summary.Cell>
              </Table.Summary.Row>
            ) : null
          }
        />
        <Note>
          สมาชิกอาจใช้หลายร้าน จำนวนรวมจึงนับสมาชิกไม่ซ้ำ ·
          ยอดใช้จ่ายอ้างอิงเฉพาะใบเสร็จที่ส่งเข้าระบบ
        </Note>
      </Card>
    </>
  );
}
