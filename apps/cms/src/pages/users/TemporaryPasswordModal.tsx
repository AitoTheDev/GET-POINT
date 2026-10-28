import { Alert, Modal, Typography } from 'antd';

interface TemporaryPasswordModalProps {
  /** null = closed */
  value: { name: string; email: string; password: string } | null;
  onClose: () => void;
}

/** Shows a temporary password exactly once (it is not stored anywhere readable). */
export function TemporaryPasswordModal({ value, onClose }: TemporaryPasswordModalProps) {
  return (
    <Modal
      open={Boolean(value)}
      title="รหัสผ่านชั่วคราว"
      onOk={onClose}
      onCancel={onClose}
      okText="คัดลอกแล้ว ปิดหน้าต่าง"
      cancelButtonProps={{ style: { display: 'none' } }}
      maskClosable={false}
      destroyOnHidden
    >
      {value && (
        <>
          <Typography.Paragraph>
            ส่งรหัสผ่านนี้ให้ <strong>{value.name}</strong> ({value.email}) เพื่อเข้าสู่ระบบครั้งแรก
            ระบบจะให้ตั้งรหัสผ่านใหม่ทันทีหลังเข้าสู่ระบบ
          </Typography.Paragraph>
          <Typography.Paragraph
            copyable={{ text: value.password, tooltips: ['คัดลอก', 'คัดลอกแล้ว'] }}
            style={{
              fontFamily: 'Consolas, "Courier New", monospace',
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: 3,
              textAlign: 'center',
              background: '#F6F7F9',
              border: '1px dashed #D0D3D9',
              borderRadius: 12,
              padding: '14px 12px',
            }}
          >
            {value.password}
          </Typography.Paragraph>
          <Alert
            type="warning"
            showIcon
            message="รหัสผ่านนี้จะแสดงเพียงครั้งเดียว หากปิดหน้าต่างแล้วต้องรีเซ็ตรหัสผ่านใหม่"
          />
        </>
      )}
    </Modal>
  );
}
