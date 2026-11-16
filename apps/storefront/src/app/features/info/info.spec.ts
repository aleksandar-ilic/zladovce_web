import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { API, SITE, settle, STORE, testProviders, text } from '../../testing/fixtures';

const NOT_FOUND = { code: 'NOT_FOUND', detail: 'Nije pronađeno.' };
const NF = { status: 404, statusText: 'Not Found' };

async function open(path: string) {
  TestBed.configureTestingModule({ providers: [provideRouter(routes), ...testProviders()] });
  const harness = await RouterTestingHarness.create(path);
  const render = () => settle(() => harness.detectChanges(), 6);
  const root = () => harness.routeNativeElement as HTMLElement;
  return {
    harness,
    render,
    root,
    http: TestBed.inject(HttpTestingController),
    el: (id: string) => root().querySelector<HTMLElement>(`[data-testid="${id}"]`),
    all: (id: string) => [...root().querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)],
  };
}

const head = () => document.head;
const robots = () => head().querySelector<HTMLMetaElement>('meta[name="robots"]')?.content ?? null;
const canonical = () => head().querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
const jsonLd = () =>
  [...head().querySelectorAll('script[type="application/ld+json"]')].map(
    (s) => JSON.parse(s.textContent ?? '{}') as Record<string, unknown>,
  );

function richPage(key: string, bodyHtml: string, title: string | null = null) {
  return {
    key,
    title,
    content: { bodyHtml },
    seoTitle: null,
    seoDescription: null,
    updatedAt: '2026-11-15T10:00:00Z',
  };
}

