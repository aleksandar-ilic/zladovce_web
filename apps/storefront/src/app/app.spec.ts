import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CART_STORAGE_KEY, CartStore } from '@zladovce/shared';
import { App } from './app';
import { routes } from './app.routes';
import { RenderMode } from '@angular/ssr';
import { serverRoutes } from './app.routes.server';
import {
  CART_PATH,
  FOOTER_INFO_NAV,
  FOOTER_NAV,
  INFO_PAGES,
  MAIN_NAV,
  visibleNav,
} from './core/navigation';
import { deliveryFacts } from './features/home/home.page';
import {
  API,
  CATEGORY,
  listItem,
  nb,
  paged,
  settle,
  STORE,
  testProviders,
} from './testing/fixtures';

async function renderApp() {
  TestBed.configureTestingModule({ providers: [provideRouter(routes), ...testProviders()] });
  const fixture = TestBed.createComponent(App);
  await TestBed.inject(Router).navigateByUrl('/');
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

/** Links shown before (and without) any optional content. */
const ALWAYS_MAIN = visibleNav(MAIN_NAV, new Set());

const text = (element: Element | null): string =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('storefront shell', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    document.body.style.overflow = '';
  });

  it('has the landmarks, a skip link and the wordmark', async () => {
    const { root } = await renderApp();
    expect(root.querySelector('sf-header')).not.toBeNull();
    expect(root.querySelector('main#sadrzaj')).not.toBeNull();
    expect(root.querySelector('sf-footer')).not.toBeNull();
    expect(text(root.querySelector('a.skip-link'))).toBe('Preskoči na sadržaj');
    expect(text(root.querySelector('sf-header a[routerLink="/"]'))).toBe('Zladovce');
  });

  it('moves focus to the main content from the skip link', async () => {
    const { root } = await renderApp();
    root.querySelector<HTMLElement>('a.skip-link')?.click();
    expect(document.activeElement).toBe(root.querySelector('main'));
  });

  it('builds the main navigation from the config and marks the current page', async () => {
    const { root } = await renderApp();
    const links = [...root.querySelectorAll('sf-header nav[aria-label="Glavna navigacija"] a')];
    expect(links.map(text)).toEqual(ALWAYS_MAIN.map((item) => item.label));
    expect(links[0]?.getAttribute('href')).toBe('/');
    expect(links[0]?.getAttribute('aria-current')).toBe('page');
  });

  it('shows the cart count from the CartStore and updates it', async () => {
    const { fixture, root } = await renderApp();
    const count = root.querySelector('[data-testid="cart-count"]');
    const link = root.querySelector(`sf-header a[href="${CART_PATH}"]`);
    expect(text(count)).toBe('0');
    expect(link?.getAttribute('aria-label')).toBe('Korpa, broj proizvoda: 0');

    const cart = TestBed.inject(CartStore);
    cart.add('variant-1', 2);
    cart.add('variant-2');
    fixture.detectChanges();
    expect(text(count)).toBe('3');
    expect(link?.getAttribute('aria-label')).toBe('Korpa, broj proizvoda: 3');
  });

  it('restores the cart count from localStorage', async () => {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ version: 2, lines: [{ variantId: 'v', quantity: 4 }] }),
    );
    const { root } = await renderApp();
    expect(text(root.querySelector('[data-testid="cart-count"]'))).toBe('4');
  });

  it('opens the mobile menu as a dialog and closes it with Escape, returning focus', async () => {
    const { fixture, root } = await renderApp();
    const toggle = root.querySelector<HTMLButtonElement>('button[aria-controls="sf-mobile-menu"]');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('#sf-mobile-menu')).toBeNull();

    toggle?.click();
    fixture.detectChanges();
    const dialog = root.querySelector<HTMLElement>('#sf-mobile-menu');
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(document.body.style.overflow).toBe('hidden');
    expect(
      [...(dialog?.querySelectorAll('nav a') ?? [])].map((a) => a.getAttribute('href')),
    ).toEqual([...ALWAYS_MAIN.map((item) => item.path), CART_PATH]);

    dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(root.querySelector('#sf-mobile-menu')).toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
    expect(document.body.style.overflow).toBe('');
  });

  it('opens the category menu next to "Prodavnica" with real categories', async () => {
    const { fixture, root } = await renderApp();
    const toggle = root.querySelector<HTMLButtonElement>('[data-testid="categories-toggle"]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .match(`${API}/catalog/categories`)
      .forEach((r) => r.flush({ items: [CATEGORY] }));
    await settle(() => fixture.detectChanges());
    const menu = root.querySelector('[data-testid="categories-menu"]');
    expect([...(menu?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('href'))).toEqual([
      '/prodavnica',
      '/prodavnica/dzemovi-proba',
    ]);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="categories-menu"]')).toBeNull();
  });

  it('closes the mobile menu with its close button and after choosing a link', async () => {
    const { fixture, root } = await renderApp();
    const toggle = root.querySelector<HTMLButtonElement>('button[aria-controls="sf-mobile-menu"]');

    toggle?.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('button[aria-label="Zatvori meni"]')?.click();
    fixture.detectChanges();
    expect(root.querySelector('#sf-mobile-menu')).toBeNull();

    toggle?.click();
    fixture.detectChanges();
    root.querySelector<HTMLAnchorElement>('#sf-mobile-menu nav a')?.click();
    fixture.detectChanges();
    expect(root.querySelector('#sf-mobile-menu')).toBeNull();
  });

  it('renders the footer navigation and the current year without invented contact details', async () => {
    const { root } = await renderApp();
    const footer = root.querySelector('sf-footer');
    expect([...(footer?.querySelectorAll('nav a') ?? [])].map(text)).toEqual(
      visibleNav(FOOTER_NAV, new Set()).map((i) => i.label),
    );
    expect(text(footer ?? null)).toContain(`© ${new Date().getFullYear()} Zladovce`);
    expect(text(footer ?? null)).not.toMatch(/@|\+381|tel\.|telefon/i);
  });
});

