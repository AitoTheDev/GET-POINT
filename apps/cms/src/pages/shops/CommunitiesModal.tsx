import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Menu } from '@getpoint/shared';
import { Alert, App, Button, Flex, Input, Modal, Switch, Table } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { type Community, useCommunities, useSaveCommunity } from '../../api/org';
import { useAuth } from '../../auth/useAuth';
import { StatusPill } from '../../components/StatusPill';

interface Draft {
  id?: string;
  name: string;
  active: boolean;
}

/** List, add and rename Communities. Adding needs access to every location. */
export function CommunitiesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, can } = useAuth();
  const { message } = App.useApp();
  const communities = useCommunities();
  const save = useSaveCommunity();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = can(Menu.SHOPS, 'manage');
  const canCreate = canManage && Boolean(user?.scope.all);

  const submit = async () => {
    if (!draft?.name.trim()) {
      setError('กรุณากรอกชื่อ Community');
      return;
    }
    setError(null);
    try {
      const saved = await save.mutateAsync({
        id: draft.id,
        name: draft.name.trim(),
        status: draft.active ? 'ACTIVE' : 'INACTIVE',
      });
      message.success(
        draft.id ? 'บันทึก Community เรียบร้อยแล้ว' : `เพิ่ม Community ${saved.code} เรียบร้อยแล้ว`,
      );
      setDraft(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const edit = (c: Community) => {
    setError(null);
    setDraft({ id: c.id, name: c.name, active: c.status === 'ACTIVE' });
  };

  return (
    <Modal
      open={open}
      title="Community"
      footer={null}
      onCancel={onClose}
      width={720}
      destroyOnHidden
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}

      {draft ? (
        <Flex gap={12} align="center" wrap style={{ marginBottom: 16 }}>
          <Input
            aria-label="ชื่อ Community"
            autoFocus
            value={draft.name}
            maxLength={150}
            placeholder="ชื่อ Community"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            onPressEnter={submit}
            style={{ flex: '1 1 240px' }}
          />
          <Switch
            checked={draft.active}
            onChange={(active) => setDraft({ ...draft, active })}
            checkedChildren="เปิดใช้งาน"
            unCheckedChildren="ปิดใช้งาน"
          />
          <Button onClick={() => setDraft(null)}>ยกเลิก</Button>
          <Button type="primary" onClick={submit} loading={save.isPending}>
            {draft.id ? 'บันทึก' : 'เพิ่ม'}
          </Button>
        </Flex>
      ) : (
        canCreate && (
          <Button
            icon={<PlusOutlined />}
            onClick={() => {
              setError(null);
              setDraft({ name: '', active: true });
            }}
            style={{ marginBottom: 16 }}
          >
            เพิ่ม Community
          </Button>
        )
      )}

      <Table<Community>
        rowKey="id"
        size="middle"
        pagination={false}
        loading={communities.isLoading}
        dataSource={communities.data}
        columns={[
          { title: 'รหัส', dataIndex: 'code', width: 100 },
          { title: 'ชื่อ Community', dataIndex: 'name' },
          { title: 'สถานที่', dataIndex: 'locationCount', width: 90, align: 'center' },
          {
            title: 'สถานะ',
            width: 130,
            render: (_, c) =>
              c.status === 'ACTIVE' ? (
                <StatusPill tone="success">เปิดใช้งาน</StatusPill>
              ) : (
                <StatusPill tone="neutral">ปิดใช้งาน</StatusPill>
              ),
          },
          {
            title: 'จัดการ',
            width: 90,
            align: 'center',
            render: (_, c) =>
              canManage &&
              c.canManage && (
                <Button
                  type="text"
                  aria-label={`แก้ไข ${c.name}`}
                  icon={<EditOutlined />}
                  onClick={() => edit(c)}
                />
              ),
          },
        ]}
      />
    </Modal>
  );
}
