import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { parseAppConfig, provideAppConfig } from '@zladovce/api';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

/**
 * Configuration for the build-time prerender. There is no browser and no /config.json here,
 * so the API base URL comes from the build environment:
 *
 *   ZLADOVCE_API_BASE_URL=https://api.example.com/api/v1 npm run build:storefront
 *
 * Phase 4 uses it to fetch the list of product, category and blog routes to prerender.
 */
const buildTimeConfig = parseAppConfig({
  apiBaseUrl: process.env['ZLADOVCE_API_BASE_URL'] || 'http://localhost:5080/api/v1',
});

const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering(withRoutes(serverRoutes)), provideAppConfig(buildTimeConfig)],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
