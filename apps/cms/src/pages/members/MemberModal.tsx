import { PhoneOutlined } from '@ant-design/icons';
import { normalizeThaiMobile, THAI_MOBILE_MESSAGE } from '@getpoint/shared';
import { Alert, App, Form, Input, Modal, Select } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import {
  type Member,
  type MemberCommunity,
  useCreateMember,
  useUpdateMember,
} from '../../api/members';

interface MemberForm {
  communityId: string;
  phone: string;
  firstName: string;
  lastName?: string;
  note?: string;
}

interface MemberModalProps {
  open: boolean;
  /** null = add a new member */
  member: Member | null;
  communities: MemberCommunity[];
  onClose: () => void;
  onSaved: (member: Member) => void;
}

export function MemberModal({ open, member, communities, onClose, onSaved }: MemberModalProps) {
  const [form] = Form.useForm<MemberForm>();
  const { message } = App.useApp();
  const create = useCreateMember();
  const update = useUpdateMember();
  const [error, setError] = useState<string | null>(null);

  const activeCommunities = communities.filter((c) => c.status === 'ACTIVE');
  // LOGA finds members by phone, so a linked member's phone is fixed.
  const phoneLocked = member?.logaLinkStatus === 'LINKED';

  const submit = async () => {
    // Invalid fields are already shown under each input.
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setError(null);
    const fields = {
      phone: normalizeThaiMobile(values.phone)!,
      firstName: values.firstName.trim(),
      lastName: values.lastName?.trim() || null,
      note: values.note?.trim() || null,
    };
    try {
      const saved = member
        ? await update.mutateAsync({
            id: member.id,
            ...fields,
            ...(phoneLocked && { phone: undefined }),
          })
        : await create.mutateAsync({ communityId: values.communityId, ...fields });

      if (saved.logaLinkStatus === 'ERROR') {
        message.warning(`บันทึกสมาชิก ${saved.code} แล้ว แต่เชื่อม LOGA ไม่สำเร็จ`);
      } else if (!member) {
        message.success(`เพิ่มสมาชิก ${saved.code} และเชื่อม LOGA เรียบร้อยแล้ว`);
      } else {
        message.success('บันทึกข้อมูลสมาชิกเรียบร้อยแล้ว');
      }
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      title={member ? `แก้ไขสมาชิก ${member.code}` : 'เพิ่มสมาชิก'}
      okText={member ? 'บันทึก' : 'เพิ่มสมาชิก'}
      cancelText="ยกเลิก"
      onOk={submit}
      onCancel={onClose}
      confirmLoading={create.isPending || update.isPending}
      destroyOnHidden
    >
      <Form<MemberForm>
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve={false}
        initialValues={
          member
            ? {
                communityId: member.communityId,
                phone: member.phone,
                firstName: member.firstName,
                lastName: member.lastName ?? undefined,
                note: member.note ?? undefined,
              }
            : { communityId: activeCommunities.length === 1 ? activeCommunities[0].id : undefined }
        }
      >
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        {/* A member belongs to one Community; it can't be changed later. */}
        <Form.Item
          label="Community"
          name="communityId"
          hidden={Boolean(member) || activeCommunities.length === 1}
          rules={[{ required: true, message: 'กรุณาเลือก Community' }]}
        >
          <Select
            placeholder="เลือก Community"
            options={activeCommunities.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Form.Item>
        <Form.Item
          label="เบอร์โทรศัพท์"
          name="phone"
          extra={
            phoneLocked
              ? 'เปลี่ยนเบอร์ไม่ได้ เพราะ LOGA ใช้เบอร์นี้ระบุตัวสมาชิก'
              : 'เบอร์มือถือ 10 หลัก ใช้ค้นหาสมาชิกใน LOGA'
          }
          rules={[
            { required: true, message: 'กรุณากรอกเบอร์โทรศัพท์' },
            {
              validator: (_, value?: string) =>
                !value || normalizeThaiMobile(value)
                  ? Promise.resolve()
                  : Promise.reject(new Error(THAI_MOBILE_MESSAGE)),
            },
          ]}
        >
          <Input
            prefix={<PhoneOutlined />}
            inputMode="tel"
            maxLength={16}
            placeholder="เช่น 0812345678"
            disabled={phoneLocked}
          />
        </Form.Item>
        <Form.Item
          label="ชื่อ"
          name="firstName"
          rules={[{ required: true, whitespace: true, message: 'กรุณากรอกชื่อ' }]}
        >
          <Input maxLength={100} placeholder="เช่น สมชาย" />
        </Form.Item>
        <Form.Item label="นามสกุล" name="lastName">
          <Input maxLength={100} placeholder="ไม่บังคับ" />
        </Form.Item>
        <Form.Item label="หมายเหตุ (เห็นเฉพาะเจ้าหน้าที่)" name="note">
          <Input.TextArea maxLength={500} rows={3} showCount />
        </Form.Item>
        {!member && (
          <Alert
            type="info"
            showIcon
            message="ระบบจะสร้างรหัสสมาชิก (Mxxxx) ให้อัตโนมัติ และค้นหาเบอร์นี้ใน LOGA หากยังไม่มีจะสมัครสมาชิก LOGA ให้"
          />
        )}
      </Form>
    </Modal>
  );
}
