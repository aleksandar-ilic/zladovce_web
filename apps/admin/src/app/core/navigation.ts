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
  /**
   * A live number next to the label: `receivedOrders` = new orders waiting to be accepted,
   * `deadEmails` = customer emails that could not be sent.
   */
  badge?: 'receivedOrders' | 'deadEmails';
}

/**
 * Side navigation of the admin shell. Only pages that exist are listed, in the order of
 * PROJECT_SPECIFICATION §12; later phases add their entries (blog, customers, reports …).
 */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  {
    label: 'Kontrolna tabla',
    path: '/',
    exact: true,
    icon: 'M4 5h7v8H4zM13 5h7v5h-7zM13 12h7v8h-7zM4 15h7v5H4z',
  },
  {
    label: 'Porudžbine',
    path: '/porudzbine',
    // receipt
    icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4',
    badge: 'receivedOrders',
  },
  {
    label: 'E-poruke',
    path: '/e-poruke',
    // envelope
    icon: 'M3 6h18v12H3zM3 7l9 6 9-6',
    badge: 'deadEmails',
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
  {
    label: 'Kuriri',
    path: '/kuriri',
    // delivery truck
    icon: 'M3 6h11v10H3zM14 9h4l3 3v4h-7zM7 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01',
    roles: ['Owner'],
  },
  {
    label: 'Podešavanja',
    path: '/podesavanja',
    // sliders
    icon: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
    roles: ['Owner'],
  },
];
