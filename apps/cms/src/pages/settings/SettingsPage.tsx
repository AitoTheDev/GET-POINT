import { Menu } from '@getpoint/shared';
import { Alert, Skeleton, Tabs } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { useSettings } from '../../api/settings';
import { useAuth } from '../../auth/useAuth';
import { PageHeader } from '../../components/PageHeader';
import { LogaTab } from './LogaTab';
import { OrganisationTab } from './OrganisationTab';
import { ReceiptsTab } from './ReceiptsTab';
import { SystemTab } from './SystemTab';

/** "ตั้งค่า" (no mockup; same style as the other pages). Changing needs Settings "manage". */
export function SettingsPage() {
  const { can } = useAuth();
  const canManage = can(Menu.SETTINGS, 'manage');
  const settings = useSettings();
  const data = settings.data;
  const [tab, setTab] = useState('loga');

  return (
    <>
      <PageHeader title="ตั้งค่า" />
      {settings.isError && <Alert type="error" showIcon message={errorMessage(settings.error)} />}
      {settings.isLoading && <Skeleton active paragraph={{ rows: 8 }} />}
      {data && (
        <>
          {!canManage && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="คุณดูการตั้งค่าได้อย่างเดียว การแก้ไขต้องใช้สิทธิ์จัดการตั้งค่า"
            />
          )}
          <Tabs
            size="large"
            // Each card keeps its own form state (already equal to what it saved), so a save
            // in one card never clears unsaved edits in another.
            activeKey={tab}
            onChange={setTab}
            items={[
              {
                key: 'loga',
                label: 'LOGA และการส่งแต้ม',
                children: <LogaTab data={data} canManage={canManage} />,
              },
              {
                key: 'receipts',
                label: 'ใบเสร็จ',
                children: <ReceiptsTab data={data} canManage={canManage} />,
              },
              {
                key: 'organisation',
                label: 'องค์กร',
                children: <OrganisationTab data={data} canManage={canManage} />,
              },
              {
                key: 'system',
                label: 'ระบบ',
                children: <SystemTab data={data} canManage={canManage} />,
              },
            ]}
          />
        </>
      )}
    </>
  );
}
