import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CART_STORAGE_KEY, CartStore } from '@zladovce/shared';
import { App } from './app';
import { routes } from './app.routes';
import { serverRoutes } from './app.routes.server';
import { CART_PATH, FOOTER_NAV, MAIN_NAV } from './core/navigation';

async function renderApp() {
  TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
  const fixture = TestBed.createComponent(App);
  await TestBed.inject(Router).navigateByUrl('/');
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

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
    expect(links.map(text)).toEqual(MAIN_NAV.map((item) => item.label));
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
      JSON.stringify({ version: 1, lines: [{ variantId: 'v', quantity: 4 }] }),
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
    ).toEqual([...MAIN_NAV.map((item) => item.path), CART_PATH]);

    dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(root.querySelector('#sf-mobile-menu')).toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
    expect(document.body.style.overflow).toBe('');
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
      FOOTER_NAV.map((i) => i.label),
    );
    expect(text(footer ?? null)).toContain(`© ${new Date().getFullYear()} Zladovce`);
    expect(text(footer ?? null)).not.toMatch(/@|\+381|tel\.|telefon/i);
  });
});

describe('navigation config', () => {
  const resolves = async (path: string): Promise<string> => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const harness = await RouterTestingHarness.create(path);
    return (harness.routeNativeElement as HTMLElement).tagName.toLowerCase();
  };

  it.each([...new Set([...MAIN_NAV, ...FOOTER_NAV].map((item) => item.path)), CART_PATH])(
    'menu link %s leads to an existing page',
    async (path) => {
      expect(await resolves(path)).not.toBe('sf-not-found-page');
    },
  );

  it('contains only pages that exist in this phase', () => {
    expect(MAIN_NAV.map((item) => item.label)).toEqual(['Početna']);
  });
});

describe('pages', () => {
  const open = async (path: string): Promise<HTMLElement> => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const harness = await RouterTestingHarness.create(path);
    return harness.routeNativeElement as HTMLElement;
  };

  beforeEach(() => localStorage.clear());

  it('homepage has one h1, Serbian copy and working in-page links only', async () => {
    const page = await open('/');
    expect(page.querySelectorAll('h1').length).toBe(1);
    expect(text(page.querySelector('h1'))).toBe('Domaći ukusi, pripremljeni kao za svoju kuću');
    expect(text(page)).not.toMatch(/organsk|lorem/i);
    for (const link of page.querySelectorAll('a')) {
      const fragment = link.getAttribute('href')?.split('#')[1];
      expect(fragment).toBeTruthy();
      expect(page.querySelector(`#${fragment}`)).not.toBeNull();
    }
  });

  it('cart shows the empty state with a way back', async () => {
    const page = await open('/korpa');
    expect(text(page.querySelector('h1'))).toBe('Korpa');
    expect(text(page)).toContain('Vaša korpa je prazna');
    expect(page.querySelector('ui-empty-state a')?.getAttribute('href')).toBe('/');
  });

  it('cart shows the stored quantity and can be emptied', async () => {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ version: 1, lines: [{ variantId: 'v', quantity: 2 }] }),
    );
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const harness = await RouterTestingHarness.create('/korpa');
    const page = harness.routeNativeElement as HTMLElement;
    expect(text(page)).toContain('Broj proizvoda u korpi: 2');
    page.querySelector<HTMLButtonElement>('button')?.click();
    harness.detectChanges();
    expect(text(page)).toContain('Vaša korpa je prazna');
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it('unknown URLs show the Serbian 404 page', async () => {
    const page = await open('/ne-postoji');
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
