import { Location } from '@angular/common';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { API, settle, testProviders, text } from '../../testing/fixtures';
import { tokenFromFragment } from './newsletter-token.page';

const TOKEN = 'v1.eyJzIjoiYWJjIn0.c2lnbmF0dXJl';

async function open(path: string) {
  TestBed.configureTestingModule({ providers: [provideRouter(routes), ...testProviders()] });
  const harness = await RouterTestingHarness.create(path);
  const render = () => settle(() => harness.detectChanges(), 6);
  await render();
  const root = () => harness.routeNativeElement as HTMLElement;
  return {
    harness,
    render,
    root,
    el: (id: string) => root().querySelector<HTMLElement>(`[data-testid="${id}"]`),
    http: TestBed.inject(HttpTestingController),
    router: TestBed.inject(Router),
    location: TestBed.inject(Location),
  };
}

describe('newsletter token helper', () => {
  it('reads the token only from `token` in the fragment', () => {
    expect(tokenFromFragment(`token=${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromFragment(`token=${encodeURIComponent(TOKEN)}&x=1`)).toBe(TOKEN);
    expect(tokenFromFragment('token=')).toBeNull();
    expect(tokenFromFragment('sadrzaj')).toBeNull();
    expect(tokenFromFragment(null)).toBeNull();
  });
});

describe('newsletter confirmation pages', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('confirms with the token from the fragment, after removing it from the address', async () => {
    const log = vi.spyOn(console, 'log');
    const ctx = await open(`/newsletter/potvrda#token=${TOKEN}`);
    const request = ctx.http.expectOne(`${API}/newsletter/confirm`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ token: TOKEN });
    expect(request.request.urlWithParams).not.toContain(TOKEN);
    expect(ctx.router.url).toBe('/newsletter/potvrda');
    expect(ctx.location.path(true)).toBe('/newsletter/potvrda');
    request.flush({ status: 'Confirmed', message: 'Prijava je potvrđena. Hvala!' });
    await ctx.render();
    expect(text(ctx.el('newsletter-done'))).toContain('Prijava je potvrđena. Hvala!');
    expect(ctx.el('newsletter-result')?.getAttribute('aria-live')).toBe('polite');
    expect(document.activeElement?.tagName).toBe('H2');
    expect(log.mock.calls.flat().join(' ')).not.toContain(TOKEN);
    expect(routes.find((r) => r.path === 'newsletter/potvrda')?.data).toMatchObject({
      noindex: true,
    });
  });

  it('unsubscribes from the odjava link', async () => {
    const ctx = await open(`/newsletter/odjava#token=${TOKEN}`);
    expect(text(ctx.root().querySelector('h1'))).toBe('Odjava sa novosti');
    const request = ctx.http.expectOne(`${API}/newsletter/unsubscribe`);
    expect(request.request.body).toEqual({ token: TOKEN });
    expect(ctx.location.path(true)).toBe('/newsletter/odjava');
    request.flush({ status: 'Unsubscribed', message: 'Odjavljeni ste.' });
    await ctx.render();
    expect(text(ctx.el('newsletter-done'))).toContain('Odjavljeni ste');
  });

  it('explains an invalid or expired link and offers a new sign-up', async () => {
    const ctx = await open(`/newsletter/potvrda#token=${TOKEN}`);
    ctx.http.expectOne(`${API}/newsletter/confirm`).flush(
      {
        code: 'NEWSLETTER_TOKEN_INVALID',
        detail: 'Link nije ispravan ili je istekao.',
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await ctx.render();
    const problem = ctx.el('newsletter-problem');
    expect(problem?.getAttribute('role')).toBe('alert');
    expect(text(problem)).toContain('Link nije važeći');
    expect(text(problem)).toContain('Link nije ispravan ili je istekao.');
    expect(problem?.querySelector('a')?.getAttribute('href')).toBe('/#novosti');
  });

  it('sends nothing without a token', async () => {
    const ctx = await open('/newsletter/potvrda');
    ctx.http.expectNone(`${API}/newsletter/confirm`);
    expect(text(ctx.el('newsletter-missing'))).toContain('Link nije potpun');
  });
});
