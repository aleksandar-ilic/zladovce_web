import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type UiCardPadding = 'none' | 'sm' | 'md' | 'lg';
export type UiCardTone = 'surface' | 'muted';

const PADDING: Record<UiCardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8 sm:p-10',
};

const TONE: Record<UiCardTone, string> = {
  surface: 'border-cream-200 bg-white shadow-card',
  muted: 'border-sage-100 bg-sage-50',
};

/**
 * Surface container.
 *
 *   <ui-card>
 *     <h2 uiCardTitle>Naslov</h2>
 *     …
 *   </ui-card>
 */
@Component({
  selector: 'ui-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()' },
  template: `<ng-content />`,
})
export class UiCard {
  readonly padding = input<UiCardPadding>('md');
  readonly tone = input<UiCardTone>('surface');

  protected readonly classes = computed(() =>
    `block rounded-lg border ${TONE[this.tone()]} ${PADDING[this.padding()]}`.trim(),
  );
}

/** Title typography for the heading element of a card. */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- applied to the consumer's heading element
  selector: '[uiCardTitle]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block font-serif text-xl font-semibold text-olive-900' },
  template: `<ng-content />`,
})
export class UiCardTitle {}
