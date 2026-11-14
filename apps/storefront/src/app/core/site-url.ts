import { DOCUMENT } from '@angular/common';
import { inject, InjectionToken } from '@angular/core';

/**
 * Public origin of the storefront without a trailing slash (`https://zladovce.com`), used for
 * canonical URLs, Open Graph and JSON-LD. The prerender provides it from `ZLADOVCE_SITE_URL`
 * (app.config.server.ts); in the browser it is the origin of the page itself.
 */
export const SITE_URL = new InjectionToken<string>('SITE_URL', {
  providedIn: 'root',
  factory: () => {
    const origin = inject(DOCUMENT).location?.origin;
    return origin && origin !== 'null' ? origin.replace(/\/+$/, '') : '';
  },
});

/** Default when the build environment does not set `ZLADOVCE_SITE_URL`. */
export const DEFAULT_SITE_URL = 'http://localhost:4200';

/** Normalises a configured site URL (`https://zladovce.com/` → `https://zladovce.com`). */
export function normaliseSiteUrl(value: string | undefined | null): string {
  const trimmed = (value ?? '').trim();
  return (trimmed === '' ? DEFAULT_SITE_URL : trimmed).replace(/\/+$/, '');
}