describe('navigation config', () => {
  const resolves = async (path: string): Promise<string> => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), ...testProviders()] });
    const harness = await RouterTestingHarness.create(path);
    return (harness.routeNativeElement as HTMLElement).tagName.toLowerCase();
  };

  it.each([
    ...new Set([...MAIN_NAV, ...FOOTER_NAV, ...FOOTER_INFO_NAV].map((item) => item.path)),
    CART_PATH,
  ])(
    'menu link %s leads to an existing page',
    async (path) => {
      expect(await resolves(path)).not.toBe('sf-not-found-page');
    },
  );

  it('contains only pages that exist; optional pages require their content', () => {
    expect(MAIN_NAV.map((item) => [item.label, item.requires ?? null])).toEqual([
      ['Početna', null],
      ['Prodavnica', null],
      ['O nama', 'about'],
      ['Blog', 'blog'],
      ['Kontakt', null],
      ['Praćenje porudžbine', null],
    ]);
    expect(FOOTER_INFO_NAV.map((item) => [item.path, item.requires])).toEqual([
      ['/cesta-pitanja', 'faq'],
      ['/dostava-i-placanje', 'delivery'],
      ['/politika-privatnosti', 'privacy'],
      ['/uslovi-koriscenja', 'terms'],
    ]);
    // Every informational page is reachable from the header or the footer.
    const linked = new Set([...MAIN_NAV, ...FOOTER_INFO_NAV].map((item) => item.path));
    for (const page of INFO_PAGES) {
      expect(linked.has(`/${page.slug}`)).toBe(true);
    }
  });
});

