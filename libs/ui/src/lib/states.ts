import { booleanAttribute, ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { UiButton } from './button';
import { UiSpinner } from './spinner';

const STATE_HOST = 'flex flex-col items-center justify-center gap-3 px-6 py-10 text-center';

/**
 * The three states every data view must implement (ARCHITECTURE.md A5):
 *
 *   @if (loading()) { <ui-loading-state /> }
 *   @else if (error(); as e) { <ui-error-state [message]="e.detail" (retry)="load()" /> }
 *   @else if (items().length === 0) { <ui-empty-state title="Još nema porudžbina" /> }
 *   @else { … }
 */
@Component({
  selector: 'ui-loading-state',
  imports: [UiSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: STATE_HOST, role: 'status', 'aria-live': 'polite' },
  template: `
    <ui-spinner size="lg" label="" class="text-olive-600" />
    <p class="text-sm text-ink-700">{{ label() }}</p>
  `,
})
export class UiLoadingState {
  readonly label = input('Učitavanje…');
}

@Component({
  selector: 'ui-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: STATE_HOST },
  template: `
    <p class="font-serif text-xl font-semibold text-olive-900">{{ title() }}</p>
    @if (description()) {
      <p class="max-w-prose text-sm text-ink-700">{{ description() }}</p>
    }
    <!-- Optional action, e.g. a link or button -->
    <ng-content />
  `,
})
export class UiEmptyState {
  readonly title = input.required<string>();
  readonly description = input<string>();
}

@Component({
  selector: 'ui-error-state',
  imports: [UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: STATE_HOST, role: 'alert' },
  template: `
    <p class="font-serif text-xl font-semibold text-danger-700">{{ title() }}</p>
    <p class="max-w-prose text-sm text-ink-700">{{ message() }}</p>
    @if (retryable()) {
      <button uiButton type="button" variant="secondary" size="sm" (click)="retry.emit()">
        {{ retryLabel() }}
      </button>
    }
  `,
})
export class UiErrorState {
  readonly title = input('Došlo je do greške');
  readonly message = input('Podaci trenutno ne mogu da se učitaju. Pokušajte ponovo.');
  readonly retryLabel = input('Pokušaj ponovo');
  /** Set to false when retrying cannot help (e.g. missing permission). */
  readonly retryable = input(true, { transform: booleanAttribute });
  readonly retry = output<void>();
}
