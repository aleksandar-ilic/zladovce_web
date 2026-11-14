import { Routes } from '@angular/router';
import { HOME_DESCRIPTION, SeoData, SHOP_DESCRIPTION } from './core/seo';

/**
 * Storefront routes (PROJECT_SPECIFICATION.md P1.3). Every feature is lazy loaded.
 * Route `data` feeds the SEO service (core/seo.ts): `description` and `noindex`. Routes without
 * a `title` (category, product) set title, description, canonical URL and JSON-LD themselves.
 * When a route is added here, also give it a render mode in app.routes.server.ts and,
 * if it belongs in the menu, an entry in core/navigation.ts.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Zladovce – domaći džemovi, sokovi, sirće i kompoti',
    data: { description: HOME_DESCRIPTION } satisfies SeoData,
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'prodavnica',
    title: 'Prodavnica – Zladovce',
    data: { description: SHOP_DESCRIPTION } satisfies SeoData,
    loadComponent: () => import('./features/shop/shop.page').then((m) => m.ShopPage),
  },
  {
    path: 'prodavnica/:categorySlug',
    loadComponent: () => import('./features/shop/shop.page').then((m) => m.ShopPage),
  },
  {
    path: 'proizvod/:slug',
    loadComponent: () => import('./features/product/product.page').then((m) => m.ProductPage),
  },
  {
    path: 'korpa',
    title: 'Korpa – Zladovce',
    data: { noindex: true } satisfies SeoData,
    loadComponent: () => import('./features/cart/cart.page').then((m) => m.CartPage),
  },
  {
    path: 'porucivanje',
    title: 'Poručivanje – Zladovce',
    data: { noindex: true } satisfies SeoData,
    loadComponent: () => import('./features/checkout/checkout.page').then((m) => m.CheckoutPage),
  },
  {
    path: 'porudzbina-primljena',
    title: 'Porudžbina je primljena – Zladovce',
    data: { noindex: true } satisfies SeoData,
    loadComponent: () =>
      import('./features/checkout/confirmation.page').then((m) => m.ConfirmationPage),
  },
  {
    path: '**',
    title: 'Stranica nije pronađena – Zladovce',
    data: { noindex: true } satisfies SeoData,
    loadComponent: () => import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
