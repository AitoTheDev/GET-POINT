import { THAI_PROVINCES } from '@getpoint/shared';
import { Alert, App, AutoComplete, Form, Input, Modal, Select, Switch } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { type Location, useCommunities, useSaveLocation } from '../../api/org';
import { useAuth } from '../../auth/useAuth';

interface LocationForm {
  communityId: string;
  name: string;
  province?: string;
  active: boolean;
}

interface LocationModalProps {
  open: boolean;
  /** null = add a new location */
  location: Location | null;
  onClose: () => void;
  onSaved: (location: Location) => void;
}

const provinceOptions = THAI_PROVINCES.map((p) => ({ value: p }));

export function LocationModal({ open, location, onClose, onSaved }: LocationModalProps) {
  const [form] = Form.useForm<LocationForm>();
  const { message } = App.useApp();
  const { user } = useAuth();
  const communities = useCommunities();
  const save = useSaveLocation();
  const [error, setError] = useState<string | null>(null);

  // New locations can only go into Communities the user manages as a whole.
  const communityOptions = (communities.data ?? [])
    .filter((c) => c.canManage || c.id === location?.communityId)
    .map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }));
  // Moving a location to another Community needs access to everything.
  const canChangeCommunity = !location || Boolean(user?.scope.all);

  const submit = async () => {
    const values = await form.validateFields();
    setError(null);
    try {
      const saved = await save.mutateAsync({
        id: location?.id,
        communityId: values.communityId,
        name: values.name,
        province: values.province?.trim() || null,
        status: values.active ? 'ACTIVE' : 'INACTIVE',
      });
      message.success(
        location ? 'บันทึกสถานที่เรียบร้อยแล้ว' : `เพิ่มสถานที่ ${saved.code} เรียบร้อยแล้ว`,
      );
      onSaved(saved as Location);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      title={location ? `แก้ไขสถานที่ ${location.code}` : 'เพิ่มสถานที่'}
      okText={location ? 'บันทึก' : 'เพิ่มสถานที่'}
      cancelText="ยกเลิก"
      onOk={submit}
      onCancel={() => {
        setError(null);
        onClose();
      }}
      confirmLoading={save.isPending}
      destroyOnHidden
    >
      <Form<LocationForm>
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve={false}
        initialValues={
          location
            ? {
                communityId: location.communityId,
                name: location.name,
                province: location.province ?? undefined,
                active: location.status === 'ACTIVE',
              }
            : {
                active: true,
                communityId: communityOptions.length === 1 ? communityOptions[0].value : undefined,
              }
        }
      >
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Form.Item
          label="Community"
          name="communityId"
          rules={[{ required: true, message: 'กรุณาเลือก Community' }]}
        >
          <Select
            options={communityOptions}
            loading={communities.isLoading}
            disabled={!canChangeCommunity}
            placeholder="เลือก Community"
          />
        </Form.Item>
        <Form.Item
          label="ชื่อสถานที่"
          name="name"
          rules={[{ required: true, whitespace: true, message: 'กรุณากรอกชื่อสถานที่' }]}
        >
          <Input maxLength={150} placeholder="เช่น Community Mall A" />
        </Form.Item>
        <Form.Item label="จังหวัด" name="province">
          <AutoComplete
            options={provinceOptions}
            filterOption={(input, option) => Boolean(option?.value.includes(input.trim()))}
            placeholder="เช่น กรุงเทพมหานคร"
            allowClear
          />
        </Form.Item>
        <Form.Item label="สถานะ" name="active" valuePropName="checked">
          <Switch checkedChildren="เปิดใช้งาน" unCheckedChildren="ปิดใช้งาน" />
        </Form.Item>
        {!location && (
          <Alert type="info" showIcon message="ระบบจะสร้างรหัสสถานที่ (LOCxxx) ให้อัตโนมัติ" />
        )}
      </Form>
    </Modal>
  );
}
