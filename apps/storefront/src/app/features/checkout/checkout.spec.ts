import { HttpHeaders } from '@angular/common/http';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CartQuote, CreateOrderRequest, PlacedOrder } from '@zladovce/models';
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
} from '../../testing/fixtures';
import { buildOrderRequest, rateLimitProblem, waitText } from './checkout-form';
import {
  CHECKOUT_DRAFT_STORAGE,
  CHECKOUT_KEY_STORAGE,
  CheckoutSession,
  CONFIRMATION_STORAGE,
  readPlacedOrder,
} from './checkout-session';

const ORDER: PlacedOrder = {
  orderNumber: 'ZLD-2026-000042',
  placedAt: '2026-11-14T10:15:00Z',
  items: [
    {
      variantId: VARIANT_370.id,
      productName: 'Džem od šljiva',
      variantName: '370 g',
      sku: 'DZ-SLJ-370',
      unitPrice: 590,
      quantity: 2,
      lineTotal: 1180,
    },
  ],
  subtotal: 1180,
  shippingPrice: 350,
  total: 1530,
  currency: 'RSD',
  paymentMethod: 'CashOnDelivery',
  trackingCode: null,
};

const TRACKING_CODE = 'ABCDE-12345-FGHJK-67890-MNPQRS';

const VALID: Record<string, string> = {
  firstName: 'Milica',
  lastName: "Petrović-O'Neil",
  email: 'milica@primer.rs',
  phone: '064 123 4567',
  street: 'Kralja Petra 12',
  city: 'Niš',
  postalCode: '18000',
};

function putCart(quantity = 2): void {
  localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify({
      version: 2,
      lines: [{ variantId: VARIANT_370.id, quantity, knownUnitPrice: 590 }],
    }),
  );
}

