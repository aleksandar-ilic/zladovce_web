export const SERBIAN_LOCALE = 'sr-Latn-RS';
export const SERBIAN_TIME_ZONE = 'Europe/Belgrade';

export type DateInput = Date | string | number | null | undefined;

/** Month names in the nominative, as written in Serbian dates ("13. novembar 2026."). */
const MONTHS = [
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

interface BelgradeParts {
  day: number;
  month: number;
  year: number;
  hour: number;
  minute: number;
}

// Only numeric parts are taken from Intl, so the output does not depend on the ICU
// version of the runtime (browser, Node during prerender, test runner).
const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SERBIAN_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function belgradeParts(date: Date): BelgradeParts {
  const parts: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== 'literal') {
      parts[part.type] = Number(part.value);
    }
  }
  return {
    day: parts['day'] ?? 0,
    month: parts['month'] ?? 0,
    year: parts['year'] ?? 0,
    hour: parts['hour'] ?? 0,
    minute: parts['minute'] ?? 0,
  };
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** `13.11.2026.` – date in Serbian local time. Empty string for missing or invalid input. */
export function formatDate(value: DateInput): string {
  const date = toDate(value);
  if (!date) {
    return '';
  }
  const p = belgradeParts(date);
  return `${pad(p.day)}.${pad(p.month)}.${p.year}.`;
}

/** `22:05` – 24-hour time in Serbian local time. */
export function formatTime(value: DateInput): string {
  const date = toDate(value);
  if (!date) {
    return '';
  }
  const p = belgradeParts(date);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** `13.11.2026. 22:05` – date and time in Serbian local time. */
export function formatDateTime(value: DateInput): string {
  const date = toDate(value);
  return date ? `${formatDate(date)} ${formatTime(date)}` : '';
}

/** `13. novembar 2026.` – long date for articles and emails-like texts. */
export function formatLongDate(value: DateInput): string {
  const date = toDate(value);
  if (!date) {
    return '';
  }
  const p = belgradeParts(date);
  return `${p.day}. ${MONTHS[p.month - 1] ?? ''} ${p.year}.`;
}
