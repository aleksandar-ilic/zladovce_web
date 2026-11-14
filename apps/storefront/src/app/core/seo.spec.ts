import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import {
  buildRobots,
  buildSitemap,
  DISALLOWED_PATHS,
  normaliseSiteUrl,
  sitemapEntries,
  updatedAtBySlug,
} from '../../../../../tools/seo-files.mjs';
import { PRODUCT, SITE, testProviders, VARIANT_370 } from '../testing/fixtures';
import { fetchSeoRoutes, FetchLike } from './prerender';
import { SeoService, serializeJsonLd } from './seo';
import { normaliseSiteUrl as normaliseAppSiteUrl } from './site-url';
import {
  breadcrumbJsonLd,
  htmlToText,
  productJsonLd,
  shareImageUrl,
  truncate,
} from './structured-data';

const head = () => document.head;
const meta = (attr: string, name: string) =>
  head().querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`)?.content ?? null;

describe('SeoService', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: '',
            title: 'Početna – Zladovce',
            data: { description: 'Opis početne.' },
            children: [],
          },
          { path: 'proizvod/:slug', children: [] },
          { path: 'korpa', title: 'Korpa', data: { noindex: true }, children: [] },
        ]),
        ...testProviders(),
      ],
    });
    const seo = TestBed.inject(SeoService);
    seo.start();
    return { seo, router: TestBed.inject(Router) };
  }

  afterEach(() => {
    head()
      .querySelectorAll('meta, link[rel="canonical"], script[data-sf-jsonld]')
      .forEach((element) => element.remove());
  });

  it('sets title, description, canonical, Open Graph and JSON-LD, and cleans up on navigation', async () => {
    const { seo, router } = setup();
    await router.navigateByUrl('/?utm=x');
    expect(meta('name', 'description')).toBe('Opis početne.');
    expect(head().querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${SITE}/`);
    expect(meta('property', 'og:url')).toBe(`${SITE}/`);
    expect(meta('property', 'og:title')).toBe('Početna – Zladovce');

    await router.navigateByUrl('/proizvod/dzem');
    seo.setPage({
      title: 'Džem – Zladovce',
      description: 'Opis džema.',
      path: '/proizvod/dzem',
      type: 'product',
      image: 'http://img/1600.webp',
      jsonLd: [{ '@type': 'Product', name: '</script><b>' }],
    });
    expect(TestBed.inject(Title).getTitle()).toBe('Džem – Zladovce');
    expect(head().querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${SITE}/proizvod/dzem`,
    );
    expect(meta('property', 'og:type')).toBe('product');
    expect(meta('property', 'og:image')).toBe('http://img/1600.webp');
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    const scripts = head().querySelectorAll('script[type="application/ld+json"]');
    expect(scripts.length).toBe(1);
    expect(scripts[0]!.textContent).not.toContain('</script>');
    expect(JSON.parse(scripts[0]!.textContent ?? '')).toEqual({
      '@type': 'Product',
      name: '</script><b>',
    });

    await router.navigateByUrl('/korpa');
    expect(meta('name', 'robots')).toBe('noindex');
    expect(head().querySelector('link[rel="canonical"]')).toBeNull();
    expect(head().querySelectorAll('script[type="application/ld+json"]').length).toBe(0);
    expect(meta('property', 'og:image')).toBeNull();
  });

  it('serialises JSON-LD safely', () => {
    expect(serializeJsonLd({ a: '<b>' })).toBe('{"a":"\\u003cb>"}');
  });
});

describe('structured data', () => {
  it('builds Product with one RSD offer per package and availability', () => {
    const data = productJsonLd(PRODUCT, SITE) as Record<string, unknown>;
    expect(data).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Džem od šljiva',
      description: 'Kuvan polako.',
      sku: VARIANT_370.sku,
      url: `${SITE}/proizvod/${PRODUCT.slug}`,
      image: [
        'http://localhost:9000/media/products/img-1/1600.webp',
        'http://localhost:9000/media/products/img-2/1600.webp',
      ],
    });
    expect(data['offers']).toEqual([
      expect.objectContaining({
        '@type': 'Offer',
        sku: 'DZ-SLJ-370',
        price: '590.00',
        priceCurrency: 'RSD',
        availability: 'https://schema.org/InStock',
      }),
      expect.objectContaining({ sku: 'DZ-SLJ-720', availability: 'https://schema.org/OutOfStock' }),
    ]);
  });

  it('builds BreadcrumbList with absolute URLs', () => {
    expect(breadcrumbJsonLd([{ name: 'Početna', path: '/' }, { name: 'Džem' }], SITE)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Početna', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Džem' },
      ],
    });
  });

  it('turns HTML into text, truncates on words and picks share images', () => {
    expect(htmlToText('<p>Šljive &amp; šećer</p><ul><li>Jedan</li></ul>')).toBe(
      'Šljive & šećer Jedan',
    );
    expect(truncate('jedan dva tri četiri', 12)).toBe('jedan dva…');
    expect(
      shareImageUrl({ baseUrl: 'b', widths: [400, 800], width: 800, height: 800, altText: null }),
    ).toBe('b/800.webp');
    expect(shareImageUrl(null)).toBeNull();
    expect(normaliseAppSiteUrl('https://zladovce.com/')).toBe('https://zladovce.com');
    expect(normaliseAppSiteUrl(undefined)).toBe('http://localhost:4200');
  });
});

describe('prerender params', () => {
  const ok =
    (body: unknown): FetchLike =>
    () =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

  it('returns the slugs of GET /seo/routes and drops unsafe ones', async () => {
    const warn = vi.fn();
    const routes = await fetchSeoRoutes('http://api/api/v1/', {
      warn,
      fetchFn: ok({
        categories: [
          { slug: 'dzemovi', updatedAt: 'x' },
          { slug: '../etc', updatedAt: 'x' },
        ],
        products: [{ slug: 'dzem-od-sljiva', updatedAt: 'x' }, { slug: 'A B' }, null],
      }),
    });
    expect(routes).toEqual({
      categories: [{ slug: 'dzemovi', updatedAt: 'x' }],
      products: [{ slug: 'dzem-od-sljiva', updatedAt: 'x' }],
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to no routes with a warning when the API is down, failing or empty', async () => {
    const warn = vi.fn();
    const down: FetchLike = () => Promise.reject(new TypeError('fetch failed'));
    expect(await fetchSeoRoutes('http://api', { fetchFn: down, warn })).toEqual({
      categories: [],
      products: [],
    });
    expect(warn.mock.calls[0]![0]).toContain('Only the static pages are prerendered');

    const failing: FetchLike = () =>
      Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
    expect(await fetchSeoRoutes('http://api', { fetchFn: failing, warn })).toEqual({
      categories: [],
      products: [],
    });
    expect(warn.mock.calls[1]![0]).toContain('HTTP 503');

    expect(await fetchSeoRoutes('http://api', { fetchFn: ok({ categories: 'x' }), warn })).toEqual({
      categories: [],
      products: [],
    });
    expect(warn.mock.calls[2]![0]).toContain('returned no products');
  });
});

describe('sitemap.xml and robots.txt', () => {
  it('lists static pages and prerendered pages with lastmod', () => {
    const updatedAt = updatedAtBySlug({
      categories: [{ slug: 'sokovi', updatedAt: '2026-11-10T08:00:00Z' }],
      products: [{ slug: 'sok-od-jabuke', updatedAt: '2026-11-12T23:30:00Z' }],
    });
    const entries = sitemapEntries({
      categories: ['sokovi', 'dzemovi'],
      products: ['sok-od-jabuke'],
      updatedAt,
    });
    expect(entries).toEqual([
      { path: '/' },
      { path: '/prodavnica' },
      { path: '/prodavnica/dzemovi', lastmod: undefined },
      { path: '/prodavnica/sokovi', lastmod: '2026-11-10' },
      { path: '/proizvod/sok-od-jabuke', lastmod: '2026-11-12' },
    ]);
    const xml = buildSitemap('https://zladovce.com/', entries);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://zladovce.com/</loc>');
    expect(xml).toContain(
      '<loc>https://zladovce.com/proizvod/sok-od-jabuke</loc>\n    <lastmod>2026-11-12</lastmod>',
    );
    expect(xml.match(/<url>/g)?.length).toBe(5);
    expect(xml).not.toContain('/korpa');
    expect(xml).not.toContain('/porucivanje');
  });

  it('escapes XML and works without catalog data', () => {
    expect(buildSitemap('http://a&b', sitemapEntries())).toContain(
      '<loc>http://a&amp;b/prodavnica</loc>',
    );
    expect(normaliseSiteUrl('')).toBe('http://localhost:4200');
  });

  it('robots.txt disallows cart, checkout, confirmation and tracking and points to the sitemap', () => {
    expect(buildRobots('https://zladovce.com')).toBe(
      'User-agent: *\nDisallow: /korpa\nDisallow: /porucivanje\nDisallow: /porudzbina-primljena\nDisallow: /track-order\nDisallow: /pracenje-porudzbine\n\nSitemap: https://zladovce.com/sitemap.xml\n',
    );
  });

  it('never lists the client-only pages in the sitemap', () => {
    const xml = buildSitemap('https://zladovce.com', sitemapEntries({ products: ['a'] }));
    for (const path of DISALLOWED_PATHS) {
      expect(xml).not.toContain(path);
    }
  });
});
