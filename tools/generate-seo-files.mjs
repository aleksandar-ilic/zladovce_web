#!/usr/bin/env node
/**
 * Writes sitemap.xml and robots.txt into the storefront build output. Runs after
 * `ng build storefront` (npm run build:storefront).
 *
 * - The sitemap lists the static pages and every category, product, blog post, blog category
 *   and informational page (o-nama, cesta-pitanja, …) that was actually prerendered (folders in
 *   dist/storefront/browser), so it never points at a page that the build did not produce
 *   (informational pages without content are not prerendered).
 * - robots.txt disallows cart, checkout, confirmation, tracking and the newsletter pages.
 * - `lastmod` comes from GET /seo/routes when the API is reachable; otherwise it is left out.
 *
 * Environment:
 *   ZLADOVCE_SITE_URL       public origin, e.g. https://zladovce.com (default http://localhost:4200)
 *   ZLADOVCE_API_BASE_URL   API read for lastmod (default http://localhost:5080/api/v1)
 *   argv[2]                 output folder (default dist/storefront/browser)
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INFO_PAGES,
  buildRobots,
  buildSitemap,
  normaliseSiteUrl,
  sitemapEntries,
  updatedAtBySlug,
} from './seo-files.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(process.argv[2] ?? join(root, 'dist/storefront/browser'));
const siteUrl = normaliseSiteUrl(process.env.ZLADOVCE_SITE_URL);
const apiBaseUrl = (process.env.ZLADOVCE_API_BASE_URL || 'http://localhost:5080/api/v1').replace(
  /\/+$/,
  '',
);

if (!existsSync(join(outDir, 'index.html'))) {
  console.error(
    `generate-seo-files: ${outDir} has no index.html – run the storefront build first.`,
  );
  process.exit(1);
}

/** Slugs of `<outDir>/<folder>/<slug>/index.html`. */
function prerenderedSlugs(folder) {
  const dir = join(outDir, folder);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'index.html')))
    .map((entry) => entry.name);
}

async function readUpdatedAt() {
  try {
    const response = await fetch(`${apiBaseUrl}/seo/routes`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return updatedAtBySlug(await response.json());
  } catch (error) {
    console.warn(
      `generate-seo-files: ${apiBaseUrl}/seo/routes not available (${error instanceof Error ? error.message : error}); writing the sitemap without lastmod.`,
    );
    return {};
  }
}

const categories = prerenderedSlugs('prodavnica');
const products = prerenderedSlugs('proizvod');
const blogCategories = prerenderedSlugs('blog/kategorija');
const blogPosts = prerenderedSlugs('blog').filter((slug) => slug !== 'kategorija');
const infoPages = INFO_PAGES.map((page) => page.slug).filter((slug) =>
  existsSync(join(outDir, slug, 'index.html')),
);
const dynamicCount =
  categories.length + products.length + blogCategories.length + blogPosts.length + infoPages.length;
const updatedAt = dynamicCount > 0 ? await readUpdatedAt() : {};
const entries = sitemapEntries({
  categories,
  products,
  blogPosts,
  blogCategories,
  infoPages,
  updatedAt,
});

writeFileSync(join(outDir, 'sitemap.xml'), buildSitemap(siteUrl, entries), 'utf8');
writeFileSync(join(outDir, 'robots.txt'), buildRobots(siteUrl), 'utf8');
console.log(
  `generate-seo-files: sitemap.xml (${entries.length} URLs: ${categories.length} categories, ${products.length} products, ${blogPosts.length} blog posts, ${blogCategories.length} blog categories, ${infoPages.length} info pages) and robots.txt for ${siteUrl}`,
);
