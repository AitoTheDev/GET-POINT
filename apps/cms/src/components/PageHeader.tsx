import { Flex, Typography } from 'antd';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Right-aligned actions (filters, Export, Add buttons). */
  extra?: ReactNode;
}

/** Large page title block used at the top of every CMS page. */
export function PageHeader({ title, subtitle, extra }: PageHeaderProps) {
  return (
    <Flex justify="space-between" align="flex-start" gap={16} wrap style={{ marginBottom: 24 }}>
      <div>
        <Typography.Title level={1} style={{ margin: 0, fontSize: 38, fontWeight: 800 }}>
          {title}
        </Typography.Title>
        {subtitle && <Typography.Text type="secondary">{subtitle}</Typography.Text>}
      </div>
      {extra}
    </Flex>
  );
}
