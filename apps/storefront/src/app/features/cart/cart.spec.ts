import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CART_STORAGE_KEY, CartStore } from '@zladovce/shared';
import { routes } from '../../app.routes';
import {
  API,
  nb,
  quote,
  quoteLine,
  settle,
  testProviders,
  text,
  VARIANT_370,
  VARIANT_720,
} from '../../testing/fixtures';
import { freeShippingText, minimumOrderText, shippingText } from './cart.page';

async function openCart() {
  TestBed.configureTestingModule({ providers: [provideRouter(routes), ...testProviders()] });
  const harness = await RouterTestingHarness.create('/korpa');
  const http = TestBed.inject(HttpTestingController);
  const page = harness.routeNativeElement as HTMLElement;
  const render = () => settle(() => harness.detectChanges());
  return { harness, http, page, render, cart: TestBed.inject(CartStore) };
}

const pendingQuote = (http: HttpTestingController) =>
  http.match((r) => r.url === `${API}/cart/quote`);

describe('cart summary texts', () => {
  it('shows shipping, free shipping and minimum order honestly', () => {
    const paid = quote([quoteLine()]);
    expect(nb(shippingText(paid))).toBe('350 RSD');
    expect(nb(freeShippingText(paid))).toBe('Još 3.820 RSD do besplatne dostave.');
    const free = quote([quoteLine()], {
      shipping: { ...paid.shipping, price: 0, isFree: true, amountUntilFreeShipping: null },
    });
    expect(shippingText(free)).toBe('Besplatna dostava');
    expect(freeShippingText(free)).toBeNull();
    expect(shippingText(quote([], { shipping: { ...paid.shipping, enabled: false } }))).toBe(
      'Trenutno nije dostupna',
    );
    expect(minimumOrderText(paid)).toBeNull();
    expect(
      nb(
        minimumOrderText(
          quote([quoteLine()], {
            minOrderAmount: 2000,
            meetsMinimumOrder: false,
            amountUntilMinimumOrder: 820,
          }),
        ),
      ),
    ).toBe('Najmanji iznos porudžbine je 2.000 RSD. Dodajte proizvode u vrednosti od još 820 RSD.');
  });
});

