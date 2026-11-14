import { Params } from '@angular/router';

/** Readers for query parameters: invalid values fall back to the default (never break the page). */
export function readString(params: Params, key: string, maxLength = 100): string {
  const value: unknown = params[key];
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

export function readEnum<T extends string>(
  params: Params,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value: unknown = params[key];
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

export function readPositiveInt(
  params: Params,
  key: string,
  fallback: number,
  max?: number,
): number {
  const value = Number(params[key]);
  if (!Number.isInteger(value) || value < 1) {
    return fallback;
  }
  return max !== undefined ? Math.min(value, max) : value;
}

export function readFlag(params: Params, key: string): boolean {
  const value: unknown = params[key];
  return value === 'true' || value === '1';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readUuid(params: Params, key: string): string | undefined {
  const value: unknown = params[key];
  return typeof value === 'string' && UUID.test(value) ? value : undefined;
}

/**
 * Query params for the URL: values equal to their default (or empty) are left out so the address
 * stays short; `null` removes a parameter that is currently in the URL.
 */
export function compactParams(
  values: Record<string, string | number | boolean | null | undefined>,
  defaults: Record<string, string | number | boolean | undefined> = {},
): Params {
  const result: Params = {};
  for (const [key, value] of Object.entries(values)) {
    const empty = value === undefined || value === null || value === '' || value === false;
    result[key] = empty || value === defaults[key] ? null : String(value);
  }
  return result;
}

export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
export const DEFAULT_PAGE_SIZE = 20;
