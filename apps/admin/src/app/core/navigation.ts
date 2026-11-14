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
 * entries as they build them, e.g.
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
];
