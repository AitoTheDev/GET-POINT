import { Card, Flex, Skeleton, Typography } from 'antd';
import type { ReactNode } from 'react';
import { colors } from '../theme';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: number | undefined;
  /** e.g. "คน", "ร้าน", "แต้ม" */
  unit?: string;
  loading?: boolean;
  /** Tints the icon circle and value (mockups use green/orange/red for some cards). */
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}

const toneColors = {
  neutral: { fg: colors.ink, bg: '#F0F1F3' },
  success: { fg: colors.success, bg: colors.successBg },
  warning: { fg: colors.warning, bg: colors.warningBg },
  danger: { fg: colors.danger, bg: colors.dangerBg },
};

/** KPI tile used at the top of CMS pages: round icon, label, big number. */
export function StatCard({ icon, label, value, unit, loading, tone = 'neutral' }: StatCardProps) {
  const { fg, bg } = toneColors[tone];
  return (
    <Card styles={{ body: { padding: '22px 24px' } }} style={{ height: '100%' }}>
      <Flex gap={20} align="center">
        <Flex
          align="center"
          justify="center"
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: bg,
            color: fg,
            fontSize: 30,
            flex: 'none',
          }}
        >
          {icon}
        </Flex>
        <div>
          <Typography.Text style={{ fontSize: 17 }}>{label}</Typography.Text>
          {loading ? (
            <Skeleton.Input active size="small" style={{ display: 'block', marginTop: 6 }} />
          ) : (
            <div
              style={{
                fontSize: 36,
                fontWeight: 800,
                lineHeight: 1.2,
                color: tone === 'neutral' ? colors.ink : fg,
              }}
            >
              {value?.toLocaleString('en-US') ?? '-'}
              {unit && <span style={{ fontSize: 22, fontWeight: 700, marginLeft: 8 }}>{unit}</span>}
            </div>
          )}
        </div>
      </Flex>
    </Card>
  );
}
