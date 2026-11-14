export interface NavItem {
  label: string;
  /** Router path starting with `/`. It must exist in app.routes.ts – the menu never links to a missing page. */
  path: string;
  /** Match the path exactly when highlighting the current page (needed for `/`). */
  exact?: boolean;
}

/**
 * Main navigation, used by the header and the mobile drawer.
 * Later phases add entries here as the pages are built, e.g.
 *   { label: 'Prodavnica', path: '/prodavnica' }
 */
export const MAIN_NAV: readonly NavItem[] = [{ label: 'Početna', path: '/', exact: true }];

/** Footer links. Legal and informational pages are added here when they exist. */
export const FOOTER_NAV: readonly NavItem[] = [...MAIN_NAV, { label: 'Korpa', path: '/korpa' }];

/** The cart link is shown separately in the header, with the item count. */
export const CART_PATH = '/korpa';
