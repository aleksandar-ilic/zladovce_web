import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  apiErrorInterceptor,
  AppConfig,
  AuthConfig,
  correlationIdInterceptor,
  provideAppConfig,
} from '@zladovce/api';
import {
  authInterceptor,
  AuthService,
  CognitoClient,
  createAuthService,
  DEV_SESSION_KEY,
} from '@zladovce/auth';
import { AdminMe } from '@zladovce/models';
import { App } from './app';
import { routes } from './app.routes';
import { ADMIN_NAV } from './core/navigation';
import { DeadEmailsStore } from './core/dead-emails';
import { OrderSummaryStore } from './core/order-summary';

const API = 'http://localhost:5080/api/v1';
const ME_URL = `${API}/admin/me`;
const HEALTH_URL = 'http://localhost:5080/health';
const LOW_STOCK_URL = `${API}/admin/dashboard/low-stock`;
const SUMMARY_URL = `${API}/admin/orders/summary`;
const EMAILS_URL = `${API}/admin/emails`;
const DEV: AuthConfig = { mode: 'dev', dev: { email: 'vlasnik@zladovce.local', role: 'Owner' } };
const COGNITO: AuthConfig = {
  mode: 'cognito',
  cognito: { region: 'eu-central-1', userPoolId: 'eu-central-1_test', clientId: 'client-id' },
};
const OWNER: AdminMe = {
  id: '1',
  email: 'vlasnik@zladovce.local',
  fullName: 'Milica Petrović',
  role: 'Owner',
};

class FakeCognito implements CognitoClient {
  token: string | null = null;
  signInResult: string | Error = 'DONE';
  confirmResult: string | Error = 'DONE';
  readonly calls: string[] = [];

  async signIn(email: string, password: string): Promise<string> {
    this.calls.push(`signIn:${email}:${password}`);
    return this.resolve(this.signInResult);
  }
  async confirmSignIn(response: string): Promise<string> {
    this.calls.push(`confirm:${response}`);
    return this.resolve(this.confirmResult);
  }
  async signOut(): Promise<void> {
    this.calls.push('signOut');
    this.token = null;
  }
  async accessToken(): Promise<string | null> {
    return this.token;
  }
  private resolve(result: string | Error): string {
    if (result instanceof Error) {
      throw result;
    }
    if (result === 'DONE') {
      this.token = 'access-token';
    }
    return result;
  }
}

interface Context {
  fixture: ComponentFixture<App>;
  root: HTMLElement;
  router: Router;
  controller: HttpTestingController;
  auth: AuthService;
  cognito: FakeCognito;
}

/** Lets promises, lazy route loading and rendering finish. */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

async function start(auth: AuthConfig, url = '/'): Promise<Context> {
  const cognito = new FakeCognito();
  const config: AppConfig = { apiBaseUrl: API, healthUrl: HEALTH_URL, auth };
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  TestBed.configureTestingModule({
    providers: [
      provideAppConfig(config),
      provideRouter(routes),
      provideHttpClient(
        withInterceptors([correlationIdInterceptor, authInterceptor, apiErrorInterceptor]),
      ),
      provideHttpClientTesting(),
      { provide: AuthService, useFactory: () => createAuthService(config, () => cognito) },
    ],
  });
  const fixture = TestBed.createComponent(App);
  const router = TestBed.inject(Router);
  void router.navigateByUrl(url);
  await settle(fixture);
  return {
    fixture,
    root: fixture.nativeElement as HTMLElement,
    router,
    controller: TestBed.inject(HttpTestingController),
    auth: TestBed.inject(AuthService),
    cognito,
  };
}

const text = (element: Element | null | undefined): string =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

