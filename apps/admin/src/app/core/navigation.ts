import { AdminRole } from '@zladovce/models';

export type AdminNavSection = 'Prodaja' | 'Katalog' | 'Sadržaj' | 'Podešavanja';

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
   * `deadEmails` = customer emails that could not be sent, `unreadMessages` = unread messages
   * from the contact form.
   */
  badge?: 'receivedOrders' | 'deadEmails' | 'unreadMessages';
  /** Heading the entry is listed under; the dashboard has none. */
  section?: AdminNavSection;
}

/** Section headings in menu order. */
export const ADMIN_NAV_SECTIONS: readonly AdminNavSection[] = [
  'Prodaja',
  'Katalog',
  'Sadržaj',
  'Podešavanja',
];

/**
 * Side navigation of the admin shell, grouped into sections (Prodaja, Katalog, Sadržaj,
 * Podešavanja) so the list stays readable. Only pages that exist are listed; entries of one
 * section must be next to each other.
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
    section: 'Prodaja',
  },
  {
    label: 'Izveštaji',
    path: '/izvestaji',
    // bar chart
    icon: 'M4 20h16M7 16v-5M12 16V6M17 16v-8',
    section: 'Prodaja',
  },
  {
    label: 'Troškovi',
    path: '/troskovi',
    // wallet
    icon: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-3v3M16 13.5h2',
    roles: ['Owner'],
    section: 'Prodaja',
  },
  {
    label: 'Poruke kupaca',
    path: '/poruke',
    // speech bubble
    icon: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
    badge: 'unreadMessages',
    section: 'Prodaja',
  },
  {
    label: 'E-poruke',
    path: '/e-poruke',
    // envelope
    icon: 'M3 6h18v12H3zM3 7l9 6 9-6',
    badge: 'deadEmails',
    section: 'Prodaja',
  },
  {
    label: 'Proizvodi',
    path: '/proizvodi',
    // jar with a lid
    icon: 'M8 3h8v3H8zM7 6h10a1 1 0 0 1 1 1v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1zM6 11h12',
    section: 'Katalog',
  },
  {
    label: 'Kategorije',
    path: '/kategorije',
    // tag
    icon: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
    section: 'Katalog',
  },
  {
    label: 'Zalihe',
    path: '/zalihe',
    // shelves with boxes
    icon: 'M3 21h18M3 3v18M21 3v18M3 12h18M6 12V8h5v4M13 21v-5h5v5',
    section: 'Katalog',
  },
  {
    label: 'Blog',
    path: '/blog',
    // page with a folded corner
    icon: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
    section: 'Sadržaj',
  },
  {
    label: 'Sadržaj sajta',
    path: '/sadrzaj',
    // page layout
    icon: 'M3 4h18v16H3zM3 9h18M9 9v11',
    section: 'Sadržaj',
  },
  {
    label: 'Newsletter',
    path: '/newsletter',
    // paper plane
    icon: 'M21 3 3 11l7 3 3 7zM10 14 21 3',
    roles: ['Owner'],
    section: 'Sadržaj',
  },
  {
    label: 'Podešavanja',
    path: '/podesavanja',
    // sliders
    icon: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
    roles: ['Owner'],
    section: 'Podešavanja',
  },
  {
    label: 'Kuriri',
    path: '/kuriri',
    // delivery truck
    icon: 'M3 6h11v10H3zM14 9h4l3 3v4h-7zM7 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01',
    roles: ['Owner'],
    section: 'Podešavanja',
  },
  {
    label: 'Administratori',
    path: '/administratori',
    // two people
    icon: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M18 15c2 .5 3 2 3 5',
    roles: ['Owner'],
    section: 'Podešavanja',
  },
  {
    label: 'Dnevnik izmena',
    path: '/dnevnik-izmena',
    // clock with a back arrow
    icon: 'M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4',
    roles: ['Owner'],
    section: 'Podešavanja',
  },
];

export interface AdminNavGroup {
  section: AdminNavSection | null;
  items: AdminNavItem[];
}

/** Visible entries grouped by section, in menu order; empty sections are left out. */
export function groupNav(items: readonly AdminNavItem[]): AdminNavGroup[] {
  const groups: AdminNavGroup[] = [{ section: null, items: items.filter((i) => !i.section) }];
  for (const section of ADMIN_NAV_SECTIONS) {
    groups.push({ section, items: items.filter((i) => i.section === section) });
  }
  return groups.filter((group) => group.items.length > 0);
}
