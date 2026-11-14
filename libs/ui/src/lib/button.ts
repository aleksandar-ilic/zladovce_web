import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { UiSpinner } from './spinner';

export type UiButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type UiButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold no-underline select-none ' +
  'transition-colors duration-150 ease-gentle cursor-pointer ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive-700';

const VARIANTS: Record<UiButtonVariant, string> = {
  primary: 'bg-olive-700 text-white hover:bg-olive-800 active:bg-olive-900',
  secondary:
    'border border-olive-400 bg-cream-50 text-olive-800 hover:border-olive-600 hover:bg-olive-50 active:bg-olive-100',
  ghost: 'text-olive-800 hover:bg-olive-100 active:bg-olive-200',
  danger: 'bg-danger-600 text-white hover:bg-danger-700',
};

const SIZES: Record<UiButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-5 text-base',
  lg: 'min-h-13 px-7 text-lg',
};

const INACTIVE = 'pointer-events-none opacity-60';

/**
 * Brand button. Apply to a native element so semantics and keyboard behaviour stay native:
 *
 *   <button uiButton type="submit" [loading]="saving()">Sačuvaj</button>
 *   <a uiButton variant="secondary" routerLink="/prodavnica">Prodavnica</a>
 *
 * `loading` shows a spinner and blocks interaction; `disabled` blocks interaction.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- attribute selector keeps native button/link semantics
  selector: 'button[uiButton], a[uiButton]',
  imports: [UiSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    '[attr.disabled]': 'inactive() ? "" : null',
    '[attr.aria-disabled]': 'inactive() ? "true" : null',
    '[attr.aria-busy]': 'loading() ? "true" : null',
    '[attr.tabindex]': 'inactive() ? -1 : null',
  },
  template: `
    @if (loading()) {
      <ui-spinner size="sm" label="" />
    }
    <ng-content />
  `,
})
export class UiButton {
  readonly variant = input<UiButtonVariant>('primary');
  readonly size = input<UiButtonSize>('md');
  readonly block = input(false, { transform: booleanAttribute });
  readonly loading = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });

  protected readonly inactive = computed(() => this.disabled() || this.loading());

  protected readonly classes = computed(() =>
    [
      BASE,
      VARIANTS[this.variant()],
      SIZES[this.size()],
      this.block() ? 'flex w-full' : '',
      this.inactive() ? INACTIVE : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
}
