import { LoadingOutlined } from '@ant-design/icons';
import { Tooltip, Typography } from 'antd';
import type { Balance } from '../../api/members';

const hints: Record<Exclude<Balance['status'], 'OK'>, { text: string; tip: string }> = {
  NOT_LINKED: { text: 'ยังไม่เชื่อม', tip: 'สมาชิกยังไม่ได้เชื่อมกับ LOGA' },
  NOT_FOUND: { text: 'ไม่พบใน LOGA', tip: 'LOGA ไม่พบรหัสสมาชิกนี้' },
  UNAVAILABLE: { text: '-', tip: 'ไม่สามารถดึงแต้มจาก LOGA ได้ในขณะนี้' },
};

/** แต้มคงเหลือ column: live points from LOGA, or why they can't be shown. */
export function BalanceCell({ balance, loading }: { balance?: Balance; loading: boolean }) {
  if (!balance) return loading ? <LoadingOutlined aria-label="กำลังโหลดแต้ม" /> : <>-</>;
  if (balance.status === 'OK') return <>{balance.points?.toLocaleString('en-US') ?? '-'}</>;
  const hint = hints[balance.status];
  return (
    <Tooltip title={hint.tip}>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {hint.text}
      </Typography.Text>
    </Tooltip>
  );
}
