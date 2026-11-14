import { inject, Injector } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { from, Observable, of, switchMap } from 'rxjs';

/** A page with a form that can hold changes not yet saved. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/**
 * Asks before leaving a page with unsaved changes (route `canDeactivate`). Closing or reloading
 * the tab is covered by the page's own `beforeunload` handler. The dialog code is loaded only
 * when it is needed, so the guard adds nothing to the initial bundle.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (
  component,
): Observable<boolean> => {
  if (!component.hasUnsavedChanges()) {
    return of(true);
  }
  const injector = inject(Injector);
  return from(import('./confirm-dialog')).pipe(
    switchMap(({ ConfirmService }) =>
      injector.get(ConfirmService).ask({
        title: 'Napustiti stranicu bez čuvanja?',
        message:
          'Imate izmene koje niste sačuvali. Ako sada napustite stranicu, one će biti izgubljene.',
        confirmLabel: 'Napusti bez čuvanja',
        cancelLabel: 'Ostani na stranici',
        tone: 'danger',
      }),
    ),
  );
};

/** `host: { '(window:beforeunload)': 'beforeUnload($event)' }` helper. */
export function warnBeforeUnload(event: BeforeUnloadEvent, dirty: boolean): void {
  if (dirty) {
    event.preventDefault();
    // Older browsers show the dialog only when returnValue is set.
    event.returnValue = '';
  }
}
