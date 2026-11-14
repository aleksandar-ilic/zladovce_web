import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { toApiError } from './api-error';
import { isApiOrigin } from './api-url';
import { APP_CONFIG } from './config';

export const CORRELATION_ID_HEADER = 'X-Correlation-Id';

function newCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Non-secure contexts have no randomUUID; the id only needs to be unique enough for log lookup.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;
}

/**
 * Adds an `X-Correlation-Id` header to every request sent to the API origin, so a browser
 * request can be found in the backend logs. Requests to other origins are left untouched.
 */
export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  const { apiBaseUrl } = inject(APP_CONFIG);
  if (!isApiOrigin(req.url, apiBaseUrl) || req.headers.has(CORRELATION_ID_HEADER)) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { [CORRELATION_ID_HEADER]: newCorrelationId() } }));
};

/**
 * Maps failed responses from the API origin (RFC 9457 Problem Details, or anything else) into
 * a typed `ApiError`. Register it last so it sees the request as it was actually sent.
 */
export const apiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const { apiBaseUrl } = inject(APP_CONFIG);
  if (!isApiOrigin(req.url, apiBaseUrl)) {
    return next(req);
  }
  const correlationId = req.headers.get(CORRELATION_ID_HEADER) ?? undefined;
  return next(req).pipe(
    catchError((error: unknown) =>
      throwError(() =>
        error instanceof HttpErrorResponse ? toApiError(error, correlationId) : error,
      ),
    ),
  );
};
