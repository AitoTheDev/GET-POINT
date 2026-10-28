import {
  ClockCircleOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  RightOutlined,
  StarFilled,
  TeamOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { formatMoney, formatThaiDateTime, Menu } from '@getpoint/shared';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Flex,
  Row,
  Select,
  Skeleton,
  Table,
  Typography,
} from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiDownload, errorMessage } from '../../api/client';
import { toQuery } from '../../api/org';
import { useDashboard, useReportLocations } from '../../api/reports';
import { useAuth } from '../../auth/useAuth';
import { DayChart, Donut } from '../../components/charts/Charts';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { type RangeValue, thisMonth } from '../../components/dateRange';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { colors } from '../../theme';
import { ReceiptStatusPill } from '../receipts/receiptDisplay';

/** Dashboard (mockup image 54): numbers for the chosen Location and date range. */
export function DashboardPage() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [range, setRange] = useState<RangeValue>(thisMonth);
  const [locationId, setLocationId] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const locations = useReportLocations();
  const filters = { from: range.from, to: range.to, locationId };
  const dashboard = useDashboard(filters);
  const d = dashboard.data;
  const loading = dashboard.isLoading;
  const canReview = can(Menu.RECEIPT_REVIEW);

  const exportExcel = async () => {
    setExporting(true);
    try {
      await apiDownload(
        `/reports/dashboard/export?${toQuery(filters)}`,
        `dashboard-${range.from}-${range.to}.xlsx`,
      );
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="ภาพรวม GET POINT"
        extra={
          <Flex gap={12} wrap style={{ flex: '1 1 560px', justifyContent: 'flex-end' }}>
            <Select
              size="large"
              aria-label="สถานที่"
              allowClear
              placeholder="ทุกสถานที่"
              suffixIcon={<EnvironmentOutlined />}
              value={locationId}
              onChange={setLocationId}
              loading={locations.isLoading}
              options={locations.data?.map((l) => ({ value: l.id, label: l.name }))}
              style={{ flex: '1 1 200px', maxWidth: 260 }}
            />
            <DateRangeFilter value={range} onChange={setRange} style={{ flex: '0 1 340px' }} />
            <Button
              size="large"
              icon={<UploadOutlined />}
              loading={exporting}
              onClick={exportExcel}
            >
              Export
            </Button>
          </Flex>
        }
      />

      {dashboard.isError && (
        <Alert
          type="error"
          showIcon
          message={errorMessage(dashboard.error)}
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<TeamOutlined />}
            label="สมาชิกทั้งหมด"
            value={d?.kpis.members}
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<FileTextOutlined />}
            label="ใบเสร็จที่ส่ง"
            value={d?.kpis.receiptsSubmitted}
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<ClockCircleOutlined />}
            label="รอตรวจสอบ (ทั้งหมดตอนนี้)"
            value={d?.kpis.waiting}
            loading={loading}
            tone="warning"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<StarFilled />}
            label="แต้มที่แจก"
            value={d?.kpis.pointsGiven}
            loading={loading}
            tone="success"
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} xl={16}>
          <Card title="แนวโน้มการส่งใบเสร็จ" style={{ height: '100%' }}>
            {d ? <DayChart data={d.trend} kind="area" unit="ใบ" /> : <Skeleton active />}
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card title="สถานะใบเสร็จ" style={{ height: '100%' }}>
            {d ? (
              <Donut
                centerLabel="ทั้งหมด"
                unit="รายการ"
                slices={[
                  {
                    key: 'approved',
                    label: 'อนุมัติแล้ว',
                    value: d.statuses.approved,
                    color: colors.success,
                  },
                  {
                    key: 'waiting',
                    label: 'รอตรวจสอบ',
                    value: d.statuses.waiting,
                    color: colors.warning,
                  },
                  {
                    key: 'rejected',
                    label: 'ไม่อนุมัติ',
                    value: d.statuses.rejected,
                    color: colors.danger,
                  },
                ]}
              />
            ) : (
              <Skeleton active />
            )}
          </Card>
        </Col>
      </Row>

      <Card
        title="ใบเสร็จรอตรวจสอบล่าสุด"
        extra={
          canReview && (
            <Link to="/receipts/review" style={{ color: colors.ink }}>
              ดูทั้งหมด <RightOutlined />
            </Link>
          )
        }
        styles={{ body: { padding: 0 } }}
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={d?.recentWaiting}
          pagination={false}
          scroll={{ x: 820 }}
          locale={{ emptyText: 'ไม่มีใบเสร็จรอตรวจสอบ' }}
          columns={[
            { title: 'เลขรายการ', dataIndex: 'code', render: (code: string) => `#${code}` },
            {
              title: 'วันที่ส่ง',
              dataIndex: 'submittedAt',
              render: (v: string) => formatThaiDateTime(v),
            },
            { title: 'เบอร์โทร', dataIndex: ['member', 'phone'] },
            { title: 'ร้านค้า', dataIndex: ['shop', 'name'], render: (v?: string) => v ?? '-' },
            {
              title: 'ยอดชำระ',
              dataIndex: 'amount',
              render: (v: number | null) => (v === null ? '-' : `${formatMoney(v)} บาท`),
            },
            {
              title: 'สถานะ',
              dataIndex: 'status',
              render: (status) => <ReceiptStatusPill status={status} />,
            },
            ...(canReview
              ? [
                  {
                    title: 'จัดการ',
                    key: 'action',
                    render: (_: unknown, r: { code: string; status: string }) => (
                      <Button
                        onClick={() =>
                          navigate(`/receipts/review?code=${r.code}&status=${r.status}`)
                        }
                      >
                        ตรวจสอบ
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>
      <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 13 }}>
        ตัวเลขนับตามวันที่ส่งใบเสร็จ (เวลาไทย) และเฉพาะสถานที่ที่คุณมีสิทธิ์เข้าถึง
      </Typography.Text>
    </>
  );
}
