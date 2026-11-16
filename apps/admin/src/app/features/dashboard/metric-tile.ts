import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatRsd, formatSerbianNumber } from '@zladovce/utilities';
import { MetricTile } from './metrics';

/**
 * Stat tile: label, value, trend against the previous period (arrow + signed text, coloured by
 * whether the change is good news, never colour alone) and a one-line explanation.
 */
@Component({
  selector: 'adm-metric-tile',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="flex h-full flex-col rounded-lg border border-cream-200 bg-white p-4 shadow-soft"
      [class.opacity-60]="busy()"
      [attr.data-testid]="'tile-' + tile().key"
    >
      <h3 class="text-sm font-semibold text-ink-700">{{ tile().label }}</h3>
      <p
        class="mt-1 font-sans font-semibold text-ink-900"
        [class.text-3xl]="size() === 'lg'"
        [class.text-2xl]="size() === 'md'"
        data-testid="tile-value"
      >
        {{ valueText() }}
      </p>
      <p class="text-sm text-ink-700" data-testid="tile-detail">{{ tile().detail }}</p>
      @if (tile().trend; as t) {
        <p
          class="mt-2 flex items-center gap-1 text-sm font-semibold"
          [class.text-olive-700]="t.tone === 'good'"
          [class.text-danger-700]="t.tone === 'bad'"
          [class.text-ink-500]="t.tone === 'neutral'"
          data-testid="tile-trend"
        >
          <svg
            class="size-4 shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            @switch (t.direction) {
              @case ('up') {
                <path d="M8 13V3M4 7l4-4 4 4" />
              }
              @case ('down') {
                <path d="M8 3v10M4 9l4 4 4-4" />
              }
              @case ('new') {
                <path d="M8 3v10M3 8h10" />
              }
              @default {
                <path d="M3 8h10" />
              }
            }
          </svg>
          <span>{{ t.text }}</span>
        </p>
        <p class="text-xs text-ink-500">Prethodni period: {{ previousText() }}</p>
      }
      @if (tile().hint) {
        <p class="mt-2 text-xs text-ink-500">{{ tile().hint }}</p>
      }
      @if (tile().link; as link) {
        <a
          [routerLink]="link.path"
          class="mt-auto pt-2 text-sm font-semibold text-olive-700 underline underline-offset-4"
          data-testid="tile-link"
          >{{ link.label }}</a
        >
      }
    </div>
  `,
})
export class MetricTileCard {
  readonly tile = input.required<MetricTile>();
  readonly size = input<'lg' | 'md'>('lg');
  readonly busy = input(false);

  private format(value: number | null): string {
    if (value === null) {
      return '—';
    }
    return this.tile().format === 'rsd' ? formatRsd(value) : formatSerbianNumber(value);
  }

  protected readonly valueText = computed(() => this.format(this.tile().value));
  protected readonly previousText = computed(() => this.format(this.tile().previous));
}
