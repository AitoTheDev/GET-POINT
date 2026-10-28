import { RobotOutlined, SearchOutlined, TagsOutlined, UserOutlined } from '@ant-design/icons';
import { ActivityGroupLabel, activityLabel, formatThaiShortDateTime, Menu } from '@getpoint/shared';
import { Alert, Card, DatePicker, Flex, Input, Select, Table, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import buddhistEra from 'dayjs/plugin/buddhistEra';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import {
  type ActivityFilters,
  type ActivityItem,
  useActivityActors,
  useActivityLog,
} from '../../api/reports';
import { useAuth } from '../../auth/useAuth';
import { PageHeader } from '../../components/PageHeader';
import { colors } from '../../theme';

dayjs.extend(buddhistEra);

/** Stored details as readable "key: value" lines (passwords were never stored). */
function Details({ metadata }: { metadata: unknown }) {
  if (!metadata || typeof metadata !== 'object') {
    return <Typography.Text type="secondary">ไม่มีรายละเอียดเพิ่มเติม</Typography.Text>;
  }
  return (
    <pre
      style={{
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontSize: 13,
        background: '#F6F7F9',
        borderRadius: 8,
        padding: 12,
        maxHeight: 320,
        overflow: 'auto',
      }}
    >
      {JSON.stringify(metadata, null, 2)}
    </pre>
  );
}

/**
 * Activity Log (no mockup; same style as the other pages).
 * Admin (manage) sees everyone's actions; other roles see only their own.
 */
export function ActivityLogPage() {
  const { can, user } = useAuth();
  const everyone = can(Menu.ACTIVITY_LOG, 'manage');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [filters, setFilters] = useState<ActivityFilters>({ page: 1, pageSize: 20 });
  const log = useActivityLog(filters);
  const actors = useActivityActors(everyone);
  const update = (patch: Partial<ActivityFilters>) =>
    setFilters((f) => ({ ...f, page: 1, ...patch }));

  return (
    <>
      <PageHeader
        title="Activity Log"
        subtitle={
          everyone
            ? 'ประวัติการใช้งานระบบของผู้ใช้งานทุกคน'
            : `ประวัติการใช้งานของคุณ (${user?.name ?? ''}) เท่านั้น`
        }
      />

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Flex gap={12} wrap>
          <Input
            size="large"
            allowClear
            prefix={<SearchOutlined />}
            placeholder="ค้นหากิจกรรม รหัส หรือชื่อรายการ"
            aria-label="ค้นหากิจกรรม"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!e.target.value) update({ search: undefined });
            }}
            onPressEnter={() => update({ search: search.trim() || undefined })}
            style={{ flex: '2 1 260px' }}
          />
          <Select
            size="large"
            aria-label="ประเภทกิจกรรม"
            allowClear
            placeholder="ทุกประเภท"
            suffixIcon={<TagsOutlined />}
            value={filters.group}
            onChange={(group) => update({ group })}
            options={Object.entries(ActivityGroupLabel).map(([value, label]) => ({ value, label }))}
            style={{ flex: '1 1 180px' }}
          />
          {everyone && (
            <Select
              size="large"
              aria-label="ผู้ใช้งาน"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="ผู้ใช้งานทุกคน"
              suffixIcon={<UserOutlined />}
              value={filters.actorId}
              onChange={(actorId) => update({ actorId })}
              loading={actors.isLoading}
              options={actors.data?.map((a) => ({ value: a.id, label: `${a.name} (${a.email})` }))}
              style={{ flex: '1 1 220px' }}
            />
          )}
          <DatePicker.RangePicker
            size="large"
            aria-label="ช่วงวันที่"
            placeholder={['ตั้งแต่วันที่', 'ถึงวันที่']}
            format="DD/MM/BBBB"
            value={range}
            onChange={(r) => {
              const value = r?.[0] && r[1] ? ([r[0], r[1]] as [Dayjs, Dayjs]) : null;
              setRange(value);
              update({
                from: value?.[0].format('YYYY-MM-DD'),
                to: value?.[1].format('YYYY-MM-DD'),
              });
            }}
            style={{ flex: '1 1 240px' }}
          />
        </Flex>
      </Card>

      {log.isError && (
        <Alert
          type="error"
          showIcon
          message={errorMessage(log.error)}
          style={{ marginBottom: 16 }}
        />
      )}

      <Card styles={{ body: { padding: 0 } }}>
        <Table<ActivityItem>
          rowKey="id"
          loading={log.isFetching}
          dataSource={log.data?.items}
          scroll={{ x: 860 }}
          locale={{ emptyText: 'ไม่พบกิจกรรม' }}
          expandable={{
            expandedRowRender: (item) => <Details metadata={item.metadata} />,
            expandRowByClick: true,
          }}
          pagination={{
            current: filters.page,
            pageSize: filters.pageSize,
            total: log.data?.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            locale: { items_per_page: 'รายการ/หน้า' },
            showTotal: (total) => `ทั้งหมด ${total.toLocaleString('en-US')} รายการ`,
            onChange: (page, pageSize) =>
              setFilters((f) => ({ ...f, page: pageSize === f.pageSize ? page : 1, pageSize })),
          }}
          columns={[
            {
              title: 'เวลา',
              dataIndex: 'createdAt',
              width: 170,
              render: (v: string) => formatThaiShortDateTime(v),
            },
            ...(everyone
              ? [
                  {
                    title: 'ผู้ใช้งาน',
                    key: 'actor',
                    render: (_: unknown, item: ActivityItem) =>
                      item.actor ? (
                        <Flex vertical style={{ lineHeight: 1.3 }}>
                          <span>{item.actor.name}</span>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {item.actor.email}
                          </Typography.Text>
                        </Flex>
                      ) : (
                        <span style={{ color: colors.textMuted }}>
                          <RobotOutlined /> ระบบอัตโนมัติ
                        </span>
                      ),
                  },
                ]
              : []),
            {
              title: 'กิจกรรม',
              dataIndex: 'action',
              render: (action: string) => {
                const group = action.split('.')[0];
                return (
                  <Flex gap={8} align="center" wrap>
                    <span style={{ fontWeight: 500 }}>{activityLabel(action)}</span>
                    {ActivityGroupLabel[group] && (
                      <Tag bordered={false}>{ActivityGroupLabel[group]}</Tag>
                    )}
                  </Flex>
                );
              },
            },
            { title: 'รายการ', dataIndex: 'target', render: (v: string | null) => v ?? '-' },
            { title: 'IP', dataIndex: 'ip', width: 140, render: (v: string | null) => v ?? '-' },
          ]}
        />
      </Card>
    </>
  );
}
