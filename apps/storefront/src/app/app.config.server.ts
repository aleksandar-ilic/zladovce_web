import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { parseAppConfig, provideAppConfig } from '@zladovce/api';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { normaliseSiteUrl, SITE_URL } from './core/site-url';

/**
 * Configuration for the build-time prerender. There is no browser and no /config.json here,
 * so both addresses come from the build environment:
 *
 *   ZLADOVCE_API_BASE_URL=https://api.example.com/api/v1   API read while prerendering
 *                                                           (default http://localhost:5080/api/v1)
 *   ZLADOVCE_SITE_URL=https://zladovce.com                  canonical/Open Graph/JSON-LD URLs
 *                                                           (default http://localhost:4200)
 */
const buildTimeConfig = parseAppConfig({
  apiBaseUrl: process.env['ZLADOVCE_API_BASE_URL'] || 'http://localhost:5080/api/v1',
});

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    provideAppConfig(buildTimeConfig),
    { provide: SITE_URL, useValue: normaliseSiteUrl(process.env['ZLADOVCE_SITE_URL']) },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
