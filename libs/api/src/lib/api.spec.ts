import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ApiClient, toHttpParams } from './api-client';
import {
  ApiError,
  asApiError,
  ClientErrorCode,
  parseRetryAfter,
  readProblemDetails,
  toApiError,
} from './api-error';
import { isApiOrigin, isApiUrl } from './api-url';
import { AppConfig, ConfigError, loadAppConfig, parseAppConfig, provideAppConfig } from './config';
import { HealthClient } from './health-client';
import {
  apiErrorInterceptor,
  CORRELATION_ID_HEADER,
  correlationIdInterceptor,
} from './interceptors';

const API = 'http://localhost:5080/api/v1';
const CONFIG: AppConfig = { apiBaseUrl: API, healthUrl: 'http://localhost:5080/health' };

const PROBLEM = {
  type: 'https://zladovce.com/errors/insufficient-stock',
  title: 'Nedovoljno na stanju',
  status: 409,
  code: 'INSUFFICIENT_STOCK',
  detail: 'Nekih proizvoda više nema u traženoj količini.',
  errors: { 'items[0].quantity': ['Dostupno: 2'] },
  traceId: '00-abc-def-00',
};

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideAppConfig(CONFIG),
      provideHttpClient(withInterceptors([correlationIdInterceptor, apiErrorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return {
    http: TestBed.inject(HttpClient),
    api: TestBed.inject(ApiClient),
    health: TestBed.inject(HealthClient),
    controller: TestBed.inject(HttpTestingController),
  };
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the request to fail.');
}

describe('correlationIdInterceptor', () => {
  it('adds a unique X-Correlation-Id to API requests', () => {
    const { api, controller } = setup();
    api.get('/admin/me').subscribe();
    api.get('/admin/me').subscribe();
    const requests = controller.match(`${API}/admin/me`);
    const ids = requests.map((r) => r.request.headers.get(CORRELATION_ID_HEADER));
    expect(ids[0]).toMatch(/^[0-9a-f-]{20,}$/);
    expect(ids[0]).not.toBe(ids[1]);
    requests.forEach((r) => r.flush({}));
    controller.verify();
  });

  it('covers the health endpoint on the API origin', () => {
    const { health, controller } = setup();
    health.check().subscribe();
    const request = controller.expectOne(CONFIG.healthUrl);
    expect(request.request.headers.has(CORRELATION_ID_HEADER)).toBe(true);
    request.flush('Healthy');
  });

  it('keeps an id that the caller already set', () => {
    const { api, controller } = setup();
    api.get('/x', { headers: { [CORRELATION_ID_HEADER]: 'fixed' } }).subscribe();
    const request = controller.expectOne(`${API}/x`);
    expect(request.request.headers.get(CORRELATION_ID_HEADER)).toBe('fixed');
    request.flush({});
  });

  it('does not touch requests to other origins or relative URLs', () => {
    const { http, controller } = setup();
    http.get('https://example.com/data.json').subscribe();
    http.get('/config.json').subscribe();
    const external = controller.expectOne('https://example.com/data.json');
    const local = controller.expectOne('/config.json');
    expect(external.request.headers.has(CORRELATION_ID_HEADER)).toBe(false);
    expect(local.request.headers.has(CORRELATION_ID_HEADER)).toBe(false);
    external.flush({});
    local.flush({});
  });
});

describe('apiErrorInterceptor', () => {
  it('maps Problem Details to ApiError and keeps the correlation id', async () => {
    const { api, controller } = setup();
    const pending = failure(firstValueFrom(api.post('/orders', { items: [] })));
    const request = controller.expectOne(`${API}/orders`);
    const correlationId = request.request.headers.get(CORRELATION_ID_HEADER);
    request.flush(PROBLEM, { status: 409, statusText: 'Conflict' });

    const error = await pending;
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(409);
    expect(apiError.code).toBe('INSUFFICIENT_STOCK');
    expect(apiError.title).toBe('Nedovoljno na stanju');
    expect(apiError.detail).toBe(PROBLEM.detail);
    expect(apiError.message).toBe(PROBLEM.detail);
    expect(apiError.traceId).toBe(PROBLEM.traceId);
    expect(apiError.type).toBe(PROBLEM.type);
    expect(apiError.correlationId).toBe(correlationId);
    expect(apiError.isValidation).toBe(true);
    expect(apiError.fieldErrors('items[0].quantity')).toEqual(['Dostupno: 2']);
    expect(apiError.fieldErrors('unknown')).toEqual([]);
  });

  it('maps a network failure to a Serbian NETWORK_ERROR', async () => {
    const { api, controller } = setup();
    const pending = failure(firstValueFrom(api.get('/admin/me')));
    controller.expectOne(`${API}/admin/me`).error(new ProgressEvent('error'));
    const error = (await pending) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.isNetworkError).toBe(true);
    expect(error.code).toBe(ClientErrorCode.Network);
    expect(error.detail).toContain('Server trenutno nije dostupan');
  });

  it('fills fallbacks when the body is not Problem Details', async () => {
    const { api, controller } = setup();
    const pending = failure(firstValueFrom(api.get('/admin/me')));
    controller
      .expectOne(`${API}/admin/me`)
      .flush('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' });
    const error = (await pending) as ApiError;
    expect(error.status).toBe(502);
    expect(error.code).toBe(ClientErrorCode.Server);
    expect(error.detail).toContain('greške na serveru');
    expect(error.isValidation).toBe(false);
  });

  it('parses Problem Details from text responses (health check)', async () => {
    const { health, controller } = setup();
    const pending = failure(firstValueFrom(health.check()));
    controller.expectOne(CONFIG.healthUrl).flush(
      JSON.stringify({
        ...PROBLEM,
        status: 503,
        code: 'UNHEALTHY',
        detail: 'Baza nije dostupna.',
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
      },
    );
    const error = (await pending) as ApiError;
    expect(error.code).toBe('UNHEALTHY');
    expect(error.detail).toBe('Baza nije dostupna.');
  });

  it('leaves errors from other origins untouched', async () => {
    const { http, controller } = setup();
    const pending = failure(firstValueFrom(http.get('https://example.com/x')));
    controller.expectOne('https://example.com/x').flush(null, { status: 500, statusText: 'Error' });
    const error = await pending;
    expect(error).toBeInstanceOf(HttpErrorResponse);
  });
});

describe('toApiError / readProblemDetails', () => {
  const response = (status: number, error: unknown) => new HttpErrorResponse({ status, error });

  it.each([
    [401, ClientErrorCode.Unauthorized, 'isUnauthorized'],
    [403, ClientErrorCode.Forbidden, 'isForbidden'],
    [404, ClientErrorCode.NotFound, 'isNotFound'],
  ] as const)('uses status fallbacks for %i', (status, code, flag) => {
    const error = toApiError(response(status, null));
    expect(error.code).toBe(code);
    expect(error[flag]).toBe(true);
    expect(error.detail.length).toBeGreaterThan(0);
  });

  it('has fallbacks for 429 and unexpected client errors', () => {
    expect(toApiError(response(429, null)).code).toBe(ClientErrorCode.TooManyRequests);
    expect(toApiError(response(418, null)).code).toBe(ClientErrorCode.Unknown);
  });

  it('prefers server fields and falls back per missing field', () => {
    const error = toApiError(
      response(403, { code: 'ADMIN_INACTIVE', detail: 'Nalog je deaktiviran.' }),
    );
    expect(error.code).toBe('ADMIN_INACTIVE');
    expect(error.detail).toBe('Nalog je deaktiviran.');
    expect(error.title).toBe('Pristup nije dozvoljen');
  });

  it('ignores malformed fields', () => {
    expect(readProblemDetails(null)).toBeNull();
    expect(readProblemDetails('not json')).toBeNull();
    expect(readProblemDetails([1, 2])).toBeNull();
    expect(readProblemDetails({ detail: 42, errors: 'x' })).toBeNull();
    expect(readProblemDetails({ errors: { name: 'Obavezno', empty: [], bad: [1] } })).toEqual({
      errors: { name: ['Obavezno'] },
    });
  });

  it('keeps the problem body (extensions) and reads Retry-After', () => {
    const quote = { lines: [], total: 0 };
    const conflict = toApiError(
      response(409, { code: 'CART_CHANGED', detail: 'Korpa je promenjena.', quote }),
    );
    expect(conflict.extension('quote')).toEqual(quote);
    expect(conflict.extension('missing')).toBeNull();
    expect(conflict.retryAfterSeconds).toBeNull();

    const limited = toApiError(
      new HttpErrorResponse({
        status: 429,
        error: { code: 'RATE_LIMITED', detail: 'Previše pokušaja.' },
        headers: new HttpHeaders({ 'Retry-After': '120' }),
      }),
    );
    expect(limited.code).toBe('RATE_LIMITED');
    expect(limited.retryAfterSeconds).toBe(120);
    expect(toApiError(response(0, null)).body).toEqual({});
  });

  it('parses Retry-After seconds and HTTP dates', () => {
    const now = Date.parse('2026-11-14T10:00:00Z');
    expect(parseRetryAfter('30', now)).toBe(30);
    expect(parseRetryAfter('Sat, 14 Nov 2026 10:02:00 GMT', now)).toBe(120);
    expect(parseRetryAfter('', now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
    expect(parseRetryAfter('soon', now)).toBeUndefined();
  });

  it('asApiError normalises unknown errors', () => {
    const existing = toApiError(response(404, null));
    expect(asApiError(existing)).toBe(existing);
    expect(asApiError(response(500, null)).code).toBe(ClientErrorCode.Server);
    const unknown = asApiError(new TypeError('boom'));
    expect(unknown).toBeInstanceOf(ApiError);
    expect(unknown.code).toBe(ClientErrorCode.Unknown);
  });
});

describe('ApiClient', () => {
  it('builds URLs from apiBaseUrl and sends typed requests', async () => {
    const { api, controller } = setup();
    expect(api.url('admin/me')).toBe(`${API}/admin/me`);
    expect(api.url('/admin/me')).toBe(`${API}/admin/me`);

    const pending = firstValueFrom(
      api.get<{ id: string }>('/products', {
        params: { page: 2, q: '', tag: ['a', 'b'], x: null },
      }),
    );
    const request = controller.expectOne((r) => r.url === `${API}/products`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.toString()).toBe('page=2&tag=a&tag=b');
    request.flush({ id: '1' });
    expect(await pending).toEqual({ id: '1' });
  });

  it.each(['post', 'put', 'patch'] as const)('%s sends a JSON body', (method) => {
    const { api, controller } = setup();
    api[method]('/things', { name: 'Džem' }).subscribe();
    const request = controller.expectOne(`${API}/things`);
    expect(request.request.method).toBe(method.toUpperCase());
    expect(request.request.body).toEqual({ name: 'Džem' });
    request.flush({});
  });

  it('delete sends DELETE', () => {
    const { api, controller } = setup();
    api.delete('/things/1').subscribe();
    const request = controller.expectOne(`${API}/things/1`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
  });

  it('toHttpParams skips empty values', () => {
    expect(toHttpParams(undefined).keys()).toEqual([]);
    expect(toHttpParams({ a: 0, b: false, c: undefined, d: '' }).toString()).toBe('a=0&b=false');
  });
});

describe('HealthClient', () => {
  it.each([
    ['Healthy', 'Healthy'],
    ['{"status":"Healthy"}', 'Healthy'],
    ['', null],
  ])('reports healthy for a 2xx answer (%s)', async (body, status) => {
    const { health, controller } = setup();
    const pending = firstValueFrom(health.check());
    controller.expectOne(CONFIG.healthUrl).flush(body);
    const result = await pending;
    expect(result.healthy).toBe(true);
    expect(result.status).toBe(status);
    expect(result.checkedAt).toBeInstanceOf(Date);
  });
});

describe('isApiUrl / isApiOrigin', () => {
  it('matches only the API base on a path boundary', () => {
    expect(isApiUrl(`${API}/admin/me`, API)).toBe(true);
    expect(isApiUrl(API, API)).toBe(true);
    expect(isApiUrl(`${API}?x=1`, API)).toBe(true);
    expect(isApiUrl('http://localhost:5080/api/v10/admin', API)).toBe(false);
    expect(isApiUrl('http://localhost:5080/health', API)).toBe(false);
    expect(isApiUrl('http://localhost:5080.evil.example/api/v1/x', API)).toBe(false);
    expect(isApiUrl('/api/v1/admin/me', API)).toBe(false);
    expect(isApiUrl(`${API}/x`, '')).toBe(false);
  });

  it('compares origins', () => {
    expect(isApiOrigin('http://localhost:5080/health', API)).toBe(true);
    expect(isApiOrigin('http://localhost:5081/health', API)).toBe(false);
    expect(isApiOrigin('/config.json', API)).toBe(false);
  });
});

describe('parseAppConfig', () => {
  const cognito = {
    mode: 'cognito',
    cognito: { region: 'eu-central-1', userPoolId: 'eu-central-1_abc', clientId: 'client' },
  };
  const dev = { mode: 'dev', dev: { email: 'vlasnik@zladovce.local', role: 'Owner' } };

  it('normalises the base URL and derives the health URL', () => {
    expect(parseAppConfig({ apiBaseUrl: `${API}/` })).toEqual(CONFIG);
  });

  it('accepts an explicit health URL', () => {
    const config = parseAppConfig({ apiBaseUrl: API, healthUrl: 'https://api.example.com/health' });
    expect(config.healthUrl).toBe('https://api.example.com/health');
  });

  it('ignores auth for the storefront and requires it for admin', () => {
    expect(parseAppConfig({ apiBaseUrl: API, auth: dev }).auth).toBeUndefined();
    expect(() => parseAppConfig({ apiBaseUrl: API }, { requireAuth: true })).toThrow(ConfigError);
  });

  it('parses both auth modes', () => {
    expect(parseAppConfig({ apiBaseUrl: API, auth: cognito }, { requireAuth: true }).auth).toEqual(
      cognito,
    );
    expect(parseAppConfig({ apiBaseUrl: API, auth: dev }, { requireAuth: true }).auth).toEqual(dev);
  });

  it.each([
    ['not an object', 'x'],
    ['missing apiBaseUrl', {}],
    ['empty apiBaseUrl', { apiBaseUrl: '  ' }],
    ['relative apiBaseUrl', { apiBaseUrl: '/api/v1' }],
    ['non-http apiBaseUrl', { apiBaseUrl: 'ftp://x/api' }],
    ['unknown auth mode', { apiBaseUrl: API, auth: { mode: 'none' } }],
    ['missing auth mode', { apiBaseUrl: API, auth: { dev: dev.dev } }],
    [
      'cognito with empty ids',
      {
        apiBaseUrl: API,
        auth: { mode: 'cognito', cognito: { region: '', userPoolId: '', clientId: '' } },
      },
    ],
    ['cognito without section', { apiBaseUrl: API, auth: { mode: 'cognito' } }],
    ['dev without section', { apiBaseUrl: API, auth: { mode: 'dev' } }],
    [
      'dev with invalid role',
      { apiBaseUrl: API, auth: { mode: 'dev', dev: { email: 'a@b.c', role: 'Admin' } } },
    ],
  ])('rejects %s', (_name, raw) => {
    expect(() => parseAppConfig(raw, { requireAuth: true })).toThrow(ConfigError);
  });
});

describe('loadAppConfig', () => {
  const respond = (body: string, status = 200) =>
    (() => Promise.resolve(new Response(body, { status }))) as unknown as typeof fetch;

  it('loads and validates the file without caching', async () => {
    const fetchFn = vi.fn(respond(JSON.stringify({ apiBaseUrl: API })));
    await expect(loadAppConfig({ fetchFn: fetchFn as unknown as typeof fetch })).resolves.toEqual(
      CONFIG,
    );
    expect(fetchFn).toHaveBeenCalledWith('/config.json', { cache: 'no-store' });
  });

  it('fails clearly on HTTP errors, invalid JSON and network errors', async () => {
    await expect(loadAppConfig({ fetchFn: respond('', 404) })).rejects.toThrow(/HTTP 404/);
    await expect(loadAppConfig({ fetchFn: respond('<html>') })).rejects.toThrow(/not valid JSON/);
    const offline = (() => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch;
    await expect(loadAppConfig({ fetchFn: offline })).rejects.toThrow(/network error/);
  });
});
