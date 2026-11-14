import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { apiErrorInterceptor, correlationIdInterceptor } from '@zladovce/api';
import { authInterceptor, provideAuth } from '@zladovce/auth';
import { provideSerbianLocale } from '@zladovce/utilities';
import { routes } from './app.routes';

/**
 * APP_CONFIG is provided in main.ts after /config.json has been loaded.
 * Angular Material pieces used only by some pages (paginator texts, dialogs) are provided by
 * those pages, so they stay out of the initial bundle.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Order matters: correlation id → credentials → error mapping (innermost).
    provideHttpClient(
      withInterceptors([correlationIdInterceptor, authInterceptor, apiErrorInterceptor]),
    ),
    provideAuth({ signIn: '/prijava', home: '/' }),
    provideSerbianLocale(),
  ],
};
