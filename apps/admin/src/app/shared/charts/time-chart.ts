import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { formatRsd, formatSerbianNumber } from '@zladovce/utilities';
import { axisNumber, CHART_COLORS, labelIndexes, niceTicks, TimeChartData } from './chart-data';

export type ChartValueFormat = 'rsd' | 'count';

const HEIGHT = 240;
const MARGIN = { top: 12, right: 16, bottom: 30, left: 60 };
const DEFAULT_WIDTH = 640;

let nextId = 0;

/** `1.200 RSD` or `12`. */
export function formatChartValue(value: number, format: ChartValueFormat): string {
  return format === 'rsd' ? formatRsd(value) : formatSerbianNumber(value);
}

/**
 * Time chart drawn as plain SVG: lines (one or two series, e.g. ordered vs delivered value) or
 * columns (one series, e.g. orders per day). Thin marks, hairline grid, one y-axis that starts
 * at 0, a legend for two series.
 *
 * Interaction: the pointer (or the arrow keys once the chart has focus) selects the nearest
 * day/month; a tooltip lists every series for it. Tooltips never gate: "Prikaži tabelu" switches
 * to a table with every value, and the chart has a text summary for screen readers.
 */
@Component({
  selector: 'adm-time-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-wrap items-center justify-between gap-2">
      @if (data().series.length > 1) {
        <ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-700" data-testid="legend">
          @for (series of data().series; track series.key) {
            <li class="inline-flex items-center gap-2">
              @if (type() === 'line') {
                <svg class="h-3 w-5" viewBox="0 0 20 12" aria-hidden="true">
                  <path
                    d="M1 6h18"
                    [attr.stroke]="series.color"
                    stroke-width="2.5"
                    stroke-linecap="round"
                  />
                </svg>
              } @else {
                <span
                  class="inline-block size-3 rounded-sm"
                  [style.background]="series.color"
                ></span>
              }
              {{ series.label }}
            </li>
          }
        </ul>
      } @else {
        <span></span>
      }
      <button
        type="button"
        class="cursor-pointer rounded-sm px-1 py-1 text-sm font-semibold text-olive-700 underline underline-offset-4 hover:text-olive-900"
        [attr.aria-pressed]="showTable()"
        data-testid="toggle-table"
        (click)="showTable.set(!showTable())"
      >
        {{ showTable() ? 'Prikaži grafikon' : 'Prikaži tabelu' }}
      </button>
    </div>

    @if (showTable()) {
      <div class="mt-3 overflow-x-auto" data-testid="chart-table">
        <table class="w-full min-w-max text-left text-sm">
          <caption class="sr-only">
            {{
              label()
            }}
          </caption>
          <thead>
            <tr class="border-b border-cream-200 text-ink-700">
              <th scope="col" class="py-2 pr-4 font-semibold">{{ bucketHeader() }}</th>
              @for (series of data().series; track series.key) {
                <th scope="col" class="py-2 pr-4 text-right font-semibold">{{ series.label }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of tableRows(); track $index) {
              <tr class="border-b border-cream-100">
                <th scope="row" class="py-1.5 pr-4 font-normal">{{ row.label }}</th>
                @for (value of row.values; track $index) {
                  <td class="py-1.5 pr-4 text-right tabular-nums">{{ value }}</td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div
        #frame
        class="relative mt-2 outline-none focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-olive-700"
        [class.opacity-50]="busy()"
        tabindex="0"
        role="img"
        [attr.aria-label]="summary()"
        [attr.aria-describedby]="tooltipId"
        data-testid="chart"
        (keydown)="onKey($event)"
        (focus)="onFocus()"
        (blur)="active.set(null)"
      >
        <svg
          class="block w-full"
          [attr.viewBox]="'0 0 ' + width() + ' ' + height"
          [attr.height]="height"
          aria-hidden="true"
          (pointermove)="onPointer($event)"
          (pointerleave)="active.set(null)"
        >
          @for (tick of ticks(); track tick) {
            <line
              [attr.x1]="margin.left"
              [attr.x2]="width() - margin.right"
              [attr.y1]="y(tick)"
              [attr.y2]="y(tick)"
              [attr.stroke]="tick === 0 ? colors.axis : colors.grid"
              stroke-width="1"
              shape-rendering="crispEdges"
            />
            <text
              [attr.x]="margin.left - 8"
              [attr.y]="y(tick)"
              text-anchor="end"
              dominant-baseline="middle"
              class="fill-ink-500 text-[11px] tabular-nums"
            >
              {{ axis(tick) }}
            </text>
          }
          @for (index of xLabels(); track index) {
            <text
              [attr.x]="x(index)"
              [attr.y]="height - 8"
              [attr.text-anchor]="anchor(index)"
              class="fill-ink-500 text-[11px]"
            >
              {{ data().labels[index] }}
            </text>
          }

          @if (type() === 'column') {
            @for (bar of columns(); track bar.index) {
              @if (bar.path) {
                <path
                  [attr.d]="bar.path"
                  [attr.fill]="bar.color"
                  [attr.opacity]="active() === null || active() === bar.index ? 1 : 0.55"
                />
              }
            }
          } @else {
            @if (active() !== null) {
              <line
                [attr.x1]="x(active()!)"
                [attr.x2]="x(active()!)"
                [attr.y1]="margin.top"
                [attr.y2]="height - margin.bottom"
                [attr.stroke]="colors.axis"
                stroke-width="1"
              />
            }
            @for (line of lines(); track line.key) {
              <path
                [attr.d]="line.path"
                fill="none"
                [attr.stroke]="line.color"
                stroke-width="2"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
              @if (active() !== null) {
                <circle
                  [attr.cx]="x(active()!)"
                  [attr.cy]="y(line.values[active()!] ?? 0)"
                  r="4"
                  [attr.fill]="line.color"
                  [attr.stroke]="colors.surface"
                  stroke-width="2"
                />
              } @else if (line.values.length > 0) {
                <circle
                  [attr.cx]="x(line.values.length - 1)"
                  [attr.cy]="y(line.values[line.values.length - 1] ?? 0)"
                  r="4"
                  [attr.fill]="line.color"
                  [attr.stroke]="colors.surface"
                  stroke-width="2"
                />
              }
            }
          }
        </svg>

        <div
          [id]="tooltipId"
          class="pointer-events-none absolute top-2 z-10 min-w-40 rounded-md border border-cream-200 bg-white px-3 py-2 text-sm shadow-card"
          [class.invisible]="active() === null"
          [style.left.px]="tooltipLeft()"
          role="status"
          aria-live="polite"
          data-testid="chart-tooltip"
        >
          @if (active() !== null) {
            <p class="text-xs text-ink-500">{{ data().longLabels[active()!] }}</p>
            @for (series of data().series; track series.key) {
              <p class="mt-1 flex items-center gap-2">
                <svg class="h-3 w-4 shrink-0" viewBox="0 0 16 12" aria-hidden="true">
                  <path
                    d="M1 6h14"
                    [attr.stroke]="series.color"
                    stroke-width="2.5"
                    stroke-linecap="round"
                  />
                </svg>
                <strong class="font-semibold text-ink-900">{{
                  value(series.values[active()!] ?? 0)
                }}</strong>
                <span class="text-ink-700">{{ series.label }}</span>
              </p>
            }
          }
        </div>
      </div>
      @if (allZero()) {
        <p class="mt-2 text-sm text-ink-700" data-testid="chart-empty">{{ emptyText() }}</p>
      }
    }
  `,
})
export class TimeChart {
  readonly data = input.required<TimeChartData>();
  readonly type = input<'line' | 'column'>('line');
  readonly format = input<ChartValueFormat>('rsd');
  /** What the chart shows, for screen readers and the table caption. */
  readonly label = input.required<string>();
  readonly bucketHeader = input('Dan');
  readonly emptyText = input('U ovom periodu nema podataka.');
  /** Data is being reloaded: the old chart stays, dimmed. */
  readonly busy = input(false);

  protected readonly colors = CHART_COLORS;
  protected readonly margin = MARGIN;
  protected readonly height = HEIGHT;
  protected readonly tooltipId = `adm-chart-tip-${nextId++}`;
  protected readonly showTable = signal(false);
  protected readonly active = signal<number | null>(null);
  protected readonly width = signal(DEFAULT_WIDTH);

  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly count = computed(() => this.data().labels.length);
  protected readonly max = computed(() =>
    Math.max(0, ...this.data().series.flatMap((series) => series.values)),
  );
  protected readonly ticks = computed(() => niceTicks(this.max(), 4, this.format() === 'count'));
  private readonly top = computed(() => this.ticks()[this.ticks().length - 1] ?? 1);
  protected readonly allZero = computed(() => this.max() === 0);

  protected readonly xLabels = computed(() =>
    labelIndexes(this.count(), Math.max(2, Math.floor((this.width() - 80) / 64))),
  );

  protected readonly lines = computed(() =>
    this.data().series.map((series) => ({
      key: series.key,
      color: series.color,
      values: series.values,
      path: series.values
        .map(
          (value, i) => `${i === 0 ? 'M' : 'L'}${this.x(i).toFixed(1)},${this.y(value).toFixed(1)}`,
        )
        .join(''),
    })),
  );

  protected readonly columns = computed(() => {
    const series = this.data().series[0];
    if (!series) {
      return [];
    }
    const band = this.plotWidth() / Math.max(1, this.count());
    // Thin bars: at most 24 px, with at least a 2 px gap between neighbours.
    const barWidth = Math.max(2, Math.min(24, band * 0.6, band - 2));
    const base = this.y(0);
    return series.values.map((value, index) => {
      const top = this.y(value);
      const heightPx = base - top;
      if (value <= 0 || heightPx <= 0) {
        return { index, color: series.color, path: '' };
      }
      const left = this.x(index) - barWidth / 2;
      const r = Math.min(4, barWidth / 2, heightPx);
      const path =
        `M${left},${base}V${top + r}Q${left},${top} ${left + r},${top}` +
        `H${left + barWidth - r}Q${left + barWidth},${top} ${left + barWidth},${top + r}V${base}Z`;
      return { index, color: series.color, path };
    });
  });

  protected readonly tableRows = computed(() => {
    const data = this.data();
    return data.longLabels.map((label, i) => ({
      label,
      values: data.series.map((series) => this.value(series.values[i] ?? 0)),
    }));
  });

  protected readonly summary = computed(() => {
    const data = this.data();
    const parts = data.series.map((series) => {
      const total = series.values.reduce((sum, v) => sum + v, 0);
      return `${series.label}: ukupno ${this.value(total)}`;
    });
    return `${this.label()}. ${parts.join('; ')}. Strelicama levo i desno pregledajte pojedinačne vrednosti, ili otvorite tabelu.`;
  });

  protected readonly tooltipLeft = computed(() => {
    const index = this.active();
    if (index === null) {
      return 0;
    }
    const x = this.x(index);
    const scale = this.renderScale();
    const left = x * scale;
    const frameWidth = this.width() * scale;
    // Keep the tooltip inside the chart: right of the point, or left of it near the edge.
    return left + 180 > frameWidth ? Math.max(0, left - 180) : left + 12;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const element = this.host.nativeElement;
      const measure = () => {
        const w = Math.round(element.getBoundingClientRect().width);
        if (w > 0) {
          this.width.set(Math.max(280, w));
        }
      };
      measure();
      if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(() => measure());
        observer.observe(element);
        destroyRef.onDestroy(() => observer.disconnect());
      }
    });
  }

  private plotWidth(): number {
    return this.width() - MARGIN.left - MARGIN.right;
  }

  /** Screen pixels per SVG unit (the SVG is scaled to the frame width). */
  private renderScale(): number {
    const frame = this.frame()?.nativeElement;
    const w = frame?.getBoundingClientRect().width ?? 0;
    return w > 0 ? w / this.width() : 1;
  }

  x(index: number): number {
    const n = this.count();
    if (this.type() === 'column') {
      const band = this.plotWidth() / Math.max(1, n);
      return MARGIN.left + band * (index + 0.5);
    }
    if (n <= 1) {
      return MARGIN.left + this.plotWidth() / 2;
    }
    return MARGIN.left + (index / (n - 1)) * this.plotWidth();
  }

  y(value: number): number {
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    return MARGIN.top + plotHeight * (1 - Math.max(0, value) / this.top());
  }

  protected anchor(index: number): string {
    if (this.type() === 'column' || this.count() <= 1) {
      return 'middle';
    }
    return index === 0 ? 'start' : index === this.count() - 1 ? 'end' : 'middle';
  }

  protected axis(value: number): string {
    return axisNumber(value);
  }

  protected value(value: number): string {
    return formatChartValue(value, this.format());
  }

  protected onPointer(event: PointerEvent): void {
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || this.count() === 0) {
      return;
    }
    const svgX = ((event.clientX - rect.left) / rect.width) * this.width();
    this.active.set(this.nearest(svgX));
  }

  /** Index of the bucket closest to an x position in SVG units. */
  nearest(svgX: number): number {
    let best = 0;
    let distance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.count(); i++) {
      const d = Math.abs(this.x(i) - svgX);
      if (d < distance) {
        distance = d;
        best = i;
      }
    }
    return best;
  }

  protected onFocus(): void {
    if (this.active() === null && this.count() > 0) {
      this.active.set(this.count() - 1);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    const n = this.count();
    if (n === 0) {
      return;
    }
    const current = this.active() ?? n - 1;
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = Math.max(0, current - 1);
    if (event.key === 'ArrowRight') next = Math.min(n - 1, current + 1);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = n - 1;
    if (event.key === 'Escape') {
      this.active.set(null);
      return;
    }
    if (next !== null) {
      event.preventDefault();
      this.active.set(next);
    }
  }
}
