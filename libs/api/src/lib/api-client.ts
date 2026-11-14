import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { APP_CONFIG } from './config';

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue | readonly (string | number | boolean)[]>;

export interface ApiRequestOptions {
  /** Query parameters; null, undefined and empty-string values are omitted. */
  params?: QueryParams;
  headers?: Record<string, string>;
}

/** Builds HttpParams, skipping empty values so optional filters never reach the URL as `x=`. */
export function toHttpParams(params: QueryParams | undefined): HttpParams {
  let result = new HttpParams();
  if (!params) {
    return result;
  }
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value as readonly (string | number | boolean)[]) {
        result = result.append(key, String(item));
      }
    } else if (value !== null && value !== undefined && value !== '') {
      result = result.set(key, String(value as string | number | boolean));
    }
  }
  return result;
}

/**
 * Thin typed wrapper around HttpClient for the Zladovce API.
 * Paths are relative to `apiBaseUrl` (`/admin/me`). Failures surface as `ApiError`
 * (see `apiErrorInterceptor`). Feature API clients in later phases build on this class.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  /** Absolute URL of an API path. */
  url(path: string): string {
    return `${this.config.apiBaseUrl}/${path.replace(/^\/+/, '')}`;
  }

  get<T>(path: string, options: ApiRequestOptions = {}): Observable<T> {
    return this.http.get<T>(this.url(path), this.httpOptions(options));
  }

  post<T>(path: string, body?: unknown, options: ApiRequestOptions = {}): Observable<T> {
    return this.http.post<T>(this.url(path), body ?? null, this.httpOptions(options));
  }

  put<T>(path: string, body?: unknown, options: ApiRequestOptions = {}): Observable<T> {
    return this.http.put<T>(this.url(path), body ?? null, this.httpOptions(options));
  }

  patch<T>(path: string, body?: unknown, options: ApiRequestOptions = {}): Observable<T> {
    return this.http.patch<T>(this.url(path), body ?? null, this.httpOptions(options));
  }

  delete<T = void>(path: string, options: ApiRequestOptions = {}): Observable<T> {
    return this.http.delete<T>(this.url(path), this.httpOptions(options));
  }

  private httpOptions(options: ApiRequestOptions) {
    return { params: toHttpParams(options.params), headers: options.headers };
  }
}
