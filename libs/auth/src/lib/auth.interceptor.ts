import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { APP_CONFIG, isApiUrl } from '@zladovce/api';
import { from, switchMap, tap } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Attaches the administrator's credentials (Bearer token, or dev headers in dev mode) to
 * requests going to `apiBaseUrl` – and to nothing else, so they can never leak to another
 * origin or to a different path on the same host. A 401 from the API ends the session.
 *
 * Register it before `apiErrorInterceptor`.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const { apiBaseUrl } = inject(APP_CONFIG);
  if (!isApiUrl(req.url, apiBaseUrl)) {
    return next(req);
  }
  const auth = inject(AuthService);
  return from(auth.credentialHeaders().catch(() => null)).pipe(
    switchMap((headers) =>
      next(headers ? req.clone({ setHeaders: headers }) : req).pipe(
        tap({
          error: (error: unknown) => {
            if ((error as { status?: unknown } | null)?.status === 401) {
              auth.handleUnauthorized();
            }
          },
        }),
      ),
    ),
  );
};
