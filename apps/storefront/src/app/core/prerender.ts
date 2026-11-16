import { SeoRoute, SeoRoutes } from '@zladovce/models';

/** Slugs are used as file paths of the prerendered output, so only clean slugs are accepted. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMPTY: SeoRoutes = {
  categories: [],
  products: [],
  blogPosts: [],
  blogCategories: [],
  pages: [],
};

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface SeoRoutesOptions {
  fetchFn?: FetchLike;
  timeoutMs?: number;
  warn?: (message: string) => void;
}

function cleanRoutes(raw: unknown): SeoRoute[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (item): item is SeoRoute =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as SeoRoute).slug === 'string' &&
      SLUG.test((item as SeoRoute).slug),
  );
}

/**
 * Reads `GET /seo/routes` at build time. Never throws: when the API is unreachable, answers
 * with an error or with something unexpected, it logs a warning and returns no routes, so the
 * build still succeeds and prerenders only the static pages.
 */
export async function fetchSeoRoutes(
  apiBaseUrl: string,
  options: SeoRoutesOptions = {},
): Promise<SeoRoutes> {
  const {
    fetchFn = fetch as unknown as FetchLike,
    timeoutMs = 15_000,
    warn = (message: string) => console.warn(message),
  } = options;
  const url = `${apiBaseUrl.replace(/\/+$/, '')}/seo/routes`;
  try {
    const response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const body = (await response.json()) as Partial<SeoRoutes> | null;
    const routes: SeoRoutes = {
      categories: cleanRoutes(body?.categories),
      products: cleanRoutes(body?.products),
      // Phase 7 routes are read by the storefront blog/CMS pages (not prerendered yet).
      blogPosts: [],
      blogCategories: [],
      pages: [],
    };
    if (routes.products.length === 0) {
      warn(`[prerender] ${url} returned no products; product pages are not prerendered.`);
    }
    return routes;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warn(
      `[prerender] Could not read ${url} (${reason}). Only the static pages are prerendered; ` +
        'set ZLADOVCE_API_BASE_URL to a reachable API to prerender categories and products.',
    );
    return EMPTY;
  }
}

const cache = new Map<string, Promise<SeoRoutes>>();

/** One request per build (categories and products read the same answer). */
export function seoRoutesOnce(apiBaseUrl: string): Promise<SeoRoutes> {
  let routes = cache.get(apiBaseUrl);
  if (!routes) {
    routes = fetchSeoRoutes(apiBaseUrl);
    cache.set(apiBaseUrl, routes);
  }
  return routes;
}
