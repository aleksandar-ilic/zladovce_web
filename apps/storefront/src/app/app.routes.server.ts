import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Render mode per route (PROJECT_SPECIFICATION.md P1.3). The build uses `outputMode: "static"`
 * (angular.json), so only two modes are allowed and no Node server exists at runtime:
 *
 *  - RenderMode.Prerender – HTML is generated at build time into dist/storefront/browser/<route>/index.html.
 *    Parameterised routes add `getPrerenderParams` returning every parameter set to render.
 *  - RenderMode.Client    – no HTML is generated; the host serves index.csr.html and the
 *    browser renders the page. Used for cart, checkout, confirmation and tracking.
 *
 * Paths here must match app.routes.ts (no leading slash). Add specific routes above the
 * catch-all; anything not listed is rendered in the browser.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'korpa', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Client },
];
