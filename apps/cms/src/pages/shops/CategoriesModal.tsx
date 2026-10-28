import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Flex, Input, Modal, Popconfirm, Switch, Table } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import {
  type ShopCategory,
  useDeleteCategory,
  useSaveCategory,
  useShopCategories,
} from '../../api/org';
import { StatusPill } from '../../components/StatusPill';

interface Draft {
  id?: string;
  name: string;
  active: boolean;
}

/** Admin-only: manage the shop category list (หมวดหมู่). */
export function CategoriesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const categories = useShopCategories();
  const save = useSaveCategory();
  const remove = useDeleteCategory();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!draft?.name.trim()) {
      setError('กรุณากรอกชื่อหมวดหมู่');
      return;
    }
    setError(null);
    try {
      await save.mutateAsync({
        id: draft.id,
        name: draft.name.trim(),
        status: draft.active ? 'ACTIVE' : 'INACTIVE',
        // New categories go to the end of the list.
        ...(!draft.id && { sortOrder: (categories.data?.length ?? 0) + 1 }),
      });
      message.success('บันทึกหมวดหมู่เรียบร้อยแล้ว');
      setDraft(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const onDelete = async (c: ShopCategory) => {
    try {
      await remove.mutateAsync(c.id);
      message.success(`ลบหมวดหมู่ ${c.name} แล้ว`);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      title="หมวดหมู่ร้านค้า"
      footer={null}
      onCancel={onClose}
      width={640}
      destroyOnHidden
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
      {draft ? (
        <Flex gap={12} align="center" wrap style={{ marginBottom: 16 }}>
          <Input
            aria-label="ชื่อหมวดหมู่"
            autoFocus
            value={draft.name}
            maxLength={100}
            placeholder="ชื่อหมวดหมู่"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            onPressEnter={submit}
            style={{ flex: '1 1 200px' }}
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
        <Button
          icon={<PlusOutlined />}
          onClick={() => {
            setError(null);
            setDraft({ name: '', active: true });
          }}
          style={{ marginBottom: 16 }}
        >
          เพิ่มหมวดหมู่
        </Button>
      )}

      <Table<ShopCategory>
        rowKey="id"
        size="middle"
        pagination={false}
        loading={categories.isLoading}
        dataSource={categories.data}
        columns={[
          { title: 'หมวดหมู่', dataIndex: 'name' },
          { title: 'ร้านค้า', dataIndex: 'shopCount', width: 90, align: 'center' },
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
            width: 110,
            align: 'center',
            render: (_, c) => (
              <Flex justify="center">
                <Button
                  type="text"
                  aria-label={`แก้ไข ${c.name}`}
                  icon={<EditOutlined />}
                  onClick={() => {
                    setError(null);
                    setDraft({ id: c.id, name: c.name, active: c.status === 'ACTIVE' });
                  }}
                />
                {c.shopCount === 0 && (
                  <Popconfirm
                    title={`ลบหมวดหมู่ ${c.name}?`}
                    okText="ลบ"
                    cancelText="ยกเลิก"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => onDelete(c)}
                  >
                    <Button
                      type="text"
                      danger
                      aria-label={`ลบ ${c.name}`}
                      icon={<DeleteOutlined />}
                    />
                  </Popconfirm>
                )}
              </Flex>
            ),
          },
        ]}
      />
      <Alert
        type="info"
        showIcon
        style={{ marginTop: 12 }}
        message="หมวดหมู่ที่มีร้านค้าใช้อยู่ลบไม่ได้ ให้ปิดใช้งานแทน ร้านเดิมจะยังแสดงหมวดหมู่นี้"
      />
    </Modal>
  );
}
