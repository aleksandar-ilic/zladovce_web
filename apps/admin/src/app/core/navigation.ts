import { AdminRole } from '@zladovce/models';

export interface AdminNavItem {
  label: string;
  /** Router path starting with `/`. It must exist in app.routes.ts. */
  path: string;
  /** Match the path exactly when highlighting the current page (needed for `/`). */
  exact?: boolean;
  /** SVG path data (24×24 viewBox, drawn as a 1.6px stroke). */
  icon: string;
  /** Roles that see the entry; omitted means every administrator. The route needs `roleGuard` too. */
  roles?: readonly AdminRole[];
}

/**
 * Side navigation of the admin shell. Only pages that exist are listed; later phases add
 * entries as they build them (order of PROJECT_SPECIFICATION §12), e.g.
 *   { label: 'Porudžbine', path: '/porudzbine', icon: '…' }
 *   { label: 'Podešavanja', path: '/podesavanja', icon: '…', roles: ['Owner'] }
 */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  {
    label: 'Kontrolna tabla',
    path: '/',
    exact: true,
    icon: 'M4 5h7v8H4zM13 5h7v5h-7zM13 12h7v8h-7zM4 15h7v5H4z',
  },
  {
    label: 'Proizvodi',
    path: '/proizvodi',
    // jar with a lid
    icon: 'M8 3h8v3H8zM7 6h10a1 1 0 0 1 1 1v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1zM6 11h12',
  },
  {
    label: 'Kategorije',
    path: '/kategorije',
    // tag
    icon: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
  },
  {
    label: 'Zalihe',
    path: '/zalihe',
    // shelves with boxes
    icon: 'M3 21h18M3 3v18M21 3v18M3 12h18M6 12V8h5v4M13 21v-5h5v5',
  },
];
