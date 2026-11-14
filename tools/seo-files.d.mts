export interface SitemapEntry {
  path: string;
  lastmod?: string;
}

export interface SitemapInput {
  categories?: readonly string[];
  products?: readonly string[];
  updatedAt?: {
    categories?: Record<string, string | undefined>;
    products?: Record<string, string | undefined>;
  };
}

export const STATIC_PATHS: readonly string[];
export const DISALLOWED_PATHS: readonly string[];
export const DEFAULT_SITE_URL: string;
export function normaliseSiteUrl(value: string | null | undefined): string;
export function xmlEscape(value: string): string;
export function toLastmod(value: unknown): string | undefined;
export function sitemapEntries(input?: SitemapInput): SitemapEntry[];
export function buildSitemap(
  siteUrl: string | null | undefined,
  entries: readonly SitemapEntry[],
): string;
export function buildRobots(
  siteUrl: string | null | undefined,
  disallow?: readonly string[],
): string;
export function updatedAtBySlug(routes: unknown): {
  categories: Record<string, string>;
  products: Record<string, string>;
};