async function open(path = '/porucivanje') {
  TestBed.configureTestingModule({ providers: [provideRouter(routes), ...testProviders()] });
  const harness = await RouterTestingHarness.create(path);
  const http = TestBed.inject(HttpTestingController);
  const root = () => harness.fixture.nativeElement as HTMLElement;
  const render = () => settle(() => harness.detectChanges());
  const el = <T extends HTMLElement>(id: string) =>
    root().querySelector<T>(`[data-testid="${id}"]`);
  const type = (id: string, value: string) => {
    const input = el<HTMLInputElement>(id);
    if (!input) throw new Error(`missing ${id}`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
  };
  const fill = (values: Record<string, string> = VALID) => {
    for (const [id, value] of Object.entries(values)) type(id, value);
  };
  const acceptTerms = () => el<HTMLInputElement>('acceptedTerms')!.click();
  const submit = async () => {
    el<HTMLFormElement>('checkout-form')!.dispatchEvent(new Event('submit'));
    await render();
  };
  const quotes = () => http.match((r) => r.url === `${API}/cart/quote`);
  const orders = () => http.match((r) => r.url === `${API}/orders` && r.method === 'POST');
  return { harness, http, root, render, el, type, fill, acceptTerms, submit, quotes, orders };
}

/** Opens the checkout with a priced cart (2 × 590 RSD + 350 RSD shipping). */
async function openPriced(priced: CartQuote = quote([quoteLine()])) {
  putCart();
  const ctx = await open();
  await ctx.render();
  ctx.quotes()[0]!.flush(priced);
  await ctx.render();
  return ctx;
}

const conflict = (code: string, fresh: CartQuote, errors: Record<string, string[]> = {}) => ({
  type: 'https://zladovce.com/errors/conflict',
  title: 'Sukob',
  status: 409,
  code,
  detail: 'Korpa je promenjena.',
  errors,
  quote: fresh,
  traceId: 't',
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('checkout helpers', () => {
  it('builds the order from the quote on screen (known prices and expected total)', () => {
    const q = quote([quoteLine()]);
    const request: CreateOrderRequest = buildOrderRequest(
      {
        customer: {
          firstName: ' Ana ',
          lastName: 'Ilić',
          email: ' ana@primer.rs ',
          phone: '0641234567',
        },
        address: { city: 'Niš', street: 'Ulica 1', postalCode: ' 18000 ' },
        deliveryNote: '   ',
        acceptedTerms: true,
      },
      q,
    );
    expect(request).toEqual({
      items: [{ variantId: VARIANT_370.id, quantity: 2, knownUnitPrice: 590 }],
      customer: { firstName: 'Ana', lastName: 'Ilić', email: 'ana@primer.rs', phone: '0641234567' },
      address: { city: 'Niš', street: 'Ulica 1', postalCode: '18000' },
      deliveryNote: null,
      acceptedTerms: true,
      expectedTotal: 1530,
    });
  });

  it('words the waiting time in Serbian', () => {
    expect(waitText(1)).toBe('1 sekundu');
    expect(waitText(3)).toBe('3 sekunde');
    expect(waitText(45)).toBe('45 sekundi');
    expect(waitText(60)).toBe('1 minut');
    expect(waitText(125)).toBe('3 minuta');
    expect(waitText(null)).toBe('nekoliko minuta');
    expect(rateLimitProblem(300).messages[0]).toContain('Sačekajte oko 5 minuta');
  });

  it('keeps the tracking code in sessionStorage only, also when a repeated submission returns none', () => {
    TestBed.configureTestingModule({ providers: testProviders() });
    const session = TestBed.inject(CheckoutSession);
    session.saveConfirmation({ ...ORDER, trackingCode: TRACKING_CODE });
    expect(session.readConfirmation()?.trackingCode).toBe(TRACKING_CODE);
    // 200 replay of the same submission: the code is not sent again.
    session.saveConfirmation({ ...ORDER, trackingCode: null });
    expect(session.readConfirmation()?.trackingCode).toBe(TRACKING_CODE);
    // A different order never inherits the code.
    session.saveConfirmation({ ...ORDER, orderNumber: 'ZLD-2026-000043', trackingCode: null });
    expect(session.readConfirmation()?.trackingCode).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.getItem(CONFIRMATION_STORAGE)).toContain('ZLD-2026-000043');
  });

  it('reads only a well-formed stored confirmation', () => {
    expect(readPlacedOrder(ORDER)).toEqual(ORDER);
    expect(readPlacedOrder({ ...ORDER, trackingCode: 42 })?.trackingCode).toBeNull();
    expect(readPlacedOrder({ orderNumber: 'x' })).toBeNull();
    expect(readPlacedOrder(null)).toBeNull();
  });
});

describe('CheckoutPage', () => {
  it('explains an empty cart and requests nothing', async () => {
    const ctx = await open();
    await ctx.render();
    expect(text(ctx.root())).toContain('Vaša korpa je prazna');
    expect(ctx.quotes().length).toBe(0);
  });

  it('does not show the form when the cart cannot be ordered and links back to the cart', async () => {
    const ctx = await openPriced(
      quote([quoteLine()], {
        minOrderAmount: 2000,
        meetsMinimumOrder: false,
        amountUntilMinimumOrder: 820,
        canCheckout: false,
      }),
    );
    expect(ctx.el('checkout-form')).toBeNull();
    const blocked = ctx.el('checkout-blocked');
    expect(nb(text(blocked))).toContain('Najmanji iznos porudžbine je 2.000 RSD');
    expect(blocked?.querySelector('a')?.getAttribute('href')).toBe('/korpa');
  });

  it('shows the fresh quote, cash on delivery and terms without a dead link', async () => {
    const ctx = await openPriced();
    expect(text(ctx.el('summary-line'))).toContain('Džem od šljiva');
    expect(text(ctx.el('summary-line'))).toContain('2 × 590 RSD');
    expect(text(ctx.el('subtotal'))).toBe('1.180 RSD');
    expect(text(ctx.el('shipping'))).toBe('350 RSD');
    expect(text(ctx.el('total'))).toBe('1.530 RSD');
    expect(text(ctx.el('payment'))).toContain('Plaćanje pouzećem');
    expect(text(ctx.el('payment'))).toContain('kuriru');
    const terms = ctx.el('acceptedTerms')!.closest('label')!;
    expect(text(terms)).toBe('Prihvatam uslove kupovine');
    expect(terms.querySelector('a')).toBeNull();
    expect(text(ctx.el('submit'))).toBe('Poruči');
  });

  it('links the terms label to /uslovi-koriscenja only while the terms page has content', async () => {
    const ctx = await openPriced();
    const routesResponse = (pages: { key: string; updatedAt: string }[]) => ({
      categories: [],
      products: [],
      blogPosts: [],
      blogCategories: [],
      pages,
    });
    ctx.http
      .expectOne(`${API}/seo/routes`)
      .flush(routesResponse([{ key: 'privacy', updatedAt: '2026-11-15T10:00:00Z' }]));
    await ctx.render();
    const label = () => ctx.el('acceptedTerms')!.closest('label')!;
    expect(label().querySelector('a')).toBeNull();
    TestBed.resetTestingModule();

    putCart();
    const withTerms = await open();
    await withTerms.render();
    withTerms.quotes()[0]!.flush(quote([quoteLine()]));
    withTerms.http
      .expectOne(`${API}/seo/routes`)
      .flush(routesResponse([{ key: 'terms', updatedAt: '2026-11-15T10:00:00Z' }]));
    await withTerms.render();
    const link = withTerms.el('acceptedTerms')!.closest('label')!.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/uslovi-koriscenja');
    expect(text(link)).toBe('uslove kupovine');
  });

  it('validates names, e-mail, phone, postal code and terms before sending', async () => {
    const ctx = await openPriced();
    await ctx.submit();
    const errors = () => [...ctx.root().querySelectorAll('[role="alert"]')].map(text);
    expect(errors()).toEqual(
      expect.arrayContaining([
        'Ime je obavezno.',
        'Prezime je obavezno.',
        'Adresa e-pošte je obavezna.',
        'Broj telefona je obavezan.',
        'Ulica i broj su obavezni.',
        'Mesto je obavezno.',
        'Poštanski broj je obavezan.',
        'Da biste poručili, potvrdite da prihvatate uslove kupovine.',
      ]),
    );
    expect(text(ctx.el('checkout-problem'))).toContain('Proverite označena polja');

    ctx.fill({
      ...VALID,
      firstName: 'Milica3',
      email: 'milica@primer',
      phone: '064 12',
      postalCode: '1800',
    });
    await ctx.submit();
    expect(errors()).toEqual(
      expect.arrayContaining([
        'Ime sme da sadrži samo slova, razmak, crticu, tačku i apostrof.',
        'Unesite ispravnu adresu e-pošte (npr. ime@primer.rs).',
        'Unesite ispravan broj telefona u Srbiji, npr. 064 123 4567 ili +381 64 123 4567.',
        'Poštanski broj ima tačno 5 cifara.',
      ]),
    );
    expect(ctx.el('phone')?.getAttribute('aria-invalid')).toBe('true');
    expect(ctx.orders().length).toBe(0);

    // +381 and 00381 forms are accepted too.
    ctx.fill({ ...VALID, phone: '+381 64 123 4567' });
    await ctx.render();
    expect(ctx.el('phone')?.getAttribute('aria-invalid')).toBeNull();
    ctx.type('phone', '00381641234567');
    await ctx.render();
    expect(ctx.el('phone')?.getAttribute('aria-invalid')).toBeNull();
    await ctx.submit();
    expect(ctx.orders().length).toBe(0); // terms still missing
    ctx.acceptTerms();
    await ctx.render();
    expect(ctx.el('terms-error')).toBeNull();
  });

  it('keeps one idempotency key across retries, applies conflict quotes and renews the key after success', async () => {
    const ctx = await openPriced();
    const cart = TestBed.inject(CartStore);
    ctx.fill();
    ctx.acceptTerms();
    await ctx.submit();

    let request: TestRequest = ctx.orders()[0]!;
    const key = request.request.headers.get('Idempotency-Key');
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(sessionStorage.getItem(CHECKOUT_KEY_STORAGE)).toBe(key);
    expect(request.request.body).toMatchObject({
      items: [{ variantId: VARIANT_370.id, quantity: 2, knownUnitPrice: 590 }],
      customer: { firstName: 'Milica', phone: '064 123 4567' },
      address: { postalCode: '18000' },
      acceptedTerms: true,
      expectedTotal: 1530,
    });

    // The price changed meanwhile: the fresh quote is applied and explained.
    const changed = quote([quoteLine({ unitPrice: 650, discountPrice: null, lineTotal: 1300 })], {
      adjustments: [
        {
          variantId: VARIANT_370.id,
          reason: 'priceChanged',
          requestedQuantity: 2,
          availableQuantity: 2,
          previousUnitPrice: 590,
          unitPrice: 650,
        },
      ],
    });
    request.flush(
      conflict('CART_CHANGED', changed, { 'items[0].knownUnitPrice': ['Cena je promenjena.'] }),
      {
        status: 409,
        statusText: 'Conflict',
      },
    );
    await ctx.render();
    expect(text(ctx.el('checkout-problem'))).toContain('Ponuda se promenila');
    expect(nb(text(ctx.el('checkout-notices')))).toContain(
      'Cena proizvoda „Džem od šljiva, 370 g“ je promenjena sa 590 RSD na 650 RSD.',
    );
    expect(text(ctx.el('total'))).toBe('1.650 RSD');
    expect(cart.lines()[0]?.knownUnitPrice).toBe(650);
    expect(ctx.quotes().length).toBe(0); // the conflict's quote is used, no extra request

    // Confirm again: same key, new known price and total.
    await ctx.submit();
    request = ctx.orders()[0]!;
    expect(request.request.headers.get('Idempotency-Key')).toBe(key);
    expect(request.request.body).toMatchObject({
      items: [{ knownUnitPrice: 650 }],
      expectedTotal: 1650,
    });

    // Rate limited: friendly wait message, same key afterwards.
    request.flush(
      { code: 'RATE_LIMITED', status: 429, title: 'Previše zahteva', detail: 'Previše.' },
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: new HttpHeaders({ 'Retry-After': '1' }),
      },
    );
    await ctx.render();
    expect(text(ctx.el('checkout-problem'))).toContain('Previše pokušaja u kratkom roku');
    expect(text(ctx.el('checkout-problem'))).toContain('Sačekajte oko 1 sekundu');
    expect(ctx.el<HTMLButtonElement>('submit')?.disabled).toBe(true);
    await ctx.submit();
    expect(ctx.orders().length).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await ctx.render();
    expect(ctx.el<HTMLButtonElement>('submit')?.disabled).toBe(false);
    expect(cart.isEmpty()).toBe(false);

    await ctx.submit();
    request = ctx.orders()[0]!;
    expect(request.request.headers.get('Idempotency-Key')).toBe(key);
    request.flush(
      { ...ORDER, total: 1650, subtotal: 1300 },
      { status: 201, statusText: 'Created' },
    );
    await ctx.render();

    expect(cart.isEmpty()).toBe(true);
    expect(TestBed.inject(Router).url).toBe('/porudzbina-primljena');
    expect(JSON.parse(sessionStorage.getItem(CONFIRMATION_STORAGE)!).orderNumber).toBe(
      'ZLD-2026-000042',
    );
    const next = sessionStorage.getItem(CHECKOUT_KEY_STORAGE);
    expect(next).toMatch(/^[0-9a-f-]{36}$/);
    expect(next).not.toBe(key);
    expect(sessionStorage.getItem(CHECKOUT_DRAFT_STORAGE)).toBeNull();
    expect(text(ctx.el('order-number'))).toBe('ZLD-2026-000042');
  });

  it('ignores a second submit while the first is running', async () => {
    const ctx = await openPriced();
    ctx.fill();
    ctx.acceptTerms();
    await ctx.submit();
    expect(ctx.el<HTMLButtonElement>('submit')?.disabled).toBe(true);
    expect(text(ctx.el('submit'))).toBe('Šaljemo porudžbinu…');
    await ctx.submit();
    await ctx.submit();
    expect(ctx.orders().length).toBe(1);
  });

  it('keeps the cart after failures and reduced stock, and maps field errors from the API', async () => {
    const ctx = await openPriced();
    const cart = TestBed.inject(CartStore);
    ctx.fill();
    ctx.acceptTerms();
    await ctx.submit();
    ctx.orders()[0]!.flush(
      {
        code: 'VALIDATION_FAILED',
        status: 400,
        title: 'Neispravni podaci',
        detail: 'Proverite unete podatke i pokušajte ponovo.',
        errors: { 'customer.phone': ['Unesite ispravan broj telefona u Srbiji.'] },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await ctx.render();
    expect(text(ctx.el('phone')?.closest('ui-form-field')?.querySelector('[role="alert"]'))).toBe(
      'Unesite ispravan broj telefona u Srbiji.',
    );
    expect(cart.isEmpty()).toBe(false);

    ctx.type('phone', '011 123 4567');
    await ctx.submit();
    const reduced = quote([quoteLine({ quantity: 1, requestedQuantity: 2, lineTotal: 590 })], {
      adjustments: [
        {
          variantId: VARIANT_370.id,
          reason: 'quantityReduced',
          requestedQuantity: 2,
          availableQuantity: 1,
          previousUnitPrice: null,
          unitPrice: null,
          limitReason: 'stock',
        },
      ],
    });
    ctx
      .orders()[0]!
      .flush(
        conflict('INSUFFICIENT_STOCK', reduced, { 'items[0].quantity': ['Dostupno najviše: 1.'] }),
        { status: 409, statusText: 'Conflict' },
      );
    await ctx.render();
    expect(text(ctx.el('checkout-problem'))).toContain('Nekih proizvoda više nema');
    expect(text(ctx.el('checkout-notices'))).toContain('je smanjena na 1 jer više nema na stanju');
    expect(cart.quantityOf(VARIANT_370.id)).toBe(1);

    await ctx.submit();
    ctx.orders()[0]!.error(new ProgressEvent('error'));
    await ctx.render();
    expect(text(ctx.el('checkout-problem'))).toContain('Porudžbina nije poslata');
    expect(text(ctx.el('checkout-problem'))).toContain('nećemo napraviti duplu');
    expect(cart.isEmpty()).toBe(false);
    expect(sessionStorage.getItem(CONFIRMATION_STORAGE)).toBeNull();
  });

  it('hides the form when the minimum order is no longer met', async () => {
    const ctx = await openPriced();
    ctx.fill();
    ctx.acceptTerms();
    await ctx.submit();
    ctx.orders()[0]!.flush(
      conflict(
        'MINIMUM_ORDER_NOT_MET',
        quote([quoteLine()], {
          minOrderAmount: 3000,
          meetsMinimumOrder: false,
          amountUntilMinimumOrder: 1820,
          canCheckout: false,
        }),
      ),
      { status: 409, statusText: 'Conflict' },
    );
    await ctx.render();
    expect(text(ctx.el('checkout-problem'))).toContain('ispod najmanjeg iznosa');
    expect(ctx.el('checkout-form')).toBeNull();
    expect(nb(text(ctx.el('checkout-blocked')))).toContain('3.000 RSD');
    // The typed data is kept for when the customer comes back.
    expect(JSON.parse(sessionStorage.getItem(CHECKOUT_DRAFT_STORAGE)!).city).toBe('Niš');
  });

  it('starts a new submission when the API reports the key as used', async () => {
    const ctx = await openPriced();
    ctx.fill();
    ctx.acceptTerms();
    await ctx.submit();
    const first = ctx.orders()[0]!;
    const key = first.request.headers.get('Idempotency-Key');
    first.flush(
      {
        code: 'IDEMPOTENCY_KEY_REUSED',
        status: 409,
        title: 'Sukob',
        detail: 'Ključ je iskorišćen.',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await ctx.render();
    expect(text(ctx.el('checkout-problem'))).toContain('Porudžbina je možda već primljena');
    await ctx.submit();
    expect(ctx.orders()[0]!.request.headers.get('Idempotency-Key')).not.toBe(key);
  });

  it('restores what was typed (this tab only)', async () => {
    sessionStorage.setItem(
      CHECKOUT_DRAFT_STORAGE,
      JSON.stringify({ firstName: 'Ana', city: 'Niš' }),
    );
    const ctx = await openPriced();
    expect(ctx.el<HTMLInputElement>('firstName')?.value).toBe('Ana');
    expect(ctx.el<HTMLInputElement>('city')?.value).toBe('Niš');
    expect(ctx.el<HTMLInputElement>('acceptedTerms')?.checked).toBe(false);
    expect(localStorage.getItem(CHECKOUT_DRAFT_STORAGE)).toBeNull();
  });
});

describe('ConfirmationPage', () => {
  it('shows the stored order after a reload and points to the email when no code came back', async () => {
    sessionStorage.setItem(CONFIRMATION_STORAGE, JSON.stringify(ORDER));
    const ctx = await open('/porudzbina-primljena');
    await ctx.render();
    expect(text(ctx.root().querySelector('h1'))).toBe('Porudžbina je primljena');
    expect(text(ctx.el('order-number'))).toBe('ZLD-2026-000042');
    expect(text(ctx.el('confirmation-item'))).toContain('2 × 590 RSD');
    expect(text(ctx.el('total'))).toBe('1.530 RSD');
    expect(text(ctx.el('payment-method'))).toBe('Plaćanje pouzećem');
    expect(nb(text(ctx.el('next-steps')))).toContain('iznos od 1.530 RSD plaćate kuriru');
    expect(text(ctx.el('tracking-code-in-email'))).toContain(
      'Kod za praćenje smo poslali u e-poruci',
    );
    expect(ctx.el('tracking-code-value')).toBeNull();
    expect(ctx.el('copy-tracking-code')).toBeNull();
    expect(ctx.el('tracking-code-in-email')?.querySelector('a')?.getAttribute('href')).toBe(
      '/track-order',
    );
  });

  it('shows the tracking code with a copy button and the tracking link (fragment, not query)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    try {
      sessionStorage.setItem(
        CONFIRMATION_STORAGE,
        JSON.stringify({ ...ORDER, trackingCode: TRACKING_CODE }),
      );
      const ctx = await open('/porudzbina-primljena');
      await ctx.render();
      expect(text(ctx.el('tracking-code-value'))).toBe(TRACKING_CODE);
      expect(text(ctx.el('tracking-code-card'))).toContain('Poslali smo ga i u e-poruci potvrde');
      const link = ctx.el<HTMLAnchorElement>('track-order-link')!;
      expect(link.getAttribute('href')).toBe(`/track-order#kod=${TRACKING_CODE}`);
      expect(link.getAttribute('href')).not.toContain('?');
      expect(text(link)).toBe('Prati porudžbinu');

      ctx.el<HTMLButtonElement>('copy-tracking-code')!.click();
      await ctx.render();
      expect(writeText).toHaveBeenCalledWith(TRACKING_CODE);
      expect(text(ctx.el('copy-status'))).toBe('Kod je kopiran.');
      expect(ctx.el('copy-status')?.getAttribute('role')).toBe('status');
      expect(text(ctx.el('copy-tracking-code'))).toBe('Kopirano');

      // Only this tab's sessionStorage holds the code; nothing in localStorage.
      expect(JSON.stringify({ ...localStorage })).not.toContain(TRACKING_CODE);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('follows the link to the tracking page, which sends the code and clears the fragment', async () => {
    sessionStorage.setItem(
      CONFIRMATION_STORAGE,
      JSON.stringify({ ...ORDER, trackingCode: TRACKING_CODE }),
    );
    const ctx = await open('/porudzbina-primljena');
    await ctx.render();
    ctx.el<HTMLAnchorElement>('track-order-link')!.click();
    await ctx.render();
    const request = ctx.http.expectOne(`${API}/tracking/lookup`);
    expect(request.request.body).toEqual({ code: TRACKING_CODE });
    expect(TestBed.inject(Router).url).toBe('/track-order');
  });

  it('falls back to execCommand when the Clipboard API is missing, and selects the code when that fails too', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    try {
      sessionStorage.setItem(
        CONFIRMATION_STORAGE,
        JSON.stringify({ ...ORDER, trackingCode: TRACKING_CODE }),
      );
      const ctx = await open('/porudzbina-primljena');
      await ctx.render();
      ctx.el<HTMLButtonElement>('copy-tracking-code')!.click();
      await ctx.render();
      expect(exec).toHaveBeenCalledWith('copy');
      expect(text(ctx.el('copy-status'))).toBe('Kod je kopiran.');
      expect(document.querySelector('textarea[aria-hidden="true"]')).toBeNull();

      exec.mockReturnValue(false);
      ctx.el<HTMLButtonElement>('copy-tracking-code')!.click();
      await ctx.render();
      expect(text(ctx.el('copy-status'))).toContain('Kopiranje nije uspelo');
      expect(document.getSelection()?.toString().trim()).toBe(TRACKING_CODE);
    } finally {
      vi.unstubAllGlobals();
      delete (document as { execCommand?: unknown }).execCommand;
    }
  });

  it('explains when there is nothing to show', async () => {
    const ctx = await open('/porudzbina-primljena');
    await ctx.render();
    expect(text(ctx.root())).toContain('Ovde trenutno nema porudžbine za prikaz');
    expect(ctx.root().querySelector('ui-empty-state a')?.getAttribute('href')).toBe('/prodavnica');
  });
});
