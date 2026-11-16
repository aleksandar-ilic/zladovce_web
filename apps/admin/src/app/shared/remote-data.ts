import { DestroyRef, inject, Signal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiError, asApiError } from '@zladovce/api';
import { catchError, map, Observable, of, startWith, Subject, switchMap } from 'rxjs';

/**
 * State of one piece of data loaded from the API. While it reloads (another period chosen), the
 * last data stays (`data`) with `busy: true`, so charts keep their frame instead of flashing.
 */
export interface RemoteState<T> {
  data: T | null;
  busy: boolean;
  error: ApiError | null;
}

/**
 * Loads `load(query)` every time `queries` emits (a new period), cancelling the request that
 * was running, and keeps the result as a signal. `reload()` repeats the last query.
 * Create it in an injection context.
 */
export class RemoteData<Q, T> {
  private readonly state = signal<RemoteState<T>>({ data: null, busy: true, error: null });
  private readonly retry = new Subject<void>();
  private last: Q | null = null;

  readonly value: Signal<RemoteState<T>> = this.state.asReadonly();

  constructor(queries: Observable<Q>, load: (query: Q) => Observable<T>) {
    const destroyRef = inject(DestroyRef);
    const requests = new Subject<Q>();
    // Subscribed first: `queries` (route parameters) emits synchronously.
    requests
      .pipe(
        switchMap((query) =>
          load(query).pipe(
            map((data): Partial<RemoteState<T>> => ({ data, busy: false, error: null })),
            catchError((error: unknown) =>
              of<Partial<RemoteState<T>>>({ busy: false, error: asApiError(error) }),
            ),
            startWith<Partial<RemoteState<T>>>({ busy: true, error: null }),
          ),
        ),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((changes) => this.state.update((state) => ({ ...state, ...changes })));
    this.retry.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
      if (this.last !== null) {
        requests.next(this.last);
      }
    });
    queries.pipe(takeUntilDestroyed(destroyRef)).subscribe((query) => {
      this.last = query;
      requests.next(query);
    });
  }

  reload(): void {
    this.retry.next();
  }
}
