import { PublicStoreShipping, SeoRoute, SeoRoutes } from '@zladovce/models';
import { deliveryFacts } from '../shared/delivery-facts';
import { INFO_PAGES } from './navigation';

/** Slugs are used as file paths of the prerendered output, so only clean slugs are accepted. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** `blog/kategorija/…` is the category route, so a post slug `kategorija` cannot be a folder. */
const RESERVED_POST_SLUGS = new Set(['kategorija']);
const PAGE_KEYS = new Set(['home', 'about', 'privacy', 'terms', 'delivery']);
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

type SeoPageRoute = SeoRoutes['pages'][number];

function cleanPages(raw: unknown): SeoPageRoute[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (item): item is SeoPageRoute =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as SeoPageRoute).key === 'string' &&
      PAGE_KEYS.has((item as SeoPageRoute).key),
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
      blogPosts: cleanRoutes(body?.blogPosts).filter(
        (route) => !RESERVED_POST_SLUGS.has(route.slug),
      ),
      blogCategories: cleanRoutes(body?.blogCategories),
      pages: cleanPages(body?.pages),
    };
    if (routes.products.length === 0) {
      warn(`[prerender] ${url} returned no products; product pages are not prerendered.`);
    }
    return routes;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warn(
      `[prerender] Could not read ${url} (${reason}). Only the static pages are prerendered; ` +
        'set ZLADOVCE_API_BASE_URL to a reachable API to prerender categories, products, ' +
        'blog posts and content pages.',
    );
    return EMPTY;
  }
}

/**
 * Reads one public JSON resource at build time (`/content/faq`, `/store`). Never throws: any
 * failure is logged and answered with null.
 */
export async function fetchBuildJson<T>(
  apiBaseUrl: string,
  path: string,
  options: SeoRoutesOptions = {},
): Promise<T | null> {
  const {
    fetchFn = fetch as unknown as FetchLike,
    timeoutMs = 15_000,
    warn = (message: string) => console.warn(message),
  } = options;
  const url = `${apiBaseUrl.replace(/\/+$/, '')}${path}`;
  try {
    const response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    warn(
      `[prerender] Could not read ${url} (${error instanceof Error ? error.message : String(error)}).`,
    );
    return null;
  }
}

export interface InfoPageSources {
  routes: SeoRoutes;
  /** Number of published FAQ items (`GET /content/faq`). */
  faqCount: number;
  /** Shipping of `GET /store` (the delivery page falls back to its facts). */
  shipping: PublicStoreShipping | null;
}

/**
 * The informational pages (`:page` route) worth prerendering: CMS pages with content, the
 * FAQ when it has items, the delivery page also when only the store's delivery facts exist.
 * Pages without content are not rendered (the browser shows the 404 view for them).
 */
export function infoPageSlugs({ routes, faqCount, shipping }: InfoPageSources): string[] {
  const keys = new Set(routes.pages.map((page) => page.key));
  return INFO_PAGES.filter((page) => {
    switch (page.kind) {
      case 'faq':
        return faqCount > 0;
      case 'delivery':
        return keys.has('delivery') || deliveryFacts(shipping).length > 0;
      default:
        return page.cmsKey !== null && keys.has(page.cmsKey);
    }
  }).map((page) => page.slug);
}

const cache = new Map<string, Promise<unknown>>();

function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  let value = cache.get(key) as Promise<T> | undefined;
  if (!value) {
    value = load();
    cache.set(key, value);
  }
  return value;
}

/** One request per build (categories, products, blog and pages read the same answer). */
export function seoRoutesOnce(apiBaseUrl: string): Promise<SeoRoutes> {
  return once(`routes ${apiBaseUrl}`, () => fetchSeoRoutes(apiBaseUrl));
}

/** Slugs of the informational pages to prerender (one set of requests per build). */
export function infoPageSlugsOnce(apiBaseUrl: string): Promise<string[]> {
  return once(`info ${apiBaseUrl}`, async () => {
    const [routes, faq, store] = await Promise.all([
      seoRoutesOnce(apiBaseUrl),
      fetchBuildJson<{ items?: unknown[] }>(apiBaseUrl, '/content/faq'),
      fetchBuildJson<{ shipping?: PublicStoreShipping }>(apiBaseUrl, '/store'),
    ]);
    return infoPageSlugs({
      routes,
      faqCount: Array.isArray(faq?.items) ? faq.items.length : 0,
      shipping: store?.shipping ?? null,
    });
  });
}
