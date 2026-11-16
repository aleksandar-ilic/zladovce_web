import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CHART_COLORS } from './chart-data';
import { ChartValueFormat, formatChartValue } from './time-chart';

export interface BarListItem {
  key: string;
  label: string;
  value: number;
  /** Extra text after the value, e.g. `3 kom.` next to revenue. */
  note?: string;
}

/**
 * Ranked horizontal bars (top products, sales by category, orders by status): one hue, one
 * baseline, the value printed at the end of every row, so nothing depends on hovering or on colour.
 * It is a real list: screen readers read "name: value" row by row.
 */
@Component({
  selector: 'adm-bar-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (rows().length === 0) {
      <p class="py-4 text-sm text-ink-700" data-testid="bar-list-empty">{{ emptyText() }}</p>
    } @else {
      <ul class="flex flex-col gap-3" [attr.aria-label]="label()" data-testid="bar-list">
        @for (row of rows(); track row.key) {
          <li class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
            <span class="min-w-0 truncate text-sm text-ink-900" [title]="row.label"
              >{{ row.label }}<span class="sr-only">: </span></span
            >
            <span class="text-right text-sm font-semibold tabular-nums text-ink-900"
              >{{ row.text }}
              @if (row.note) {
                <span class="font-normal text-ink-500"> · {{ row.note }}</span>
              }
            </span>
            <span class="col-span-2 block h-2 rounded-full bg-cream-100" aria-hidden="true">
              @if (row.percent > 0) {
                <span
                  class="block h-2 rounded-full"
                  [style.width.%]="row.percent"
                  [style.background]="color"
                ></span>
              }
            </span>
          </li>
        }
      </ul>
    }
  `,
})
export class BarList {
  readonly items = input.required<readonly BarListItem[]>();
  readonly format = input<ChartValueFormat>('rsd');
  readonly label = input.required<string>();
  readonly emptyText = input('U ovom periodu nema podataka.');
  /** Keep the given order (e.g. statuses) instead of largest first. */
  readonly keepOrder = input(false);

  protected readonly color = CHART_COLORS.series1;

  protected readonly rows = computed(() => {
    const items = this.keepOrder()
      ? [...this.items()]
      : [...this.items()].sort((a, b) => b.value - a.value);
    const max = Math.max(0, ...items.map((item) => item.value));
    return items.map((item) => ({
      ...item,
      text: formatChartValue(item.value, this.format()),
      percent: max > 0 ? Math.max(item.value > 0 ? 1 : 0, (item.value / max) * 100) : 0,
    }));
  });
}
