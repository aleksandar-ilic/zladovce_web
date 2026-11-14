import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import {
  API,
  CATEGORY,
  CATEGORY_DETAIL,
  listItem,
  paged,
  settle,
  testProviders,
  text,
} from '../../testing/fixtures';
import {
  activeFilterCount,
  EMPTY_SHOP_QUERY,
  pageWindow,
  parseShopQuery,
  productCountLabel,
  shopQueryParams,
  toCatalogQuery,
  withChange,
} from './shop-query';
import { ShopPage } from './shop.page';

describe('shop query ↔ URL', () => {
  it('reads every filter and falls back to defaults for invalid values', () => {
    expect(
      parseShopQuery({
        q: ' džem ',
        minPrice: '300',
        maxPrice: '1200',
        inStock: 'true',
        sort: 'priceAsc',
        page: '3',
      }),
    ).toEqual({
      q: 'džem',
      minPrice: 300,
      maxPrice: 1200,
      inStock: true,
      sort: 'priceAsc',
      page: 3,
    });
    expect(
      parseShopQuery({
        minPrice: '-5',
        maxPrice: 'x',
        sort: 'bestselling',
        page: '0',
        inStock: 'yes',
      }),
    ).toEqual(EMPTY_SHOP_QUERY);
    expect(parseShopQuery({ minPrice: '900', maxPrice: '100' })).toMatchObject({
      minPrice: 100,
      maxPrice: 900,
    });
  });

  it('writes only what differs from the defaults and round-trips', () => {
    const query = {
      q: 'sok',
      minPrice: 100,
      maxPrice: null,
      inStock: true,
      sort: 'name' as const,
      page: 2,
    };
    const params = shopQueryParams(query);
    expect(params).toEqual({
      q: 'sok',
      minPrice: '100',
      maxPrice: null,
      inStock: 'true',
      sort: 'name',
      page: '2',
    });
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null));
    expect(parseShopQuery(clean)).toEqual(query);
    expect(shopQueryParams(EMPTY_SHOP_QUERY)).toEqual({
      q: null,
      minPrice: null,
      maxPrice: null,
      inStock: null,
      sort: null,
      page: null,
    });
  });

  it('goes back to page 1 on every filter change, counts filters and builds the API query', () => {
    const query = { ...EMPTY_SHOP_QUERY, page: 4 };
    expect(withChange(query, { inStock: true }).page).toBe(1);
    expect(withChange(query, { page: 5 }).page).toBe(5);
    expect(activeFilterCount({ ...EMPTY_SHOP_QUERY, q: 'x', maxPrice: 3 }, 'sokovi')).toBe(3);
    expect(toCatalogQuery({ ...EMPTY_SHOP_QUERY, q: 'x', inStock: true }, 'sokovi')).toEqual({
      category: 'sokovi',
      q: 'x',
      minPrice: undefined,
      maxPrice: undefined,
      inStock: true,
      sort: 'newest',
      page: 1,
      pageSize: 12,
    });
  });

  it('counts in Serbian and windows the page numbers', () => {
    expect(productCountLabel(1)).toBe('1 proizvod');
    expect(productCountLabel(3)).toBe('3 proizvoda');
    expect(productCountLabel(11)).toBe('11 proizvoda');
    expect(productCountLabel(21)).toBe('21 proizvod');
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
  });
});

