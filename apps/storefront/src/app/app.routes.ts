import { Routes } from '@angular/router';
import { SeoData } from './core/seo';

/**
 * Storefront routes (PROJECT_SPECIFICATION.md P1.3). Every feature is lazy loaded.
 * Route `data` feeds the SEO service (core/seo.ts): `description` and `noindex`.
 * When a route is added here, also give it a render mode in app.routes.server.ts and,
 * if it belongs in the menu, an entry in core/navigation.ts.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Zladovce – domaći džemovi, sokovi, sirće i kompoti',
    data: {
      description:
        'Zladovce – porodični posao sa juga Srbije. Domaći džemovi, voćni sokovi, sirće i kompoti, sa dostavom širom Srbije i plaćanjem pouzećem.',
    } satisfies SeoData,
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'korpa',
    title: 'Korpa – Zladovce',
    data: { noindex: true } satisfies SeoData,
    loadComponent: () => import('./features/cart/cart.page').then((m) => m.CartPage),
  },
  {
    path: '**',
    title: 'Stranica nije pronađena – Zladovce',
    data: { noindex: true } satisfies SeoData,
    loadComponent: () => import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
