import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import {
  buildRobots,
  buildSitemap,
  DISALLOWED_PATHS,
  INFO_PAGES as SITEMAP_INFO_PAGES,
  normaliseSiteUrl,
  sitemapEntries,
  updatedAtBySlug,
} from '../../../../../tools/seo-files.mjs';
import { PRODUCT, SITE, STORE, testProviders, VARIANT_370 } from '../testing/fixtures';
import { INFO_PAGES } from './navigation';
import { fetchBuildJson, fetchSeoRoutes, FetchLike, infoPageSlugs } from './prerender';
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
    expect(routes).toMatchObject({
      categories: [{ slug: 'dzemovi', updatedAt: 'x' }],
      products: [{ slug: 'dzem-od-sljiva', updatedAt: 'x' }],
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to no routes with a warning when the API is down, failing or empty', async () => {
    const warn = vi.fn();
    const down: FetchLike = () => Promise.reject(new TypeError('fetch failed'));
    expect(await fetchSeoRoutes('http://api', { fetchFn: down, warn })).toMatchObject({
      categories: [],
      products: [],
    });
    expect(warn.mock.calls[0]![0]).toContain('Only the static pages are prerendered');

    const failing: FetchLike = () =>
      Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
    expect(await fetchSeoRoutes('http://api', { fetchFn: failing, warn })).toMatchObject({
      categories: [],
      products: [],
    });
    expect(warn.mock.calls[1]![0]).toContain('HTTP 503');

    expect(
      await fetchSeoRoutes('http://api', { fetchFn: ok({ categories: 'x' }), warn }),
    ).toMatchObject({
      categories: [],
      products: [],
    });
    expect(warn.mock.calls[2]![0]).toContain('returned no products');
  });

  it('returns blog posts, blog categories and CMS pages with content', async () => {
    const routes = await fetchSeoRoutes('http://api', {
      warn: vi.fn(),
      fetchFn: ok({
        categories: [],
        products: [{ slug: 'p', updatedAt: 'x' }],
        blogPosts: [
          { slug: 'kako-kuvamo-dzem', updatedAt: 'x' },
          { slug: 'kategorija', updatedAt: 'x' },
          { slug: '../x', updatedAt: 'x' },
        ],
        blogCategories: [{ slug: 'recepti', updatedAt: 'x' }],
        pages: [
          { key: 'about', updatedAt: 'x' },
          { key: 'terms', updatedAt: 'x' },
          { key: '../evil', updatedAt: 'x' },
        ],
      }),
    });
    expect(routes.blogPosts).toEqual([{ slug: 'kako-kuvamo-dzem', updatedAt: 'x' }]);
    expect(routes.blogCategories).toEqual([{ slug: 'recepti', updatedAt: 'x' }]);
    expect(routes.pages.map((p) => p.key)).toEqual(['about', 'terms']);
  });

  it('prerenders only the informational pages with content', () => {
    const routes = {
      categories: [],
      products: [],
      blogPosts: [],
      blogCategories: [],
      pages: [
        { key: 'about', updatedAt: 'x' },
        { key: 'privacy', updatedAt: 'x' },
        { key: 'home', updatedAt: 'x' },
      ],
    };
    expect(infoPageSlugs({ routes, faqCount: 0, shipping: STORE.shipping })).toEqual([
      'o-nama',
      'politika-privatnosti',
    ]);
    expect(
      infoPageSlugs({
        routes: { ...routes, pages: [] },
        faqCount: 2,
        shipping: { ...STORE.shipping, price: 350 },
      }),
    ).toEqual(['cesta-pitanja', 'dostava-i-placanje']);
    expect(
      infoPageSlugs({ routes: { ...routes, pages: [] }, faqCount: 0, shipping: null }),
    ).toEqual([]);
  });

  it('reads FAQ and store at build time without throwing when the API is down', async () => {
    const warn = vi.fn();
    const down: FetchLike = () => Promise.reject(new TypeError('fetch failed'));
    expect(await fetchBuildJson('http://api', '/content/faq', { fetchFn: down, warn })).toBeNull();
    expect(warn.mock.calls[0]![0]).toContain('http://api/content/faq');
    expect(
      await fetchBuildJson('http://api/', '/store', { fetchFn: ok({ storeName: 'Z' }), warn }),
    ).toEqual({ storeName: 'Z' });
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
      { path: '/kontakt' },
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
    expect(xml.match(/<url>/g)?.length).toBe(6);
    expect(xml).not.toContain('/korpa');
    expect(xml).not.toContain('/porucivanje');
  });

  it('escapes XML and works without catalog data', () => {
    expect(buildSitemap('http://a&b', sitemapEntries())).toContain(
      '<loc>http://a&amp;b/prodavnica</loc>',
    );
    expect(normaliseSiteUrl('')).toBe('http://localhost:4200');
  });

  it('robots.txt disallows cart, checkout, confirmation, tracking and the newsletter pages', () => {
    expect(buildRobots('https://zladovce.com')).toBe(
      'User-agent: *\nDisallow: /korpa\nDisallow: /porucivanje\nDisallow: /porudzbina-primljena\nDisallow: /track-order\nDisallow: /pracenje-porudzbine\nDisallow: /newsletter/\n\nSitemap: https://zladovce.com/sitemap.xml\n',
    );
  });

  it('lists blog posts, blog categories and informational pages with lastmod', () => {
    const updatedAt = updatedAtBySlug({
      blogPosts: [
        { slug: 'kako-kuvamo-dzem', updatedAt: '2026-11-15T10:00:00Z' },
        { slug: 'zimnica', updatedAt: '2026-11-01T10:00:00Z' },
      ],
      blogCategories: [{ slug: 'recepti', updatedAt: '2026-11-15T10:00:00Z' }],
      pages: [
        { key: 'about', updatedAt: '2026-11-14T09:00:00Z' },
        { key: 'terms', updatedAt: '2026-11-13T09:00:00Z' },
      ],
    });
    const entries = sitemapEntries({
      blogPosts: ['zimnica', 'kako-kuvamo-dzem'],
      blogCategories: ['recepti'],
      infoPages: ['uslovi-koriscenja', 'o-nama', 'cesta-pitanja'],
      updatedAt,
    });
    expect(entries).toEqual([
      { path: '/' },
      { path: '/prodavnica' },
      { path: '/kontakt' },
      { path: '/o-nama', lastmod: '2026-11-14' },
      { path: '/cesta-pitanja', lastmod: undefined },
      { path: '/uslovi-koriscenja', lastmod: '2026-11-13' },
      { path: '/blog', lastmod: '2026-11-15' },
      { path: '/blog/kategorija/recepti', lastmod: '2026-11-15' },
      { path: '/blog/kako-kuvamo-dzem', lastmod: '2026-11-15' },
      { path: '/blog/zimnica', lastmod: '2026-11-01' },
    ]);
    // Without posts the blog list is not in the sitemap (an empty blog is not worth indexing).
    expect(sitemapEntries({}).map((e) => e.path)).not.toContain('/blog');
  });

  it('keeps INFO_PAGES of the sitemap tool in line with the navigation config', () => {
    expect(SITEMAP_INFO_PAGES.map((page) => page.slug)).toEqual(INFO_PAGES.map((p) => p.slug));
    expect(SITEMAP_INFO_PAGES.map((page) => page.key)).toEqual(
      INFO_PAGES.map((p) => p.cmsKey ?? 'faq'),
    );
  });

  it('never lists the client-only pages in the sitemap', () => {
    const xml = buildSitemap('https://zladovce.com', sitemapEntries({ products: ['a'] }));
    for (const path of DISALLOWED_PATHS) {
      expect(xml).not.toContain(path);
    }
    expect(DISALLOWED_PATHS).toContain('/newsletter/');
  });
});