describe('conditional navigation links', () => {
  beforeEach(() => localStorage.clear());

  it('shows optional pages in header and footer only while they have content, refreshed from the API', async () => {
    const { fixture, root } = await renderApp();
    const http = TestBed.inject(HttpTestingController);
    const headerLinks = () =>
      [...root.querySelectorAll('sf-header nav[aria-label="Glavna navigacija"] a')].map(text);
    const footerInfo = () =>
      [...root.querySelectorAll('sf-footer [data-testid="footer-info"] a')].map(text);

    // Nothing known yet: only pages that always exist.
    expect(headerLinks()).toEqual(['Početna', 'Prodavnica', 'Kontakt', 'Praćenje porudžbine']);
    expect(root.querySelector('[data-testid="footer-info"]')).toBeNull();

    http.expectOne(`${API}/seo/routes`).flush({
      categories: [],
      products: [],
      blogPosts: [{ slug: 'prvi-tekst', updatedAt: '2026-11-15T10:00:00Z' }],
      blogCategories: [],
      pages: [
        { key: 'about', updatedAt: '2026-11-15T10:00:00Z' },
        { key: 'terms', updatedAt: '2026-11-15T10:00:00Z' },
      ],
    });
    http
      .expectOne(`${API}/content/faq`)
      .flush({ items: [{ id: 'f1', question: 'Kako plaćam?', answer: 'Pouzećem.' }] });
    http.expectOne(`${API}/store`).flush({
      ...STORE,
      contact: { email: 'prodaja@example.com', phone: '+381 64 000 0000', address: null },
    });
    await settle(() => fixture.detectChanges());

    expect(headerLinks()).toEqual([
      'Početna',
      'Prodavnica',
      'O nama',
      'Blog',
      'Kontakt',
      'Praćenje porudžbine',
    ]);
    // No privacy page and no delivery facts (shipping price 0): those stay unlinked.
    expect(footerInfo()).toEqual(['Česta pitanja', 'Uslovi korišćenja']);
    const contact = root.querySelector('[data-testid="footer-contact"]');
    expect(contact?.querySelector('a[href="tel:+381640000000"]')).not.toBeNull();
    expect(contact?.querySelector('a[href="mailto:prodaja@example.com"]')).not.toBeNull();
  });

  it('uses the store logo in the header when one is set', async () => {
    const { fixture, root } = await renderApp();
    TestBed.inject(HttpTestingController)
      .expectOne(`${API}/store`)
      .flush({
        ...STORE,
        logo: {
          key: 'logos/l1',
          baseUrl: 'http://localhost:9000/media/logos/l1',
          widths: [400, 800],
          width: 800,
          height: 300,
          emailPngUrl: 'http://localhost:9000/media/logos/l1/email.png',
        },
      });
    await settle(() => fixture.detectChanges());
    const home = root.querySelector('sf-header a[routerLink="/"]');
    const logo = home?.querySelector('img');
    expect(logo?.getAttribute('src')).toBe('http://localhost:9000/media/logos/l1/400.webp');
    expect(logo?.getAttribute('alt')).toBe('');
    expect(home?.getAttribute('aria-label')).toBe('Zladovce – početna strana');
    expect(text(home ?? null)).toBe('');
  });
});

describe('pages', () => {
  const open = async (path: string) => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), ...testProviders()] });
    const harness = await RouterTestingHarness.create(path);
    return { harness, page: harness.routeNativeElement as HTMLElement };
  };

  beforeEach(() => localStorage.clear());

  it('homepage has one h1, honest Serbian copy and links only to existing pages', async () => {
    const { page } = await open('/');
    expect(page.querySelectorAll('h1').length).toBe(1);
    expect(text(page.querySelector('h1'))).toBe('Domaći ukusi, pripremljeni kao za svoju kuću');
    expect(text(page)).not.toMatch(
      /organsk|lorem|sertifik|nagrad|najprodavanij|newsletter|utisci/i,
    );
    expect(text(page)).toContain('Platite pouzećem');
    for (const link of page.querySelectorAll('a')) {
      const href = link.getAttribute('href') ?? '';
      const [path, fragment] = href.split('#');
      if (fragment) {
        expect(page.querySelector(`#${fragment}`)).not.toBeNull();
      } else {
        expect(path).toMatch(/^\/(prodavnica(\/[a-z0-9-]+)?|proizvod\/[a-z0-9-]+)$/);
      }
    }
  });

  it('homepage shows featured categories and products from the API, no empty sections', async () => {
    const { harness, page } = await open('/');
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne(`${API}/catalog/categories`)
      .flush({ items: [CATEGORY, { ...CATEGORY, id: 'e', slug: 'prazna', productCount: 0 }] });
    http.expectOne(`${API}/store`).flush(STORE);
    for (const request of http.match((r) => r.url === `${API}/catalog/products`)) {
      expect(request.request.params.get('featured')).toBe('true');
      request.flush(paged([listItem()]));
    }
    await settle(() => harness.detectChanges());
    for (const request of http.match((r) => r.url === `${API}/catalog/products`)) {
      request.flush(paged([listItem()]));
    }
    await settle(() => harness.detectChanges());
    expect(page.querySelectorAll('[data-testid="home-categories"] li').length).toBe(1);
    expect(
      page.querySelectorAll('[data-testid="home-featured"] [data-testid="product-card"]').length,
    ).toBe(1);
    expect(page.querySelector('[data-testid="hero-photos"]')).not.toBeNull();
    // Shipping price 0 and no other values configured: no delivery block.
    expect(page.querySelector('[data-testid="delivery"]')).toBeNull();
  });

  it('homepage shows "Najprodavanije" only when something has sold', async () => {
    const { harness, page } = await open('/');
    const http = TestBed.inject(HttpTestingController);
    const bestsellers = http.match((r) => r.url === `${API}/catalog/bestsellers`);
    expect(bestsellers.length).toBe(1);
    expect(bestsellers[0]!.request.params.get('limit')).toBe('4');
    bestsellers[0]!.flush({ items: [] });
    await settle(() => harness.detectChanges());
    expect(page.querySelector('[data-testid="home-bestsellers"]')).toBeNull();
    expect(text(page)).not.toContain('Najprodavanije');
  });

  it('homepage lists the best sellers from the API', async () => {
    const { harness, page } = await open('/');
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne((r) => r.url === `${API}/catalog/bestsellers`)
      .flush({ items: [listItem(), listItem({ id: 'p2', slug: 'sok-od-jabuke', name: 'Sok' })] });
    await settle(() => harness.detectChanges());
    const section = page.querySelector('[data-testid="home-bestsellers"]');
    expect(section?.querySelectorAll('[data-testid="product-card"]').length).toBe(2);
    expect(text(page)).toContain('Najprodavanije');
  });

  it('delivery facts list only configured values', () => {
    expect(deliveryFacts(STORE.shipping)).toEqual([]);
    expect(deliveryFacts(null)).toEqual([]);
    expect(
      deliveryFacts({
        ...STORE.shipping,
        price: 350,
        freeShippingThreshold: 5000,
        minOrderAmount: 1000,
        estimatedDeliveryText: '2–3 radna dana',
      }).map((f) => nb(`${f.title}: ${f.text}`)),
    ).toEqual([
      'Cena dostave: 350 RSD',
      'Besplatna dostava: Za porudžbine od 5.000 RSD',
      'Najmanja porudžbina: 1.000 RSD',
      'Rok isporuke: 2–3 radna dana',
    ]);
    expect(deliveryFacts({ ...STORE.shipping, enabled: false, price: 350 })).toEqual([]);
  });

  it('unknown URLs show the Serbian 404 page', async () => {
    const { page } = await open('/ne-postoji');
    expect(page.tagName.toLowerCase()).toBe('sf-not-found-page');
    expect(text(page.querySelector('h1'))).toBe('Stranica nije pronađena');
    expect(page.querySelector('a')?.getAttribute('href')).toBe('/');
    expect(TestBed.inject(Router).config.at(-1)?.path).toBe('**');
  });
});

