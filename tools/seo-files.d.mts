export interface SitemapEntry {
  path: string;
  lastmod?: string;
}

type UpdatedAt = Record<string, string | undefined>;

export interface SitemapInput {
  categories?: readonly string[];
  products?: readonly string[];
  blogPosts?: readonly string[];
  blogCategories?: readonly string[];
  /** Slugs of the prerendered informational pages (`o-nama`, …). */
  infoPages?: readonly string[];
  updatedAt?: {
    categories?: UpdatedAt;
    products?: UpdatedAt;
    blogPosts?: UpdatedAt;
    blogCategories?: UpdatedAt;
    /** By CMS page key (`about`, `privacy`, …). */
    pages?: UpdatedAt;
  };
}

export interface InfoPageEntry {
  slug: string;
  key: string;
}

export const STATIC_PATHS: readonly string[];
export const BLOG_PATH: string;
export const INFO_PAGES: readonly InfoPageEntry[];
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
  blogPosts: Record<string, string>;
  blogCategories: Record<string, string>;
  pages: Record<string, string>;
};
