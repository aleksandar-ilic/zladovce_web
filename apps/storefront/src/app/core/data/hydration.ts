import { catchError, concat, EMPTY, Observable } from 'rxjs';
import { FetchOptions } from './catalog-api';

/**
 * The request of a prerendered page: first the answer embedded at build time (transfer cache,
 * so hydration sees the same data as the HTML), then – only while hydrating – a fresh answer
 * from the API, so content changed after the build shows without a rebuild. A failing refresh
 * keeps the build-time data.
 */
export function cachedThenFresh<T>(
  load: (options: FetchOptions) => Observable<T>,
  hydrating: boolean,
): Observable<T> {
  return hydrating
    ? concat(load({}), load({ fresh: true }).pipe(catchError(() => EMPTY)))
    : load({});
}
