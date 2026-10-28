import {
  CheckCircleFilled,
  EditOutlined,
  EnvironmentOutlined,
  InfoCircleOutlined,
  MinusCircleFilled,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { type ActiveStatus, Menu } from '@getpoint/shared';
import { Button, Card, Empty, Flex, Input, Pagination, Select, Table, Typography } from 'antd';
import { useState } from 'react';
import {
  type Location,
  type Shop,
  type ShopFilters,
  useShopCategories,
  useShops,
} from '../../api/org';
import { useAuth } from '../../auth/useAuth';
import { StatusPill } from '../../components/StatusPill';
import { colors } from '../../theme';
import { ShopModal } from './ShopModal';

interface ShopsPanelProps {
  location: Location;
  locations: Location[];
  onEditLocation: () => void;
}

/** Right side: selected location header + "ร้านค้าในสถานที่นี้" table. */
export function ShopsPanel({ location, locations, onEditLocation }: ShopsPanelProps) {
  const { can } = useAuth();
  const canManage = can(Menu.SHOPS, 'manage');
  const categories = useShopCategories();
  const [filters, setFilters] = useState<Omit<ShopFilters, 'locationId'>>({
    page: 1,
    pageSize: 20,
  });
  const [searchText, setSearchText] = useState('');
  const [editing, setEditing] = useState<Shop | 'new' | null>(null);
  const shops = useShops({ ...filters, locationId: location.id });

  const update = (patch: Partial<ShopFilters>) => setFilters((f) => ({ ...f, page: 1, ...patch }));
  const total = shops.data?.total ?? 0;
  const from = total === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
  const to = Math.min(filters.page * filters.pageSize, total);

  return (
    <Flex vertical gap={20}>
      <Card styles={{ body: { padding: '20px 24px' } }}>
        <Flex justify="space-between" align="center" gap={16} wrap>
          <Flex gap={16} align="center">
            <Flex
              align="center"
              justify="center"
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#F0F1F3',
                fontSize: 28,
              }}
            >
              <EnvironmentOutlined />
            </Flex>
            <div>
              <Typography.Title level={3} style={{ margin: 0 }}>
                {location.name}
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 16 }}>
                {location.code}
                {location.province && ` · ${location.province}`}
                {` · ${location.community.name}`}
              </Typography.Text>
            </div>
          </Flex>
          <Flex gap={12} align="center">
            {canManage && (
              <Button size="large" icon={<EditOutlined />} onClick={onEditLocation}>
                แก้ไขสถานที่
              </Button>
            )}
            {location.status === 'ACTIVE' ? (
              <StatusPill tone="success">เปิดใช้งาน</StatusPill>
            ) : (
              <StatusPill tone="neutral">ปิดใช้งาน</StatusPill>
            )}
          </Flex>
        </Flex>
      </Card>

      <Card styles={{ body: { padding: 24 } }}>
        <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            ร้านค้าในสถานที่นี้
          </Typography.Title>
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              เพิ่มร้านค้า
            </Button>
          )}
        </Flex>

        <Flex gap={12} wrap style={{ marginBottom: 16 }}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="ค้นหาชื่อร้านหรือรหัสร้าน"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              if (!e.target.value) update({ search: undefined });
            }}
            onPressEnter={() => update({ search: searchText.trim() || undefined })}
            style={{ flex: '2 1 220px' }}
          />
          <Select
            aria-label="กรองตามหมวดหมู่"
            allowClear
            placeholder="ทุกหมวดหมู่"
            value={filters.categoryId}
            onChange={(categoryId) => update({ categoryId })}
            options={categories.data?.map((c) => ({ value: c.id, label: c.name }))}
            style={{ flex: '1 1 160px' }}
          />
          <Select<ActiveStatus>
            aria-label="กรองตามสถานะ"
            allowClear
            placeholder="ทุกสถานะ"
            value={filters.status}
            onChange={(status) => update({ status })}
            options={[
              { value: 'ACTIVE', label: 'เปิดใช้งาน' },
              { value: 'INACTIVE', label: 'ปิดใช้งาน' },
            ]}
            style={{ flex: '1 1 140px' }}
          />
        </Flex>

        <Table<Shop>
          rowKey="id"
          scroll={{ x: 'max-content' }}
          loading={shops.isFetching}
          dataSource={shops.data?.items}
          locale={{ emptyText: <Empty description="ยังไม่มีร้านค้าในสถานที่นี้" /> }}
          pagination={false}
          columns={[
            { title: 'รหัสร้าน', dataIndex: 'code', width: 100 },
            { title: 'ชื่อร้านค้า', dataIndex: 'name' },
            { title: 'หมวดหมู่', render: (_, s) => s.category?.name ?? '-' },
            { title: 'ชื่อร้านบนใบเสร็จ', render: (_, s) => s.receiptName ?? '-' },
            {
              title: 'ร่วมสะสมแต้ม',
              render: (_, s) =>
                s.participating ? (
                  <span style={{ color: colors.success }}>
                    <CheckCircleFilled /> ใช่
                  </span>
                ) : (
                  <span style={{ color: colors.textMuted }}>
                    <MinusCircleFilled /> ไม่
                  </span>
                ),
            },
            {
              title: 'สถานะ',
              render: (_, s) =>
                s.status === 'ACTIVE' ? (
                  <StatusPill tone="success">เปิดใช้งาน</StatusPill>
                ) : (
                  <StatusPill tone="neutral">ปิดใช้งาน</StatusPill>
                ),
            },
            ...(canManage
              ? [
                  {
                    title: 'จัดการ',
                    width: 110,
                    render: (_: unknown, s: Shop) => (
                      <Button icon={<EditOutlined />} onClick={() => setEditing(s)}>
                        แก้ไข
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
        />

        <Flex justify="space-between" align="center" gap={12} wrap style={{ marginTop: 16 }}>
          <Flex
            gap={8}
            align="center"
            style={{ background: colors.pageBg, borderRadius: 10, padding: '10px 14px' }}
          >
            <InfoCircleOutlined />
            <Typography.Text>
              ชื่อร้านบนใบเสร็จใช้ช่วยจับคู่ร้านค้าจากข้อมูลที่ AI อ่าน
            </Typography.Text>
          </Flex>
          <Pagination
            current={filters.page}
            pageSize={filters.pageSize}
            total={total}
            showTotal={() => `แสดง ${from} – ${to} จาก ${total} ร้าน`}
            showSizeChanger
            pageSizeOptions={[10, 20, 50]}
            locale={{ items_per_page: 'ร้าน / หน้า' }}
            onChange={(page, pageSize) =>
              setFilters((f) => ({ ...f, page: pageSize === f.pageSize ? page : 1, pageSize }))
            }
          />
        </Flex>
      </Card>

      {editing && (
        <ShopModal
          open
          shop={editing === 'new' ? null : editing}
          location={location}
          locations={locations}
          onClose={() => setEditing(null)}
        />
      )}
    </Flex>
  );
}
