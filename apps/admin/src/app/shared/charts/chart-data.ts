import { formatSerbianNumber } from '@zladovce/utilities';

/**
 * Chart colours. Brand-adjacent olive and clay, chosen so the two series stay apart for
 * colour-blind readers too (checked with the dataviz palette validator on white: lightness band,
 * chroma floor, CVD ΔE 8.1, normal-vision ΔE 17.8, contrast ≥ 3:1 – all pass).
 * Slot 1 is also the single-series colour. Text never uses these: labels stay in ink.
 */
export const CHART_COLORS = {
  series1: '#5f7020',
  series2: '#c4793f',
  grid: '#ebe4d4',
  axis: '#d8cdb5',
  surface: '#ffffff',
} as const;

const SHORT_MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'maj',
  'jun',
  'jul',
  'avg',
  'sep',
  'okt',
  'nov',
  'dec',
] as const;

const LONG_MONTHS = [
  'januar',
  'februar',
  'mart',
  'april',
  'maj',
  'jun',
  'jul',
  'avgust',
  'septembar',
  'oktobar',
  'novembar',
  'decembar',
] as const;

export type Granularity = 'Day' | 'Month';

/** Short x-axis label of a bucket: `14.11.` for a day, `nov 2026.` for a month. */
export function bucketShortLabel(from: string, granularity: Granularity): string {
  const [y, m, d] = from.split('-');
  if (!y || !m) {
    return from;
  }
  if (granularity === 'Month') {
    return `${SHORT_MONTHS[Number(m) - 1] ?? m} ${y}.`;
  }
  return `${Number(d)}.${Number(m)}.`;
}

/** Full label for tooltips and the table: `14.11.2026.` or `novembar 2026.` (cut months noted). */
export function bucketLongLabel(from: string, to: string, granularity: Granularity): string {
  const [y, m, d] = from.split('-');
  if (!y || !m) {
    return from;
  }
  if (granularity === 'Month') {
    const name = `${LONG_MONTHS[Number(m) - 1] ?? m} ${y}.`;
    const [, , toDay] = to.split('-');
    const lastDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
    const partial = Number(d) !== 1 || Number(toDay) !== lastDay;
    return partial ? `${name} (${Number(d)}.–${Number(toDay)}.)` : name;
  }
  return `${String(Number(d)).padStart(2, '0')}.${m}.${y}.`;
}

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

/** Data of one time chart: a label per bucket and one value per bucket for each series. */
export interface TimeChartData {
  labels: string[];
  longLabels: string[];
  series: ChartSeries[];
}

interface Bucket {
  from: string;
  to: string;
}

const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/**
 * Maps API series points (one per bucket, the API zero-fills empty days/months) to chart data.
 * Every bucket is kept in order, so an empty day shows as 0 instead of being skipped; a missing
 * or unreadable number counts as 0.
 */
export function toTimeChart<T extends Bucket>(
  points: readonly T[],
  granularity: Granularity,
  series: readonly { key: keyof T & string; label: string; color: string }[],
): TimeChartData {
  const sorted = [...points].sort((a, b) => a.from.localeCompare(b.from));
  return {
    labels: sorted.map((p) => bucketShortLabel(p.from, granularity)),
    longLabels: sorted.map((p) => bucketLongLabel(p.from, p.to, granularity)),
    series: series.map((s) => ({
      key: s.key,
      label: s.label,
      color: s.color,
      values: sorted.map((p) => num(p[s.key])),
    })),
  };
}

/**
 * Round axis steps (1, 2, 2.5, 5 × 10ⁿ) from 0 to at least `max`; `[0, 1]` for an empty chart.
 * `integers` (counts) never gives steps below 1 or fractions like 2,5.
 */
export function niceTicks(max: number, count = 4, integers = false): number[] {
  if (!Number.isFinite(max) || max <= 0) {
    return [0, 1];
  }
  const rough = integers ? Math.max(1, max / count) : max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const factors = integers && power < 10 ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  const step = (factors.find((f) => f * power >= rough) ?? 10) * power;
  const ticks: number[] = [];
  for (let value = 0; value < max + step * 0.999; value += step) {
    ticks.push(Math.round(value * 100) / 100);
  }
  return ticks.length < 2 ? [0, step] : ticks;
}

/** Axis text: whole numbers in full under 10.000, otherwise compact (`12 hilj.`, `1,2 mil.`). */
export function axisNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${formatSerbianNumber(Math.round(value / 100_000) / 10)} mil.`;
  }
  if (abs >= 10_000) {
    return `${formatSerbianNumber(Math.round(value / 100) / 10)} hilj.`;
  }
  return formatSerbianNumber(value);
}

/** Indexes of the x labels to print so they do not collide (always the first and the last). */
export function labelIndexes(count: number, maxLabels: number): number[] {
  if (count <= 0) {
    return [];
  }
  if (count <= maxLabels) {
    return Array.from({ length: count }, (_, i) => i);
  }
  const step = Math.ceil((count - 1) / Math.max(1, maxLabels - 1));
  const result: number[] = [];
  for (let i = 0; i < count; i += step) {
    result.push(i);
  }
  const lastShown = result[result.length - 1] ?? 0;
  if (lastShown !== count - 1) {
    // Replace a label that would sit too close to the last one.
    if (count - 1 - lastShown < step / 2 && result.length > 1) {
      result.pop();
    }
    result.push(count - 1);
  }
  return result;
}

export type TrendDirection = 'up' | 'down' | 'flat' | 'new';

export interface Trend {
  direction: TrendDirection;
  /** Change in percent (rounded to a whole number), null when it cannot be computed. */
  percent: number | null;
  /** `+12%`, `−5%`, `bez promene`, `novo`. */
  text: string;
  /** Whether the change is good news: depends on the number (more expenses is not). */
  tone: 'good' | 'bad' | 'neutral';
}

/**
 * Change against the previous period. Both zero → no change; previous zero and current not →
 * "novo" (a percentage would be meaningless); otherwise the rounded percentage.
 * `higherIsBetter` false is for expenses, cancellations and rejections.
 */
export function trend(current: number, previous: number, higherIsBetter = true): Trend {
  const c = num(current);
  const p = num(previous);
  if (c === p) {
    return { direction: 'flat', percent: 0, text: 'bez promene', tone: 'neutral' };
  }
  if (p === 0) {
    return {
      direction: 'new',
      percent: null,
      text: c > 0 ? 'novo u ovom periodu' : 'manje nego pre',
      tone: c > 0 === higherIsBetter ? 'good' : 'bad',
    };
  }
  const percent = Math.round(((c - p) / Math.abs(p)) * 100);
  const up = c > p;
  const shown = percent === 0 ? '<1' : String(Math.abs(percent));
  return {
    direction: up ? 'up' : 'down',
    percent,
    text: `${up ? '+' : '−'}${shown}%`,
    tone: up === higherIsBetter ? 'good' : 'bad',
  };
}
