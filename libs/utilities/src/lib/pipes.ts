import { Pipe, PipeTransform } from '@angular/core';
import { DateInput, formatDate, formatDateTime, formatLongDate, formatTime } from './format-date';
import { formatRsd } from './format-rsd';

/** `{{ 1200 | rsd }}` -> `1.200 RSD` */
@Pipe({ name: 'rsd' })
export class RsdPipe implements PipeTransform {
  transform(amount: number | null | undefined): string {
    return formatRsd(amount);
  }
}

export type SrDateFormat = 'date' | 'time' | 'dateTime' | 'long';

/** `{{ createdAt | srDate }}` -> `13.11.2026.`; formats: `date` (default), `time`, `dateTime`, `long`. */
@Pipe({ name: 'srDate' })
export class SrDatePipe implements PipeTransform {
  transform(value: DateInput, format: SrDateFormat = 'date'): string {
    switch (format) {
      case 'time':
        return formatTime(value);
      case 'dateTime':
        return formatDateTime(value);
      case 'long':
        return formatLongDate(value);
      default:
        return formatDate(value);
    }
  }
}
