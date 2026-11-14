export interface NavItem {
  label: string;
  /** Router path starting with `/`. It must exist in app.routes.ts – the menu never links to a missing page. */
  path: string;
  /** Match the path exactly when highlighting the current page (needed for `/`). */
  exact?: boolean;
}

export const SHOP_PATH = '/prodavnica';

/**
 * Main navigation, used by the header and the mobile drawer. "Prodavnica" also opens the
 * category menu (real categories from the API). About, blog and contact are added in the
 * phases that build those pages.
 */
export const MAIN_NAV: readonly NavItem[] = [
  { label: 'Početna', path: '/', exact: true },
  { label: 'Prodavnica', path: SHOP_PATH },
];

/** Footer links. Legal and informational pages are added here when they exist. */
export const FOOTER_NAV: readonly NavItem[] = [...MAIN_NAV, { label: 'Korpa', path: '/korpa' }];

/** The cart link is shown separately in the header, with the item count. */
export const CART_PATH = '/korpa';

export const CHECKOUT_PATH = '/porucivanje';
export const ORDER_CONFIRMATION_PATH = '/porudzbina-primljena';

/**
 * Page with the terms of purchase, linked from the checkout's terms checkbox. The page is built
 * in Phase 7 (`/uslovi-koriscenja`); while this is null the label is plain text, never a dead link.
 */
export const TERMS_PAGE: NavItem | null = null;
