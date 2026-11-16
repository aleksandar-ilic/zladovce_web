import { Routes } from '@angular/router';
import { HOME_DESCRIPTION, HOME_TITLE, SeoData, SHOP_DESCRIPTION } from './core/seo';
import { infoPageMatch } from './core/navigation';

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
    title: HOME_TITLE,
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
    path: 'track-order',
    title: 'Praćenje porudžbine – Zladovce',
    data: { noindex: true } satisfies SeoData,
    loadComponent: () => import('./features/tracking/tracking.page').then((m) => m.TrackingPage),
  },
  {
    // Serbian alias; `/track-order` is canonical (email links). The fragment `#kod=…` is kept.
    path: 'pracenje-porudzbine',
    pathMatch: 'full',
    redirectTo: 'track-order',
  },
  {
    path: 'kontakt',
    title: 'Kontakt – Zladovce',
    data: {
      description:
        'Pišite porodici Zladovce: pitanja o proizvodima, porudžbinama i dostavi. Kontakt podaci i formular za poruku.',
    } satisfies SeoData,
    loadComponent: () => import('./features/contact/contact.page').then((m) => m.ContactPage),
  },
  {
    // Blog list and category; title, description and canonical are set by the page.
    path: 'blog',
    loadComponent: () => import('./features/blog/blog-list.page').then((m) => m.BlogListPage),
  },
  {
    path: 'blog/kategorija/:categorySlug',
    loadComponent: () => import('./features/blog/blog-list.page').then((m) => m.BlogListPage),
  },
  {
    path: 'blog/:slug',
    loadComponent: () => import('./features/blog/blog-post.page').then((m) => m.BlogPostPage),
  },
  {
    // Email links `/newsletter/potvrda#token=…`; client only, noindex, disallowed in robots.txt.
    path: 'newsletter/potvrda',
    title: 'Potvrda prijave – Zladovce',
    data: { noindex: true, newsletterAction: 'confirm' },
    loadComponent: () =>
      import('./features/newsletter/newsletter-token.page').then((m) => m.NewsletterTokenPage),
  },
  {
    path: 'newsletter/odjava',
    title: 'Odjava – Zladovce',
    data: { noindex: true, newsletterAction: 'unsubscribe' },
    loadComponent: () =>
      import('./features/newsletter/newsletter-token.page').then((m) => m.NewsletterTokenPage),
  },
  {
    // O nama, Česta pitanja, Dostava i plaćanje, Politika privatnosti, Uslovi korišćenja
    // (core/navigation.ts INFO_PAGES). Matches only those slugs; the page sets its own SEO.
    path: ':page',
    canMatch: [infoPageMatch],
    loadComponent: () => import('./features/info/info.page').then((m) => m.InfoPage),
  },
  {
    path: '**',
    title: 'Stranica nije pronađena – Zladovce',
    data: { noindex: true } satisfies SeoData,
    loadComponent: () => import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
