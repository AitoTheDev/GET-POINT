import { InputNumber, type InputNumberProps, Space } from 'antd';
import type { ReactNode } from 'react';

interface AddonNumberProps extends Omit<InputNumberProps<number>, 'addonBefore' | 'addonAfter'> {
  /** Text in front, e.g. "ยอดใช้จ่ายทุก" */
  before?: ReactNode;
  /** Text after, e.g. "บาท" */
  after?: ReactNode;
}

/**
 * Number input with labels joined on either side ("ยอดใช้จ่ายทุก [25] บาท").
 * Replaces InputNumber's deprecated addonBefore/addonAfter; works inside Form.Item.
 */
export function AddonNumber({ before, after, style, size, ...props }: AddonNumberProps) {
  return (
    <Space.Compact size={size} style={{ width: '100%', ...style }}>
      {before !== undefined && <Space.Addon>{before}</Space.Addon>}
      <InputNumber<number> {...props} style={{ width: '100%' }} />
      {after !== undefined && <Space.Addon>{after}</Space.Addon>}
    </Space.Compact>
  );
}
