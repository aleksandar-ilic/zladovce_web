import { ApiError, asApiError } from '@zladovce/api';
import { catchError, concat, filter, map, Observable, of } from 'rxjs';
import { FetchOptions } from './catalog-api';

/**
 * State of a content page: `missing` is the API's 404 (an empty CMS page, an unknown post or
 * category) and shows the 404 view; `error` is anything else and offers a retry.
 */
export type PageState<T> =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; data: T };

/**
 * Loading → loaded / missing / error. During the prerender a failure other than 404 keeps
 * `loading` (like the catalog pages), so the HTML never bakes in an error the browser would
 * not see.
 */
export function pageState<T>(request: Observable<T>, browser: boolean): Observable<PageState<T>> {
  return concat(
    of<PageState<T>>({ status: 'loading' }),
    request.pipe(
      map((data): PageState<T> => ({ status: 'loaded', data })),
      catchError((error: unknown) => {
        const apiError = asApiError(error);
        if (apiError.isNotFound) {
          return of<PageState<T>>({ status: 'missing' });
        }
        return of<PageState<T>>(
          browser ? { status: 'error', error: apiError } : { status: 'loading' },
        );
      }),
    ),
  );
}

/**
 * `pageState` of the build-time answer, then – while a prerendered page hydrates – of a fresh
 * answer, so content published, changed or emptied after the build shows at once. A failing
 * refresh keeps what is on screen.
 */
export function pageStateWithRefresh<T>(
  load: (options: FetchOptions) => Observable<T>,
  hydrating: boolean,
  browser: boolean,
): Observable<PageState<T>> {
  const first = pageState(load({}), browser);
  if (!hydrating) {
    return first;
  }
  const fresh = pageState(load({ fresh: true }), browser).pipe(
    filter((state) => state.status === 'loaded' || state.status === 'missing'),
  );
  return concat(first, fresh);
}

export function loadedData<T>(state: PageState<T>): T | null {
  return state.status === 'loaded' ? state.data : null;
}
