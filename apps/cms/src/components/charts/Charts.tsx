import { Empty, Flex, Typography } from 'antd';
import { type ReactNode, useState } from 'react';
import { colors } from '../../theme';
import { chartColors, labelIndexes, longDay, niceTicks, shortDay, useWidth } from './chartUtils';

const tooltipStyle = {
  position: 'absolute',
  pointerEvents: 'none',
  background: '#fff',
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  boxShadow: '0 4px 14px rgba(31, 36, 48, 0.12)',
  padding: '6px 10px',
  fontSize: 13,
  whiteSpace: 'nowrap',
  transform: 'translate(-50%, calc(-100% - 10px))',
  zIndex: 2,
} as const;

function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div role="tooltip" style={{ ...tooltipStyle, left: x, top: y }}>
      {children}
    </div>
  );
}

const PAD = { top: 22, right: 12, bottom: 28, left: 44 };

/**
 * One value per day: an area line (trend) or columns (counts).
 * Hover shows the day and value; labels are thinned so they never collide.
 */
export function DayChart({
  data,
  kind,
  unit,
  height = 240,
}: {
  data: { day: string; count: number }[];
  kind: 'area' | 'columns';
  /** e.g. "ใบ", "คน" (tooltip) */
  unit: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...data.map((d) => d.count));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const slot = data.length ? plotW / data.length : 0;
  const cx = (i: number) => PAD.left + slot * (i + 0.5);
  const cy = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const shownX = labelIndexes(data.length, plotW);
  // Numbers on the marks only when there is room; otherwise just the highest day.
  const few = data.length <= 14 && slot >= 30;
  const maxIndex = data.findIndex((d) => d.count === max);
  const showValue = (i: number) => data[i].count > 0 && (few || i === maxIndex);
  const total = data.reduce((n, d) => n + d.count, 0);

  const line = data.map((d, i) => `${i ? 'L' : 'M'}${cx(i)},${cy(d.count)}`).join(' ');
  const area = data.length ? `${line} L${cx(data.length - 1)},${cy(0)} L${cx(0)},${cy(0)} Z` : '';
  const barW = Math.min(36, Math.max(2, slot - 2));

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`รวม ${total.toLocaleString('en-US')} ${unit} ใน ${data.length} วัน`}
          onMouseLeave={() => setHover(null)}
          style={{ display: 'block', fontFamily: 'inherit' }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={cy(t)}
                y2={cy(t)}
                stroke={t === 0 ? colors.border : chartColors.grid}
              />
              <text
                x={PAD.left - 8}
                y={cy(t) + 4}
                textAnchor="end"
                fontSize={12}
                fill={chartColors.axis}
              >
                {t.toLocaleString('en-US')}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            shownX.has(i) ? (
              <text
                key={d.day}
                x={cx(i)}
                y={height - 8}
                textAnchor="middle"
                fontSize={12}
                fill={chartColors.axis}
              >
                {shortDay(d.day)}
              </text>
            ) : null,
          )}

          {kind === 'area' ? (
            <>
              <path d={area} fill={chartColors.seriesFill} />
              <path d={line} fill="none" stroke={chartColors.series} strokeWidth={2} />
              {hover !== null && (
                <line
                  x1={cx(hover)}
                  x2={cx(hover)}
                  y1={PAD.top}
                  y2={cy(0)}
                  stroke={chartColors.axis}
                  strokeDasharray="3 3"
                />
              )}
              {data.map((d, i) =>
                few || hover === i ? (
                  <circle
                    key={d.day}
                    cx={cx(i)}
                    cy={cy(d.count)}
                    r={hover === i ? 5.5 : 4}
                    fill="#fff"
                    stroke={chartColors.series}
                    strokeWidth={2}
                  />
                ) : null,
              )}
            </>
          ) : (
            data.map((d, i) => {
              const h = cy(0) - cy(d.count);
              const x = cx(i) - barW / 2;
              const r = Math.min(4, barW / 2, h);
              return h > 0 ? (
                <path
                  key={d.day}
                  d={`M${x},${cy(0)} V${cy(d.count) + r} Q${x},${cy(d.count)} ${x + r},${cy(d.count)} H${x + barW - r} Q${x + barW},${cy(d.count)} ${x + barW},${cy(d.count) + r} V${cy(0)} Z`}
                  fill={chartColors.series}
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              ) : null;
            })
          )}

          {data.map((d, i) =>
            showValue(i) && hover !== i ? (
              <text
                key={d.day}
                x={cx(i)}
                y={cy(d.count) - 8}
                textAnchor="middle"
                fontSize={12}
                fill={colors.text}
              >
                {d.count.toLocaleString('en-US')}
              </text>
            ) : null,
          )}

          {/* Hit areas: the whole column of each day. */}
          {data.map((d, i) => (
            <rect
              key={d.day}
              data-testid="chart-hit"
              x={PAD.left + slot * i}
              y={PAD.top}
              width={slot}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={cx(hover)} y={cy(data[hover].count)}>
          <div style={{ color: colors.textMuted }}>{longDay(data[hover].day)}</div>
          <strong>
            {data[hover].count.toLocaleString('en-US')} {unit}
          </strong>
        </Tooltip>
      )}
    </div>
  );
}

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Share of a whole, with the total in the middle and a legend (label + value) beside it. */
export function Donut({
  slices,
  centerLabel,
  unit,
  legendUnit,
  size = 200,
}: {
  slices: DonutSlice[];
  centerLabel: string;
  /** e.g. "รายการ", "คน" */
  unit: string;
  /** Unit after each legend value (mockups: none on the Dashboard, "คน" on members). */
  legendUnit?: string;
  size?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((n, s) => n + s.value, 0);
  const stroke = size * 0.16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // A 2px gap between slices (none when one slice is the whole ring).
  const parts = slices.filter((s) => s.value > 0);
  const gap = parts.length > 1 ? 2 : 0;
  let offset = 0;

  return (
    <Flex align="center" justify="center" gap={28} wrap>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg
          width={size}
          height={size}
          role="img"
          aria-label={slices.map((s) => `${s.label} ${s.value}`).join(', ')}
          style={{ transform: 'rotate(-90deg)', display: 'block' }}
          onMouseLeave={() => setHover(null)}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#F0F1F3"
            strokeWidth={stroke}
          />
          {total > 0 &&
            parts.map((s) => {
              const len = (s.value / total) * c;
              const dash = `${Math.max(0, len - gap)} ${c - Math.max(0, len - gap)}`;
              const el = (
                <circle
                  key={s.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={hover === s.key ? stroke + 6 : stroke}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  onMouseEnter={() => setHover(s.key)}
                  style={{ transition: 'stroke-width 120ms' }}
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        <Flex
          vertical
          align="center"
          justify="center"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', lineHeight: 1.2 }}
        >
          {hover ? (
            <>
              <Typography.Text type="secondary">
                {slices.find((s) => s.key === hover)!.label}
              </Typography.Text>
              <span style={{ fontSize: 30, fontWeight: 800 }}>
                {total ? Math.round((slices.find((s) => s.key === hover)!.value / total) * 100) : 0}
                %
              </span>
            </>
          ) : (
            <>
              <Typography.Text type="secondary">{centerLabel}</Typography.Text>
              <span style={{ fontSize: 32, fontWeight: 800 }}>{total.toLocaleString('en-US')}</span>
              <Typography.Text type="secondary">{unit}</Typography.Text>
            </>
          )}
        </Flex>
      </div>
      <Flex vertical gap={14} style={{ minWidth: 170 }}>
        {slices.map((s) => (
          <Flex
            key={s.key}
            align="center"
            gap={10}
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: s.color,
                flex: 'none',
              }}
            />
            <span style={{ flex: 1, fontSize: 16 }}>{s.label}</span>
            <strong style={{ fontSize: 18, marginLeft: 16 }}>
              {s.value.toLocaleString('en-US')}
              {legendUnit && ` ${legendUnit}`}
            </strong>
          </Flex>
        ))}
      </Flex>
    </Flex>
  );
}

/** Ranked horizontal bars with the value at the end of each bar. */
export function BarList({
  rows,
  format = (v) => v.toLocaleString('en-US'),
  limit = 8,
}: {
  rows: { key: string; label: string; value: number }[];
  format?: (v: number) => string;
  limit?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const shown = [...rows].sort((a, b) => b.value - a.value).slice(0, limit);
  const max = Math.max(0, ...shown.map((r) => r.value));
  if (!shown.length)
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="ไม่มีข้อมูล" />;
  return (
    <Flex vertical gap={10} role="list">
      {shown.map((r) => (
        <Flex
          key={r.key}
          role="listitem"
          align="center"
          gap={12}
          onMouseEnter={() => setHover(r.key)}
          onMouseLeave={() => setHover(null)}
        >
          <Typography.Text ellipsis={{ tooltip: r.label }} style={{ width: 130, flex: 'none' }}>
            {r.label}
          </Typography.Text>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div
              style={{
                height: 22,
                width: `${max ? Math.max(1, (r.value / max) * 80) : 0}%`,
                background: chartColors.series,
                borderRadius: '0 4px 4px 0',
                opacity: hover === null || hover === r.key ? 1 : 0.55,
              }}
            />
            <span style={{ whiteSpace: 'nowrap', fontSize: 14 }}>{format(r.value)}</span>
          </div>
        </Flex>
      ))}
      {rows.length > limit && (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          แสดง {limit} อันดับแรกจาก {rows.length} ร้าน (ดูทั้งหมดในตารางด้านล่าง)
        </Typography.Text>
      )}
    </Flex>
  );
}
