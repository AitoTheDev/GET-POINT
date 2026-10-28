import { CalendarOutlined } from '@ant-design/icons';
import { presetRange, type RangePreset, RangePresetLabel } from '@getpoint/shared';
import { DatePicker, Flex, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import buddhistEra from 'dayjs/plugin/buddhistEra';
import { todayInBangkok } from '../pages/point-rules/ruleDisplay';
import { rangeText, type RangeValue } from './dateRange';

dayjs.extend(buddhistEra);

const PRESETS: RangePreset[] = ['today', '7d', '30d', 'month', 'custom'];

/** Preset picker (วันนี้ / 7 วัน / 30 วัน / เดือนนี้ / กำหนดเอง) with a range picker for custom. */
export function DateRangeFilter({
  value,
  onChange,
  style,
}: {
  value: RangeValue;
  onChange: (value: RangeValue) => void;
  style?: React.CSSProperties;
}) {
  const today = todayInBangkok();
  return (
    <Flex gap={8} wrap style={style}>
      <Select<RangePreset>
        size="large"
        aria-label="ช่วงวันที่"
        value={value.preset}
        suffixIcon={<CalendarOutlined />}
        onChange={(preset) =>
          onChange(
            preset === 'custom' ? { ...value, preset } : { preset, ...presetRange(preset, today) },
          )
        }
        options={PRESETS.map((p) => ({ value: p, label: RangePresetLabel[p] }))}
        labelRender={() =>
          value.preset === 'custom'
            ? RangePresetLabel.custom
            : `${RangePresetLabel[value.preset]} · ${rangeText(value.from, value.to)}`
        }
        popupMatchSelectWidth={false}
        style={{ flex: '1 1 200px', minWidth: 0 }}
      />
      {value.preset === 'custom' && (
        <DatePicker.RangePicker
          size="large"
          aria-label="เลือกช่วงวันที่"
          format="DD/MM/BBBB"
          allowClear={false}
          value={[dayjs(value.from), dayjs(value.to)]}
          disabledDate={(d: Dayjs) => d.format('YYYY-MM-DD') > today}
          onChange={(range) => {
            if (range?.[0] && range[1]) {
              onChange({
                preset: 'custom',
                from: range[0].format('YYYY-MM-DD'),
                to: range[1].format('YYYY-MM-DD'),
              });
            }
          }}
          style={{ flex: '1 1 240px' }}
        />
      )}
    </Flex>
  );
}