describe('informational pages', () => {
  afterEach(() => {
    head()
      .querySelectorAll('meta, link[rel="canonical"], script[data-sf-jsonld]')
      .forEach((element) => element.remove());
  });

  it('routes only the known slugs to the info page', async () => {
    const ctx = await open('/nesto-drugo');
    expect(ctx.root().tagName.toLowerCase()).toBe('sf-not-found-page');
  });

  it('FAQ: accessible accordion with FAQPage JSON-LD', async () => {
    const ctx = await open('/cesta-pitanja');
    ctx.http.expectOne(`${API}/content/faq`).flush({
      items: [
        { id: 'a1', question: 'Kako plaćam?', answer: 'Pouzećem, kuriru.\n\nBez kartice.' },
        { id: 'a2', question: 'Treba li nalog?', answer: 'Ne treba.' },
      ],
    });
    await ctx.render();
    expect(text(ctx.root().querySelector('h1'))).toBe('Česta pitanja');
    const [first, second] = ctx.all('faq-question');
    const answers = ctx.all('faq-answer');
    expect(first?.getAttribute('aria-expanded')).toBe('false');
    expect(first?.getAttribute('aria-controls')).toBe(answers[0]?.id);
    expect(answers[0]?.getAttribute('role')).toBe('region');
    expect(answers[0]?.getAttribute('aria-labelledby')).toBe(first?.id);
    expect(answers[0]?.hidden).toBe(true);
    // Answers are in the HTML (prerendered, indexable) even while closed.
    expect([...answers[0]!.querySelectorAll('p')].map(text)).toEqual([
      'Pouzećem, kuriru.',
      'Bez kartice.',
    ]);
    expect(answers[0]?.querySelectorAll('p').length).toBe(2);

    first!.click();
    await ctx.render();
    expect(first?.getAttribute('aria-expanded')).toBe('true');
    expect(answers[0]?.hidden).toBe(false);
    expect(answers[1]?.hidden).toBe(true);
    first!.click();
    await ctx.render();
    expect(answers[0]?.hidden).toBe(true);

    ctx.el('faq-open-all')!.click();
    await ctx.render();
    expect(answers.every((a) => !a.hidden)).toBe(true);
    expect(second?.getAttribute('aria-expanded')).toBe('true');

    expect(canonical()).toBe(`${SITE}/cesta-pitanja`);
    expect(jsonLd()).toEqual([
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Kako plaćam?',
            acceptedAnswer: { '@type': 'Answer', text: 'Pouzećem, kuriru.\n\nBez kartice.' },
          },
          {
            '@type': 'Question',
            name: 'Treba li nalog?',
            acceptedAnswer: { '@type': 'Answer', text: 'Ne treba.' },
          },
        ],
      },
    ]);
  });

  it('FAQ without items is a 404 (noindex)', async () => {
    const ctx = await open('/cesta-pitanja');
    ctx.http.expectOne(`${API}/content/faq`).flush({ items: [] });
    await ctx.render();
    expect(ctx.root().querySelector('sf-not-found-page')).not.toBeNull();
    expect(robots()).toBe('noindex');
    expect(canonical()).toBeNull();
  });

  it('About: rich HTML through the Angular sanitizer and the photo gallery', async () => {
    const ctx = await open('/o-nama');
    ctx.http.expectOne(`${API}/content/pages/about`).flush({
      key: 'about',
      title: 'Naša porodica',
      content: {
        bodyHtml:
          '<p>Kuvamo <strong>kod kuće</strong>.</p><figure><img src="http://localhost:9000/media/pages/x/800.webp" alt="Kuhinja"><figcaption>Kuhinja</figcaption></figure><script>alert(1)</script>',
        images: [
          {
            key: 'pages/g1',
            baseUrl: 'http://localhost:9000/media/pages/g1',
            widths: [400, 800],
            width: 800,
            height: 600,
            alt: 'Bašta',
          },
        ],
      },
      seoTitle: 'O nama – porodica Zladovce',
      seoDescription: null,
      updatedAt: '2026-11-15T10:00:00Z',
    });
    await ctx.render();
    expect(text(ctx.el('page-title'))).toBe('Naša porodica');
    const body = ctx.el('page-body')!;
    expect(body.querySelector('strong')).not.toBeNull();
    expect(body.querySelector('figure img')?.getAttribute('src')).toBe(
      'http://localhost:9000/media/pages/x/800.webp',
    );
    expect(body.querySelector('script')).toBeNull();
    const gallery = ctx.el('about-gallery');
    expect(gallery?.querySelector('img')?.getAttribute('alt')).toBe('Bašta');
    expect(document.title).toBe('O nama – porodica Zladovce');
    expect(
      head().querySelector<HTMLMetaElement>('meta[name="description"]')?.content,
    ).toBe('Kuvamo kod kuće. Kuhinja');
    expect(head().querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content).toBe(
      'http://localhost:9000/media/pages/g1/800.webp',
    );
  });

  it('Privacy and terms: an empty page (404) shows the 404 view', async () => {
    const ctx = await open('/politika-privatnosti');
    ctx.http.expectOne(`${API}/content/pages/privacy`).flush(NOT_FOUND, NF);
    await ctx.render();
    expect(text(ctx.root().querySelector('h1'))).toBe('Stranica nije pronađena');
    expect(robots()).toBe('noindex');
  });

  it('Terms: the owner text with its default title and last change', async () => {
    const ctx = await open('/uslovi-koriscenja');
    ctx.http
      .expectOne(`${API}/content/pages/terms`)
      .flush(richPage('terms', '<h2>Opšte</h2><p>Tekst uslova.</p>'));
    await ctx.render();
    expect(text(ctx.el('page-title'))).toBe('Uslovi korišćenja');
    expect(text(ctx.root())).toContain('Poslednja izmena: 15. novembar 2026.');
    expect(ctx.el('page-body')?.querySelector('h2')).not.toBeNull();
    expect(canonical()).toBe(`${SITE}/uslovi-koriscenja`);
    expect(robots()).toBeNull();
  });

  it('Delivery: the CMS page when it has content', async () => {
    const ctx = await open('/dostava-i-placanje');
    ctx.http.expectOne(`${API}/store`).flush(STORE);
    ctx.http
      .expectOne(`${API}/content/pages/delivery`)
      .flush(richPage('delivery', '<p>Šaljemo kurirskom službom.</p>'));
    await ctx.render();
    expect(text(ctx.el('page-body'))).toBe('Šaljemo kurirskom službom.');
    expect(ctx.el('delivery-facts')).toBeNull();
  });

  it('Delivery: falls back to the delivery facts of the store settings', async () => {
    const ctx = await open('/dostava-i-placanje');
    ctx.http.expectOne(`${API}/content/pages/delivery`).flush(NOT_FOUND, NF);
    ctx.http.expectOne(`${API}/store`).flush({
      ...STORE,
      shipping: { ...STORE.shipping, price: 350, estimatedDeliveryText: '2–3 radna dana' },
    });
    await ctx.render();
    const facts = ctx.el('delivery-facts');
    expect(text(facts)).toContain('Cena dostave');
    expect(text(facts)).toContain('2–3 radna dana');
    expect(text(facts)).toContain('pouzećem');
    expect(robots()).toBeNull();
  });

  it('Delivery: neither CMS page nor store facts is a 404', async () => {
    const ctx = await open('/dostava-i-placanje');
    ctx.http.expectOne(`${API}/content/pages/delivery`).flush(NOT_FOUND, NF);
    ctx.http.expectOne(`${API}/store`).flush(STORE);
    await ctx.render();
    expect(ctx.root().querySelector('sf-not-found-page')).not.toBeNull();
    expect(robots()).toBe('noindex');
  });
});
