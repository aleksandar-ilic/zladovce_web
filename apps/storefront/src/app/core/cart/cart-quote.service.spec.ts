import { HttpTestingController } from '@angular/common/http/testing';
import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CART_STORAGE_KEY, CartStore } from '@zladovce/shared';
import {
  API,
  nb,
  quote,
  quoteLine,
  testProviders,
  VARIANT_370,
  VARIANT_720,
} from '../../testing/fixtures';

const tick = () => new Promise((resolve) => setTimeout(resolve));
import { adjustmentMessage, lineLabel } from './cart-messages';
import { CartQuoteService, cartSignature, QUOTE_DEBOUNCE_MS } from './cart-quote.service';

@Component({ selector: 'sf-test-host', template: '' })
class Host {
  readonly quotes = inject(CartQuoteService);
  constructor() {
    this.quotes.watch();
  }
}

function setup() {
  TestBed.configureTestingModule({ providers: testProviders() });
  const cart = TestBed.inject(CartStore);
  const http = TestBed.inject(HttpTestingController);
  return { cart, http, quotes: TestBed.inject(CartQuoteService) };
}

const quoteRequests = (http: HttpTestingController) =>
  http.match((r) => r.url === `${API}/cart/quote` && r.method === 'POST');

describe('cart messages', () => {
  const base = { variantId: 'v', requestedQuantity: 3, previousUnitPrice: null, unitPrice: null };

  it('explains every adjustment in plain Serbian', () => {
    expect(
      adjustmentMessage({ ...base, reason: 'unavailable', availableQuantity: 0 }, 'Sok, 1 l'),
    ).toBe('Proizvod „Sok, 1 l“ više nije dostupan i uklonjen je iz korpe.');
    expect(adjustmentMessage({ ...base, reason: 'unavailable', availableQuantity: 0 }, null)).toBe(
      'Jedan proizvod više nije dostupan i uklonjen je iz korpe.',
    );
    expect(
      adjustmentMessage({ ...base, reason: 'quantityReduced', availableQuantity: 2 }, 'Sok, 1 l'),
    ).toBe('Količina proizvoda „Sok, 1 l“ je smanjena na 2 jer više nema na stanju.');
    expect(
      adjustmentMessage(
        { ...base, reason: 'quantityReduced', availableQuantity: 2, limitReason: 'stock' },
        'Sok, 1 l',
      ),
    ).toBe('Količina proizvoda „Sok, 1 l“ je smanjena na 2 jer više nema na stanju.');
    expect(
      adjustmentMessage(
        { ...base, reason: 'quantityReduced', availableQuantity: 20, limitReason: 'orderLimit' },
        'Sok, 1 l',
      ),
    ).toBe(
      'Količina proizvoda „Sok, 1 l“ je smanjena na 20 jer je najveća količina po porudžbini 20.',
    );
    expect(
      adjustmentMessage(
        { ...base, reason: 'quantityReduced', availableQuantity: 20, limitReason: 'orderLimit' },
        null,
      ),
    ).toBe('Količina jednog proizvoda je smanjena na 20 jer je najveća količina po porudžbini 20.');
    expect(
      nb(
        adjustmentMessage(
          {
            ...base,
            reason: 'priceChanged',
            availableQuantity: 3,
            previousUnitPrice: 590,
            unitPrice: 1200.5,
          },
          'Sok, 1 l',
        ),
      ),
    ).toBe('Cena proizvoda „Sok, 1 l“ je promenjena sa 590 RSD na 1.200,50 RSD.');
    expect(lineLabel({ productName: 'Džem', variantName: '370 g' })).toBe('Džem, 370 g');
  });
});

