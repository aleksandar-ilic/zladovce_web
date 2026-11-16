import { inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { distinctUntilChanged, map, shareReplay } from 'rxjs';
import { parsePeriodQuery, periodQueryParams, PeriodQuery, samePeriod } from './period';

/**
 * The period of a page, kept in the URL (`?period=…&from=…&to=…`) so a reload, the back button
 * and a shared link show the same numbers. Create in an injection context.
 */
export function periodFromRoute() {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const changes = route.queryParams.pipe(
    map(parsePeriodQuery),
    distinctUntilChanged(samePeriod),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  const value = toSignal(changes, { initialValue: parsePeriodQuery(route.snapshot.queryParams) });
  return {
    changes,
    value,
    /** Puts a new period into the URL; other query parameters stay. */
    set(period: PeriodQuery): void {
      void router.navigate([], {
        relativeTo: route,
        queryParams: periodQueryParams(period),
        queryParamsHandling: 'merge',
      });
    },
  };
}
