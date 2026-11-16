import { Params } from '@angular/router';
import { DashboardPeriodKey, PeriodRange } from '@zladovce/models';
import { formatDate } from '@zladovce/utilities';
import { compactParams } from './list-query';
import { fromIsoDate } from './serbian-dates';

/** The period every dashboard number, chart and report is computed for. */
export interface PeriodQuery {
  period: DashboardPeriodKey;
  /** `yyyy-MM-dd`, only for `custom` (empty otherwise). */
  from: string;
  to: string;
}

export const DEFAULT_PERIOD: DashboardPeriodKey = 'last30';

export const PERIOD_OPTIONS: readonly { value: DashboardPeriodKey; label: string }[] = [
  { value: 'today', label: 'Danas' },
  { value: 'yesterday', label: 'Juče' },
  { value: 'last7', label: 'Poslednjih 7 dana' },
  { value: 'last30', label: 'Poslednjih 30 dana' },
  { value: 'thisMonth', label: 'Ovaj mesec' },
  { value: 'lastMonth', label: 'Prošli mesec' },
  { value: 'thisYear', label: 'Ova godina' },
  { value: 'custom', label: 'Izabrani period' },
];

export const PERIOD_KEYS = PERIOD_OPTIONS.map((option) => option.value);

export function periodLabel(period: DashboardPeriodKey): string {
  return PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? '';
}

/** The API accepts custom ranges of at most three years. */
export const MAX_CUSTOM_DAYS = 3 * 366;

/** Days between two `yyyy-MM-dd` dates, inclusive (null when either is invalid). */
export function daysInRange(from: string, to: string): number | null {
  const start = fromIsoDate(from);
  const end = fromIsoDate(to);
  if (!start || !end) {
    return null;
  }
  return (
    Math.round(
      (Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
        Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) /
        86_400_000,
    ) + 1
  );
}

/** A custom range the API accepts: both dates valid, `from ≤ to`, at most three years. */
export function isValidCustomRange(from: string, to: string): boolean {
  const days = daysInRange(from, to);
  return days !== null && days >= 1 && days <= MAX_CUSTOM_DAYS;
}

/**
 * `?period=last7`, or `?period=custom&from=2026-11-01&to=2026-11-14`. A missing or unreadable
 * value falls back to the last 30 days, so a hand-edited address never breaks the page.
 */
export function parsePeriodQuery(params: Params): PeriodQuery {
  const raw: unknown = params['period'];
  const period =
    typeof raw === 'string' && (PERIOD_KEYS as readonly string[]).includes(raw)
      ? (raw as DashboardPeriodKey)
      : DEFAULT_PERIOD;
  if (period !== 'custom') {
    return { period, from: '', to: '' };
  }
  const from = typeof params['from'] === 'string' ? (params['from'] as string) : '';
  const to = typeof params['to'] === 'string' ? (params['to'] as string) : '';
  return isValidCustomRange(from, to)
    ? { period, from, to }
    : { period: DEFAULT_PERIOD, from: '', to: '' };
}

/** URL query: the default period is left out; `from`/`to` only for a custom range. */
export function periodQueryParams(query: PeriodQuery): Params {
  const custom = query.period === 'custom';
  return compactParams(
    { period: query.period, from: custom ? query.from : null, to: custom ? query.to : null },
    { period: DEFAULT_PERIOD },
  );
}

/** Query parameters for the API (`period`, plus `from`/`to` for a custom range). */
export function periodApiParams(query: PeriodQuery): Record<string, string> {
  return query.period === 'custom'
    ? { period: 'custom', from: query.from, to: query.to }
    : { period: query.period };
}

export function samePeriod(a: PeriodQuery, b: PeriodQuery): boolean {
  return a.period === b.period && a.from === b.from && a.to === b.to;
}

/** `1.11.2026. – 15.11.2026.`, or a single date for a one-day period. */
export function rangeText(range: PeriodRange | null | undefined): string {
  if (!range) {
    return '';
  }
  const from = formatIsoDay(range.from);
  const to = formatIsoDay(range.to);
  return from === to ? from : `${from} – ${to}`;
}

/** `2026-11-14` → `14.11.2026.` (calendar day, no time-zone shift). */
export function formatIsoDay(day: string): string {
  const date = fromIsoDate(day);
  return date
    ? formatDate(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)))
    : day;
}
