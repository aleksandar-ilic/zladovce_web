import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { PublicProduct } from '@zladovce/models';
import { CART_MAX_LINES, CartStore } from '@zladovce/shared';
import { routes } from '../../app.routes';
import { CartFeedback } from '../../core/cart/cart-feedback';
import {
  API,
  listItem,
  PRODUCT,
  settle,
  STORE,
  testProviders,
  text,
  VARIANT_370,
  VARIANT_720,
} from '../../testing/fixtures';
import { ProductPage } from './product.page';
import {
  addBlockReason,
  applyAvailability,
  defaultVariant,
  remainingQuantity,
  variantLabel,
} from './purchase';

describe('purchase rules', () => {
  it('preselects the first package on stock and labels packages by size', () => {
    expect(defaultVariant([VARIANT_720, VARIANT_370])?.id).toBe(VARIANT_370.id);
    expect(defaultVariant([VARIANT_720])?.id).toBe(VARIANT_720.id);
    expect(defaultVariant([])).toBeNull();
    expect(variantLabel(VARIANT_370)).toBe('370 g');
    expect(variantLabel({ unitAmount: 1, measurementUnit: 'l', name: 'Flaša' })).toBe('1 l');
  });

  it('never allows more than maxOrderQuantity minus what is already in the cart', () => {
    expect(remainingQuantity(VARIANT_370, 0)).toBe(5);
    expect(remainingQuantity(VARIANT_370, 3)).toBe(2);
    expect(remainingQuantity(VARIANT_370, 7)).toBe(0);
    expect(remainingQuantity(VARIANT_720, 0)).toBe(0);
    expect(remainingQuantity({ ...VARIANT_370, maxOrderQuantity: 500 }, 0)).toBe(99);
    expect(addBlockReason(VARIANT_370, 0, false)).toBeNull();
    expect(addBlockReason(VARIANT_370, 5, false)).toBe('limitReached');
    expect(addBlockReason(VARIANT_370, 0, true)).toBe('cartFull');
    expect(addBlockReason(VARIANT_370, 1, true)).toBeNull();
    expect(addBlockReason(VARIANT_720, 0, false)).toBe('unavailable');
    expect(addBlockReason(null, 0, false)).toBe('unavailable');
  });

  it('applies current availability; a package missing from the answer is not on sale', () => {
    const updated = applyAvailability(PRODUCT, [
      {
        variantId: VARIANT_720.id,
        productId: PRODUCT.id,
        price: 990,
        regularPrice: 1100,
        discountPrice: 990,
        inStock: true,
        maxOrderQuantity: 3,
      },
    ]);
    expect(updated.variants[0]).toMatchObject({
      id: VARIANT_370.id,
      inStock: false,
      maxOrderQuantity: 0,
    });
    expect(updated.variants[1]).toMatchObject({ price: 990, inStock: true, maxOrderQuantity: 3 });
    expect(updated).toMatchObject({
      inStock: true,
      price: 990,
      originalPrice: 1100,
      hasPriceRange: false,
    });
  });
});

