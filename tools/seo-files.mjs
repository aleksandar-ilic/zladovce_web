/**
 * sitemap.xml and robots.txt for the storefront (pure functions, no file system access).
 * Used by tools/generate-seo-files.mjs after the build and unit-tested from the storefront.
 */

/** Pages that exist without catalog data and are always prerendered. */
export const STATIC_PATHS = ['/', '/prodavnica'];

/** Client-only pages that must not be crawled (and are never in the sitemap). Tracking follows in Phase 6. */
export const DISALLOWED_PATHS = ['/korpa', '/porucivanje', '/porudzbina-primljena'];

export const DEFAULT_SITE_URL = 'http://localhost:4200';

/** `https://zladovce.com/` → `https://zladovce.com`; empty → the local default. */
export function normaliseSiteUrl(value) {
  const trimmed = (value ?? '').trim();
  return (trimmed === '' ? DEFAULT_SITE_URL : trimmed).replace(/\/+$/, '');
}

export function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** `2026-11-14T10:00:00Z` → `2026-11-14`; anything unreadable → undefined. */
export function toLastmod(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

/**
 * Sitemap entries: the static pages, then every prerendered category and product page (sorted),
 * with `lastmod` from `GET /seo/routes` when it was available.
 */
export function sitemapEntries({ categories = [], products = [], updatedAt = {} } = {}) {
  const lastmod = (kind, slug) => toLastmod(updatedAt[kind]?.[slug]);
  return [
    ...STATIC_PATHS.map((path) => ({ path })),
    ...[...new Set(categories)]
      .sort()
      .map((slug) => ({ path: `/prodavnica/${slug}`, lastmod: lastmod('categories', slug) })),
    ...[...new Set(products)]
      .sort()
      .map((slug) => ({ path: `/proizvod/${slug}`, lastmod: lastmod('products', slug) })),
  ];
}

export function buildSitemap(siteUrl, entries) {
  const base = normaliseSiteUrl(siteUrl);
  const urls = entries.map((entry) => {
    const lines = [`    <loc>${xmlEscape(`${base}${entry.path}`)}</loc>`];
    if (entry.lastmod) {
      lines.push(`    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>`);
    }
    return `  <url>\n${lines.join('\n')}\n  </url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

export function buildRobots(siteUrl, disallow = DISALLOWED_PATHS) {
  const base = normaliseSiteUrl(siteUrl);
  return [
    'User-agent: *',
    ...disallow.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

/** `{ categories: [{ slug, updatedAt }], … }` → `{ categories: { slug: updatedAt }, … }`. */
export function updatedAtBySlug(routes) {
  const index = (items) =>
    Object.fromEntries(
      (Array.isArray(items) ? items : [])
        .filter((item) => item && typeof item.slug === 'string')
        .map((item) => [item.slug, item.updatedAt]),
    );
  return { categories: index(routes?.categories), products: index(routes?.products) };
}
