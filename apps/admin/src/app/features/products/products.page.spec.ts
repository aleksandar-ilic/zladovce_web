import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { apiErrorInterceptor, provideAppConfig } from '@zladovce/api';
import { AdminProductListItem } from '@zladovce/models';
import { CATEGORY } from '../../testing/fixtures';
import { ProductsPage, priceLabel } from './products.page';
import {
  hasProductFilters,
  parseProductQuery,
  productQueryParams,
  toApiQuery,
} from './products-query';

const API = 'http://localhost:5080/api/v1';

const ITEM: AdminProductListItem = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Džem od šljiva',
  slug: 'dzem-od-sljiva',
  sku: 'DZEM-SLJIVA',
  category: { id: CATEGORY.id, name: CATEGORY.name },
  isActive: true,
  isFeatured: true,
  isArchived: false,
  variantCount: 2,
  priceFrom: 650,
  hasPriceRange: true,
  totalStock: 18,
  stockStatus: 'low',
  mainImage: {
    id: 'i1',
    altText: null,
    isMain: true,
    sortOrder: 0,
    baseUrl: 'http://localhost:9000/b/media/products/i1',
    widths: [400, 800],
    width: 800,
    height: 600,
  },
  createdAt: '2026-11-14T10:00:00Z',
  updatedAt: '2026-11-14T10:00:00Z',
};

const text = (element: Element | null | undefined): string =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('product list query ↔ URL', () => {
  it('reads filters from the URL with safe fallbacks', () => {
    expect(
      parseProductQuery({
        q: ' džem ',
        category: CATEGORY.id,
        status: 'inactive',
        archived: 'true',
        sort: 'nameDesc',
        page: '3',
        pageSize: '50',
      }),
    ).toEqual({
      q: 'džem',
      category: CATEGORY.id,
      status: 'inactive',
      archived: true,
      sort: 'nameDesc',
      page: 3,
      pageSize: 50,
    });
    expect(
      parseProductQuery({ category: 'x', status: 'deleted', sort: 'price', page: '0' }),
    ).toEqual({
      q: '',
      category: undefined,
      status: undefined,
      archived: false,
      sort: 'newest',
      page: 1,
      pageSize: 20,
    });
  });

  it('writes only what differs from the defaults and round-trips', () => {
    const query = parseProductQuery({ q: 'sok', archived: 'true', page: '2' });
    const params = productQueryParams(query);
    expect(params).toEqual({
      q: 'sok',
      category: null,
      status: null,
      archived: 'true',
      sort: null,
      page: '2',
      pageSize: null,
    });
    const back = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null));
    expect(parseProductQuery(back)).toEqual(query);
    expect(hasProductFilters(query)).toBe(true);
    expect(hasProductFilters(parseProductQuery({ sort: 'name' }))).toBe(false);
    expect(toApiQuery(query)).toEqual({
      q: 'sok',
      category: undefined,
      status: undefined,
      archived: true,
      sort: 'newest',
      page: 2,
      pageSize: 20,
    });
  });

  it('shows "od" for a price range', () => {
    expect(priceLabel({ priceFrom: 650, hasPriceRange: true })).toBe('od 650 RSD');
    expect(priceLabel({ priceFrom: 1200, hasPriceRange: false })).toBe('1.200 RSD');
    expect(priceLabel({ priceFrom: null, hasPriceRange: false })).toBe('—');
  });
});

describe('ProductsPage', () => {
  async function openPage(url: string) {
    TestBed.configureTestingModule({
      providers: [
        provideAppConfig({ apiBaseUrl: API, healthUrl: 'http://localhost:5080/health' }),
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([{ path: 'proizvodi', component: ProductsPage }]),
        provideLocationMocks(),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, ProductsPage);
    const controller = TestBed.inject(HttpTestingController);
    controller.expectOne(`${API}/admin/categories`).flush({ items: [CATEGORY] });
    const render = async () => {
      for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve));
        harness.detectChanges();
        await harness.fixture.whenStable();
      }
    };
    return {
      harness,
      render,
      controller,
      page: harness.routeDebugElement?.componentInstance as ProductsPage,
      root: () => harness.routeNativeElement as HTMLElement,
    };
  }

  const list = (controller: HttpTestingController) =>
    controller.expectOne((r) => r.url === `${API}/admin/products`);

  it('loads with the URL filters, shows rows and keeps filter changes in the URL (Back restores them)', async () => {
    const { render, controller, page, root } = await openPage(
      `/proizvodi?category=${CATEGORY.id}&sort=name`,
    );
    const first = list(controller);
    expect(first.request.params.toString()).toBe(
      `category=${CATEGORY.id}&sort=name&page=1&pageSize=20`,
    );
    first.flush({ items: [ITEM], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
    await render();

    const row = root().querySelector('[data-testid="product-row"]');
    expect(text(row)).toContain('Džem od šljiva');
    expect(text(row)).toContain('Džemovi · DZEM-SLJIVA · 2 pakovanja');
    expect(text(row)).toContain('U prodaji');
    expect(text(row)).toContain('Istaknut');
    expect(text(row)).toContain('Malo na stanju');
    expect(text(row?.querySelector('[data-testid="price"]'))).toBe('od 650 RSD');
    // text() collapses the no-break space
    expect(row?.querySelector('img')?.getAttribute('src')).toBe(
      'http://localhost:9000/b/media/products/i1/400.webp',
    );
    expect(row?.querySelector('a')?.getAttribute('href')).toBe(`/proizvodi/${ITEM.id}`);

    page.update({ archived: true });
    await render();
    const router = TestBed.inject(Router);
    expect(router.url).toBe(`/proizvodi?category=${CATEGORY.id}&archived=true&sort=name`);
    const second = list(controller);
    expect(second.request.params.get('archived')).toBe('true');
    second.flush({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    await render();
    expect(text(root())).toContain('Nema proizvoda za izabrane filtere');

    // The harness does not start the router's popstate listener; the app does (initial navigation).
    router.setUpLocationChangeListener();
    TestBed.inject(Location).back();
    await render();
    expect(router.url).toBe(`/proizvodi?category=${CATEGORY.id}&sort=name`);
    expect(page.query()).toMatchObject({ category: CATEGORY.id, sort: 'name', archived: false });
    list(controller).flush({ items: [ITEM], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
    await render();
    expect(root().querySelectorAll('[data-testid="product-row"]').length).toBe(1);
  });

  it('debounces typing in the search field into the URL', async () => {
    const { render, controller, root } = await openPage('/proizvodi');
    list(controller).flush({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    await render();
    expect(text(root())).toContain('Još nema proizvoda');

    const input = root().querySelector<HTMLInputElement>('[data-testid="search"]');
    if (!input) throw new Error('search');
    input.value = 'sok';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 450));
    await render();
    expect(TestBed.inject(Router).url).toBe('/proizvodi?q=sok');
    expect(list(controller).request.params.get('q')).toBe('sok');
  });
});
