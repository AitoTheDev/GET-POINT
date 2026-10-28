import {
  CalendarOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  formatThaiShortDate,
  maskThaiMobile,
  Menu,
  memberFullName,
  type MemberStatus,
} from '@getpoint/shared';
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Flex,
  Input,
  Pagination,
  Row,
  Select,
  Table,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import buddhistEra from 'dayjs/plugin/buddhistEra';
import { useState } from 'react';
import { apiDownload, errorMessage } from '../../api/client';
import {
  type Member,
  type MemberFilters,
  useBalances,
  useMemberCommunities,
  useMembers,
  useMemberSummary,
} from '../../api/members';
import { toQuery } from '../../api/org';
import { useAuth } from '../../auth/useAuth';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { BalanceCell } from './BalanceCell';
import { MemberDrawer } from './MemberDrawer';
import { MemberModal } from './MemberModal';
import { MemberAvatar, MemberStatusPill } from './memberDisplay';

dayjs.extend(buddhistEra);

/** Filter bar values before "ค้นหา" is pressed. */
interface Draft {
  search: string;
  communityId?: string;
  status?: MemberStatus;
  range: [Dayjs, Dayjs] | null;
}

const EMPTY_DRAFT: Draft = { search: '', range: null };
const FIRST_PAGE = { page: 1, pageSize: 20 };

