import { SystemRole } from '@getpoint/shared';
import { Alert, Form, Input, Modal, Select, Switch } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { type ScopeInput, type UserRow, useCreateUser, useRoles } from '../../api/users';
import { ScopePicker } from './ScopePicker';

interface CreateUserForm {
  name: string;
  email: string;
  roleId: string;
  active: boolean;
  scope: ScopeInput;
}

interface CreateUserModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (user: UserRow, temporaryPassword: string) => void;
}

export function CreateUserModal({ open, onClose, onCreated }: CreateUserModalProps) {
  const [form] = Form.useForm<CreateUserForm>();
  const roles = useRoles();
  const createUser = useCreateUser();
  const [error, setError] = useState<string | null>(null);

  const roleId = Form.useWatch('roleId', form);
  const isAdminRole = roles.data?.find((r) => r.id === roleId)?.key === SystemRole.ADMIN;

  const submit = async () => {
    const values = await form.validateFields();
    setError(null);
    try {
      const result = await createUser.mutateAsync({
        name: values.name,
        email: values.email,
        roleId: values.roleId,
        status: values.active ? 'ACTIVE' : 'SUSPENDED',
        scope: values.scope,
      });
      form.resetFields();
      onCreated(result.user, result.temporaryPassword);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      title="เพิ่มผู้ใช้งาน"
      okText="เพิ่มผู้ใช้งาน"
      cancelText="ยกเลิก"
      onOk={submit}
      onCancel={() => {
        setError(null);
        onClose();
      }}
      confirmLoading={createUser.isPending}
      destroyOnHidden
      width={560}
    >
      <Form<CreateUserForm>
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve={false}
        initialValues={{ active: true, scope: { all: false, communityIds: [], locationIds: [] } }}
      >
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Form.Item
          label="ชื่อผู้ใช้งาน"
          name="name"
          rules={[{ required: true, whitespace: true, message: 'กรุณากรอกชื่อ' }]}
        >
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item
          label="อีเมล"
          name="email"
          rules={[
            { required: true, message: 'กรุณากรอกอีเมล' },
            { type: 'email', message: 'รูปแบบอีเมลไม่ถูกต้อง' },
          ]}
        >
          <Input placeholder="name@company.com" />
        </Form.Item>
        <Form.Item
          label="บทบาท"
          name="roleId"
          rules={[{ required: true, message: 'กรุณาเลือกบทบาท' }]}
        >
          <Select
            loading={roles.isLoading}
            options={roles.data?.map((r) => ({ value: r.id, label: r.name }))}
            placeholder="เลือกบทบาท"
          />
        </Form.Item>
        <Form.Item
          label="สถานที่ที่เข้าถึงได้"
          name="scope"
          rules={[
            {
              validator: (_, scope: ScopeInput) =>
                isAdminRole || scope.all || scope.communityIds.length || scope.locationIds.length
                  ? Promise.resolve()
                  : Promise.reject(new Error('กรุณาเลือกสถานที่อย่างน้อย 1 แห่ง')),
            },
          ]}
        >
          <ScopePicker forceAll={isAdminRole} />
        </Form.Item>
        <Form.Item label="สถานะบัญชี" name="active" valuePropName="checked">
          <Switch checkedChildren="เปิดใช้งาน" unCheckedChildren="ระงับ" />
        </Form.Item>
        <Alert
          type="info"
          showIcon
          message="ระบบจะสร้างรหัสผ่านชั่วคราวให้ และผู้ใช้งานต้องตั้งรหัสผ่านใหม่เมื่อเข้าสู่ระบบครั้งแรก"
        />
      </Form>
    </Modal>
  );
}
