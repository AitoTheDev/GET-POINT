import { SaveOutlined } from '@ant-design/icons';
import { formatThaiDateTime, type SettingKey } from '@getpoint/shared';
import { Alert, Button, Card, Flex, Typography } from 'antd';
import type { ReactNode } from 'react';
import type { SettingsPage } from '../../api/settings';

interface SettingCardProps {
  title: string;
  description?: ReactNode;
  /** Shows "last changed by" for this stored item. */
  settingKey?: SettingKey;
  changes?: SettingsPage['changes'];
  /** Present only for users who may change settings. */
  onSave?: () => void;
  saving?: boolean;
  error?: string | null;
  children: ReactNode;
}

/** One block on the Settings page: title, explanation, fields and its own save button. */
export function SettingCard({
  title,
  description,
  settingKey,
  changes,
  onSave,
  saving,
  error,
  children,
}: SettingCardProps) {
  const change = settingKey ? changes?.[settingKey] : undefined;
  return (
    <Card
      title={
        <Typography.Title level={4} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
      }
      styles={{ body: { padding: 24 } }}
    >
      {description && (
        <Typography.Paragraph type="secondary" style={{ marginTop: -4 }}>
          {description}
        </Typography.Paragraph>
      )}
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {children}
      {(onSave || change) && (
        <Flex justify="space-between" align="center" gap={12} wrap style={{ marginTop: 8 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {change
              ? `แก้ไขล่าสุด ${formatThaiDateTime(change.at)}${change.by ? ` โดย ${change.by}` : ''}`
              : 'ใช้ค่าเริ่มต้น'}
          </Typography.Text>
          {onSave && (
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={onSave}>
              บันทึก
            </Button>
          )}
        </Flex>
      )}
    </Card>
  );
}