describe('render modes', () => {
  it('every server route matches an application route', () => {
    const appPaths = routes.map((route) => route.path);
    for (const serverRoute of serverRoutes) {
      expect(appPaths).toContain(serverRoute.path);
    }
  });

  it('prerenders content pages and keeps the cart client-only', () => {
    const mode = (path: string) => serverRoutes.find((r) => r.path === path)?.renderMode;
    expect(mode('')).toBe(RenderMode.Prerender);
    expect(mode('prodavnica')).toBe(RenderMode.Prerender);
    expect(mode('prodavnica/:categorySlug')).toBe(RenderMode.Prerender);
    expect(mode('proizvod/:slug')).toBe(RenderMode.Prerender);
    expect(mode('korpa')).toBe(RenderMode.Client);
    expect(mode('porucivanje')).toBe(RenderMode.Client);
    expect(mode('porudzbina-primljena')).toBe(RenderMode.Client);
  });

  it('prerenders contact, blog and informational pages; newsletter links are client only', () => {
    const route = (path: string) => serverRoutes.find((r) => r.path === path);
    for (const path of ['kontakt', 'blog', 'blog/:slug', 'blog/kategorija/:categorySlug', ':page']) {
      expect(route(path)?.renderMode).toBe(RenderMode.Prerender);
    }
    for (const path of ['blog/:slug', 'blog/kategorija/:categorySlug', ':page']) {
      expect(route(path)).toHaveProperty('getPrerenderParams');
    }
    expect(route('newsletter/potvrda')?.renderMode).toBe(RenderMode.Client);
    expect(route('newsletter/odjava')?.renderMode).toBe(RenderMode.Client);
  });
});

describe('SEO meta tags', () => {
  const meta = (name: string): string | null =>
    document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? null;

  afterEach(() =>
    document.head
      .querySelectorAll('meta[name="robots"], meta[name="description"]')
      .forEach((m) => m.remove()),
  );

  it('follow the current route and are cleaned up on navigation', async () => {
    const { fixture } = await renderApp();
    const router = TestBed.inject(Router);
    expect(meta('description')).toContain('porodični posao sa juga Srbije');
    expect(meta('robots')).toBeNull();

    await router.navigateByUrl('/korpa');
    fixture.detectChanges();
    expect(meta('robots')).toBe('noindex');
    expect(meta('description')).toBeNull();

    await router.navigateByUrl('/ne-postoji');
    expect(meta('robots')).toBe('noindex');

    await router.navigateByUrl('/');
    expect(meta('robots')).toBeNull();
    expect(meta('description')).toContain('Zladovce');
  });
});
