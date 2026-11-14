import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** "Na stanju" / "Nema na stanju" with a small status dot (the text carries the meaning). */
@Component({
  selector: 'sf-availability',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-1.5 text-sm' },
  template: `
    <span
      class="size-2 rounded-full"
      [class]="inStock() ? 'bg-olive-500' : 'bg-ink-500/60'"
      aria-hidden="true"
    ></span>
    <span [class]="inStock() ? 'text-olive-800' : 'text-ink-700'" data-testid="availability">{{
      inStock() ? 'Na stanju' : 'Nema na stanju'
    }}</span>
  `,
})
export class Availability {
  readonly inStock = input.required<boolean>();
}
