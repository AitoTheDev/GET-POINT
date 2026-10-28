import { Card, Empty, Typography } from 'antd';
import { useLocation } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { findNavItem } from '../navigation';
import { SystemStatus } from './SystemStatus';

/** Stand-in for pages that later sessions will build. */
export function PlaceholderPage() {
  const { pathname } = useLocation();
  const item = findNavItem(pathname);
  if (!item) return null;

  return (
    <>
      <PageHeader title={item.label} />
      {item.path === '/' && <SystemStatus />}
      <Card>
        <Empty
          description={
            <Typography.Text type="secondary">
              หน้านี้จะพัฒนาใน Session {item.session}
            </Typography.Text>
          }
        />
      </Card>
    </>
  );
}
