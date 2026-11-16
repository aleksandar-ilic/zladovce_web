import { Injectable, Provider } from '@angular/core';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
  MatDateFormats,
  NativeDateAdapter,
} from '@angular/material/core';
import { SERBIAN_LOCALE, SERBIAN_TIME_ZONE } from '@zladovce/utilities';

const pad = (value: number): string => String(value).padStart(2, '0');

/** `yyyy-MM-dd` of a picker date (the calendar day the administrator chose). */
export function toIsoDate(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Picker date (local midnight) of `yyyy-MM-dd`, or null. */
export function fromIsoDate(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) {
    return null;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return toIsoDate(date) === value ? date : null;
}

const belgradeParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: SERBIAN_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

function partsAt(instant: number): Record<string, number> {
  const parts: Record<string, number> = {};
  for (const part of belgradeParts.formatToParts(new Date(instant))) {
    if (part.type !== 'literal') {
      parts[part.type] = Number(part.value);
    }
  }
  return parts;
}

/** `yyyy-MM-dd` of an instant in Serbian local time (Europe/Belgrade). */
export function belgradeDate(instant: string | number | Date = Date.now()): string {
  const ms = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  const p = partsAt(ms);
  return `${p['year']}-${pad(p['month'] ?? 0)}-${pad(p['day'] ?? 0)}`;
}

/** Offset of Belgrade from UTC at an instant, in milliseconds (+1 h or +2 h). */
function belgradeOffset(instant: number): number {
  const p = partsAt(instant);
  const local = Date.UTC(p['year']!, p['month']! - 1, p['day']!, p['hour']!, p['minute']!);
  return local - Math.floor(instant / 60_000) * 60_000;
}

/**
 * The instant to send for a Serbian calendar day chosen in a form (shipment or payment date):
 * `null` for today (the API then uses "now"), otherwise noon of that day in Belgrade, never before
 * `notBefore` (the order's time, the API refuses earlier dates) and never in the future.
 */
export function instantForSerbianDate(
  day: string,
  options: { notBefore?: string | null; now?: number } = {},
): string | null {
  const now = options.now ?? Date.now();
  if (!day || day >= belgradeDate(now)) {
    return null;
  }
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 12, 0);
  let instant = guess - belgradeOffset(guess);
  const floor = options.notBefore ? new Date(options.notBefore).getTime() : Number.NaN;
  if (!Number.isNaN(floor) && instant < floor) {
    instant = floor;
  }
  return new Date(Math.min(instant, now)).toISOString();
}

/**
 * The instant of a Serbian local date and time (`2026-11-20`, `08:30`), e.g. when a blog post
 * should appear. Null for an unreadable date or time.
 */
export function belgradeInstant(day: string, time: string): string | null {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const clock = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!date || !clock || Number(clock[1]) > 23 || Number(clock[2]) > 59) {
    return null;
  }
  const guess = Date.UTC(
    Number(date[1]),
    Number(date[2]) - 1,
    Number(date[3]),
    Number(clock[1]),
    Number(clock[2]),
  );
  // Two passes: the offset can differ on either side of a daylight-saving change.
  let instant = guess - belgradeOffset(guess);
  instant = guess - belgradeOffset(instant);
  return new Date(instant).toISOString();
}

/** `HH:mm` of an instant in Serbian local time. */
export function belgradeTime(instant: string | number | Date = Date.now()): string {
  const ms = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  const p = partsAt(ms);
  return `${pad(p['hour'] ?? 0)}:${pad(p['minute'] ?? 0)}`;
}

export const SERBIAN_DATE_FORMATS: MatDateFormats = {
  parse: { dateInput: null },
  display: {
    dateInput: 'input',
    monthYearLabel: { year: 'numeric', month: 'long' },
    dateA11yLabel: { year: 'numeric', month: 'long', day: 'numeric' },
    monthYearA11yLabel: { year: 'numeric', month: 'long' },
  },
};

/**
 * Date picker adapter for Serbian dates: typed and shown as `14.11.2026.` (the trailing dot is
 * optional when typing), weeks start on Monday, month names in Serbian Latin.
 */
@Injectable()
export class SerbianDateAdapter extends NativeDateAdapter {
  override getFirstDayOfWeek(): number {
    return 1;
  }

  override parse(value: unknown): Date | null {
    if (typeof value === 'string') {
      const match = /^\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\.?\s*$/.exec(value);
      if (!match) {
        return value.trim() === '' ? null : this.invalid();
      }
      const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
      return date.getDate() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1
        ? date
        : this.invalid();
    }
    return value instanceof Date ? new Date(value.getTime()) : null;
  }

  override format(date: Date, displayFormat: object | string): string {
    if (displayFormat === 'input') {
      return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}.`;
    }
    return super.format(date, displayFormat as object);
  }
}

/** Providers for every page with a date picker (kept out of the initial bundle). */
export const SERBIAN_DATES: Provider[] = [
  { provide: MAT_DATE_LOCALE, useValue: SERBIAN_LOCALE },
  { provide: DateAdapter, useClass: SerbianDateAdapter },
  { provide: MAT_DATE_FORMATS, useValue: SERBIAN_DATE_FORMATS },
];
