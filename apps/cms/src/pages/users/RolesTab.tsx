import { DeleteOutlined, LockOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { type AuthUser, Menu, MENUS, type MenuPermission, SystemRole } from '@getpoint/shared';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Form,
  Input,
  List,
  Popconfirm,
  Row,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import { apiGet, errorMessage } from '../../api/client';
import { type Role, useDeleteRole, useRoles, useSaveRole } from '../../api/users';
import { useAuth } from '../../auth/useAuth';
import { PermissionMatrix } from '../../components/PermissionMatrix';
import { colors } from '../../theme';

const NEW = 'new';
const emptyPermissions = (): MenuPermission[] =>
  MENUS.map((menu) => ({ menu, canView: false, canManage: false }));

/** "บทบาทและสิทธิ์": edit the view/manage matrix of each role, add or delete custom roles. */
export function RolesTab() {
  const roles = useRoles();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (roles.isLoading) return <Spin style={{ display: 'block', margin: 48 }} />;
  if (roles.isError) return <Alert type="error" showIcon message={errorMessage(roles.error)} />;

  const list = roles.data ?? [];
  const currentId = selectedId ?? list[0]?.id ?? null;
  const current = currentId === NEW ? null : (list.find((r) => r.id === currentId) ?? null);

  return (
    <Row gutter={24}>
      <Col xs={24} lg={8}>
        <Card
          title="บทบาท"
          extra={<NewRoleButton onClick={() => setSelectedId(NEW)} />}
          styles={{ body: { padding: 8 } }}
        >
          <List
            dataSource={list}
            renderItem={(role) => (
              <List.Item
                onClick={() => setSelectedId(role.id)}
                style={{
                  cursor: 'pointer',
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: role.id === currentId ? colors.sidebarActiveBg : undefined,
                  boxShadow: role.id === currentId ? `inset 4px 0 0 ${colors.ink}` : undefined,
                }}
              >
                <List.Item.Meta
                  title={
                    <Flex gap={8} align="center">
                      {role.name}
                      {role.isSystem && <Tag>บทบาทหลัก</Tag>}
                    </Flex>
                  }
                  description={
                    <span>
                      <TeamOutlined /> {role.userCount} คน
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      </Col>
      <Col xs={24} lg={16}>
        {currentId === NEW ? (
          <RoleEditor key={NEW} role={null} onSaved={(r) => setSelectedId(r.id)} />
        ) : current ? (
          <RoleEditor
            key={current.id}
            role={current}
            onSaved={(r) => setSelectedId(r.id)}
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <Card>
            <Empty />
          </Card>
        )}
      </Col>
    </Row>
  );
}

function NewRoleButton({ onClick }: { onClick: () => void }) {
  const { can } = useAuth();
  if (!can(Menu.USERS, 'manage')) return null;
  return (
    <Button icon={<PlusOutlined />} onClick={onClick}>
      เพิ่มบทบาท
    </Button>
  );
}

interface RoleEditorProps {
  /** null = creating a new role */
  role: Role | null;
  onSaved: (role: Role) => void;
  onDeleted?: () => void;
}

function RoleEditor({ role, onSaved, onDeleted }: RoleEditorProps) {
  const { can, user, setUser } = useAuth();
  const { message } = App.useApp();
  const saveRole = useSaveRole();
  const deleteRole = useDeleteRole();
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [permissions, setPermissions] = useState<MenuPermission[]>(
    role?.permissions ?? emptyPermissions(),
  );
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role?.key === SystemRole.ADMIN;
  const canManage = can(Menu.USERS, 'manage');

  const save = async () => {
    if (!name.trim()) {
      setError('กรุณากรอกชื่อบทบาท');
      return;
    }
    setError(null);
    try {
      const saved = await saveRole.mutateAsync({
        id: role?.id,
        name: name.trim(),
        description: description.trim(),
        // The Admin role always keeps full access; the API rejects permission changes to it.
        permissions: isAdmin ? undefined : permissions,
      });
      message.success('บันทึกบทบาทเรียบร้อยแล้ว');
      // Editing your own role changes what you can see right away.
      if (saved.id === user?.role.id) setUser(await apiGet<AuthUser>('/auth/me'));
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const remove = async () => {
    if (!role) return;
    try {
      await deleteRole.mutateAsync(role.id);
      message.success('ลบบทบาทเรียบร้อยแล้ว');
      onDeleted?.();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <Card
      title={role ? `แก้ไขบทบาท: ${role.name}` : 'เพิ่มบทบาทใหม่'}
      extra={
        role &&
        !role.isSystem &&
        canManage && (
          <Popconfirm
            title="ลบบทบาทนี้?"
            description={role.userCount > 0 ? 'ต้องย้ายผู้ใช้งานออกจากบทบาทนี้ก่อน' : undefined}
            okText="ลบ"
            cancelText="ยกเลิก"
            okButtonProps={{ danger: true }}
            onConfirm={remove}
          >
            <Button danger icon={<DeleteOutlined />}>
              ลบบทบาท
            </Button>
          </Popconfirm>
        )
      }
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {isAdmin && (
        <Alert
          type="info"
          showIcon
          icon={<LockOutlined />}
          style={{ marginBottom: 16 }}
          message="บทบาทผู้ดูแลระบบมีสิทธิ์ทุกเมนูเสมอ เพื่อป้องกันไม่ให้ไม่มีใครจัดการระบบได้"
        />
      )}
      <Form layout="vertical">
        <Row gutter={16}>
          <Col xs={24} md={10}>
            <Form.Item label="ชื่อบทบาท" required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                disabled={!canManage}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={14}>
            <Form.Item label="คำอธิบาย">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={255}
                disabled={!canManage}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <Typography.Title level={5}>สิทธิ์ตามเมนู</Typography.Title>
      <PermissionMatrix
        value={permissions}
        onChange={isAdmin || !canManage ? undefined : setPermissions}
      />

      {canManage && (
        <Flex justify="flex-end" style={{ marginTop: 16 }}>
          <Button type="primary" size="large" onClick={save} loading={saveRole.isPending}>
            {role ? 'บันทึก' : 'เพิ่มบทบาท'}
          </Button>
        </Flex>
      )}
    </Card>
  );
}
