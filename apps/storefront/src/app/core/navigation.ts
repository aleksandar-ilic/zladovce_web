import { CanMatchFn } from '@angular/router';
import { CmsPageKey } from '@zladovce/models';

/**
 * Content a page needs before it may be linked. A page without its content shows the 404
 * view, so a menu entry with `requires` is shown only while `SiteContent` reports that content
 * (core/data/site-content.ts).
 */
export type ContentFlag = 'about' | 'blog' | 'faq' | 'delivery' | 'privacy' | 'terms';

export interface NavItem {
  label: string;
  /** Router path starting with `/`. It must exist in app.routes.ts – the menu never links to a missing page. */
  path: string;
  /** Match the path exactly when highlighting the current page (needed for `/`). */
  exact?: boolean;
  /** Shown only while this content exists. */
  requires?: ContentFlag;
}

export const SHOP_PATH = '/prodavnica';

/** Order tracking: the canonical path of the email links (`/pracenje-porudzbine` redirects here). */
export const TRACKING_PATH = '/track-order';

export const BLOG_PATH = '/blog';
export const BLOG_CATEGORY_PATH = '/blog/kategorija';
export const CONTACT_PATH = '/kontakt';

/** Kind of an informational page; decides which view `InfoPage` renders. */
export type InfoPageKind = 'about' | 'faq' | 'delivery' | 'privacy' | 'terms';

export interface InfoPageDef {
  /** URL segment (PROJECT_SPECIFICATION.md P1.3). */
  slug: string;
  kind: InfoPageKind;
  /** CMS page key, or null for the FAQ (its content are the FAQ items). */
  cmsKey: CmsPageKey | null;
  label: string;
}

/**
 * Single-segment informational pages served by one route (`:page`, app.routes.ts). They are
 * prerendered only when they have content (`GET /seo/routes` → `pages`, FAQ items, delivery
 * facts of the store settings); without content they show the 404 view and are never linked.
 * Keep in line with `INFO_PAGES` of tools/seo-files.mjs (a test compares them).
 */
export const INFO_PAGES: readonly InfoPageDef[] = [
  { slug: 'o-nama', kind: 'about', cmsKey: 'about', label: 'O nama' },
  { slug: 'cesta-pitanja', kind: 'faq', cmsKey: null, label: 'Česta pitanja' },
  { slug: 'dostava-i-placanje', kind: 'delivery', cmsKey: 'delivery', label: 'Dostava i plaćanje' },
  {
    slug: 'politika-privatnosti',
    kind: 'privacy',
    cmsKey: 'privacy',
    label: 'Politika privatnosti',
  },
  { slug: 'uslovi-koriscenja', kind: 'terms', cmsKey: 'terms', label: 'Uslovi korišćenja' },
];

export function infoPage(slug: string | null | undefined): InfoPageDef | null {
  return INFO_PAGES.find((page) => page.slug === slug) ?? null;
}

/** The `:page` route matches only the informational slugs; everything else falls to `**`. */
export const infoPageMatch: CanMatchFn = (_route, segments) =>
  segments.length === 1 && infoPage(segments[0]?.path) !== null;

export function infoPath(kind: InfoPageKind): string {
  return `/${INFO_PAGES.find((page) => page.kind === kind)!.slug}`;
}

/**
 * Main navigation, used by the header and the mobile drawer. "Prodavnica" also opens the
 * category menu (real categories from the API). "O nama" and "Blog" appear only while they
 * have content.
 */
export const MAIN_NAV: readonly NavItem[] = [
  { label: 'Početna', path: '/', exact: true },
  { label: 'Prodavnica', path: SHOP_PATH },
  { label: 'O nama', path: infoPath('about'), requires: 'about' },
  { label: 'Blog', path: BLOG_PATH, requires: 'blog' },
  { label: 'Kontakt', path: CONTACT_PATH },
  { label: 'Praćenje porudžbine', path: TRACKING_PATH },
];

/** The cart link is shown separately in the header, with the item count. */
export const CART_PATH = '/korpa';

/** Footer column "Kupovina". */
export const FOOTER_NAV: readonly NavItem[] = [...MAIN_NAV, { label: 'Korpa', path: CART_PATH }];

/** Footer column "Informacije": FAQ, delivery and the legal pages, each only with content. */
export const FOOTER_INFO_NAV: readonly NavItem[] = INFO_PAGES.filter(
  (page) => page.kind !== 'about',
).map((page) => ({ label: page.label, path: `/${page.slug}`, requires: page.kind }));

export const CHECKOUT_PATH = '/porucivanje';
export const ORDER_CONFIRMATION_PATH = '/porudzbina-primljena';

/**
 * Page with the terms of purchase, linked from the checkout's terms checkbox – only while the
 * terms page has content (`requires`); otherwise the label is plain text, never a dead link.
 */
export const TERMS_PAGE: NavItem = {
  label: 'Uslovi korišćenja',
  path: infoPath('terms'),
  requires: 'terms',
};

/** The entries whose content exists. */
export function visibleNav(
  items: readonly NavItem[],
  available: ReadonlySet<ContentFlag>,
): NavItem[] {
  return items.filter((item) => !item.requires || available.has(item.requires));
}
