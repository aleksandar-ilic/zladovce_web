import { Location } from '@angular/common';
import { HttpHeaders } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TrackingLookup } from '@zladovce/models';
import { routes } from '../../app.routes';
import { API, settle, testProviders, text } from '../../testing/fixtures';
import {
  caretAfterFormat,
  codeCharacters,
  codeFromFragment,
  formatTrackingCode,
  isCompleteCode,
} from './tracking-code';
import { NOT_FOUND_MESSAGE } from './tracking.page';

const LOOKUP_URL = `${API}/tracking/lookup`;
const RAW = 'abcde12345fghjk67890mnpqrs';
const CODE = 'ABCDE-12345-FGHJK-67890-MNPQRS';

const RESULT: TrackingLookup = {
  orderNumber: 'ZLD-2026-000042',
  status: 'Shipped',
  statusLabel: 'Poslata',
  placedAt: '2026-11-14T10:15:00Z',
  timeline: [
    {
      status: 'Received',
      label: 'Porudžbina primljena',
      at: '2026-11-14T10:15:00Z',
      customerMessage: null,
    },
    {
      status: 'Accepted',
      label: 'Porudžbina prihvaćena',
      at: '2026-11-14T12:00:00Z',
      customerMessage: 'Šaljemo sutra ujutru.',
    },
    {
      status: 'Shipped',
      label: 'Pošiljka predata kurirskoj službi',
      // Summer time: 23:30 UTC on 30 June is 01:30 on 1 July in Belgrade.
      at: '2026-06-30T23:30:00Z',
      customerMessage: null,
    },
  ],
  shipment: {
    courierName: 'Brza pošta',
    trackingNumber: 'BP123456',
    trackingUrl: 'https://brza.example/pracenje?broj=BP123456',
    shippedAt: '2026-11-15T08:05:00Z',
  },
};

async function open(path: string) {
  TestBed.configureTestingModule({ providers: [provideRouter(routes), ...testProviders()] });
  const harness = await RouterTestingHarness.create(path);
  const http = TestBed.inject(HttpTestingController);
  const router = TestBed.inject(Router);
  const location = TestBed.inject(Location);
  const root = () => harness.routeNativeElement as HTMLElement;
  const render = () => settle(() => harness.detectChanges(), 6);
  const el = <T extends HTMLElement>(id: string) =>
    root().querySelector<T>(`[data-testid="${id}"]`);
  const all = (id: string) => [...root().querySelectorAll(`[data-testid="${id}"]`)];
  const type = async (value: string, caret = value.length) => {
    const input = el<HTMLInputElement>('tracking-code')!;
    input.value = value;
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event('input'));
    await render();
    return input;
  };
  const submit = async () => {
    el<HTMLFormElement>('tracking-form')!.dispatchEvent(new Event('submit'));
    await render();
  };
  await render();
  return { harness, http, router, location, root, render, el, all, type, submit };
}