describe('ShopPage', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  async function open(url: string) {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), ...testProviders()] });
    const harness = await RouterTestingHarness.create(url);
    const http = TestBed.inject(HttpTestingController);
    const render = () => settle(() => harness.detectChanges());
    await render();
    return { harness, http, render, page: () => harness.routeNativeElement as HTMLElement };
  }

  const productRequests = (http: HttpTestingController): TestRequest[] =>
    http.match((r) => r.url === `${API}/catalog/products`);

  /** Flushes the cached request; the hydration refresh (fresh copy) gets the same answer. */
  function flushProducts(http: HttpTestingController, body: object): TestRequest[] {
    const requests = productRequests(http);
    for (const request of requests) {
      request.flush(body);
    }
    return requests;
  }

  it('loads with the filters from the URL and writes filter changes back to the URL', async () => {
    const { http, render, page, harness } = await open(
      '/prodavnica?q=d%C5%BEem&inStock=true&sort=priceDesc&page=2',
    );
    http.expectOne(`${API}/catalog/categories`).flush({ items: [CATEGORY] });
    const [first] = flushProducts(http, paged([listItem()], 2, 12, 13));
    expect(first!.request.params.toString()).toBe(
      'q=d%C5%BEem&inStock=true&sort=priceDesc&page=2&pageSize=12',
    );
    await render();
    flushProducts(http, paged([listItem()], 2, 12, 13));
    await render();

    const root = page();
    expect(text(root.querySelector('h1'))).toBe('Prodavnica');
    expect(root.querySelectorAll('[data-testid="product-card"]').length).toBe(1);
    expect(text(root.querySelector('[data-testid="result-count"]'))).toBe('13 proizvoda');
    expect(text(root.querySelector('[data-testid="discount-badge"]'))).toContain('−9');
    expect(root.querySelector('[data-testid="featured-badge"]')).not.toBeNull();
    expect(text(root.querySelector('[data-testid="availability"]'))).toBe('Na stanju');
    expect(text(root.querySelector('[data-testid="price"]'))).toBe('od 590 RSD');
    expect(root.querySelector<HTMLInputElement>('[data-testid="search"]')?.value).toBe('džem');
    expect(
      root.querySelector('nav[aria-label="Stranice"] [aria-current="page"]')?.textContent?.trim(),
    ).toBe('2');

    const shop = harness.routeDebugElement?.componentInstance as ShopPage;
    const min = root.querySelector<HTMLInputElement>('[data-testid="min-price"]')!;
    min.value = '300';
    min.dispatchEvent(new Event('change'));
    await render();
    expect(TestBed.inject(Router).url).toBe(
      '/prodavnica?q=d%C5%BEem&inStock=true&sort=priceDesc&minPrice=300',
    );
    const [second] = flushProducts(http, paged([], 1, 12, 0));
    expect(second!.request.params.get('minPrice')).toBe('300');
    expect(second!.request.params.get('page')).toBe('1');
    await render();
    expect(text(root)).toContain('Nema proizvoda za izabrane filtere');
    expect(shop.query().minPrice).toBe(300);

    root.querySelector<HTMLButtonElement>('[data-testid="reset-filters"]')!.click();
    await render();
    expect(TestBed.inject(Router).url).toBe('/prodavnica?sort=priceDesc');
    flushProducts(http, paged([], 1, 12, 0));
  });

  it('category links keep the other filters, and the category page shows its header and SEO', async () => {
    const { http, render, page } = await open('/prodavnica?inStock=true');
    http.expectOne(`${API}/catalog/categories`).flush({ items: [CATEGORY] });
    flushProducts(http, paged([listItem()]));
    await render();
    flushProducts(http, paged([listItem()]));
    await render();
    const link = page().querySelector<HTMLAnchorElement>('aside [data-testid="category-filter"]');
    expect(link?.getAttribute('href')).toBe('/prodavnica/dzemovi-proba?inStock=true');

    link!.click();
    await render();
    expect(TestBed.inject(Router).url).toBe('/prodavnica/dzemovi-proba?inStock=true');
    http.expectOne(`${API}/catalog/categories/dzemovi-proba`).flush(CATEGORY_DETAIL);
    const [request] = flushProducts(http, paged([listItem()]));
    expect(request!.request.params.get('category')).toBe('dzemovi-proba');
    await render();
    expect(text(page().querySelector('h1'))).toBe('Džemovi');
    expect(text(page())).toContain('Domaći džemovi.');
    expect(document.title).toBe('Džemovi – Zladovce');
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://zladovce.test/prodavnica/dzemovi-proba',
    );
    const jsonLd = [...document.head.querySelectorAll('script[type="application/ld+json"]')].map(
      (s) => JSON.parse(s.textContent ?? '{}') as { '@type': string },
    );
    expect(jsonLd.map((item) => item['@type'])).toEqual(['BreadcrumbList']);
  });

  it('shows the not-found state for an unknown category', async () => {
    const { http, render, page } = await open('/prodavnica/nema-je');
    http.expectOne(`${API}/catalog/categories`).flush({ items: [] });
    http
      .expectOne(`${API}/catalog/categories/nema-je`)
      .flush(
        { title: 'Nije pronađeno', status: 404, code: 'NOT_FOUND', detail: 'Nema.' },
        { status: 404, statusText: 'Not Found' },
      );
    flushProducts(http, paged([]));
    await render();
    expect(text(page().querySelector('h1'))).toBe('Kategorija nije pronađena');
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex',
    );
  });

  it('shows an error state with retry, and the mobile filter drawer as a dialog', async () => {
    const { http, render, page } = await open('/prodavnica');
    http.expectOne(`${API}/catalog/categories`).flush({ items: [CATEGORY] });
    productRequests(http)[0]!.flush(
      { title: 'Greška', status: 500, code: 'INTERNAL_ERROR', detail: 'Pokušajte ponovo.' },
      { status: 500, statusText: 'Server Error' },
    );
    await render();
    expect(text(page())).toContain('Proizvodi nisu učitani');
    page().querySelector<HTMLButtonElement>('ui-error-state button')!.click();
    await render();
    flushProducts(http, paged([listItem()]));
    await render();
    expect(page().querySelectorAll('[data-testid="product-card"]').length).toBe(1);

    const toggle = page().querySelector<HTMLButtonElement>('[data-testid="open-filters"]')!;
    toggle.click();
    await render();
    const drawer = page().querySelector<HTMLElement>('[data-testid="filter-drawer"]');
    expect(drawer?.getAttribute('role')).toBe('dialog');
    expect(drawer?.querySelector('[data-testid="search"]')?.id).toBe('m-q');
    expect(document.body.style.overflow).toBe('hidden');
    drawer!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await render();
    expect(page().querySelector('[data-testid="filter-drawer"]')).toBeNull();
    expect(document.activeElement).toBe(toggle);
    expect(document.body.style.overflow).toBe('');
  });
});
