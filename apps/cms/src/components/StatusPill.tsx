import {
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  LoadingOutlined,
  MinusCircleFilled,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import { colors } from '../theme';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'loading';

const tones: Record<StatusTone, { color: string; background: string; icon: ReactNode }> = {
  success: { color: colors.success, background: colors.successBg, icon: <CheckCircleFilled /> },
  warning: { color: colors.warning, background: colors.warningBg, icon: <ClockCircleOutlined /> },
  danger: { color: colors.danger, background: colors.dangerBg, icon: <CloseCircleFilled /> },
  neutral: { color: colors.textMuted, background: '#F0F1F3', icon: <MinusCircleFilled /> },
  loading: { color: colors.textMuted, background: '#F0F1F3', icon: <LoadingOutlined /> },
};

/** Rounded status badge used across the CMS tables (e.g. อนุมัติแล้ว / รอตรวจสอบ / ไม่อนุมัติ). */
export function StatusPill({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const { color, background, icon } = tones[tone];
  return (
    <span
      data-tone={tone}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 12px',
        borderRadius: 999,
        color,
        background,
        fontWeight: 500,
        lineHeight: '26px',
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {children}
    </span>
  );
}