describe('tracking code helpers', () => {
  it('upper-cases, drops other characters, groups 5-5-5-5-6 and stops at 26 characters', () => {
    expect(formatTrackingCode('')).toBe('');
    expect(formatTrackingCode('abcde')).toBe('ABCDE');
    expect(formatTrackingCode('abcde1')).toBe('ABCDE-1');
    expect(formatTrackingCode(RAW)).toBe(CODE);
    expect(formatTrackingCode(' abcde 12345-fghjk_67890 mnpqrs ')).toBe(CODE);
    expect(formatTrackingCode(`${RAW}XYZ`)).toBe(CODE);
    expect(formatTrackingCode('čćžšđ-ab')).toBe('AB');
    expect(codeCharacters(CODE)).toBe(RAW.toUpperCase());
    expect(isCompleteCode(CODE)).toBe(true);
    expect(isCompleteCode('ABCDE-12345')).toBe(false);
  });

  it('keeps the caret behind the same characters after formatting', () => {
    // Typed the 6th character at the end: the caret moves past the new hyphen.
    expect(caretAfterFormat('ABCDE1', 6, 'ABCDE-1')).toBe(7);
    // Typed in the middle of the first group: the caret stays there.
    expect(caretAfterFormat('ABXCDE-1', 3, 'ABXCD-E1')).toBe(3);
    // Deleted a hyphen: the caret stays after the same character.
    expect(caretAfterFormat('ABCDE1', 5, 'ABCDE-1')).toBe(5);
    expect(caretAfterFormat('', 0, '')).toBe(0);
  });

  it('reads the code only from `kod` in the fragment', () => {
    expect(codeFromFragment(`kod=${CODE}`)).toBe(CODE);
    expect(codeFromFragment(`#kod=${RAW}`)).toBe(CODE);
    expect(codeFromFragment(`kod=${encodeURIComponent(CODE)}`)).toBe(CODE);
    expect(codeFromFragment('sadrzaj')).toBeNull();
    expect(codeFromFragment('kod=')).toBeNull();
    expect(codeFromFragment(null)).toBeNull();
  });
});

