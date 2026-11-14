import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { apiErrorInterceptor, correlationIdInterceptor } from '@zladovce/api';
import { provideSerbianLocale } from '@zladovce/utilities';
import { routes } from './app.routes';

/**
 * Providers shared by the browser and the build-time prerender.
 * APP_CONFIG is added separately: from /config.json in the browser (main.ts) and from the
 * build environment during prerendering (app.config.server.ts).
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    provideClientHydration(withEventReplay()),
    provideHttpClient(
      withFetch(),
      withInterceptors([correlationIdInterceptor, apiErrorInterceptor]),
    ),
    provideSerbianLocale(),
  ],
};