describe('CartQuoteService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('quotes the cart with known prices and overwrites it from the quote lines', async () => {
    const { cart, http, quotes } = setup();
    cart.add(VARIANT_370.id, 4, { knownUnitPrice: 600 });
    cart.add(VARIANT_720.id, 1, { label: 'Džem od šljiva, 720 g' });
    quotes.refresh();
    await tick();
    const [request] = quoteRequests(http);
    expect(request!.request.body).toEqual({
      items: [
        { variantId: VARIANT_370.id, quantity: 4, knownUnitPrice: 600 },
        { variantId: VARIANT_720.id, quantity: 1, knownUnitPrice: null },
      ],
    });
    request!.flush(
      quote([quoteLine({ requestedQuantity: 4, quantity: 3, lineTotal: 1770 })], {
        adjustments: [
          {
            variantId: VARIANT_370.id,
            reason: 'quantityReduced',
            requestedQuantity: 4,
            availableQuantity: 3,
            previousUnitPrice: null,
            unitPrice: null,
          },
          {
            variantId: VARIANT_370.id,
            reason: 'priceChanged',
            requestedQuantity: 4,
            availableQuantity: 3,
            previousUnitPrice: 600,
            unitPrice: 590,
          },
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
    expect(cart.lines()).toEqual([
      {
        variantId: VARIANT_370.id,
        quantity: 3,
        knownUnitPrice: 590,
        label: 'Džem od šljiva, 370 g',
      },
    ]);
    expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY)!).lines[0].knownUnitPrice).toBe(590);
    expect(quotes.notices().map(nb)).toEqual([
      'Količina proizvoda „Džem od šljiva, 370 g“ je smanjena na 3 jer više nema na stanju.',
      'Cena proizvoda „Džem od šljiva, 370 g“ je promenjena sa 600 RSD na 590 RSD.',
      'Proizvod „Džem od šljiva, 720 g“ više nije dostupan i uklonjen je iz korpe.',
    ]);
    expect(quotes.quote()?.subtotal).toBe(1770);
    expect(quotes.stale()).toBe(false);
    expect(quotes.loading()).toBe(false);
    quotes.dismissNotices();
    expect(quotes.notices().map(nb)).toEqual([]);
    http.verify();
  });

  it('debounces rapid changes, cancels the request in flight and ignores its own update', async () => {
    vi.useFakeTimers();
    const { cart, http } = setup();
    cart.add(VARIANT_370.id, 1);
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    const first = quoteRequests(http);
    expect(first.length).toBe(1);
    first[0]!.flush(quote([quoteLine({ requestedQuantity: 1, quantity: 1, lineTotal: 590 })]));
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(QUOTE_DEBOUNCE_MS * 2);
    // Applying the quote changed the stored line (price, label) but not ids/quantities: no new quote.
    expect(quoteRequests(http).length).toBe(0);

    cart.setQuantity(VARIANT_370.id, 2);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(100);
    cart.setQuantity(VARIANT_370.id, 3);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(QUOTE_DEBOUNCE_MS - 50);
    expect(quoteRequests(http).length).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    const second = quoteRequests(http);
    expect(second.length).toBe(1);
    expect((second[0]!.request.body as { items: { quantity: number }[] }).items[0]!.quantity).toBe(
      3,
    );

    // A newer change cancels the running request.
    cart.setQuantity(VARIANT_370.id, 4);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(QUOTE_DEBOUNCE_MS + 10);
    expect(second[0]!.cancelled).toBe(true);
    const third = quoteRequests(http);
    expect(third.length).toBe(1);
    third[0]!.flush(quote([quoteLine({ requestedQuantity: 4, quantity: 4, lineTotal: 2360 })]));
    expect(TestBed.inject(CartQuoteService).quote()?.subtotal).toBe(2360);
    fixture.destroy();
  });

  it('discards an answer for a cart that changed while the request was running', async () => {
    const { cart, http, quotes } = setup();
    cart.add(VARIANT_370.id, 1);
    quotes.refresh();
    await tick();
    const [request] = quoteRequests(http);
    cart.setQuantity(VARIANT_370.id, 2);
    request!.flush(quote([quoteLine({ requestedQuantity: 1, quantity: 1, lineTotal: 590 })]));
    expect(cart.quantityOf(VARIANT_370.id)).toBe(2);
    expect(quotes.quote()).toBeNull();
    expect(quotes.stale()).toBe(true);
  });

  it('keeps the cart and exposes the error when the quote fails, and retries', async () => {
    const { cart, http, quotes } = setup();
    cart.add(VARIANT_370.id, 1);
    quotes.refresh();
    await tick();
    quoteRequests(http)[0]!.flush(
      { title: 'Greška', status: 500, code: 'INTERNAL_ERROR', detail: 'Pokušajte ponovo.' },
      { status: 500, statusText: 'Server Error' },
    );
    expect(quotes.error()?.code).toBe('INTERNAL_ERROR');
    expect(quotes.loading()).toBe(false);
    expect(cart.quantityOf(VARIANT_370.id)).toBe(1);
    quotes.refresh();
    await tick();
    quoteRequests(http)[0]!.flush(
      quote([quoteLine({ requestedQuantity: 1, quantity: 1, lineTotal: 590 })]),
    );
    expect(quotes.error()).toBeNull();
    expect(quotes.quote()).not.toBeNull();
  });

  it('does not call the API for an empty cart', async () => {
    const { http, quotes } = setup();
    quotes.refresh();
    await tick();
    expect(quoteRequests(http).length).toBe(0);
    expect(quotes.quote()).toBeNull();
    expect(cartSignature([])).toBe('');
  });
});