describe('TrackingPage', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('is noindex, explains where the code is and formats while typing', async () => {
    const ctx = await open('/track-order');
    expect(text(ctx.root().querySelector('h1'))).toBe('Praćenje porudžbine');
    const route = routes.find((r) => r.path === 'track-order');
    expect(route?.title).toBe('Praćenje porudžbine – Zladovce');
    expect(route?.data).toEqual({ noindex: true });
    const label = ctx.root().querySelector('label[for="sf-tracking-code"]');
    expect(text(label)).toBe('Kod za praćenje');
    const input = ctx.el<HTMLInputElement>('tracking-code')!;
    expect(input.id).toBe('sf-tracking-code');
    expect(input.getAttribute('aria-describedby')).toBe('sf-tracking-help');
    expect(text(ctx.root().querySelector('#sf-tracking-help'))).toContain(
      'u e-poruci kojom smo potvrdili porudžbinu i na stranici potvrde',
    );

    await ctx.type('abcde1');
    expect(input.value).toBe('ABCDE-1');
    expect(input.selectionStart).toBe(7);
    await ctx.type('abxcde-1', 3);
    expect(input.value).toBe('ABXCD-E1');
    expect(input.selectionStart).toBe(3);
  });

  it('asks for the whole code before sending anything', async () => {
    const ctx = await open('/track-order');
    await ctx.submit();
    expect(text(ctx.el('tracking-problem'))).toContain('Upišite kod za praćenje');
    await ctx.type('ABCDE-123');
    await ctx.submit();
    expect(text(ctx.el('tracking-problem'))).toContain('Upisali ste 8 od 26 znakova');
    ctx.http.expectNone(LOOKUP_URL);
  });

  it('sends the code in the body, disables the button while loading and shows the result', async () => {
    const ctx = await open('/track-order');
    await ctx.type(RAW);
    await ctx.submit();
    const request = ctx.http.expectOne(LOOKUP_URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ code: CODE });
    expect(request.request.urlWithParams).toBe(LOOKUP_URL);
    const button = ctx.el<HTMLButtonElement>('tracking-submit')!;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(text(button)).toBe('Proveravamo…');

    request.flush(RESULT);
    await ctx.render();
    const result = ctx.el('tracking-result')!;
    expect(result.closest('[aria-live="polite"]')).not.toBeNull();
    expect(text(ctx.el('tracking-order-number'))).toBe('ZLD-2026-000042');
    expect(text(ctx.el('tracking-status'))).toBe('Poslata');
    expect(text(ctx.el('tracking-placed'))).toBe('14.11.2026. 11:15');
    expect(ctx.el('tracking-form')).toBeNull();
    expect(document.activeElement?.id).toBe('sf-tracking-result');
  });

  it('renders the real timeline with Serbian dates in Belgrade time and customer messages', async () => {
    const ctx = await open('/track-order');
    await ctx.type(CODE);
    await ctx.submit();
    ctx.http.expectOne(LOOKUP_URL).flush(RESULT);
    await ctx.render();
    const entries = ctx.all('tracking-entry');
    expect(entries.length).toBe(3);
    expect(text(entries[0])).toContain('Porudžbina primljena');
    expect(text(entries[0]?.querySelector('time'))).toBe('14.11.2026. 11:15');
    expect(entries[0]?.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-11-14T10:15:00Z',
    );
    expect(text(entries[1]?.querySelector('[data-testid="tracking-message"]'))).toBe(
      'Šaljemo sutra ujutru.',
    );
    expect(entries[0]?.querySelector('[data-testid="tracking-message"]')).toBeNull();
    expect(text(entries[2]?.querySelector('time'))).toBe('01.07.2026. 01:30');
    expect(text(entries[2])).toContain('(trenutni status)');
  });

  it('shows the shipment with a safe external courier link', async () => {
    const ctx = await open('/track-order');
    await ctx.type(CODE);
    await ctx.submit();
    ctx.http.expectOne(LOOKUP_URL).flush(RESULT);
    await ctx.render();
    expect(text(ctx.el('tracking-courier'))).toBe('Brza pošta');
    expect(text(ctx.el('tracking-number'))).toBe('BP123456');
    expect(text(ctx.el('tracking-shipped'))).toBe('15.11.2026. 09:05');
    const link = ctx.el<HTMLAnchorElement>('tracking-courier-link')!;
    expect(link.getAttribute('href')).toBe('https://brza.example/pracenje?broj=BP123456');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(text(link)).toContain('otvara se u novom prozoru');
  });

  it('hides the shipment card and courier link when the API has none', async () => {
    const ctx = await open('/track-order');
    await ctx.type(CODE);
    await ctx.submit();
    ctx.http.expectOne(LOOKUP_URL).flush({
      ...RESULT,
      status: 'Received',
      statusLabel: 'Primljena',
      timeline: RESULT.timeline.slice(0, 1),
      shipment: null,
    });
    await ctx.render();
    expect(ctx.el('tracking-shipment')).toBeNull();
    expect(ctx.all('tracking-entry').length).toBe(1);

    ctx.http.verify();
    ctx.el<HTMLButtonElement>('tracking-again')!.click();
    await ctx.render();
    expect(ctx.el('tracking-result')).toBeNull();
    expect(ctx.el<HTMLInputElement>('tracking-code')?.value).toBe('');
    expect(document.activeElement).toBe(ctx.el('tracking-code'));
  });

  it('shows a link without a tracking URL as plain courier data', async () => {
    const ctx = await open('/track-order');
    await ctx.type(CODE);
    await ctx.submit();
    ctx.http.expectOne(LOOKUP_URL).flush({
      ...RESULT,
      shipment: { ...RESULT.shipment!, trackingNumber: null, trackingUrl: null },
    });
    await ctx.render();
    expect(ctx.el('tracking-shipment')).not.toBeNull();
    expect(ctx.el('tracking-number')).toBeNull();
    expect(ctx.el('tracking-courier-link')).toBeNull();
  });

  it('shows one generic message for every unknown code', async () => {
    const ctx = await open('/track-order');
    await ctx.type(CODE);
    await ctx.submit();
    ctx.http.expectOne(LOOKUP_URL).flush(
      {
        code: 'TRACKING_NOT_FOUND',
        title: 'Nije pronađeno',
        detail: 'Porudžbina nije pronađena.',
        status: 404,
      },
      { status: 404, statusText: 'Not Found' },
    );
    await ctx.render();
    const problem = ctx.el('tracking-problem')!;
    expect(problem.getAttribute('role')).toBe('alert');
    expect(problem.getAttribute('data-kind')).toBe('notFound');
    expect(text(problem)).toContain(NOT_FOUND_MESSAGE);
    expect(NOT_FOUND_MESSAGE).toBe(
      'Nismo pronašli porudžbinu sa ovim kodom. Proverite kod iz e-poruke i pokušajte ponovo.',
    );
    expect(ctx.el<HTMLInputElement>('tracking-code')?.getAttribute('aria-invalid')).toBe('true');
    expect(ctx.el<HTMLButtonElement>('tracking-submit')?.disabled).toBe(false);
  });

  it('explains the rate limit with Retry-After and blocks the button meanwhile', async () => {
    const ctx = await open('/track-order');
    await ctx.type(CODE);
    await ctx.submit();
    const limited = (seconds: string) =>
      ctx.http.expectOne(LOOKUP_URL).flush(
        { code: 'RATE_LIMITED', title: 'Previše zahteva', detail: 'x', status: 429 },
        {
          status: 429,
          statusText: 'Too Many Requests',
          headers: new HttpHeaders({ 'Retry-After': seconds }),
        },
      );
    limited('1');
    await ctx.render();
    expect(text(ctx.el('tracking-problem'))).toContain('Sačekajte oko 1 sekundu');
    expect(ctx.el('tracking-problem')?.getAttribute('data-kind')).toBe('rateLimited');
    expect(ctx.el<HTMLButtonElement>('tracking-submit')?.disabled).toBe(true);
    await ctx.submit();
    ctx.http.expectNone(LOOKUP_URL);

    // The button works again once the wait is over.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await ctx.render();
    expect(ctx.el<HTMLButtonElement>('tracking-submit')?.disabled).toBe(false);
    await ctx.submit();
    limited('120');
    await ctx.render();
    expect(text(ctx.el('tracking-problem'))).toContain('Sačekajte oko 2 minuta');
  });

  it('says so when the server cannot be reached', async () => {
    const ctx = await open('/track-order');
    await ctx.type(CODE);
    await ctx.submit();
    ctx.http.expectOne(LOOKUP_URL).error(new ProgressEvent('error'));
    await ctx.render();
    expect(ctx.el('tracking-problem')?.getAttribute('data-kind')).toBe('network');
    expect(text(ctx.el('tracking-problem'))).toContain('Proverite internet vezu');
    expect(ctx.el<HTMLInputElement>('tracking-code')?.value).toBe(CODE);
  });

  it('sends a code from the email link at once and removes it from the address', async () => {
    const log = vi.spyOn(console, 'log');
    const ctx = await open(`/track-order#kod=${CODE}`);
    const request = ctx.http.expectOne(LOOKUP_URL);
    expect(request.request.body).toEqual({ code: CODE });
    expect(request.request.urlWithParams).not.toContain(CODE);
    // Fragment cleared (history entry replaced), never moved to the query string.
    expect(ctx.router.url).toBe('/track-order');
    expect(ctx.location.path(true)).toBe('/track-order');
    request.flush(RESULT);
    await ctx.render();
    expect(text(ctx.el('tracking-status'))).toBe('Poslata');
    expect(log.mock.calls.flat().join(' ')).not.toContain(CODE);
  });

  it('accepts the Serbian address as an alias of /track-order, keeping the fragment', async () => {
    const ctx = await open(`/pracenje-porudzbine#kod=${RAW}`);
    const request = ctx.http.expectOne(LOOKUP_URL);
    expect(request.request.body).toEqual({ code: CODE });
    expect(ctx.router.url).toBe('/track-order');
    expect(ctx.location.path(true)).toBe('/track-order');
    request.flush(RESULT);
    await ctx.render();
    expect(text(ctx.el('tracking-order-number'))).toBe('ZLD-2026-000042');
  });

  it('leaves other fragments alone and sends nothing', async () => {
    const ctx = await open('/track-order#sadrzaj');
    ctx.http.expectNone(LOOKUP_URL);
    expect(ctx.location.path(true)).toBe('/track-order#sadrzaj');
  });
});
