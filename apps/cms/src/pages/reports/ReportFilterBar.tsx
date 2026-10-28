import { SearchOutlined } from '@ant-design/icons';
import { Button, Card, Flex } from 'antd';
import type { ReactNode } from 'react';

/** Filter row of a report: the fields, then "แสดงรายงาน" (nothing reloads until it is pressed). */
export function ReportFilterBar({
  children,
  onApply,
}: {
  children: ReactNode;
  onApply: () => void;
}) {
  return (
    <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
      <Flex gap={12} wrap>
        {children}
        <Button
          type="primary"
          size="large"
          icon={<SearchOutlined />}
          onClick={onApply}
          style={{ flex: '0 0 180px' }}
        >
          แสดงรายงาน
        </Button>
      </Flex>
    </Card>
  );
}

/** Small grey note under a card or table (ⓘ …). */
export function Note({ children }: { children: ReactNode }) {
  return (
    <div style={{ color: '#8A909C', fontSize: 13, marginTop: 8 }}>
      <span aria-hidden style={{ marginRight: 6 }}>
        ⓘ
      </span>
      {children}
    </div>
  );
}
