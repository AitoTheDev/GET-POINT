import { useLayoutEffect, useRef, useState } from 'react';

/** Single-series colour (validated for contrast on white) and chart neutrals. */
export const chartColors = {
  series: '#15845d',
  seriesFill: 'rgba(21, 132, 93, 0.14)',
  remainder: '#d9dce1',
  grid: '#eceef1',
  axis: '#8A909C',
};

const THAI_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

/** "2026-10-05" → "5 ต.ค." */
export function shortDay(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${d} ${THAI_MONTHS[m - 1]}`;
}

/** "2026-10-05" → "5 ต.ค. 2569" */
export function longDay(day: string): string {
  return `${shortDay(day)} ${Number(day.slice(0, 4)) + 543}`;
}

/** A round axis maximum and its tick values (about 4 steps); whole-number steps for counts. */
export function niceTicks(max: number, steps = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / steps;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10]
    .map((m) => m * magnitude)
    .find((s) => s >= raw && Number.isInteger(s))!;
  const ticks: number[] = [];
  for (let v = 0; v < max + step; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks.length < 2 ? [0, step] : ticks;
}

/** Indexes of x labels to show so they don't collide (always first and last). */
export function labelIndexes(count: number, width: number, labelWidth = 48): Set<number> {
  const fit = Math.max(2, Math.floor(width / labelWidth));
  if (count <= fit) return new Set(Array.from({ length: count }, (_, i) => i));
  const every = Math.ceil((count - 1) / (fit - 1));
  const shown = new Set<number>();
  for (let i = 0; i < count; i += every) shown.add(i);
  // Keep the last day, dropping a neighbour that would touch it.
  for (const i of shown) if (i !== 0 && count - 1 - i < every / 2) shown.delete(i);
  shown.add(count - 1);
  return shown;
}

/** Width of an element, kept up to date. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
