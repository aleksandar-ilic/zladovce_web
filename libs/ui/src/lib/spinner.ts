import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type UiSpinnerSize = 'sm' | 'md' | 'lg';

const SIZES: Record<UiSpinnerSize, string> = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-9',
};

/**
 * Indeterminate progress indicator.
 * With a `label` (default) it is announced as a status; pass `label=""` when the surrounding
 * element already describes what is loading (e.g. inside a button).
 */
@Component({
  selector: 'ui-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex items-center',
    '[attr.role]': 'label() ? "status" : null',
  },
  template: `
    <svg [class]="svgClass()" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
      />
    </svg>
    @if (label()) {
      <span class="sr-only">{{ label() }}</span>
    }
  `,
})
export class UiSpinner {
  readonly size = input<UiSpinnerSize>('md');
  readonly label = input('Učitavanje…');

  protected readonly svgClass = computed(() => `animate-spin ${SIZES[this.size()]}`);
}
