import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  convertToParamMap,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import {
  apiErrorInterceptor,
  AppConfig,
  AuthConfig,
  ConfigError,
  correlationIdInterceptor,
  parseAppConfig,
  provideAppConfig,
} from '@zladovce/api';
import { AdminMe, AdminRole } from '@zladovce/models';
import { AuthError, toAuthError } from './auth-error';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { CognitoAuthService } from './cognito-auth.service';
import { CognitoClient } from './cognito-client';
import {
  DEV_EMAIL_HEADER,
  DEV_ROLE_HEADER,
  DEV_SESSION_KEY,
  DevAuthService,
} from './dev-auth.service';
import { authGuard, guestGuard, roleGuard, safeReturnUrl } from './guards';
import { HasRoleDirective } from './has-role.directive';
import { createAuthService } from './provide-auth';
import { hasRole } from './roles';

const API = 'http://localhost:5080/api/v1';
const ME_URL = `${API}/admin/me`;
const DEV: AuthConfig = { mode: 'dev', dev: { email: 'vlasnik@zladovce.local', role: 'Owner' } };
const COGNITO: AuthConfig = {
  mode: 'cognito',
  cognito: { region: 'eu-central-1', userPoolId: 'eu-central-1_test', clientId: 'client-id' },
};
const OWNER: AdminMe = {
  id: '1',
  email: 'vlasnik@zladovce.local',
  fullName: 'Vlasnik Test',
  role: 'Owner',
};
const STAFF: AdminMe = { ...OWNER, id: '2', fullName: 'Urednik Test', role: 'Staff' };

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

const cognitoException = (name: string, message = ''): Error =>
  Object.assign(new Error(message), { name });

function setup(auth: AuthConfig = DEV) {
  const cognito = new FakeCognito();
  const config: AppConfig = { apiBaseUrl: API, healthUrl: 'http://localhost:5080/health', auth };
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  TestBed.configureTestingModule({
    providers: [
      provideAppConfig(config),
      provideRouter([]),
      provideHttpClient(
        withInterceptors([correlationIdInterceptor, authInterceptor, apiErrorInterceptor]),
      ),
      provideHttpClientTesting(),
      { provide: AuthService, useFactory: () => createAuthService(config, () => cognito) },
    ],
  });
  return {
    cognito,
    config,
    auth: TestBed.inject(AuthService),
    http: TestBed.inject(HttpClient),
    controller: TestBed.inject(HttpTestingController),
    router: TestBed.inject(Router),
  };
}

