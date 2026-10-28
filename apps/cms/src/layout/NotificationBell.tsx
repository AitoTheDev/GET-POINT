import {
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { formatThaiDateTime } from '@getpoint/shared';
import { Badge, Button, Dropdown, Flex, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type NotificationItem, useNotifications } from '../api/reports';
import { colors } from '../theme';

const content: Record<
  NotificationItem['key'],
  {
    icon: React.ReactNode;
    title: (n: number) => string;
    detail: (oldest: string | null) => string;
    to: string;
  }
> = {
  'transfers-stopped': {
    icon: <ExclamationCircleOutlined style={{ color: colors.danger }} />,
    title: (n) => `ส่งแต้มไป LOGA ไม่สำเร็จ ${n.toLocaleString('en-US')} รายการ`,
    detail: () => 'ระบบหยุดส่งอัตโนมัติแล้ว กรุณาตรวจสอบและกดส่งซ้ำ',
    to: '/receipts/history?transferStatus=NEEDS_RETRY',
  },
  'receipts-waiting': {
    icon: <ClockCircleOutlined style={{ color: colors.warning }} />,
    title: (n) => `ใบเสร็จรอตรวจสอบเกิน 24 ชั่วโมง ${n.toLocaleString('en-US')} ใบ`,
    detail: (oldest) => (oldest ? `รอนานที่สุดตั้งแต่ ${formatThaiDateTime(oldest)}` : ''),
    to: '/receipts/review',
  },
};

/** Header bell: things that need someone to act (refreshed every minute). */
export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const notifications = useNotifications();
  const items = notifications.data?.items ?? [];
  const total = notifications.data?.total ?? 0;

  return (
    <Dropdown
      trigger={['click']}
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      popupRender={() => (
        <div
          role="dialog"
          aria-label="การแจ้งเตือน"
          style={{
            width: 'min(360px, calc(100vw - 32px))',
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 8px 28px rgba(31, 36, 48, 0.16)',
            padding: 8,
          }}
        >
          <Typography.Text strong style={{ display: 'block', padding: '8px 12px', fontSize: 16 }}>
            การแจ้งเตือน
          </Typography.Text>
          {items.length === 0 ? (
            <Flex
              vertical
              align="center"
              gap={6}
              style={{ padding: '20px 12px', color: colors.textMuted }}
            >
              <CheckCircleOutlined style={{ fontSize: 26, color: colors.success }} />
              ไม่มีเรื่องที่ต้องดำเนินการ
            </Flex>
          ) : (
            items.map((item) => {
              const c = content[item.key];
              return (
                <Button
                  key={item.key}
                  type="text"
                  block
                  onClick={() => {
                    setOpen(false);
                    navigate(c.to);
                  }}
                  style={{
                    height: 'auto',
                    padding: '10px 12px',
                    textAlign: 'left',
                    whiteSpace: 'normal',
                  }}
                >
                  <Flex gap={12} align="flex-start" style={{ width: '100%' }}>
                    <span style={{ fontSize: 20, lineHeight: 1 }}>{c.icon}</span>
                    <Flex vertical style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{c.title(item.count)}</span>
                      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                        {c.detail(item.oldestAt)}
                      </Typography.Text>
                    </Flex>
                    <RightOutlined
                      style={{ fontSize: 12, marginTop: 4, color: colors.textMuted }}
                    />
                  </Flex>
                </Button>
              );
            })
          )}
        </div>
      )}
    >
      <button
        type="button"
        aria-label={total ? `การแจ้งเตือน ${total} รายการ` : 'การแจ้งเตือน'}
        style={{ background: 'none', border: 0, padding: 4, cursor: 'pointer', lineHeight: 0 }}
      >
        <Badge
          count={total}
          size="small"
          overflowCount={99}
          color={colors.brandRed}
          offset={[-2, 2]}
        >
          <BellOutlined style={{ fontSize: 24, color: colors.ink }} />
        </Badge>
      </button>
    </Dropdown>
  );
}