function type(root: HTMLElement, control: string, value: string): void {
  const input = root.querySelector<HTMLInputElement>(`input[formControlName="${control}"]`);
  if (!input) {
    throw new Error(`Input not found: ${control}`);
  }
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

async function submit(ctx: Context): Promise<void> {
  ctx.root.querySelector('form')?.dispatchEvent(new Event('submit'));
  await settle(ctx.fixture);
}

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('admin routing and guards', () => {
  it('sends a signed-out visitor to the Serbian sign-in page', async () => {
    const ctx = await start(COGNITO, '/');
    expect(ctx.router.url).toBe('/prijava');
    expect(text(ctx.root.querySelector('h1'))).toBe('Prijava u administraciju');
    expect(ctx.root.querySelector('adm-shell')).toBeNull();
    ctx.controller.verify();
  });

  it('remembers the requested page', async () => {
    const ctx = await start(COGNITO, '/porudzbine');
    expect(ctx.router.url).toBe('/prijava?returnUrl=%2Fporudzbine');
  });

  it('keeps a signed-in administrator away from the sign-in page', async () => {
    sessionStorage.setItem(DEV_SESSION_KEY, '1');
    const ctx = await start(DEV, '/prijava');
    expect(ctx.router.url).toBe('/');
    ctx.controller.expectOne(ME_URL).flush(OWNER);
    ctx.controller.expectOne(HEALTH_URL).flush('Healthy');
  });
});

describe('sign-in page (cognito mode)', () => {
  it('validates the form before calling Cognito', async () => {
    const ctx = await start(COGNITO, '/prijava');
    await submit(ctx);
    const errors = [...ctx.root.querySelectorAll('mat-error')].map(text);
    expect(errors).toEqual(['Ovo polje je obavezno.', 'Ovo polje je obavezno.']);

    type(ctx.root, 'email', 'nije-adresa');
    type(ctx.root, 'password', 'tajna');
    await submit(ctx);
    expect([...ctx.root.querySelectorAll('mat-error')].map(text)).toEqual([
      'Unesite ispravnu e-adresu.',
    ]);
    expect(ctx.cognito.calls).toEqual([]);
  });

  it('shows a Serbian error for wrong credentials and stays on the page', async () => {
    const ctx = await start(COGNITO, '/prijava');
    ctx.cognito.signInResult = Object.assign(new Error('Incorrect username or password.'), {
      name: 'NotAuthorizedException',
    });
    type(ctx.root, 'email', 'vlasnik@zladovce.local');
    type(ctx.root, 'password', 'pogresna');
    await submit(ctx);
    expect(text(ctx.root.querySelector('[data-testid="error"]'))).toBe(
      'Pogrešna e-adresa ili lozinka.',
    );
    expect(ctx.root.querySelector('[data-testid="error"]')?.getAttribute('role')).toBe('alert');
    expect(ctx.router.url).toBe('/prijava');
    expect(ctx.root.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
      false,
    );
  });

  it('shows the loading state while signing in, then opens the dashboard', async () => {
    const ctx = await start(COGNITO, '/prijava');
    type(ctx.root, 'email', 'vlasnik@zladovce.local');
    type(ctx.root, 'password', 'tajna');
    await submit(ctx);

    // Cognito accepted the credentials; the profile request is still pending.
    const button = ctx.root.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(button?.disabled).toBe(true);
    expect(text(button)).toBe('Prijavljivanje…');
    expect(ctx.root.querySelector('mat-progress-bar')).not.toBeNull();

    const me = ctx.controller.expectOne(ME_URL);
    expect(me.request.headers.get('Authorization')).toBe('Bearer access-token');
    me.flush(OWNER);
    await settle(ctx.fixture);

    expect(ctx.router.url).toBe('/');
    expect(ctx.root.querySelector('adm-shell')).not.toBeNull();
    ctx.controller.expectOne(HEALTH_URL).flush('Healthy');
  });

  it('returns to the page that was requested before sign-in', async () => {
    const ctx = await start(COGNITO, '/prijava?returnUrl=%2Fnepoznato');
    type(ctx.root, 'email', 'vlasnik@zladovce.local');
    type(ctx.root, 'password', 'tajna');
    await submit(ctx);
    ctx.controller.expectOne(ME_URL).flush(OWNER);
    await settle(ctx.fixture);
    expect(ctx.router.url).toBe('/nepoznato');
    expect(text(ctx.root.querySelector('main h1'))).toBe('Stranica nije pronađena');
  });

  it('walks an invited administrator through the new-password step', async () => {
    const ctx = await start(COGNITO, '/prijava');
    ctx.cognito.signInResult = 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED';
    type(ctx.root, 'email', 'urednik@zladovce.local');
    type(ctx.root, 'password', 'privremena');
    await submit(ctx);
    expect(text(ctx.root.querySelector('h1'))).toBe('Postavite novu lozinku');

    type(ctx.root, 'password', 'kratka');
    type(ctx.root, 'confirm', 'kratka');
    await submit(ctx);
    expect([...ctx.root.querySelectorAll('mat-error')].map(text)).toEqual([
      'Najmanji broj znakova: 8.',
    ]);

    type(ctx.root, 'password', 'Nova-lozinka-2026');
    type(ctx.root, 'confirm', 'Druga-lozinka-2026');
    await submit(ctx);
    expect(text(ctx.root.querySelector('[data-testid="mismatch"]'))).toBe(
      'Lozinke se ne poklapaju.',
    );
    expect(ctx.cognito.calls.some((call) => call.startsWith('confirm:'))).toBe(false);

    type(ctx.root, 'confirm', 'Nova-lozinka-2026');
    await submit(ctx);
    expect(ctx.cognito.calls).toContain('confirm:Nova-lozinka-2026');
    ctx.controller.expectOne(ME_URL).flush({ ...OWNER, role: 'Staff' });
    await settle(ctx.fixture);
    expect(ctx.router.url).toBe('/');
    ctx.controller.expectOne(HEALTH_URL).flush('Healthy');
  });

  it('shows Cognito password-policy errors on the new-password step and allows going back', async () => {
    const ctx = await start(COGNITO, '/prijava');
    ctx.cognito.signInResult = 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED';
    ctx.cognito.confirmResult = Object.assign(new Error('Password does not conform to policy'), {
      name: 'InvalidPasswordException',
    });
    type(ctx.root, 'email', 'urednik@zladovce.local');
    type(ctx.root, 'password', 'privremena');
    await submit(ctx);
    type(ctx.root, 'password', 'jednostavna');
    type(ctx.root, 'confirm', 'jednostavna');
    await submit(ctx);
    expect(text(ctx.root.querySelector('[data-testid="error"]'))).toContain(
      'Nova lozinka ne ispunjava pravila',
    );
    expect(text(ctx.root.querySelector('h1'))).toBe('Postavite novu lozinku');

    const back = [...ctx.root.querySelectorAll('button')].find(
      (b) => text(b) === 'Nazad na prijavu',
    );
    back?.click();
    await settle(ctx.fixture);
    expect(text(ctx.root.querySelector('h1'))).toBe('Prijava u administraciju');
    expect(ctx.root.querySelector('[data-testid="error"]')).toBeNull();
  });

  it('asks for the authenticator code when MFA is enabled', async () => {
    const ctx = await start(COGNITO, '/prijava');
    ctx.cognito.signInResult = 'CONFIRM_SIGN_IN_WITH_TOTP_CODE';
    type(ctx.root, 'email', 'vlasnik@zladovce.local');
    type(ctx.root, 'password', 'tajna');
    await submit(ctx);
    expect(text(ctx.root.querySelector('h1'))).toBe('Potvrda identiteta');

    type(ctx.root, 'code', '12');
    await submit(ctx);
    expect([...ctx.root.querySelectorAll('mat-error')].map(text)).toEqual(['Kod ima šest cifara.']);

    type(ctx.root, 'code', '123 456');
    await submit(ctx);
    expect(ctx.cognito.calls).toContain('confirm:123456');
    ctx.controller.expectOne(ME_URL).flush(OWNER);
    await settle(ctx.fixture);
    expect(ctx.router.url).toBe('/');
    ctx.controller.expectOne(HEALTH_URL).flush('Healthy');
  });

  it('refuses an account that the API does not accept as an administrator', async () => {
    const ctx = await start(COGNITO, '/prijava');
    type(ctx.root, 'email', 'neko@zladovce.local');
    type(ctx.root, 'password', 'tajna');
    await submit(ctx);
    ctx.controller
      .expectOne(ME_URL)
      .flush(
        { code: 'ADMIN_INACTIVE', detail: 'Nalog je deaktiviran.', status: 403 },
        { status: 403, statusText: 'Forbidden' },
      );
    await settle(ctx.fixture);
    expect(text(ctx.root.querySelector('[data-testid="error"]'))).toBe('Nalog je deaktiviran.');
    expect(ctx.router.url).toBe('/prijava');
    expect(ctx.auth.isSignedIn()).toBe(false);
    expect(ctx.cognito.calls).toContain('signOut');
  });

  it('has no dev sign-in on the page', async () => {
    const ctx = await start(COGNITO, '/prijava');
    expect(text(ctx.root)).not.toContain('Razvojni režim');
    expect(ctx.root.querySelector('input[type="password"]')).not.toBeNull();
  });
});

describe('sign-in page (dev mode)', () => {
  it('signs in with one button and no password', async () => {
    const ctx = await start(DEV, '/prijava');
    expect(text(ctx.root)).toContain('Razvojni režim prijave');
    expect(text(ctx.root)).toContain('vlasnik@zladovce.local');
    expect(text(ctx.root)).toContain('Vlasnik');
    expect(ctx.root.querySelector('input')).toBeNull();

    ctx.root.querySelector<HTMLButtonElement>('button')?.click();
    await settle(ctx.fixture);
    const me = ctx.controller.expectOne(ME_URL);
    expect(me.request.headers.get('X-Dev-User-Email')).toBe('vlasnik@zladovce.local');
    expect(me.request.headers.get('X-Dev-User-Role')).toBe('Owner');
    me.flush(OWNER);
    await settle(ctx.fixture);
    expect(ctx.router.url).toBe('/');
    ctx.controller.expectOne(HEALTH_URL).flush('Healthy');
  });
});

describe('shell and dashboard', () => {
  async function openDashboard(): Promise<Context> {
    sessionStorage.setItem(DEV_SESSION_KEY, '1');
    return start(DEV, '/');
  }

  it('shows loading states, then real data from /admin/me and /health', async () => {
    const ctx = await openDashboard();
    expect(text(ctx.root.querySelector('main h1'))).toBe('Kontrolna tabla');
    expect(text(ctx.root.querySelector('[data-testid="welcome"]'))).toContain('Učitavanje naloga');
    expect(text(ctx.root.querySelector('[data-testid="health"]'))).toContain('Provera servera');
    expect(ctx.root.querySelector('[data-testid="current-admin"]')).toBeNull();

    ctx.controller.expectOne(ME_URL).flush(OWNER);
    ctx.controller.expectOne(HEALTH_URL).flush('Healthy');
    await settle(ctx.fixture);

    const welcome = text(ctx.root.querySelector('[data-testid="welcome"]'));
    expect(welcome).toContain('Dobro došli, Milica Petrović');
    expect(welcome).toContain('vlasnik@zladovce.local');
    expect(welcome).toContain('Vlasnik');
    expect(text(ctx.root.querySelector('[data-testid="health"]'))).toContain('Dostupan');
    expect(text(ctx.root.querySelector('[data-testid="health"]'))).toMatch(
      /Poslednja provera: \d{2}\.\d{2}\.\d{4}\. \d{2}:\d{2}/,
    );

    const current = text(ctx.root.querySelector('[data-testid="current-admin"]'));
    expect(current).toContain('Milica Petrović');
    expect(current).toContain('Vlasnik');
  });

  it('shows error states with working retries', async () => {
    const ctx = await openDashboard();
    ctx.controller.expectOne(ME_URL).error(new ProgressEvent('error'));
    ctx.controller.expectOne(HEALTH_URL).error(new ProgressEvent('error'));
    await settle(ctx.fixture);

    const welcome = ctx.root.querySelector('[data-testid="welcome"]');
    const health = ctx.root.querySelector('[data-testid="health"]');
    expect(text(welcome)).toContain('Podaci o nalogu nisu učitani');
    expect(text(welcome)).toContain('Server trenutno nije dostupan');
    expect(text(health)).toContain('Nedostupan');
    expect(ctx.auth.isSignedIn()).toBe(true);

    welcome?.querySelector<HTMLButtonElement>('button')?.click();
    health?.querySelector<HTMLButtonElement>('button')?.click();
    await settle(ctx.fixture);
    ctx.controller.expectOne(ME_URL).flush(OWNER);
    ctx.controller.expectOne(HEALTH_URL).flush('{"status":"Healthy"}');
    await settle(ctx.fixture);
    expect(text(welcome)).toContain('Dobro došli, Milica Petrović');
    expect(text(health)).toContain('Dostupan');
  });

  it('builds the side navigation from the config and marks the current page', async () => {
    const ctx = await openDashboard();
    ctx.controller.expectOne(ME_URL).flush(OWNER);
    ctx.controller.expectOne(HEALTH_URL).flush('Healthy');
    await settle(ctx.fixture);
    const links = [...ctx.root.querySelectorAll('mat-sidenav nav a')];
    expect(links.map(text)).toEqual(ADMIN_NAV.map((item) => item.label));
    expect(links.map(text)).toEqual([
      'Kontrolna tabla',
      'Porudžbine',
      'Izveštaji',
      'Troškovi',
      'Poruke kupaca',
      'E-poruke',
      'Proizvodi',
      'Kategorije',
      'Zalihe',
      'Blog',
      'Sadržaj sajta',
      'Newsletter',
      'Podešavanja',
      'Kuriri',
      'Administratori',
      'Dnevnik izmena',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/porudzbine',
      '/izvestaji',
      '/troskovi',
      '/poruke',
      '/e-poruke',
      '/proizvodi',
      '/kategorije',
      '/zalihe',
      '/blog',
      '/sadrzaj',
      '/newsletter',
      '/podesavanja',
      '/kuriri',
      '/administratori',
      '/dnevnik-izmena',
    ]);
    // Section headings group the menu.
    expect([...ctx.root.querySelectorAll('mat-sidenav nav h2')].map(text)).toEqual([
      'Prodaja',
      'Katalog',
      'Sadržaj',
      'Podešavanja',
    ]);
    expect(links[0]?.getAttribute('aria-current')).toBe('page');
    expect(ctx.root.querySelector('a.skip-link')).not.toBeNull();
    expect(ctx.root.querySelector('main#sadrzaj')).not.toBeNull();
  });

  it('hides the owner-only entries from staff and keeps staff out of settings and couriers', async () => {
    sessionStorage.setItem(DEV_SESSION_KEY, '1');
    const staff: AuthConfig = {
      mode: 'dev',
      dev: { email: 'urednik@zladovce.local', role: 'Staff' },
    };
    const ctx = await start(staff, '/');
    ctx.controller.expectOne(ME_URL).flush({ ...OWNER, role: 'Staff' });
    await settle(ctx.fixture);
    void ctx.router.navigateByUrl('/podesavanja');
    await settle(ctx.fixture);
    expect(ctx.router.url).toBe('/');
    const labels = [...ctx.root.querySelectorAll('mat-sidenav nav a')].map(text);
    expect(labels).toContain('Porudžbine');
    expect(labels).not.toContain('Podešavanja');
    expect(labels).not.toContain('Kuriri');
    expect(ctx.controller.match(`${API}/admin/settings`).length).toBe(0);

    void ctx.router.navigateByUrl('/kuriri');
    await settle(ctx.fixture);
    expect(ctx.router.url).toBe('/');
  });

  it('shows the number of new orders next to "Porudžbine" and on the dashboard', async () => {
    const ctx = await openDashboard();
    ctx.controller.expectOne(ME_URL).flush(OWNER);
    await settle(ctx.fixture);
    const counts = (received: number) => ({
      counts: [
        { status: 'Received', count: received },
        { status: 'Accepted', count: 1 },
        { status: 'Preparing', count: 2 },
        { status: 'Shipped', count: 0 },
        { status: 'Delivered', count: 7 },
        { status: 'Cancelled', count: 1 },
        { status: 'Rejected', count: 0 },
        { status: 'DeliveryFailed', count: 1 },
      ],
      total: received + 12,
    });
    ctx.controller.expectOne(SUMMARY_URL).flush(counts(3));
    await settle(ctx.fixture);
    const badge = () => ctx.root.querySelector('mat-sidenav [data-testid="nav-badge"]');
    expect(text(badge())).toBe('3 novih porudžbina');
    expect(badge()?.closest('a')?.getAttribute('href')).toBe('/porudzbine');

    // Dashboard card from the same summary.
    const card = ctx.root.querySelector('[data-testid="orders-card"]');
    expect(text(card?.querySelector('[data-testid="open-count"]'))).toBe('6');
    expect(text(card)).toContain('porudžbina čeka na obradu');
    expect(card?.querySelector('[data-status="Preparing"]')?.getAttribute('href')).toBe(
      '/porudzbine?status=Preparing',
    );
    expect(card?.querySelector('[data-testid="orders-link"]')?.getAttribute('href')).toBe(
      '/porudzbine',
    );

    const store = TestBed.inject(OrderSummaryStore);
    store.refresh(true);
    await settle(ctx.fixture);
    ctx.controller.expectOne(SUMMARY_URL).flush(counts(1));
    await settle(ctx.fixture);
    expect(text(badge())).toBe('1 nova porudžbina');

    store.refresh(true);
    await settle(ctx.fixture);
    ctx.controller.expectOne(SUMMARY_URL).flush(counts(0));
    await settle(ctx.fixture);
    expect(badge()).toBeNull();
  });

  it('shows the number of failed emails next to "E-poruke" and warns on the dashboard', async () => {
    const ctx = await openDashboard();
    ctx.controller.expectOne(ME_URL).flush(OWNER);
    await settle(ctx.fixture);
    const deadRequests = () =>
      ctx.controller.match((r) => r.url === EMAILS_URL && r.params.get('status') === 'Dead');
    const first = deadRequests();
    expect(first.length).toBe(1);
    expect(first[0]!.request.params.get('pageSize')).toBe('1');
    first[0]!.flush({ items: [], page: 1, pageSize: 1, totalItems: 3, totalPages: 3 });
    await settle(ctx.fixture);

    const badge = () => ctx.root.querySelector('mat-sidenav [data-testid="nav-badge-emails"]');
    expect(text(badge())).toBe('3 neposlate e-poruke');
    expect(badge()?.closest('a')?.getAttribute('href')).toBe('/e-poruke');
    const card = ctx.root.querySelector('[data-testid="dead-emails-card"]');
    expect(text(card)).toContain('3 neposlate e-poruke');
    expect(card?.querySelector('[data-testid="dead-emails-link"]')?.getAttribute('href')).toBe(
      '/e-poruke?status=Dead',
    );

    TestBed.inject(DeadEmailsStore).refresh(true);
    await settle(ctx.fixture);
    deadRequests()[0]!.flush({ items: [], page: 1, pageSize: 1, totalItems: 0, totalPages: 0 });
    await settle(ctx.fixture);
    expect(badge()).toBeNull();
    expect(ctx.root.querySelector('[data-testid="dead-emails-card"]')).toBeNull();
  });

  it('has a route for every navigation entry', () => {
    const shell = routes.find((route) => route.path === '' && route.children);
    const paths = (shell?.children ?? []).map((route) => `/${route.path ?? ''}`);
    for (const item of ADMIN_NAV) {
      expect(paths).toContain(item.path);
    }
  });

  it('shows the low-stock card with real data and a link to the filtered inventory', async () => {
    const ctx = await openDashboard();
    ctx.controller.expectOne(ME_URL).flush(OWNER);
    ctx.controller.expectOne(HEALTH_URL).flush('Healthy');
    const lowStock = ctx.controller.expectOne((r) => r.url === LOW_STOCK_URL);
    expect(lowStock.request.params.get('limit')).toBe('5');
    lowStock.flush({
      items: [
        {
          variantId: 'v1',
          productId: 'p1',
          productName: 'Džem od šljiva',
          variantName: '370 g',
          sku: 'DZEM-370G',
          quantityOnHand: 2,
          lowStockThreshold: 5,
          status: 'low',
          isActive: true,
          updatedAt: '2026-11-14T10:00:00Z',
        },
      ],
      totalItems: 1,
    });
    await settle(ctx.fixture);
    const card = ctx.root.querySelector('[data-testid="low-stock"]');
    expect(text(card)).toContain('Malo na stanju');
    expect(text(card)).toContain('Džem od šljiva – 370 g');
    expect(card?.querySelector('[data-testid="low-stock-link"]')?.getAttribute('href')).toBe(
      '/zalihe?status=low,out',
    );
  });

  it('signs out and returns to the sign-in page', async () => {
    const ctx = await openDashboard();
    ctx.controller.expectOne(ME_URL).flush(OWNER);
    ctx.controller.expectOne(HEALTH_URL).flush('Healthy');
    await settle(ctx.fixture);

    const signOut = [...ctx.root.querySelectorAll('button')].find((b) => text(b) === 'Odjavi se');
    signOut?.click();
    await settle(ctx.fixture);
    expect(ctx.router.url).toBe('/prijava');
    expect(ctx.auth.isSignedIn()).toBe(false);
    expect(sessionStorage.getItem(DEV_SESSION_KEY)).toBeNull();
    expect(ctx.root.querySelector('[data-testid="notice"]')).toBeNull();
  });

  it('returns to sign-in with a notice when the API reports an expired session', async () => {
    const ctx = await openDashboard();
    ctx.controller.expectOne(ME_URL).flush(null, { status: 401, statusText: 'Unauthorized' });
    ctx.controller.expectOne(HEALTH_URL).flush('Healthy');
    await settle(ctx.fixture);
    expect(ctx.router.url).toBe('/prijava');
    expect(text(ctx.root.querySelector('[data-testid="notice"]'))).toBe(
      'Prijava je istekla. Prijavite se ponovo.',
    );
  });

  it('shows the admin 404 page inside the shell for unknown URLs', async () => {
    sessionStorage.setItem(DEV_SESSION_KEY, '1');
    const ctx = await start(DEV, '/ne-postoji');
    ctx.controller.expectOne(ME_URL).flush(OWNER);
    await settle(ctx.fixture);
    expect(text(ctx.root.querySelector('main h1'))).toBe('Stranica nije pronađena');
    expect(ctx.root.querySelector('main a')?.getAttribute('href')).toBe('/');
  });
});
