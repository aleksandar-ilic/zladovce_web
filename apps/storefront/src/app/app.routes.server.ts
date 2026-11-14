import { inject } from '@angular/core';
import { PrerenderFallback, RenderMode, ServerRoute } from '@angular/ssr';
import { APP_CONFIG } from '@zladovce/api';
import { seoRoutesOnce } from './core/prerender';

/**
 * Render mode per route (PROJECT_SPECIFICATION.md P1.3). The build uses `outputMode: "static"`
 * (angular.json), so only two modes are allowed and no Node server exists at runtime:
 *
 *  - RenderMode.Prerender – HTML is generated at build time into dist/storefront/browser/<route>/index.html.
 *    Parameterised routes add `getPrerenderParams` returning every parameter set to render.
 *  - RenderMode.Client    – no HTML is generated; the host serves index.csr.html and the
 *    browser renders the page. Used for cart, checkout, confirmation and tracking.
 *
 * Category and product pages are prerendered for every slug of `GET /seo/routes`, read from
 * `ZLADOVCE_API_BASE_URL` at build time (core/prerender.ts). When the API cannot be reached the
 * build still succeeds with the static pages only. A slug created after the build is rendered in
 * the browser (`PrerenderFallback.Client`; the host rewrites unknown paths to index.csr.html).
 *
 * Paths here must match app.routes.ts (no leading slash). Add specific routes above the
 * catch-all; anything not listed is rendered in the browser.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'prodavnica', renderMode: RenderMode.Prerender },
  {
    path: 'prodavnica/:categorySlug',
    renderMode: RenderMode.Prerender,
    fallback: PrerenderFallback.Client,
    async getPrerenderParams() {
      const routes = await seoRoutesOnce(inject(APP_CONFIG).apiBaseUrl);
      return routes.categories.map((route) => ({ categorySlug: route.slug }));
    },
  },
  {
    path: 'proizvod/:slug',
    renderMode: RenderMode.Prerender,
    fallback: PrerenderFallback.Client,
    async getPrerenderParams() {
      const routes = await seoRoutesOnce(inject(APP_CONFIG).apiBaseUrl);
      return routes.products.map((route) => ({ slug: route.slug }));
    },
  },
  { path: 'korpa', renderMode: RenderMode.Client },
  { path: 'porucivanje', renderMode: RenderMode.Client },
  { path: 'porudzbina-primljena', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Client },
];
