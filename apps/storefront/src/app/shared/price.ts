import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { RsdPipe } from '@zladovce/utilities';

/** Discount in whole percent (`−15 %`), or null when there is no real discount. */
export function discountPercent(price: number, original: number | null | undefined): number | null {
  if (original === null || original === undefined || !(original > price) || original <= 0) {
    return null;
  }
  const percent = Math.round(((original - price) / original) * 100);
  return percent > 0 ? percent : null;
}

/**
 * Price with an optional discount: the current price, and the regular price struck through.
 * `from` prefixes "od" (products whose packages have different prices).
 */
@Component({
  selector: 'sf-price',
  imports: [RsdPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex flex-wrap items-baseline gap-x-2' },
  template: `
    <span [class]="currentClass()" data-testid="price">
      @if (from()) {
        <span class="text-[0.8em] font-normal text-ink-700">od </span>
      }
      {{ price() | rsd }}
    </span>
    @if (discounted()) {
      <s class="text-sm text-ink-500" data-testid="regular-price">
        <span class="sr-only">Redovna cena: </span>{{ original() | rsd }}
      </s>
    }
  `,
})
export class Price {
  readonly price = input.required<number>();
  readonly original = input<number | null>(null);
  readonly from = input(false, { transform: booleanAttribute });
  readonly size = input<'md' | 'lg'>('md');

  protected readonly discounted = computed(
    () => discountPercent(this.price(), this.original()) !== null,
  );
  protected readonly currentClass = computed(
    () =>
      `font-semibold ${this.discounted() ? 'text-earth-700' : 'text-ink-900'} ${
        this.size() === 'lg' ? 'text-2xl md:text-3xl' : 'text-base'
      }`,
  );
}
