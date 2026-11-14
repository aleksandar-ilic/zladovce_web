/**
 * True when `url` points at the API identified by `apiBaseUrl` (same base, on a path boundary).
 * Used by interceptors so credentials and API-only headers are never sent anywhere else.
 */
export function isApiUrl(url: string, apiBaseUrl: string): boolean {
  if (!apiBaseUrl || !url.startsWith(apiBaseUrl)) {
    return false;
  }
  const next = url.charAt(apiBaseUrl.length);
  return next === '' || next === '/' || next === '?';
}

/** True when `url` has the same origin as the API (covers `/health`, which lives outside `/api/v1`). */
export function isApiOrigin(url: string, apiBaseUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(apiBaseUrl).origin;
  } catch {
    return false;
  }
}
