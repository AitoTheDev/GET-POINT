import { CheckCircleFilled, MinusOutlined } from '@ant-design/icons';
import { type MenuPermission, MenuLabel } from '@getpoint/shared';
import { Checkbox, Table } from 'antd';
import { colors } from '../theme';

interface PermissionMatrixProps {
  value: MenuPermission[];
  /** Omit for a read-only matrix (green check / dash, as in the mockup). */
  onChange?: (next: MenuPermission[]) => void;
  disabled?: boolean;
}

const Granted = ({ on }: { on: boolean }) =>
  on ? (
    <CheckCircleFilled style={{ color: colors.success, fontSize: 18 }} aria-label="มีสิทธิ์" />
  ) : (
    <MinusOutlined style={{ color: colors.textMuted }} aria-label="ไม่มีสิทธิ์" />
  );

/** Menu × ดู / จัดการ grid. Ticking "จัดการ" also ticks "ดู"; unticking "ดู" clears "จัดการ". */
export function PermissionMatrix({ value, onChange, disabled }: PermissionMatrixProps) {
  const update = (menu: string, patch: Partial<MenuPermission>) => {
    onChange?.(
      value.map((p) => {
        if (p.menu !== menu) return p;
        const next = { ...p, ...patch };
        if (patch.canManage) next.canView = true;
        if (patch.canView === false) next.canManage = false;
        return next;
      }),
    );
  };

  return (
    <Table<MenuPermission>
      size="small"
      pagination={false}
      rowKey="menu"
      dataSource={value}
      columns={[
        {
          title: 'เมนู',
          dataIndex: 'menu',
          render: (menu: MenuPermission['menu']) => MenuLabel[menu],
        },
        {
          title: 'ดู',
          align: 'center',
          width: 90,
          render: (_, p) =>
            onChange ? (
              <Checkbox
                aria-label={`ดู ${MenuLabel[p.menu]}`}
                checked={p.canView}
                disabled={disabled}
                onChange={(e) => update(p.menu, { canView: e.target.checked })}
              />
            ) : (
              <Granted on={p.canView} />
            ),
        },
        {
          title: 'จัดการ',
          align: 'center',
          width: 90,
          render: (_, p) =>
            onChange ? (
              <Checkbox
                aria-label={`จัดการ ${MenuLabel[p.menu]}`}
                checked={p.canManage}
                disabled={disabled}
                onChange={(e) => update(p.menu, { canManage: e.target.checked })}
              />
            ) : (
              <Granted on={p.canManage} />
            ),
        },
      ]}
    />
  );
}