/** Lets pending promise callbacks run so the next HTTP request is issued. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

async function failure(promise: Promise<unknown>): Promise<AuthError> {
  try {
    await promise;
  } catch (error) {
    return error as AuthError;
  }
  throw new Error('Expected a rejection.');
}

/** Runs sign-in and answers the `/admin/me` request it triggers. */
async function signIn(
  ctx: ReturnType<typeof setup>,
  me: AdminMe | { status: number; body?: unknown } = OWNER,
  credentials = { email: 'vlasnik@zladovce.local', password: 'tajna' },
) {
  const pending = ctx.auth.signIn(credentials);
  pending.catch(() => undefined);
  await settle();
  const request = ctx.controller.expectOne(ME_URL);
  if ('status' in me) {
    request.flush(me.body ?? null, { status: me.status, statusText: 'Error' });
  } else {
    request.flush(me);
  }
  return { pending, request };
}

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('createAuthService (mode selection)', () => {
  it('creates the dev implementation only for auth.mode = "dev"', () => {
    const { auth } = setup(DEV);
    expect(auth).toBeInstanceOf(DevAuthService);
    expect(auth.mode).toBe('dev');
    expect(auth.requiresPassword).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it('creates the Cognito implementation for auth.mode = "cognito"', () => {
    const { auth } = setup(COGNITO);
    expect(auth).toBeInstanceOf(CognitoAuthService);
    expect(auth.mode).toBe('cognito');
    expect(auth.requiresPassword).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([
    ['missing auth section', undefined],
    ['unknown mode', { mode: 'none' }],
    ['mode with different casing', { mode: 'DEV', dev: { email: 'a@b.c', role: 'Owner' } }],
    ['dev section without mode', { dev: { email: 'a@b.c', role: 'Owner' } }],
  ])('never falls back to dev: %s is an error', (_name, authConfig) => {
    const config = { apiBaseUrl: API, healthUrl: '', auth: authConfig } as unknown as AppConfig;
    TestBed.configureTestingModule({});
    expect(() => TestBed.runInInjectionContext(() => createAuthService(config))).toThrow(
      ConfigError,
    );
  });

  it('config parsing rejects a dev section when the mode is cognito with incomplete settings', () => {
    const raw = {
      apiBaseUrl: API,
      auth: {
        mode: 'cognito',
        cognito: { region: '', userPoolId: '', clientId: '' },
        dev: { email: 'a@b.c', role: 'Owner' },
      },
    };
    expect(() => parseAppConfig(raw, { requireAuth: true })).toThrow(ConfigError);
  });
});

describe('DevAuthService', () => {
  it('starts signed out and sends no credentials', async () => {
    const { auth } = setup(DEV);
    expect(auth.status()).toBe('unknown');
    expect(await auth.restore()).toBe(false);
    expect(auth.status()).toBe('signedOut');
    expect(await auth.credentialHeaders()).toBeNull();
  });

  it('signs in without a password, loads the profile and sends the dev headers', async () => {
    const ctx = setup(DEV);
    const { pending, request } = await signIn(ctx);
    expect(await pending).toBe('done');
    expect(request.request.headers.get(DEV_EMAIL_HEADER)).toBe('vlasnik@zladovce.local');
    expect(request.request.headers.get(DEV_ROLE_HEADER)).toBe('Owner');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(ctx.auth.isSignedIn()).toBe(true);
    expect(ctx.auth.user()).toEqual(OWNER);
    expect(ctx.auth.role()).toBe('Owner');
    expect(ctx.auth.profile().status).toBe('loaded');
  });

  it('keeps the session across a reload of the tab and stores nothing in localStorage', async () => {
    const ctx = setup(DEV);
    await (
      await signIn(ctx)
    ).pending;
    expect(sessionStorage.getItem(DEV_SESSION_KEY)).toBe('1');
    expect(localStorage.length).toBe(0);

    TestBed.resetTestingModule();
    const reloaded = setup(DEV);
    expect(await reloaded.auth.restore()).toBe(true);
  });

  it('signs out and forgets the session', async () => {
    const ctx = setup(DEV);
    await (
      await signIn(ctx)
    ).pending;
    await ctx.auth.signOut();
    expect(ctx.auth.status()).toBe('signedOut');
    expect(ctx.auth.user()).toBeNull();
    expect(ctx.auth.signOutReason()).toBeNull();
    expect(sessionStorage.getItem(DEV_SESSION_KEY)).toBeNull();
    expect(await ctx.auth.credentialHeaders()).toBeNull();
  });

  it('rejects challenge steps', async () => {
    const { auth } = setup(DEV);
    expect((await failure(auth.completeNewPassword('x'))).code).toBe('UNSUPPORTED_STEP');
    expect((await failure(auth.confirmTotp('123456'))).code).toBe('UNSUPPORTED_STEP');
  });
});

describe('CognitoAuthService', () => {
  it('signs in with e-mail and password and sends the access token as Bearer', async () => {
    const ctx = setup(COGNITO);
    const { pending, request } = await signIn(ctx, OWNER, {
      email: ' vlasnik@zladovce.local ',
      password: 'tajna',
    });
    expect(await pending).toBe('done');
    expect(ctx.cognito.calls).toEqual(['signIn:vlasnik@zladovce.local:tajna']);
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    expect(request.request.headers.has(DEV_EMAIL_HEADER)).toBe(false);
    expect(ctx.auth.user()).toEqual(OWNER);
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it('handles the new-password challenge of an invited administrator', async () => {
    const ctx = setup(COGNITO);
    ctx.cognito.signInResult = 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED';
    expect(await ctx.auth.signIn({ email: 'a@b.rs', password: 'privremena' })).toBe(
      'newPasswordRequired',
    );
    expect(ctx.auth.isSignedIn()).toBe(false);

    const pending = ctx.auth.completeNewPassword('Nova-lozinka-2026');
    await settle();
    ctx.controller.expectOne(ME_URL).flush(STAFF);
    expect(await pending).toBe('done');
    expect(ctx.cognito.calls).toContain('confirm:Nova-lozinka-2026');
    expect(ctx.auth.role()).toBe('Staff');
  });

  it('handles the TOTP challenge and strips spaces from the code', async () => {
    const ctx = setup(COGNITO);
    ctx.cognito.signInResult = 'CONFIRM_SIGN_IN_WITH_TOTP_CODE';
    expect(await ctx.auth.signIn({ email: 'a@b.rs', password: 'x' })).toBe('totpRequired');
    const pending = ctx.auth.confirmTotp('123 456');
    await settle();
    ctx.controller.expectOne(ME_URL).flush(OWNER);
    expect(await pending).toBe('done');
    expect(ctx.cognito.calls).toContain('confirm:123456');
  });

  it.each([
    ['NotAuthorizedException', 'Incorrect username or password.', 'INVALID_CREDENTIALS'],
    ['UserNotFoundException', 'User does not exist.', 'INVALID_CREDENTIALS'],
    ['NotAuthorizedException', 'User is disabled.', 'ACCOUNT_DISABLED'],
    ['NotAuthorizedException', 'Password attempts exceeded', 'TOO_MANY_ATTEMPTS'],
    ['LimitExceededException', '', 'TOO_MANY_ATTEMPTS'],
    ['SomethingNew', 'English text', 'UNKNOWN'],
  ])('maps %s (%s) to %s with a Serbian message', async (name, message, code) => {
    const ctx = setup(COGNITO);
    ctx.cognito.signInResult = cognitoException(name, message);
    const error = await failure(ctx.auth.signIn({ email: 'a@b.rs', password: 'x' }));
    expect(error).toBeInstanceOf(AuthError);
    expect(error.code).toBe(code);
    expect(error.message).not.toBe(message);
    expect(ctx.auth.isSignedIn()).toBe(false);
  });

  it('uses the same message for an unknown address and a wrong password', () => {
    const a = toAuthError(
      cognitoException('NotAuthorizedException', 'Incorrect username or password.'),
    );
    const b = toAuthError(cognitoException('UserNotFoundException', 'User does not exist.'));
    expect(a.message).toBe(b.message);
    expect(a.message).toBe('Pogrešna e-adresa ili lozinka.');
  });

  it('maps challenge errors and network failures', async () => {
    const ctx = setup(COGNITO);
    ctx.cognito.confirmResult = cognitoException('InvalidPasswordException', 'Password too short');
    expect((await failure(ctx.auth.completeNewPassword('kratka'))).code).toBe(
      'INVALID_NEW_PASSWORD',
    );
    ctx.cognito.confirmResult = cognitoException('CodeMismatchException');
    expect((await failure(ctx.auth.confirmTotp('000000'))).code).toBe('INVALID_CODE');
    ctx.cognito.signInResult = new TypeError('Failed to fetch');
    expect((await failure(ctx.auth.signIn({ email: 'a@b.rs', password: 'x' }))).code).toBe(
      'NETWORK',
    );
  });

  it('rejects unsupported steps and missing credentials', async () => {
    const ctx = setup(COGNITO);
    ctx.cognito.signInResult = 'CONFIRM_SIGN_IN_WITH_SMS_CODE';
    expect((await failure(ctx.auth.signIn({ email: 'a@b.rs', password: 'x' }))).code).toBe(
      'UNSUPPORTED_STEP',
    );
    ctx.cognito.signInResult = 'RESET_PASSWORD';
    expect((await failure(ctx.auth.signIn({ email: 'a@b.rs', password: 'x' }))).code).toBe(
      'PASSWORD_RESET_REQUIRED',
    );
    expect((await failure(ctx.auth.signIn())).code).toBe('INVALID_CREDENTIALS');
  });

  it('restores an existing session from the library', async () => {
    const ctx = setup(COGNITO);
    ctx.cognito.token = 'restored-token';
    expect(await ctx.auth.restore()).toBe(true);
    expect(await ctx.auth.credentialHeaders()).toEqual({ Authorization: 'Bearer restored-token' });
  });

  it('checks for a session only once, also for concurrent callers', async () => {
    const ctx = setup(COGNITO);
    const spy = vi.spyOn(ctx.cognito, 'accessToken');
    const results = await Promise.all([ctx.auth.restore(), ctx.auth.restore()]);
    await ctx.auth.restore();
    expect(results).toEqual([false, false]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('signs out of Cognito', async () => {
    const ctx = setup(COGNITO);
    await (
      await signIn(ctx)
    ).pending;
    await ctx.auth.signOut();
    expect(ctx.cognito.calls).toContain('signOut');
    expect(ctx.auth.status()).toBe('signedOut');
    expect(await ctx.auth.credentialHeaders()).toBeNull();
  });
});

describe('profile (/admin/me)', () => {
  it('refuses sign-in when the API says the account is not an active administrator (403)', async () => {
    const ctx = setup(COGNITO);
    const { pending } = await signIn(ctx, {
      status: 403,
      body: { code: 'ADMIN_INACTIVE', detail: 'Nalog je deaktiviran.' },
    });
    const error = await failure(pending);
    expect(error.code).toBe('NOT_ALLOWED');
    expect(error.message).toBe('Nalog je deaktiviran.');
    expect(ctx.auth.status()).toBe('signedOut');
    expect(ctx.auth.signOutReason()).toBe('notAllowed');
    expect(ctx.cognito.calls).toContain('signOut');
  });

  it('refuses sign-in when the API rejects the credentials (401)', async () => {
    const ctx = setup(DEV);
    const { pending } = await signIn(ctx, { status: 401 });
    expect((await failure(pending)).code).toBe('NOT_ALLOWED');
    expect(ctx.auth.isSignedIn()).toBe(false);
    expect(sessionStorage.getItem(DEV_SESSION_KEY)).toBeNull();
  });

  it('keeps the session when the API is unreachable and exposes the error for a retry', async () => {
    const ctx = setup(DEV);
    const pending = ctx.auth.signIn();
    await settle();
    ctx.controller.expectOne(ME_URL).error(new ProgressEvent('error'));
    expect(await pending).toBe('done');
    expect(ctx.auth.isSignedIn()).toBe(true);
    const profile = ctx.auth.profile();
    expect(profile.status).toBe('error');
    expect(profile.error?.isNetworkError).toBe(true);

    const retry = ctx.auth.loadProfile(true);
    await settle();
    expect(ctx.auth.profile().status).toBe('loading');
    ctx.controller.expectOne(ME_URL).flush(OWNER);
    expect(await retry).toEqual(OWNER);
    expect(ctx.auth.profile().status).toBe('loaded');
  });

  it('caches the profile and shares one request between concurrent callers', async () => {
    const ctx = setup(DEV);
    await (
      await signIn(ctx)
    ).pending;
    expect(await ctx.auth.loadProfile()).toEqual(OWNER);
    ctx.controller.expectNone(ME_URL);

    const first = ctx.auth.loadProfile(true);
    const second = ctx.auth.loadProfile(true);
    await settle();
    ctx.controller.expectOne(ME_URL).flush(STAFF);
    expect(await first).toEqual(STAFF);
    expect(await second).toEqual(STAFF);
  });

  it('does not load a profile when signed out', async () => {
    const ctx = setup(DEV);
    expect(await ctx.auth.loadProfile()).toBeNull();
    ctx.controller.expectNone(ME_URL);
  });
});

describe('authInterceptor', () => {
  it('attaches credentials only to requests under apiBaseUrl', async () => {
    const ctx = setup(COGNITO);
    await (
      await signIn(ctx)
    ).pending;

    ctx.http.get(`${API}/admin/orders`).subscribe();
    ctx.http.get('http://localhost:5080/health', { responseType: 'text' }).subscribe();
    ctx.http.get('http://localhost:5080/api/v10/x').subscribe();
    ctx.http.get('https://example.com/api/v1/admin/me').subscribe();
    ctx.http.get('/config.json').subscribe();
    await settle();

    const api = ctx.controller.expectOne(`${API}/admin/orders`);
    expect(api.request.headers.get('Authorization')).toBe('Bearer access-token');
    for (const url of [
      'http://localhost:5080/health',
      'http://localhost:5080/api/v10/x',
      'https://example.com/api/v1/admin/me',
      '/config.json',
    ]) {
      const other = ctx.controller.expectOne(url);
      expect(other.request.headers.has('Authorization')).toBe(false);
      other.flush('');
    }
    api.flush([]);
  });

  it('never sends dev headers outside apiBaseUrl', async () => {
    const ctx = setup(DEV);
    await (
      await signIn(ctx)
    ).pending;
    ctx.http.get('https://example.com/x').subscribe();
    ctx.http.get(`${API}/admin/orders`).subscribe();
    await settle();
    const external = ctx.controller.expectOne('https://example.com/x');
    expect(external.request.headers.has(DEV_EMAIL_HEADER)).toBe(false);
    expect(external.request.headers.has(DEV_ROLE_HEADER)).toBe(false);
    const api = ctx.controller.expectOne(`${API}/admin/orders`);
    expect(api.request.headers.get(DEV_ROLE_HEADER)).toBe('Owner');
    external.flush('');
    api.flush([]);
  });

  it('sends API requests without credentials when signed out', async () => {
    const ctx = setup(DEV);
    ctx.http.get(`${API}/products`).subscribe();
    await settle();
    const request = ctx.controller.expectOne(`${API}/products`);
    expect(request.request.headers.has(DEV_EMAIL_HEADER)).toBe(false);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush([]);
  });

  it('ends the session when the API answers 401', async () => {
    const ctx = setup(COGNITO);
    await (
      await signIn(ctx)
    ).pending;
    ctx.http.get(`${API}/admin/orders`).subscribe({ error: () => undefined });
    await settle();
    ctx.controller
      .expectOne(`${API}/admin/orders`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await settle();
    expect(ctx.auth.status()).toBe('signedOut');
    expect(ctx.auth.signOutReason()).toBe('sessionExpired');
    expect(ctx.auth.user()).toBeNull();
    expect(ctx.cognito.calls).toContain('signOut');
  });

  it('keeps the session on other errors', async () => {
    const ctx = setup(DEV);
    await (
      await signIn(ctx)
    ).pending;
    ctx.http.get(`${API}/admin/orders`).subscribe({ error: () => undefined });
    await settle();
    ctx.controller
      .expectOne(`${API}/admin/orders`)
      .flush(null, { status: 403, statusText: 'Forbidden' });
    expect(ctx.auth.isSignedIn()).toBe(true);
  });

  it('continues without credentials when the token cannot be obtained', async () => {
    const ctx = setup(COGNITO);
    await (
      await signIn(ctx)
    ).pending;
    vi.spyOn(ctx.cognito, 'accessToken').mockRejectedValue(new Error('refresh failed'));
    ctx.http.get(`${API}/admin/orders`).subscribe({ error: () => undefined });
    await settle();
    const request = ctx.controller.expectOne(`${API}/admin/orders`);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(ctx.auth.status()).toBe('signedOut');
  });
});

describe('guards', () => {
  const state = (url: string) => ({ url }) as RouterStateSnapshot;
  const route = (returnUrl?: string) =>
    ({
      queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}),
    }) as ActivatedRouteSnapshot;
  const run = <T>(fn: () => T): T => TestBed.runInInjectionContext(fn);
  const urlOf = (ctx: ReturnType<typeof setup>, result: unknown): string => {
    expect(result).toBeInstanceOf(UrlTree);
    return ctx.router.serializeUrl(result as UrlTree);
  };

  it('authGuard sends signed-out visitors to the sign-in page with a return URL', async () => {
    const ctx = setup(DEV);
    const result = await run(() => authGuard(route(), state('/porudzbine?page=2')));
    expect(urlOf(ctx, result)).toBe('/prijava?returnUrl=%2Fporudzbine%3Fpage%3D2');
  });

  it('authGuard omits the return URL for the home page', async () => {
    const ctx = setup(DEV);
    expect(urlOf(ctx, await run(() => authGuard(route(), state('/'))))).toBe('/prijava');
  });

  it('authGuard allows signed-in administrators, including a restored session', async () => {
    sessionStorage.setItem(DEV_SESSION_KEY, '1');
    setup(DEV);
    expect(await run(() => authGuard(route(), state('/')))).toBe(true);
  });

  it('guestGuard lets signed-out visitors see the sign-in page', async () => {
    setup(DEV);
    expect(await run(() => guestGuard(route(), state('/prijava')))).toBe(true);
  });

  it('guestGuard redirects signed-in administrators to the return URL or home', async () => {
    sessionStorage.setItem(DEV_SESSION_KEY, '1');
    const ctx = setup(DEV);
    expect(urlOf(ctx, await run(() => guestGuard(route(), state('/prijava'))))).toBe('/');
    expect(urlOf(ctx, await run(() => guestGuard(route('/porudzbine'), state('/prijava'))))).toBe(
      '/porudzbine',
    );
    expect(
      urlOf(ctx, await run(() => guestGuard(route('https://evil.example'), state('/prijava')))),
    ).toBe('/');
  });

  it('safeReturnUrl accepts only local paths', () => {
    expect(safeReturnUrl('/porudzbine?x=1', '/')).toBe('/porudzbine?x=1');
    expect(safeReturnUrl('//evil.example', '/')).toBe('/');
    expect(safeReturnUrl('/\\evil.example', '/')).toBe('/');
    expect(safeReturnUrl('https://evil.example', '/')).toBe('/');
    expect(safeReturnUrl(null, '/')).toBe('/');
  });

  async function guardAs(me: AdminMe, ...roles: AdminRole[]) {
    const ctx = setup(DEV);
    await (
      await signIn(ctx, me)
    ).pending;
    return { ctx, result: await run(() => roleGuard(...roles)(route(), state('/podesavanja'))) };
  }

  it('roleGuard allows a matching role', async () => {
    expect((await guardAs(OWNER, 'Owner')).result).toBe(true);
    TestBed.resetTestingModule();
    sessionStorage.clear();
    expect((await guardAs(STAFF, 'Owner', 'Staff')).result).toBe(true);
  });

  it('roleGuard sends other roles to the home page', async () => {
    const { ctx, result } = await guardAs(STAFF, 'Owner');
    expect(urlOf(ctx, result)).toBe('/');
  });

  it('roleGuard sends signed-out visitors to the sign-in page', async () => {
    const ctx = setup(DEV);
    const result = await run(() => roleGuard('Owner')(route(), state('/podesavanja')));
    expect(urlOf(ctx, result)).toBe('/prijava');
  });

  it('roleGuard denies access when the profile cannot be loaded', async () => {
    sessionStorage.setItem(DEV_SESSION_KEY, '1');
    const ctx = setup(DEV);
    const pending = run(() =>
      roleGuard('Owner')(route(), state('/podesavanja')),
    ) as Promise<unknown>;
    await settle();
    ctx.controller.expectOne(ME_URL).error(new ProgressEvent('error'));
    expect(urlOf(ctx, await pending)).toBe('/');
  });
});

describe('hasRole', () => {
  it('requires a user', () => {
    expect(hasRole(null, 'Owner')).toBe(false);
    expect(hasRole(undefined, [])).toBe(false);
  });

  it('matches single roles and lists', () => {
    expect(hasRole(OWNER, 'Owner')).toBe(true);
    expect(hasRole(STAFF, 'Owner')).toBe(false);
    expect(hasRole(STAFF, ['Owner', 'Staff'])).toBe(true);
  });

  it('treats an empty requirement as "any administrator"', () => {
    expect(hasRole(STAFF, [])).toBe(true);
    expect(hasRole(STAFF, null)).toBe(true);
  });
});

describe('HasRoleDirective', () => {
  @Component({
    imports: [HasRoleDirective],
    template: `
      <p *authHasRole="'Owner'" id="owner">Samo vlasnik</p>
      <p *authHasRole="roles()" id="any">Svi</p>
    `,
  })
  class Host {
    roles = signal<AdminRole[]>(['Owner', 'Staff']);
  }

  const has = (root: HTMLElement, id: string) => root.querySelector(`#${id}`) !== null;

  it('renders nothing while signed out', () => {
    setup(DEV);
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    expect(has(fixture.nativeElement, 'owner')).toBe(false);
    expect(has(fixture.nativeElement, 'any')).toBe(false);
  });

  it('renders content by role and reacts to sign-out and input changes', async () => {
    const ctx = setup(DEV);
    await (
      await signIn(ctx, STAFF)
    ).pending;
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    expect(has(fixture.nativeElement, 'owner')).toBe(false);
    expect(has(fixture.nativeElement, 'any')).toBe(true);

    fixture.componentInstance.roles.set(['Owner']);
    fixture.detectChanges();
    expect(has(fixture.nativeElement, 'any')).toBe(false);

    fixture.componentInstance.roles.set(['Staff']);
    fixture.detectChanges();
    expect(has(fixture.nativeElement, 'any')).toBe(true);

    await ctx.auth.signOut();
    fixture.detectChanges();
    expect(has(fixture.nativeElement, 'any')).toBe(false);
  });

  it('shows owner-only content to the owner', async () => {
    const ctx = setup(DEV);
    await (
      await signIn(ctx, OWNER)
    ).pending;
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    expect(has(fixture.nativeElement, 'owner')).toBe(true);
  });
});