/** "สมาชิก" page (mockup image 56). */
export function MembersPage() {
  const { can } = useAuth();
  const { message } = App.useApp();
  const canManage = can(Menu.MEMBERS, 'manage');

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [filters, setFilters] = useState<MemberFilters>(FIRST_PAGE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);

  const summary = useMemberSummary();
  const communities = useMemberCommunities();
  const members = useMembers(filters);
  const ids = members.data?.items.map((m) => m.id) ?? [];
  const balances = useBalances(ids);

  const apply = (next: Draft) =>
    setFilters((f) => ({
      page: 1,
      pageSize: f.pageSize,
      search: next.search.trim() || undefined,
      communityId: next.communityId,
      status: next.status,
      registeredFrom: next.range?.[0].format('YYYY-MM-DD'),
      registeredTo: next.range?.[1].format('YYYY-MM-DD'),
    }));

  const clear = () => {
    setDraft(EMPTY_DRAFT);
    setFilters((f) => ({ ...FIRST_PAGE, pageSize: f.pageSize }));
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const { page: _page, pageSize: _size, ...exportFilters } = filters;
      const date = new Date().toISOString().slice(0, 10);
      await apiDownload(`/members/export?${toQuery(exportFilters)}`, `สมาชิก-${date}.xlsx`);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const total = members.data?.total ?? 0;
  const from = total === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
  const to = Math.min(filters.page * filters.pageSize, total);
  const showCommunity = (communities.data?.length ?? 0) > 1;

  return (
    <>
      <PageHeader
        title="สมาชิก"
        extra={
          <Flex gap={12} wrap>
            <Button
              size="large"
              icon={<FileExcelOutlined />}
              onClick={exportExcel}
              loading={exporting}
            >
              Export Excel
            </Button>
            {canManage && (
              <Button
                type="primary"
                size="large"
                icon={<PlusOutlined />}
                onClick={() => setAdding(true)}
              >
                เพิ่มสมาชิก
              </Button>
            )}
          </Flex>
        }
      />

      <Row gutter={[20, 20]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<TeamOutlined />}
            label="สมาชิกทั้งหมด"
            value={summary.data?.total}
            unit="คน"
            loading={summary.isLoading}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<UserAddOutlined />}
            label="สมาชิกใหม่เดือนนี้"
            value={summary.data?.newThisMonth}
            unit="คน"
            loading={summary.isLoading}
            tone="success"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<FileTextOutlined />}
            label="สมาชิกที่ส่งใบเสร็จ"
            value={summary.data?.withReceipts}
            unit="คน"
            loading={summary.isLoading}
            tone="success"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<UserOutlined />}
            label="สมาชิกที่ใช้งาน"
            value={summary.data?.active}
            unit="คน"
            loading={summary.isLoading}
          />
        </Col>
      </Row>

      <Card styles={{ body: { padding: 20 } }} style={{ marginBottom: 20 }}>
        <Flex gap={12} wrap>
          <Input
            size="large"
            allowClear
            prefix={<SearchOutlined />}
            placeholder="ค้นหาชื่อ เบอร์โทร หรือรหัสสมาชิก"
            value={draft.search}
            onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
            onPressEnter={() => apply(draft)}
            style={{ flex: '2 1 260px' }}
          />
          {showCommunity && (
            <Select
              size="large"
              aria-label="กรองตาม Community"
              allowClear
              placeholder="ทุก Community"
              suffixIcon={<EnvironmentOutlined />}
              value={draft.communityId}
              onChange={(communityId) => setDraft((d) => ({ ...d, communityId }))}
              options={communities.data?.map((c) => ({ value: c.id, label: c.name }))}
              style={{ flex: '1 1 180px' }}
            />
          )}
          <Select<MemberStatus>
            size="large"
            aria-label="กรองตามสถานะ"
            allowClear
            placeholder="ทุกสถานะ"
            value={draft.status}
            onChange={(status) => setDraft((d) => ({ ...d, status }))}
            options={[
              { value: 'ACTIVE', label: 'ใช้งาน' },
              { value: 'SUSPENDED', label: 'ระงับ' },
            ]}
            style={{ flex: '1 1 150px' }}
          />
          <DatePicker.RangePicker
            size="large"
            aria-label="วันที่สมัคร"
            placeholder={['สมัครตั้งแต่', 'ถึงวันที่']}
            format="DD/MM/BBBB"
            suffixIcon={<CalendarOutlined />}
            value={draft.range}
            onChange={(range) =>
              setDraft((d) => ({
                ...d,
                range: range?.[0] && range[1] ? [range[0], range[1]] : null,
              }))
            }
            style={{ flex: '1 1 260px' }}
          />
          <Button
            type="primary"
            size="large"
            icon={<SearchOutlined />}
            onClick={() => apply(draft)}
          >
            ค้นหา
          </Button>
          <Button size="large" icon={<ReloadOutlined />} onClick={clear}>
            ล้างตัวกรอง
          </Button>
        </Flex>
      </Card>

      <Card styles={{ body: { padding: 24 } }}>
        <Flex align="baseline" gap={16} wrap style={{ marginBottom: 16 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            รายชื่อสมาชิก
          </Typography.Title>
          <Typography.Text type="secondary">
            แสดง {from} – {to} จาก {total.toLocaleString('en-US')} คน
          </Typography.Text>
        </Flex>

        <Table<Member>
          rowKey="id"
          scroll={{ x: 'max-content' }}
          loading={members.isFetching}
          dataSource={members.data?.items}
          locale={{
            emptyText: (
              <Empty
                description={
                  members.isError ? errorMessage(members.error) : 'ไม่พบสมาชิกตามเงื่อนไขที่เลือก'
                }
              />
            ),
          }}
          pagination={false}
          onRow={(m) => ({ onDoubleClick: () => setOpenId(m.id) })}
          columns={[
            { title: 'รหัสสมาชิก', dataIndex: 'code', width: 120 },
            {
              title: 'ชื่อสมาชิก',
              render: (_, m) => (
                <Flex gap={12} align="center">
                  <MemberAvatar name={m.firstName} />
                  <span>{memberFullName(m)}</span>
                </Flex>
              ),
            },
            { title: 'เบอร์โทร', render: (_, m) => maskThaiMobile(m.phone) },
            ...(showCommunity
              ? [{ title: 'Community', render: (_: unknown, m: Member) => m.community.name }]
              : []),
            { title: 'วันที่สมัคร', render: (_, m) => formatThaiShortDate(m.createdAt) },
            {
              title: 'แต้มคงเหลือ',
              align: 'center',
              render: (_, m) => (
                <BalanceCell balance={balances.data?.get(m.id)} loading={balances.isFetching} />
              ),
            },
            { title: 'ใบเสร็จ', dataIndex: 'receiptCount', align: 'center' },
            { title: 'สถานะ', render: (_, m) => <MemberStatusPill status={m.status} /> },
            {
              title: 'จัดการ',
              width: 170,
              render: (_, m) => (
                <Button
                  icon={<EyeOutlined />}
                  onClick={() => setOpenId(m.id)}
                  aria-label={`ดูรายละเอียด ${m.code}`}
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
            locale={{ items_per_page: 'คน / หน้า' }}
            onChange={(page, pageSize) =>
              setFilters((f) => ({ ...f, page: pageSize === f.pageSize ? page : 1, pageSize }))
            }
          />
        </Flex>
      </Card>

      {openId && <MemberDrawer key={openId} memberId={openId} onClose={() => setOpenId(null)} />}
      {adding && (
        <MemberModal
          open
          member={null}
          communities={communities.data ?? []}
          onClose={() => setAdding(false)}
          onSaved={(saved) => {
            setAdding(false);
            setOpenId(saved.id);
          }}
        />
      )}
    </>
  );
}
