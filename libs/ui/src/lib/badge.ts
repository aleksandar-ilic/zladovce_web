import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type UiBadgeTone = 'neutral' | 'success' | 'info' | 'warning' | 'danger';

const TONES: Record<UiBadgeTone, string> = {
  neutral: 'bg-cream-200 text-ink-700',
  success: 'bg-olive-100 text-olive-800',
  info: 'bg-sage-100 text-sage-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
};

/** Small status label: `<ui-badge tone="success">Na stanju</ui-badge>`. */
@Component({
  selector: 'ui-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()' },
  template: `<ng-content />`,
})
export class UiBadge {
  readonly tone = input<UiBadgeTone>('neutral');

  protected readonly classes = computed(
    () =>
      `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[this.tone()]}`,
  );
}