describe('CartPage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('shows the empty state with a link to the shop and requests nothing', async () => {
    const { page, http, render } = await openCart();
    await render();
    expect(text(page.querySelector('h1'))).toBe('Korpa');
    expect(text(page)).toContain('Vaša korpa je prazna');
    expect(page.querySelector('ui-empty-state a')?.getAttribute('href')).toBe('/prodavnica');
    expect(pendingQuote(http).length).toBe(0);
  });

  it('shows priced lines, totals, shipping, free-shipping and minimum-order messages', async () => {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ version: 2, lines: [{ variantId: VARIANT_370.id, quantity: 2 }] }),
    );
    const { page, http, render } = await openCart();
    await render();
    expect(text(page)).toContain('Proveravamo cene i dostupnost');
    pendingQuote(http)[0]!.flush(
      quote([quoteLine()], {
        minOrderAmount: 2000,
        meetsMinimumOrder: false,
        amountUntilMinimumOrder: 820,
        canCheckout: false,
      }),
    );
    await render();
    const line = page.querySelector('[data-testid="cart-line"]');
    expect(text(line)).toContain('Džem od šljiva');
    expect(text(line)).toContain('370 g');
    expect(text(line?.querySelector('[data-testid="unit-price"]'))).toContain('590 RSD');
    expect(text(line?.querySelector('[data-testid="unit-price"] s'))).toContain('650 RSD');
    expect(text(line?.querySelector('[data-testid="line-total"]'))).toBe('1.180 RSD');
    expect(text(page.querySelector('[data-testid="subtotal"]'))).toBe('1.180 RSD');
    expect(text(page.querySelector('[data-testid="shipping"]'))).toBe('350 RSD');
    expect(text(page.querySelector('[data-testid="total"]'))).toBe('1.530 RSD');
    expect(text(page.querySelector('[data-testid="free-shipping"]'))).toBe(
      'Još 3.820 RSD do besplatne dostave.',
    );
    expect(text(page.querySelector('[data-testid="minimum-order"]'))).toContain('2.000 RSD');
    // Below the minimum order: the checkout button is disabled and says why.
    const checkout = page.querySelector<HTMLButtonElement>('[data-testid="checkout"]');
    expect(checkout?.tagName).toBe('BUTTON');
    expect(checkout?.disabled).toBe(true);
    expect(nb(text(page.querySelector('[data-testid="checkout-note"]')))).toContain(
      'Najmanji iznos porudžbine je 2.000 RSD',
    );
    expect(text(page)).not.toContain('uskoro');
    expect(nb(page.querySelector('[data-testid="cart-announcement"]')?.textContent)).toContain(
      'Ukupno: 1.530 RSD',
    );
  });

  it('links to the checkout when the quote allows ordering, and explains disabled shipping', async () => {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ version: 2, lines: [{ variantId: VARIANT_370.id, quantity: 2 }] }),
    );
    const { page, http, render } = await openCart();
    await render();
    pendingQuote(http)[0]!.flush(quote([quoteLine()]));
    await render();
    const link = page.querySelector<HTMLAnchorElement>('[data-testid="checkout"]');
    expect(link?.tagName).toBe('A');
    expect(link?.getAttribute('href')).toBe('/porucivanje');
    expect(page.querySelector('[data-testid="checkout-note"]')).toBeNull();
  });

  it('explains when shipping is switched off', async () => {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ version: 2, lines: [{ variantId: VARIANT_370.id, quantity: 2 }] }),
    );
    const { page, http, render } = await openCart();
    await render();
    const base = quote([quoteLine()]);
    pendingQuote(http)[0]!.flush({
      ...base,
      canCheckout: false,
      shipping: { ...base.shipping, enabled: false, price: 0 },
    });
    await render();
    expect(page.querySelector<HTMLButtonElement>('[data-testid="checkout"]')?.disabled).toBe(true);
    expect(text(page.querySelector('[data-testid="checkout-note"]'))).toContain(
      'Dostava je trenutno isključena',
    );
  });

  it('changes quantities within the limit, re-quotes, removes lines and shows adjustments', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify({
          version: 2,
          lines: [
            { variantId: VARIANT_370.id, quantity: 2, knownUnitPrice: 590 },
            { variantId: VARIANT_720.id, quantity: 1, label: 'Džem od šljiva, 720 g' },
          ],
        }),
      );
      const { page, http, render, cart } = await openCart();
      await render();
      pendingQuote(http)[0]!.flush(
        quote([quoteLine()], {
          adjustments: [
            {
              variantId: VARIANT_720.id,
              reason: 'unavailable',
              requestedQuantity: 1,
              availableQuantity: 0,
              previousUnitPrice: null,
              unitPrice: null,
            },
          ],
        }),
      );
      await render();
      expect(text(page.querySelector('[data-testid="cart-notices"]'))).toContain(
        'Proizvod „Džem od šljiva, 720 g“ više nije dostupan i uklonjen je iz korpe.',
      );
      expect(cart.lineCount()).toBe(1);

      // + is limited to maxOrderQuantity (5).
      const increase = page.querySelector<HTMLButtonElement>('[data-testid="increase"]')!;
      for (let i = 0; i < 5; i++) {
        increase.click();
        await render();
      }
      expect(cart.quantityOf(VARIANT_370.id)).toBe(5);
      expect(increase.disabled).toBe(true);
      expect(text(page.querySelector('[data-testid="line-total"]'))).toBe('2.950 RSD');
      expect(text(page)).toContain('Iznosi se ažuriraju');
      await vi.advanceTimersByTimeAsync(500);
      const requests = pendingQuote(http);
      expect(requests.length).toBe(1);
      requests[0]!.flush(
        quote([quoteLine({ requestedQuantity: 5, quantity: 5, lineTotal: 2950 })]),
      );
      await render();
      expect(text(page.querySelector('[data-testid="subtotal"]'))).toBe('2.950 RSD');

      page.querySelector<HTMLButtonElement>('[data-testid="remove-line"]')!.click();
      await render();
      expect(cart.isEmpty()).toBe(true);
      expect(text(page)).toContain('Vaša korpa je prazna');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows an error with retry when the cart cannot be priced', async () => {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ version: 2, lines: [{ variantId: VARIANT_370.id, quantity: 1 }] }),
    );
    const { page, http, render } = await openCart();
    await render();
    pendingQuote(http)[0]!.flush(
      {
        title: 'Greška',
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        detail: 'Servis nije dostupan.',
      },
      { status: 503, statusText: 'Unavailable' },
    );
    await render();
    expect(text(page)).toContain('Korpa trenutno ne može da se učita');
    page.querySelector<HTMLButtonElement>('ui-error-state button')!.click();
    await render();
    expect(pendingQuote(http).length).toBe(1);
  });
});
