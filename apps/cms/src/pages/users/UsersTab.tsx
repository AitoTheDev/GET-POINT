import { CheckCircleOutlined, EditOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import {
  Avatar,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Input,
  Row,
  Select,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import { type UserFilters, type UserRow, useRoles, useUsers } from '../../api/users';
import { StatusPill } from '../../components/StatusPill';
import { colors } from '../../theme';
import { describeScope } from './scope';
import { UserPanel } from './UserPanel';

interface UsersTabProps {
  onEditRoles: () => void;
  onTemporaryPassword: (user: UserRow, password: string) => void;
}

export function UsersTab({ onEditRoles, onTemporaryPassword }: UsersTabProps) {
  const roles = useRoles();
  const [filters, setFilters] = useState<UserFilters>({ page: 1, pageSize: 20 });
  const [searchText, setSearchText] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const users = useUsers(filters);

  const update = (patch: Partial<UserFilters>) => setFilters((f) => ({ ...f, page: 1, ...patch }));
  const selected = users.data?.items.find((u) => u.id === selectedId) ?? null;

  return (
    <Row gutter={[24, 24]} align="stretch">
      {/* Side by side on wide screens (as in the mockup); panel below the table otherwise. */}
      <Col xs={24} xxl={15}>
        <Card styles={{ body: { padding: 24 } }}>
          <Flex gap={12} wrap style={{ marginBottom: 16 }}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="ค้นหาชื่อหรืออีเมล"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                if (!e.target.value) update({ search: undefined });
              }}
              onPressEnter={() => update({ search: searchText.trim() || undefined })}
              style={{ flex: '2 1 220px' }}
            />
            <Select
              aria-label="กรองตามบทบาท"
              allowClear
              placeholder={
                <span>
                  <UserOutlined /> ทุกบทบาท
                </span>
              }
              value={filters.roleId}
              onChange={(roleId) => update({ roleId })}
              options={roles.data?.map((r) => ({ value: r.id, label: r.name }))}
              style={{ flex: '1 1 160px' }}
            />
            <Select
              aria-label="กรองตามสถานะ"
              allowClear
              placeholder={
                <span>
                  <CheckCircleOutlined /> ทุกสถานะ
                </span>
              }
              value={filters.status}
              onChange={(status) => update({ status })}
              options={[
                { value: 'ACTIVE', label: 'ใช้งาน' },
                { value: 'SUSPENDED', label: 'ระงับ' },
              ]}
              style={{ flex: '1 1 140px' }}
            />
          </Flex>

          <Table<UserRow>
            rowKey="id"
            scroll={{ x: 'max-content' }}
            loading={users.isFetching}
            dataSource={users.data?.items}
            locale={{ emptyText: <Empty description="ไม่พบผู้ใช้งาน" /> }}
            onRow={(user) => ({
              onClick: () => setSelectedId(user.id),
              style: {
                cursor: 'pointer',
                background: user.id === selectedId ? colors.sidebarActiveBg : undefined,
                boxShadow: user.id === selectedId ? `inset 4px 0 0 ${colors.ink}` : undefined,
              },
            })}
            pagination={{
              current: filters.page,
              pageSize: filters.pageSize,
              total: users.data?.total,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50],
              locale: { items_per_page: 'รายการ/หน้า' },
              onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, pageSize })),
            }}
            columns={[
              {
                title: 'ชื่อผู้ใช้งาน',
                render: (_, user) => (
                  <Flex gap={12} align="center">
                    <Avatar size={44} icon={<UserOutlined />} style={{ background: '#D9DCE1' }} />
                    <div style={{ minWidth: 0 }}>
                      <Typography.Text strong>{user.name}</Typography.Text>
                      {user.mustChangePassword && (
                        <Tag color="orange" style={{ marginLeft: 8 }}>
                          รอเปลี่ยนรหัสผ่าน
                        </Tag>
                      )}
                      <br />
                      <Typography.Text type="secondary" ellipsis>
                        {user.email}
                      </Typography.Text>
                    </div>
                  </Flex>
                ),
              },
              {
                title: 'บทบาท',
                render: (_, user) => (
                  <span
                    style={{
                      background: '#F0F1F3',
                      borderRadius: 999,
                      padding: '4px 12px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {user.role.name}
                  </span>
                ),
              },
              { title: 'สถานที่', render: (_, user) => describeScope(user.scope) },
              {
                title: 'สถานะ',
                render: (_, user) =>
                  user.status === 'ACTIVE' ? (
                    <StatusPill tone="success">ใช้งาน</StatusPill>
                  ) : (
                    <StatusPill tone="danger">ระงับ</StatusPill>
                  ),
              },
              {
                title: 'จัดการ',
                align: 'center',
                width: 80,
                render: (_, user) => (
                  <Button
                    type="text"
                    aria-label={`แก้ไข ${user.name}`}
                    icon={<EditOutlined style={{ fontSize: 18 }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(user.id);
                    }}
                  />
                ),
              },
            ]}
          />
        </Card>
      </Col>
      <Col xs={24} xxl={9}>
        {selected ? (
          <UserPanel
            key={selected.id}
            user={selected}
            onEditRoles={onEditRoles}
            onTemporaryPassword={(password) => onTemporaryPassword(selected, password)}
          />
        ) : (
          <Card style={{ height: '100%' }}>
            <Empty
              description="เลือกผู้ใช้งานจากรายการเพื่อกำหนดสิทธิ์"
              style={{ marginTop: 48 }}
            />
          </Card>
        )}
      </Col>
    </Row>
  );
}
