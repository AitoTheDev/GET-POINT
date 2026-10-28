import { Alert, App, Form, Input, Modal, Select, Switch } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { type Location, type Shop, useSaveShop, useShopCategories } from '../../api/org';

interface ShopForm {
  locationId: string;
  name: string;
  categoryId?: string;
  receiptName?: string;
  participating: boolean;
  active: boolean;
}

interface ShopModalProps {
  open: boolean;
  /** null = add a new shop to `location` */
  shop: Shop | null;
  location: Location;
  /** Locations the user can move the shop to. */
  locations: Location[];
  onClose: () => void;
}

export function ShopModal({ open, shop, location, locations, onClose }: ShopModalProps) {
  const [form] = Form.useForm<ShopForm>();
  const { message } = App.useApp();
  const categories = useShopCategories();
  const save = useSaveShop();
  const [error, setError] = useState<string | null>(null);

  // Inactive categories can't be chosen, but the shop's current one stays visible.
  const categoryOptions = (categories.data ?? [])
    .filter((c) => c.status === 'ACTIVE' || c.id === shop?.categoryId)
    .map((c) => ({ value: c.id, label: c.status === 'ACTIVE' ? c.name : `${c.name} (ปิดใช้งาน)` }));

  const submit = async () => {
    const values = await form.validateFields();
    setError(null);
    try {
      const saved = await save.mutateAsync({
        id: shop?.id,
        locationId: values.locationId,
        name: values.name,
        categoryId: values.categoryId ?? null,
        receiptName: values.receiptName?.trim() || null,
        participating: values.participating,
        status: values.active ? 'ACTIVE' : 'INACTIVE',
      });
      message.success(
        shop ? 'บันทึกร้านค้าเรียบร้อยแล้ว' : `เพิ่มร้านค้า ${saved.code} เรียบร้อยแล้ว`,
      );
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      title={shop ? `แก้ไขร้านค้า ${shop.code}` : `เพิ่มร้านค้าใน ${location.name}`}
      okText={shop ? 'บันทึก' : 'เพิ่มร้านค้า'}
      cancelText="ยกเลิก"
      onOk={submit}
      onCancel={() => {
        setError(null);
        onClose();
      }}
      confirmLoading={save.isPending}
      destroyOnHidden
    >
      <Form<ShopForm>
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve={false}
        initialValues={
          shop
            ? {
                locationId: shop.locationId,
                name: shop.name,
                categoryId: shop.categoryId ?? undefined,
                receiptName: shop.receiptName ?? undefined,
                participating: shop.participating,
                active: shop.status === 'ACTIVE',
              }
            : { locationId: location.id, participating: true, active: true }
        }
      >
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Form.Item
          label="ชื่อร้านค้า"
          name="name"
          rules={[{ required: true, whitespace: true, message: 'กรุณากรอกชื่อร้านค้า' }]}
        >
          <Input maxLength={150} placeholder="เช่น ร้านกาแฟ A" />
        </Form.Item>
        <Form.Item label="หมวดหมู่" name="categoryId">
          <Select
            allowClear
            options={categoryOptions}
            loading={categories.isLoading}
            placeholder="เลือกหมวดหมู่"
          />
        </Form.Item>
        <Form.Item
          label="ชื่อร้านบนใบเสร็จ"
          name="receiptName"
          extra="ชื่อร้านตามที่พิมพ์บนใบเสร็จ ใช้ช่วยจับคู่ร้านค้าจากข้อมูลที่ AI อ่าน"
        >
          <Input maxLength={150} placeholder="เช่น CAFE A" />
        </Form.Item>
        {/* Always registered so its value is submitted; only editable when editing a shop. */}
        <Form.Item label="สถานที่" name="locationId" hidden={!shop}>
          <Select
            options={locations.map((l) => ({ value: l.id, label: `${l.name} (${l.code})` }))}
          />
        </Form.Item>
        <Form.Item label="ร่วมสะสมแต้ม" name="participating" valuePropName="checked">
          <Switch checkedChildren="ใช่" unCheckedChildren="ไม่" />
        </Form.Item>
        <Form.Item label="สถานะ" name="active" valuePropName="checked">
          <Switch checkedChildren="เปิดใช้งาน" unCheckedChildren="ปิดใช้งาน" />
        </Form.Item>
        {!shop && <Alert type="info" showIcon message="ระบบจะสร้างรหัสร้าน (Sxxx) ให้อัตโนมัติ" />}
      </Form>
    </Modal>
  );
}
