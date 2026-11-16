import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { API, settle, STORE, testProviders, text } from '../../testing/fixtures';

async function open(store = STORE) {
  TestBed.configureTestingModule({ providers: [provideRouter(routes), ...testProviders()] });
  const harness = await RouterTestingHarness.create('/kontakt');
  const http = TestBed.inject(HttpTestingController);
  const render = () => settle(() => harness.detectChanges(), 6);
  http.expectOne(`${API}/store`).flush(store);
  await render();
  const root = () => harness.routeNativeElement as HTMLElement;
  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    root().querySelector<T>(`[data-testid="${id}"]`);
  const type = (id: string, value: string) => {
    const input = el<HTMLInputElement>(id)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const fill = () => {
    type('contact-name', 'Ana Petrović');
    type('contact-email-input', 'ana@example.com');
    type('contact-message', 'Da li šaljete u Novi Sad?');
  };
  const submit = async () => {
    el<HTMLFormElement>('contact-form')!.dispatchEvent(new Event('submit'));
    await render();
  };
  return { harness, http, render, root, el, type, fill, submit };
}

const PHONE_STORE = {
  ...STORE,
  contact: { email: null, phone: '+381 64 111 2222', address: 'Primer ulica 1\nGrad' },
};

describe('contact page', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('shows only the contact details that are set', async () => {
    const empty = await open();
    expect(empty.el('contact-details')).toBeNull();
    TestBed.resetTestingModule();

    const ctx = await open(PHONE_STORE);
    expect(ctx.el('contact-phone')?.getAttribute('href')).toBe('tel:+381641112222');
    expect(ctx.el('contact-email')).toBeNull();
    expect(text(ctx.el('contact-address'))).toBe('Primer ulica 1 Grad');
    expect(text(ctx.root().querySelector('h1'))).toBe('Kontakt');
  });

  it('validates name, e-mail and message before sending', async () => {
    const ctx = await open();
    await ctx.submit();
    const alerts = [...ctx.root().querySelectorAll('[role="alert"]')].map(text);
    expect(alerts).toEqual(
      expect.arrayContaining([
        'Ime je obavezno.',
        'Adresa e-pošte je obavezna.',
        'Poruka je obavezna.',
      ]),
    );
    expect(document.activeElement).toBe(ctx.el('contact-name'));
    ctx.type('contact-email-input', 'nije-adresa');
    await ctx.render();
    expect(ctx.el('contact-email-input')?.getAttribute('aria-invalid')).toBe('true');
    ctx.http.expectNone(`${API}/contact`);
  });

  it('sends the message with an empty honeypot and shows the 202 message', async () => {
    const ctx = await open();
    ctx.fill();
    await ctx.submit();
    expect(ctx.el('contact-submit')?.hasAttribute('disabled')).toBe(true);
    const request = ctx.http.expectOne(`${API}/contact`);
    expect(request.request.body).toEqual({
      name: 'Ana Petrović',
      email: 'ana@example.com',
      message: 'Da li šaljete u Novi Sad?',
      website: '',
    });
    request.flush(
      { message: 'Hvala na poruci! Odgovorićemo vam u najkraćem roku.' },
      { status: 202, statusText: 'Accepted' },
    );
    await ctx.render();
    expect(text(ctx.el('contact-success'))).toContain('Hvala na poruci!');
    expect(ctx.el('contact-live')?.getAttribute('aria-live')).toBe('polite');
    expect(document.activeElement?.textContent?.trim()).toBe('Poruka je poslata');
    ctx.el('contact-another')!.click();
    await ctx.render();
    expect(ctx.el<HTMLInputElement>('contact-name')?.value).toBe('');
  });

  it('409 CONTACT_NOT_CONFIGURED shows the API text and the phone number', async () => {
    const ctx = await open(PHONE_STORE);
    ctx.fill();
    await ctx.submit();
    ctx.http.expectOne(`${API}/contact`).flush(
      {
        code: 'CONTACT_NOT_CONFIGURED',
        detail: 'Poruku trenutno nije moguće poslati. Pozovite nas telefonom.',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await ctx.render();
    const problem = ctx.el('contact-problem');
    expect(problem?.getAttribute('data-kind')).toBe('notConfigured');
    expect(text(problem)).toContain('Poruku trenutno nije moguće poslati.');
    expect(ctx.el('contact-phone-fallback')?.querySelector('a')?.getAttribute('href')).toBe(
      'tel:+381641112222',
    );
    expect(document.activeElement).toBe(problem);
    // The text stays in the form so it can be sent later or copied.
    expect(ctx.el<HTMLTextAreaElement>('contact-message')?.value).toBe(
      'Da li šaljete u Novi Sad?',
    );
  });

  it('409 without a phone shows only the API text', async () => {
    const ctx = await open();
    ctx.fill();
    await ctx.submit();
    ctx.http
      .expectOne(`${API}/contact`)
      .flush(
        { code: 'CONTACT_NOT_CONFIGURED', detail: 'Poruku trenutno nije moguće poslati.' },
        { status: 409, statusText: 'Conflict' },
      );
    await ctx.render();
    expect(text(ctx.el('contact-problem'))).toContain('Poruku trenutno nije moguće poslati.');
    expect(ctx.el('contact-phone-fallback')).toBeNull();
  });

  it('429 asks to wait and blocks the button', async () => {
    const ctx = await open();
    ctx.fill();
    await ctx.submit();
    ctx.http
      .expectOne(`${API}/contact`)
      .flush(
        { code: 'RATE_LIMITED', detail: 'Previše zahteva.' },
        { status: 429, statusText: 'Too Many', headers: { 'Retry-After': '30' } },
      );
    await ctx.render();
    expect(ctx.el('contact-problem')?.getAttribute('data-kind')).toBe('rateLimited');
    expect(text(ctx.el('contact-problem'))).toContain('30 sekundi');
    expect(ctx.el('contact-submit')?.hasAttribute('disabled')).toBe(true);
    await ctx.submit();
    ctx.http.expectNone(`${API}/contact`);
  });

  it('puts server validation messages under the fields', async () => {
    const ctx = await open();
    ctx.fill();
    await ctx.submit();
    ctx.http.expectOne(`${API}/contact`).flush(
      {
        code: 'VALIDATION_FAILED',
        detail: 'Proverite unete podatke.',
        errors: { message: ['Poruka može imati najviše 5000 znakova.'] },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await ctx.render();
    expect(text(ctx.root())).toContain('Poruka može imati najviše 5000 znakova.');
    expect(ctx.el('contact-message')?.getAttribute('aria-invalid')).toBe('true');
  });
});