describe('ProductPage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  async function open(product: PublicProduct = PRODUCT) {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), ...testProviders()] });
    const harness = await RouterTestingHarness.create(`/proizvod/${product.slug}`);
    const http = TestBed.inject(HttpTestingController);
    const render = () => settle(() => harness.detectChanges());
    await render();
    http.expectOne(`${API}/store`).flush(STORE);
    http.expectOne(`${API}/catalog/products/${product.slug}`).flush(product);
    await render();
    return { harness, http, render, page: harness.routeNativeElement as HTMLElement };
  }

  function flushRelated(http: HttpTestingController) {
    for (const request of http.match((r) => r.url.endsWith('/related'))) {
      expect(request.request.params.get('limit')).toBe('4');
      request.flush({ items: [listItem({ id: 'other', slug: 'drugi', name: 'Džem od kajsija' })] });
    }
  }

  function flushAvailability(http: HttpTestingController, maxOrderQuantity = 5) {
    const request = http.expectOne((r) => r.url === `${API}/catalog/availability`);
    expect(request.request.params.get('variantIds')).toBe(`${VARIANT_370.id},${VARIANT_720.id}`);
    request.flush({
      items: [
        { ...VARIANT_370, variantId: VARIANT_370.id, productId: PRODUCT.id, maxOrderQuantity },
      ],
    });
  }

  it('shows name, price with discount, availability, sanitised description, gallery and related products', async () => {
    const { http, render, page } = await open();
    flushAvailability(http);
    flushRelated(http);
    await render();
    expect(text(page.querySelector('h1'))).toBe('Džem od šljiva');
    expect(text(page.querySelector('[data-testid="price"]'))).toBe('590 RSD');
    expect(text(page.querySelector('[data-testid="regular-price"]'))).toContain('650 RSD');
    expect(text(page.querySelector('[data-testid="availability"]'))).toBe('Na stanju');
    const description = page.querySelector('[data-testid="description"]');
    expect(description?.innerHTML).toContain('<p>Kuvan polako.</p>');
    expect(description?.querySelector('script')).toBeNull();
    const chips = [...page.querySelectorAll('[data-testid="variant-chip"]')].map(text);
    expect(chips).toEqual(['370 g', '720 g (nema na stanju)']);
    const main = page.querySelector<HTMLImageElement>('[data-testid="main-image"] img');
    expect(main?.getAttribute('srcset')).toBe(
      'http://localhost:9000/media/products/img-1/400.webp 400w, http://localhost:9000/media/products/img-1/800.webp 800w, http://localhost:9000/media/products/img-1/1600.webp 1600w',
    );
    expect(main?.getAttribute('alt')).toBe('Tegla džema od šljiva');
    expect(main?.getAttribute('loading')).toBe('eager');
    expect(text(page)).toContain('Iz iste kategorije');
    expect(text(page)).toContain('Džem od kajsija');

    // Gallery: thumbnails and arrow keys.
    const thumbs = page.querySelectorAll<HTMLButtonElement>('[data-testid="thumbnail"]');
    thumbs[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await render();
    expect(thumbs[1]!.getAttribute('aria-current')).toBe('true');
    expect(document.activeElement).toBe(thumbs[1]);
    expect(page.querySelector('[data-testid="main-image"] img')?.getAttribute('alt')).toBe(
      'Džem od šljiva – slika 2',
    );

    // SEO: Product + BreadcrumbList JSON-LD, canonical, OG.
    expect(document.title).toBe('Džem od šljiva – Zladovce');
    const types = [...document.head.querySelectorAll('script[type="application/ld+json"]')].map(
      (s) => (JSON.parse(s.textContent ?? '{}') as { '@type': string })['@type'],
    );
    expect(types).toEqual(['Product', 'BreadcrumbList']);
    expect(document.head.querySelector('meta[property="og:type"]')?.getAttribute('content')).toBe(
      'product',
    );
  });

  it('refreshes price and stock after hydration from /catalog/availability', async () => {
    const { http, render, page } = await open();
    const request = http.expectOne((r) => r.url === `${API}/catalog/availability`);
    request.flush({
      items: [
        {
          ...VARIANT_370,
          variantId: VARIANT_370.id,
          productId: PRODUCT.id,
          price: 610,
          discountPrice: null,
          regularPrice: 610,
        },
      ],
    });
    flushRelated(http);
    await render();
    const purchase = page.querySelector('[data-testid="purchase"]');
    expect(text(purchase?.querySelector('[data-testid="price"]'))).toBe('610 RSD');
    expect(purchase?.querySelector('[data-testid="regular-price"]')).toBeNull();
  });

  it('limits quantity by maxOrderQuantity and what is in the cart, adds with feedback', async () => {
    const { http, render, page } = await open();
    flushAvailability(http, 5);
    flushRelated(http);
    await render();
    const cart = TestBed.inject(CartStore);
    cart.add(VARIANT_370.id, 2);
    await render();
    const increase = page.querySelector<HTMLButtonElement>('[data-testid="increase"]')!;
    for (let i = 0; i < 6; i++) {
      increase.click();
      await render();
    }
    expect(page.querySelector<HTMLInputElement>('[data-testid="quantity-input"]')?.value).toBe('3');
    expect(increase.disabled).toBe(true);

    page.querySelector<HTMLButtonElement>('[data-testid="add-to-cart"]')!.click();
    await render();
    expect(cart.lines()[0]).toEqual({
      variantId: VARIANT_370.id,
      quantity: 5,
      knownUnitPrice: 590,
      label: 'Džem od šljiva, 370 g',
    });
    expect(TestBed.inject(CartFeedback).message()).toMatchObject({
      title: 'Dodato u korpu',
      detail: 'Džem od šljiva, 370 g × 3',
    });
    const button = page.querySelector<HTMLButtonElement>('[data-testid="add-to-cart"]')!;
    expect(button.disabled).toBe(true);
    expect(text(page.querySelector('[data-testid="purchase-note"]'))).toContain(
      'najveću količinu ovog pakovanja',
    );
  });

  it('disables adding an out-of-stock package and a new line when the cart is full', async () => {
    const { http, render, page } = await open();
    flushAvailability(http);
    flushRelated(http);
    await render();
    page.querySelectorAll<HTMLInputElement>('[data-testid="variant-chip"] input')[1]!.click();
    await render();
    const button = page.querySelector<HTMLButtonElement>('[data-testid="add-to-cart"]')!;
    expect(button.disabled).toBe(true);
    expect(text(button)).toBe('Nema na stanju');

    page.querySelectorAll<HTMLInputElement>('[data-testid="variant-chip"] input')[0]!.click();
    const cart = TestBed.inject(CartStore);
    for (let i = 0; i < CART_MAX_LINES; i++) {
      cart.add(`other-${i}`);
    }
    await render();
    expect(button.disabled).toBe(true);
    expect(text(page.querySelector('[data-testid="purchase-note"]'))).toContain('najviše 50');
  });

  it('shows "Proizvod nije pronađen" for an unknown slug', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), ...testProviders()] });
    const harness = await RouterTestingHarness.create('/proizvod/nema');
    const http = TestBed.inject(HttpTestingController);
    await settle(() => harness.detectChanges());
    http.expectOne(`${API}/store`).flush(STORE);
    http
      .expectOne(`${API}/catalog/products/nema`)
      .flush(
        { title: 'Nije pronađeno', status: 404, code: 'NOT_FOUND', detail: 'Nema.' },
        { status: 404, statusText: 'Not Found' },
      );
    for (const r of http.match((r) => r.url.endsWith('/related'))) {
      r.flush({}, { status: 404, statusText: 'Not Found' });
    }
    await settle(() => harness.detectChanges());
    const page = harness.routeNativeElement as HTMLElement;
    expect(text(page.querySelector('h1'))).toBe('Proizvod nije pronađen');
    expect((harness.routeDebugElement?.componentInstance as ProductPage).state().status).toBe(
      'error',
    );
  });
});
