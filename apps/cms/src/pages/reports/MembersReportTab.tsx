import {
  CheckCircleOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  SearchOutlined,
  StarOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import {
  formatMoney,
  formatNumber,
  formatThaiShortDate,
  type MemberStatus,
  MemberStatusLabel,
} from '@getpoint/shared';
import { Alert, Card, Col, Flex, Input, Row, Select, Skeleton, Table, Typography } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import {
  type MemberReportRow,
  type MembersReportFilters,
  useMembersReport,
  useReportLocations,
} from '../../api/reports';
import { DayChart, Donut } from '../../components/charts/Charts';
import { chartColors } from '../../components/charts/chartUtils';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import type { RangeValue } from '../../components/dateRange';
import { StatCard } from '../../components/StatCard';
import { MemberStatusPill } from '../members/memberDisplay';
import { Note, ReportFilterBar } from './ReportFilterBar';

interface Draft {
  range: RangeValue;
  locationId?: string;
  status?: MemberStatus;
}

/** "รายงานสมาชิก" (mockup image 60). */
export function MembersReportTab({
  range,
  filters,
  onChange,
}: {
  range: RangeValue;
  filters: MembersReportFilters;
  onChange: (filters: MembersReportFilters, range?: RangeValue) => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    range,
    locationId: filters.locationId,
    status: filters.status,
  });
  const [search, setSearch] = useState(filters.search ?? '');
  const locations = useReportLocations();
  const report = useMembersReport(filters);
  const r = report.data;
  const loading = report.isLoading;

  const apply = () =>
    onChange(
      {
        ...filters,
        from: draft.range.from,
        to: draft.range.to,
        locationId: draft.locationId,
        status: draft.status,
        page: 1,
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
          onChange={(locationId) => setDraft((d) => ({ ...d, locationId }))}
          options={locations.data?.map((l) => ({ value: l.id, label: l.name }))}
          style={{ flex: '1 1 220px' }}
        />
        <DateRangeFilter
          value={draft.range}
          onChange={(range) => setDraft((d) => ({ ...d, range }))}
          style={{ flex: '1 1 260px' }}
        />
        <Select<MemberStatus>
          size="large"
          aria-label="สถานะสมาชิก"
          allowClear
          placeholder="ทุกสถานะ"
          suffixIcon={<CheckCircleOutlined />}
          value={draft.status}
          onChange={(status) => setDraft((d) => ({ ...d, status }))}
          options={(['ACTIVE', 'SUSPENDED'] as const).map((s) => ({
            value: s,
            label: MemberStatusLabel[s],
          }))}
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

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<TeamOutlined />}
            label="สมาชิกทั้งหมด ณ วันสิ้นงวด"
            value={r?.kpis.totalAtEnd}
            unit="คน"
            loading={loading}
            tone="success"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<UserAddOutlined />}
            label="สมาชิกใหม่ในช่วงที่เลือก"
            value={r?.kpis.newInRange}
            unit="คน"
            loading={loading}
            tone="success"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<FileTextOutlined />}
            label="สมาชิกที่ส่งใบเสร็จในช่วงที่เลือก"
            value={r?.kpis.sendersInRange}
            unit="คน"
            loading={loading}
            tone="success"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<StarOutlined />}
            label="สมาชิกใหม่ที่ส่งใบเสร็จ"
            value={r?.kpis.newSenders}
            unit="คน"
            loading={loading}
            tone="success"
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} xl={15}>
          <Card title="สมาชิกใหม่รายวัน" style={{ height: '100%' }}>
            <Typography.Text type="secondary">จำนวนสมาชิก (คน)</Typography.Text>
            {r ? <DayChart data={r.dailyNew} kind="columns" unit="คน" /> : <Skeleton active />}
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="การส่งใบเสร็จของสมาชิกใหม่" style={{ height: '100%' }}>
            {r ? (
              <Donut
                centerLabel="สมาชิกใหม่"
                unit="คน"
                legendUnit="คน"
                slices={[
                  {
                    key: 'sent',
                    label: 'ส่งใบเสร็จแล้ว',
                    value: r.newMembersSending.sent,
                    color: chartColors.series,
                  },
                  {
                    key: 'notYet',
                    label: 'ยังไม่ส่งใบเสร็จ',
                    value: r.newMembersSending.notYet,
                    color: chartColors.remainder,
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
        title="รายละเอียดสมาชิก"
        extra={
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="ค้นหาชื่อ รหัส หรือเบอร์โทร"
            aria-label="ค้นหาสมาชิก"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!e.target.value) onChange({ ...filters, search: undefined, page: 1 });
            }}
            onPressEnter={() =>
              onChange({ ...filters, search: search.trim() || undefined, page: 1 })
            }
            style={{ width: 'min(280px, 60vw)' }}
          />
        }
        styles={{ body: { paddingTop: 0 } }}
      >
        <Table<MemberReportRow>
          rowKey="id"
          loading={report.isFetching}
          dataSource={r?.items}
          size="middle"
          scroll={{ x: 980 }}
          locale={{ emptyText: 'ไม่พบสมาชิก' }}
          pagination={{
            current: filters.page,
            pageSize: filters.pageSize,
            total: r?.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            locale: { items_per_page: 'คน/หน้า' },
            onChange: (page, pageSize) =>
              onChange({ ...filters, page: pageSize === filters.pageSize ? page : 1, pageSize }),
          }}
          columns={[
            { title: 'รหัสสมาชิก', dataIndex: 'code' },
            { title: 'ชื่อสมาชิก', dataIndex: 'name' },
            { title: 'เบอร์โทร', dataIndex: 'phone' },
            {
              title: 'วันที่สมัคร',
              dataIndex: 'createdAt',
              render: (v: string) => formatThaiShortDate(v),
            },
            { title: 'Community', dataIndex: 'community' },
            {
              title: 'ใบเสร็จในช่วงที่เลือก',
              dataIndex: 'receiptsInRange',
              align: 'center',
              render: formatNumber,
            },
            {
              title: 'ยอดใช้จ่ายอนุมัติ (บาท)',
              dataIndex: 'approvedAmountInRange',
              align: 'center',
              render: formatMoney,
            },
            {
              title: 'สถานะ',
              dataIndex: 'status',
              align: 'center',
              render: (s: MemberStatus) => <MemberStatusPill status={s} />,
            },
          ]}
        />
        <Flex>
          <Note>
            จำนวนสมาชิกนับไม่ซ้ำตามรหัสสมาชิก · เลือกสถานที่ = สมาชิกที่เคยส่งใบเสร็จที่สถานที่นั้น
          </Note>
        </Flex>
      </Card>
    </>
  );
}
