import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API, settle, testProviders, text } from '../testing/fixtures';
import { CONSENT_MESSAGE, NewsletterSignup } from './newsletter-signup';

const ACCEPTED =
  'Hvala! Ako prijava još nije potvrđena, poslali smo vam poruku sa linkom za potvrdu. Proverite e-poštu.';

function render() {
  TestBed.configureTestingModule({ providers: [provideRouter([]), ...testProviders()] });
  const fixture = TestBed.createComponent(NewsletterSignup);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    root.querySelector<T>(`[data-testid="${id}"]`);
  const type = (id: string, value: string) => {
    const input = el<HTMLInputElement>(id)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const submit = async () => {
    el<HTMLFormElement>('newsletter-form')!.dispatchEvent(new Event('submit'));
    await settle(() => fixture.detectChanges());
  };
  const http = TestBed.inject(HttpTestingController);
  return { fixture, root, el, type, submit, http };
}

describe('newsletter sign-up', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('requires a valid address and the consent before sending anything', async () => {
    const ctx = render();
    await ctx.submit();
    expect(text(ctx.root)).toContain('Upišite adresu e-pošte.');
    expect(text(ctx.el('newsletter-consent-error'))).toBe(CONSENT_MESSAGE);

    ctx.type('newsletter-email', 'ana@example.com');
    await ctx.submit();
    expect(text(ctx.el('newsletter-consent-error'))).toBe(CONSENT_MESSAGE);
    ctx.http.expectNone(`${API}/newsletter/subscriptions`);
  });

  it('labels the fields, hides the honeypot and explains the consent', () => {
    const ctx = render();
    const email = ctx.el<HTMLInputElement>('newsletter-email')!;
    expect(ctx.root.querySelector(`label[for="${email.id}"]`)?.textContent).toContain(
      'Adresa e-pošte',
    );
    const honeypot = ctx.el<HTMLInputElement>('newsletter-website')!;
    expect(honeypot.tabIndex).toBe(-1);
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull();
    const consent = ctx.el<HTMLInputElement>('newsletter-consent')!;
    expect(consent.closest('label')?.textContent).toContain('novosti iz Zladovca');
    expect(text(ctx.root.querySelector(`#${consent.getAttribute('aria-describedby')}`))).toContain(
      'link za odjavu',
    );
    expect(ctx.el('newsletter-live')?.getAttribute('aria-live')).toBe('polite');
  });

  it('sends email, consent and an empty honeypot, then shows the same message for everybody', async () => {
    const ctx = render();
    ctx.type('newsletter-email', '  ana@example.com ');
    ctx.el<HTMLInputElement>('newsletter-consent')!.click();
    await ctx.submit();
    expect(ctx.el('newsletter-submit')?.getAttribute('aria-busy')).toBe('true');
    expect(ctx.el('newsletter-submit')?.hasAttribute('disabled')).toBe(true);
    const request = ctx.http.expectOne(`${API}/newsletter/subscriptions`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'ana@example.com', consent: true, website: '' });
    request.flush({ message: ACCEPTED }, { status: 202, statusText: 'Accepted' });
    await settle(() => ctx.fixture.detectChanges());
    expect(ctx.el('newsletter-form')).toBeNull();
    expect(text(ctx.el('newsletter-success'))).toContain(ACCEPTED);
    expect(document.activeElement?.textContent?.trim()).toBe('Proverite e-poštu');
  });

  it('waits after 429 and keeps the button disabled', async () => {
    const ctx = render();
    ctx.type('newsletter-email', 'ana@example.com');
    ctx.el<HTMLInputElement>('newsletter-consent')!.click();
    await ctx.submit();
    ctx.http
      .expectOne(`${API}/newsletter/subscriptions`)
      .flush(
        { code: 'RATE_LIMITED', detail: 'Previše zahteva.' },
        { status: 429, statusText: 'Too Many', headers: { 'Retry-After': '120' } },
      );
    await settle(() => ctx.fixture.detectChanges());
    const problem = ctx.el('newsletter-problem');
    expect(problem?.getAttribute('data-kind')).toBe('rateLimited');
    expect(text(problem)).toContain('2 minuta');
    expect(ctx.el('newsletter-submit')?.hasAttribute('disabled')).toBe(true);
    await ctx.submit();
    ctx.http.expectNone(`${API}/newsletter/subscriptions`);
  });

  it('shows server validation messages under the fields', async () => {
    const ctx = render();
    ctx.type('newsletter-email', 'ana@example.com');
    ctx.el<HTMLInputElement>('newsletter-consent')!.click();
    await ctx.submit();
    ctx.http.expectOne(`${API}/newsletter/subscriptions`).flush(
      {
        code: 'VALIDATION_FAILED',
        detail: 'Proverite unete podatke.',
        errors: { email: ['Unesite ispravnu adresu e-pošte.'] },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle(() => ctx.fixture.detectChanges());
    expect(text(ctx.root)).toContain('Unesite ispravnu adresu e-pošte.');
    expect(ctx.el('newsletter-email')?.getAttribute('aria-invalid')).toBe('true');
  });
});
