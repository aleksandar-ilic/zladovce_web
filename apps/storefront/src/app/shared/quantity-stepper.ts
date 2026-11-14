import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

let nextId = 0;

/** Whole number between `min` and `max` (falls back to `min` for anything unreadable). */
export function clampQuantity(value: unknown, min: number, max: number): number {
  const number = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(Math.max(Math.trunc(number), min), Math.max(min, max));
}

/**
 * Quantity input with − and + buttons. The value is always kept between `min` and `max`;
 * typing is accepted on change (blur or Enter).
 */
@Component({
  selector: 'sf-quantity-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <div
      class="inline-flex h-11 items-stretch overflow-hidden rounded-md border border-sage-300 bg-white"
      role="group"
      [attr.aria-label]="label()"
    >
      <button
        type="button"
        class="inline-flex w-11 cursor-pointer items-center justify-center text-olive-800 transition-colors hover:bg-olive-50 disabled:cursor-not-allowed disabled:text-ink-500/50 disabled:hover:bg-transparent"
        [disabled]="disabled() || value() <= min()"
        [attr.aria-label]="'Smanji količinu' + labelSuffix()"
        (click)="set(value() - 1)"
        data-testid="decrease"
      >
        <svg
          class="size-4"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M3 8h10" />
        </svg>
      </button>
      <label class="sr-only" [for]="id">{{ label() }}</label>
      <input
        [id]="id"
        type="number"
        inputmode="numeric"
        class="w-12 border-x border-sage-200 bg-transparent text-center text-base font-semibold text-ink-900 [appearance:textfield] focus:outline-2 focus:outline-offset-[-2px] focus:outline-olive-700 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        [min]="min()"
        [max]="max()"
        [value]="value()"
        [disabled]="disabled()"
        (change)="set($any($event.target).value, $event.target)"
        data-testid="quantity-input"
      />
      <button
        type="button"
        class="inline-flex w-11 cursor-pointer items-center justify-center text-olive-800 transition-colors hover:bg-olive-50 disabled:cursor-not-allowed disabled:text-ink-500/50 disabled:hover:bg-transparent"
        [disabled]="disabled() || value() >= max()"
        [attr.aria-label]="'Povećaj količinu' + labelSuffix()"
        (click)="set(value() + 1)"
        data-testid="increase"
      >
        <svg
          class="size-4"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M3 8h10M8 3v10" />
        </svg>
      </button>
    </div>
  `,
})
export class QuantityStepper {
  readonly value = input.required<number>();
  readonly min = input(1);
  readonly max = input(99);
  readonly label = input('Količina');
  /** Appended to the button labels, e.g. the product name in the cart. */
  readonly itemName = input<string>('');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly valueChange = output<number>();

  protected readonly id = `sf-quantity-${nextId++}`;
  protected readonly labelSuffix = computed(() => (this.itemName() ? `: ${this.itemName()}` : ''));

  protected set(raw: unknown, target?: EventTarget | null): void {
    const next = clampQuantity(raw, this.min(), this.max());
    if (target instanceof HTMLInputElement) {
      target.value = String(next);
    }
    if (next !== this.value()) {
      this.valueChange.emit(next);
    }
  }
}
