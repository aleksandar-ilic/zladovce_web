import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { apiErrorInterceptor, provideAppConfig } from '@zladovce/api';
import { AuthService } from '@zladovce/auth';
import { AdminOrderDetail, AllowedStatusTransition } from '@zladovce/models';
import { COURIER, ORDER_ID, orderDetail } from '../../testing/fixtures';
import {
  countOf,
  openCount,
  OrderSummaryStore,
  SUMMARY_REFRESH_MS,
} from '../../core/order-summary';
import { belgradeDate, instantForSerbianDate } from '../../shared/serbian-dates';
import { nextStepHint, orderActions } from './order-actions';
import { formatPhone, OrderDetailPage, timelineActor } from './order-detail.page';
import { ordersQueryParams, parseOrdersQuery, toOrdersApiQuery } from './orders-query';
import { OrdersPage } from './orders.page';
import { buildPaymentRequest, moneyValidator, PaymentDialog } from './payment.dialog';
import { buildShipmentRequest } from './shipment.dialog';
import { buildStatusRequest, StatusDialog, StatusFormValue } from './status.dialog';
import { FormControl } from '@angular/forms';

const API = 'http://localhost:5080/api/v1';
const ORDERS_URL = `${API}/admin/orders`;
const DETAIL_URL = `${API}/admin/orders/${ORDER_ID}`;

const text = (element: Element | null | undefined): string =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function settle(detect: () => void, rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    detect();
  }
}

function providers(role: 'Owner' | 'Staff' = 'Owner') {
  return [
    provideAppConfig({ apiBaseUrl: API, healthUrl: 'http://localhost:5080/health' }),
    provideHttpClient(withInterceptors([apiErrorInterceptor])),
    provideHttpClientTesting(),
    { provide: AuthService, useValue: { user: signal({ role }), role: signal(role) } },
  ];
}

const transition = (
  status: AllowedStatusTransition['status'],
  extra: Partial<AllowedStatusTransition> = {},
): AllowedStatusTransition => ({
  status,
  requiresShipment: false,
  stockReturn: 'None',
  requiresRestockChoice: false,
  ...extra,
});

const SUMMARY = {
  counts: [
    { status: 'Received', count: 2 },
    { status: 'Accepted', count: 1 },
    { status: 'Preparing', count: 3 },
    { status: 'Shipped', count: 4 },
    { status: 'Delivered', count: 10 },
    { status: 'Cancelled', count: 1 },
    { status: 'Rejected', count: 0 },
    { status: 'DeliveryFailed', count: 1 },
  ],
  total: 22,
};

const BLANK: StatusFormValue = {
  customerMessage: '',
  internalNote: '',
  courierCompanyId: '',
  trackingNumber: '',
  shippedAt: null,
  shipmentNote: '',
  restock: null,
};

afterEach(() => {
  document
    .querySelectorAll('.cdk-overlay-container')
    .forEach((element) => (element.innerHTML = ''));
});

describe('orders list query ↔ URL', () => {
  it('defaults to "Za obradu" and reads every filter', () => {
    const empty = parseOrdersQuery({});
    expect(empty).toEqual({
      view: 'open',
      q: '',
      from: '',
      to: '',
      sort: 'newest',
      page: 1,
      pageSize: 20,
    });
    expect(toOrdersApiQuery(empty).status).toEqual(['Received', 'Accepted', 'Preparing']);
    expect(ordersQueryParams(empty)).toEqual({
      status: null,
      q: null,
      from: null,
      to: null,
      sort: null,
      page: null,
      pageSize: null,
    });

    const query = parseOrdersQuery({
      status: 'Shipped',
      q: ' Petrović ',
      from: '2026-11-14',
      to: '2026-11-01',
      sort: 'totalDesc',
      page: '2',
      pageSize: '50',
    });
    expect(query).toEqual({
      view: 'Shipped',
      q: 'Petrović',
      from: '2026-11-01',
      to: '2026-11-14',
      sort: 'totalDesc',
      page: 2,
      pageSize: 50,
    });
    expect(toOrdersApiQuery(query)).toEqual({
      q: 'Petrović',
      status: ['Shipped'],
      from: '2026-11-01',
      to: '2026-11-14',
      sort: 'totalDesc',
      page: 2,
      pageSize: 50,
    });
    const clean = Object.fromEntries(
      Object.entries(ordersQueryParams(query)).filter(([, value]) => value !== null),
    );
    expect(parseOrdersQuery(clean)).toEqual(query);

    expect(toOrdersApiQuery(parseOrdersQuery({ status: 'all' })).status).toEqual([]);
    expect(parseOrdersQuery({ status: 'shipped', from: '2026-02-30', sort: 'x' })).toMatchObject({
      view: 'open',
      from: '',
      sort: 'newest',
    });
  });

  it('counts per status from the summary', () => {
    expect(countOf(SUMMARY as never, 'Shipped')).toBe(4);
    expect(openCount(SUMMARY as never)).toBe(6);
    expect(openCount(null)).toBe(0);
  });
});

describe('OrdersPage', () => {
  async function openList(url = '/porudzbine') {
    TestBed.configureTestingModule({
      providers: [...providers(), provideRouter([{ path: 'porudzbine', component: OrdersPage }])],
    });
    const harness = await RouterTestingHarness.create(url);
    const http = TestBed.inject(HttpTestingController);
    const root = harness.routeNativeElement as HTMLElement;
    const render = () => settle(() => harness.detectChanges());
    return { harness, http, root, render, router: TestBed.inject(Router) };
  }

  it('shows the orders to work on, tabs with counts and links to the detail', async () => {
    const ctx = await openList();
    TestBed.inject(OrderSummaryStore).refresh(true);
    ctx.http.expectOne(`${ORDERS_URL}/summary`).flush(SUMMARY);
    const list = ctx.http.expectOne((r) => r.url === ORDERS_URL);
    expect(list.request.params.get('status')).toBe('Received,Accepted,Preparing');
    expect(list.request.params.get('sort')).toBe('newest');
    list.flush({
      items: [
        {
          id: ORDER_ID,
          orderNumber: 'ZLD-2026-000042',
          placedAt: '2026-11-10T09:30:00Z',
          customerName: 'Milica Petrović',
          city: 'Niš',
          itemCount: 2,
          totalQuantity: 3,
          total: 1650,
          status: 'Received',
          isPaymentCollected: false,
        },
      ],
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });
    await ctx.render();

    const open = ctx.root.querySelector('[data-view="open"]');
    expect(text(open)).toBe('Za obradu 6');
    expect(open?.getAttribute('aria-current')).toBe('page');
    expect(text(ctx.root.querySelector('[data-view="Shipped"]'))).toBe('Poslata 4');
    expect(text(ctx.root.querySelector('[data-view="Rejected"]'))).toBe('Odbijena');
    expect(text(ctx.root.querySelector('[data-view="all"]'))).toBe('Sve 22');
    expect(ctx.root.querySelector('[data-view="Shipped"]')?.getAttribute('href')).toBe(
      '/porudzbine?status=Shipped',
    );

    const row = ctx.root.querySelector('[data-testid="order-row"]');
    expect(text(row)).toContain('ZLD-2026-000042');
    expect(text(row)).toContain('Primljena');
    expect(text(row)).toContain('Milica Petrović · Niš');
    expect(text(row)).toContain('2 proizvoda, 3 kom.');
    expect(text(row?.querySelector('[data-testid="order-total"]'))).toBe('1.650 RSD');
    expect(row?.querySelector('a')?.getAttribute('href')).toBe(`/porudzbine/${ORDER_ID}`);
  });

  it('keeps tab, search and sort in the URL and shows the collected indicator', async () => {
    const ctx = await openList('/porudzbine?status=Delivered&q=ana&sort=oldest');
    const list = ctx.http.expectOne((r) => r.url === ORDERS_URL);
    expect(list.request.params.get('status')).toBe('Delivered');
    expect(list.request.params.get('q')).toBe('ana');
    expect(list.request.params.get('sort')).toBe('oldest');
    const item = {
      id: ORDER_ID,
      orderNumber: 'ZLD-2026-000001',
      placedAt: '2026-11-10T09:30:00Z',
      customerName: 'Ana',
      city: 'Niš',
      itemCount: 1,
      totalQuantity: 1,
      total: 650,
      status: 'Delivered',
      isPaymentCollected: true,
    };
    list.flush({
      items: [item, { ...item, id: 'x', isPaymentCollected: false }],
      page: 1,
      pageSize: 20,
      totalItems: 2,
      totalPages: 1,
    });
    await ctx.render();
    expect(ctx.root.querySelector('[data-testid="collected"]')).not.toBeNull();
    expect(ctx.root.querySelector('[data-testid="not-collected"]')).not.toBeNull();
    expect(text(ctx.root.querySelector('[data-testid="search"]')?.parentElement)).toBeDefined();
    expect((ctx.root.querySelector('[data-testid="search"]') as HTMLInputElement).value).toBe(
      'ana',
    );

    (ctx.harness.routeDebugElement!.componentInstance as OrdersPage).update({
      from: '2026-11-01',
      to: '2026-11-14',
    });
    await ctx.render();
    expect(ctx.router.url).toBe(
      '/porudzbine?status=Delivered&q=ana&from=2026-11-01&to=2026-11-14&sort=oldest',
    );
    const next = ctx.http.expectOne((r) => r.url === ORDERS_URL);
    expect(next.request.params.get('from')).toBe('2026-11-01');
    expect(next.request.params.get('to')).toBe('2026-11-14');
  });

  it('says so when nothing waits', async () => {
    const ctx = await openList();
    ctx.http
      .expectOne((r) => r.url === ORDERS_URL)
      .flush({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    await ctx.render();
    expect(text(ctx.root)).toContain('Nema porudžbina za obradu');
  });
});

describe('OrderSummaryStore', () => {
  it('refreshes every minute and never sends two requests at once', async () => {
    vi.useFakeTimers();
    try {
      TestBed.configureTestingModule({ providers: [...providers(), provideRouter([])] });
      const store = TestBed.inject(OrderSummaryStore);
      const http = TestBed.inject(HttpTestingController);
      const destroy: (() => void)[] = [];
      store.start({ onDestroy: (fn: () => void) => destroy.push(fn) } as never);
      const first = http.match(`${ORDERS_URL}/summary`);
      expect(first.length).toBe(1);
      store.refresh(true);
      expect(http.match(`${ORDERS_URL}/summary`).length).toBe(0);
      first[0]!.flush(SUMMARY);
      // The refresh asked for meanwhile follows right after.
      http.expectOne(`${ORDERS_URL}/summary`).flush(SUMMARY);
      expect(store.received()).toBe(2);
      expect(store.open()).toBe(6);

      await vi.advanceTimersByTimeAsync(SUMMARY_REFRESH_MS);
      http
        .expectOne(`${ORDERS_URL}/summary`)
        .flush({ ...SUMMARY, counts: [{ status: 'Received', count: 5 }] });
      expect(store.received()).toBe(5);

      destroy.forEach((fn) => fn());
      await vi.advanceTimersByTimeAsync(SUMMARY_REFRESH_MS);
      expect(http.match(`${ORDERS_URL}/summary`).length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('status actions from allowedNextStatuses', () => {
  it('makes the positive next step primary and destructive steps last', () => {
    const received = orderActions(orderDetail());
    expect(received.map((a) => [a.label, a.kind])).toEqual([
      ['Prihvati porudžbinu', 'primary'],
      ['Odbij porudžbinu', 'danger'],
      ['Otkaži porudžbinu', 'danger'],
    ]);
    expect(received[2]!.stockText).toBe('Proizvodi iz porudžbine se automatski vraćaju na stanje.');

    const shipped = orderActions({
      status: 'Shipped',
      allowedNextStatuses: [transition('DeliveryFailed'), transition('Delivered')],
    });
    expect(shipped.map((a) => a.label)).toEqual(['Označi kao isporučeno', 'Neuspešna isporuka']);

    const failed = orderActions({
      status: 'DeliveryFailed',
      allowedNextStatuses: [
        transition('Shipped', { requiresShipment: true }),
        transition('Cancelled', { stockReturn: 'AdminChoice', requiresRestockChoice: true }),
      ],
    });
    expect(failed.map((a) => a.label)).toEqual(['Pošalji ponovo', 'Otkaži porudžbinu']);
    expect(failed[1]!.stockText).toBeNull();

    expect(
      orderActions({
        status: 'Preparing',
        allowedNextStatuses: [transition('Shipped', { requiresShipment: true })],
      })[0]!.label,
    ).toBe('Označi kao poslato');
    expect(orderActions({ status: 'Delivered', allowedNextStatuses: [] })).toEqual([]);
    expect(nextStepHint({ status: 'Delivered', allowedNextStatuses: [] })).toBeNull();
    expect(nextStepHint({ status: 'Received', allowedNextStatuses: [] })).toContain('prihvatite');
  });

  it('formats phone numbers and timeline actors', () => {
    expect(formatPhone('+381641234567')).toBe('064 123 4567');
    expect(formatPhone('+38111234567')).toBe('011 234 567');
    const entry = orderDetail().timeline[0]!;
    expect(timelineActor(entry)).toBe('Kupac (porudžbina sa sajta)');
    expect(
      timelineActor({ ...entry, previousStatus: 'Received', changedByAdminName: 'Milica' }),
    ).toBe('Milica');
  });
});

describe('Serbian dates for shipments and payments', () => {
  const now = Date.parse('2026-11-14T15:00:00Z');

  it('sends null (= now) for today and noon in Belgrade for an earlier day, never before the order', () => {
    expect(belgradeDate('2026-11-13T23:30:00Z')).toBe('2026-11-14');
    expect(instantForSerbianDate('2026-11-14', { now })).toBeNull();
    expect(instantForSerbianDate('2026-11-12', { now })).toBe('2026-11-12T11:00:00.000Z');
    expect(instantForSerbianDate('2026-07-12', { now })).toBe('2026-07-12T10:00:00.000Z');
    expect(instantForSerbianDate('2026-11-12', { now, notBefore: '2026-11-12T14:00:00Z' })).toBe(
      '2026-11-12T14:00:00.000Z',
    );
    expect(instantForSerbianDate('', { now })).toBeNull();
  });
});

describe('status dialog rules', () => {
  const order = orderDetail({ status: 'Preparing', version: 9 });

  it('builds requests with shipment only for Shipped and restock only when required', () => {
    const shipped = buildStatusRequest(
      order,
      { transition: transition('Shipped', { requiresShipment: true }) },
      {
        ...BLANK,
        courierCompanyId: COURIER.id,
        trackingNumber: ' RS123 ',
        shippedAt: new Date(2026, 10, 12),
        customerMessage: ' Paket je poslat. ',
      },
      Date.parse('2026-11-14T15:00:00Z'),
    );
    expect(shipped).toEqual({
      newStatus: 'Shipped',
      version: 9,
      internalNote: null,
      customerMessage: 'Paket je poslat.',
      shipment: {
        courierCompanyId: COURIER.id,
        trackingNumber: 'RS123',
        shippedAt: '2026-11-12T11:00:00.000Z',
        note: null,
      },
    });

    const accepted = buildStatusRequest(order, { transition: transition('Accepted') }, BLANK);
    expect(accepted).toEqual({
      newStatus: 'Accepted',
      version: 9,
      internalNote: null,
      customerMessage: null,
    });
    expect('shipment' in accepted).toBe(false);
    expect('restock' in accepted).toBe(false);

    const cancelled = buildStatusRequest(
      order,
      {
        transition: transition('Cancelled', {
          stockReturn: 'AdminChoice',
          requiresRestockChoice: true,
        }),
      },
      { ...BLANK, restock: false },
    );
    expect(cancelled.restock).toBe(false);
  });

  async function openDialog(
    action: ReturnType<typeof orderActions>[number],
    role: 'Owner' | 'Staff' = 'Owner',
  ) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        ...providers(role),
        provideRouter([]),
        { provide: MAT_DIALOG_DATA, useValue: { order, action } },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(StatusDialog);
    const root = fixture.nativeElement as HTMLElement;
    const render = () => settle(() => fixture.detectChanges());
    await render();
    return { fixture, root, render, close, http: TestBed.inject(HttpTestingController) };
  }

  const shipAction = () =>
    orderActions({
      status: 'Preparing',
      allowedNextStatuses: [transition('Shipped', { requiresShipment: true })],
    })[0]!;

  it('requires an active courier for Shipped and explains when there is none', async () => {
    const ctx = await openDialog(shipAction());
    const couriers = ctx.http.expectOne(`${API}/admin/couriers?activeOnly=true`);
    couriers.flush({ items: [] });
    await ctx.render();
    expect(text(ctx.root.querySelector('[data-testid="no-couriers"]'))).toContain(
      'Još nema nijedne aktivne kurirske službe',
    );
    expect(ctx.root.querySelector('[data-testid="no-couriers"] a')?.getAttribute('href')).toBe(
      '/kuriri',
    );
    expect(
      ctx.root.querySelector<HTMLButtonElement>('[data-testid="confirm-status"]')?.disabled,
    ).toBe(true);
  });

  it('tells staff to ask the owner for a courier', async () => {
    const ctx = await openDialog(shipAction(), 'Staff');
    ctx.http.expectOne(`${API}/admin/couriers?activeOnly=true`).flush({ items: [] });
    await ctx.render();
    expect(ctx.root.querySelector('[data-testid="no-couriers"] a')).toBeNull();
    expect(text(ctx.root.querySelector('[data-testid="no-couriers"]'))).toContain(
      'Zamolite vlasnika',
    );
  });

  it('sends the shipment with the chosen courier and closes with the new detail', async () => {
    const ctx = await openDialog(shipAction());
    ctx.http
      .expectOne(`${API}/admin/couriers?activeOnly=true`)
      .flush({ items: [COURIER, { ...COURIER, id: 'other', name: 'Druga' }] });
    await ctx.render();
    const dialog = ctx.fixture.componentInstance;
    dialog.submit();
    await ctx.render();
    expect(text(ctx.root)).toContain('Izaberite kurirsku službu.');
    expect(ctx.http.match(`${DETAIL_URL}/status`).length).toBe(0);

    dialog.form.controls.courierCompanyId.setValue(COURIER.id);
    dialog.form.controls.trackingNumber.setValue('RS123');
    dialog.submit();
    const request = ctx.http.expectOne(`${DETAIL_URL}/status`);
    expect(request.request.body).toMatchObject({
      newStatus: 'Shipped',
      version: 9,
      shipment: { courierCompanyId: COURIER.id, trackingNumber: 'RS123', shippedAt: null },
    });
    const updated = orderDetail({ status: 'Shipped', version: 10 });
    request.flush(updated);
    expect(ctx.close).toHaveBeenCalledWith({ kind: 'saved', order: updated });
  });

  it('requires the restock choice when a failed delivery is cancelled', async () => {
    const action = orderActions({
      status: 'DeliveryFailed',
      allowedNextStatuses: [
        transition('Cancelled', { stockReturn: 'AdminChoice', requiresRestockChoice: true }),
      ],
    })[0]!;
    const ctx = await openDialog(action);
    expect(text(ctx.root.querySelector('[data-testid="restock-fields"] legend'))).toBe(
      'Vratiti proizvode na stanje?',
    );
    const dialog = ctx.fixture.componentInstance;
    dialog.submit();
    await ctx.render();
    expect(text(ctx.root.querySelector('[data-testid="restock-error"]'))).toBe(
      'Izaberite da li se proizvodi vraćaju na stanje.',
    );
    expect(ctx.http.match(`${DETAIL_URL}/status`).length).toBe(0);
    dialog.form.controls.restock.setValue(true);
    dialog.submit();
    const request = ctx.http.expectOne(`${DETAIL_URL}/status`);
    expect(request.request.body).toMatchObject({ newStatus: 'Cancelled', restock: true });
    expect(request.request.body.shipment).toBeUndefined();
  });

  it('shows what happens to the stock and closes with a conflict on CONCURRENT_EDIT', async () => {
    const action = orderActions(orderDetail()).find((a) => a.transition.status === 'Cancelled')!;
    const ctx = await openDialog(action);
    expect(text(ctx.root.querySelector('[data-testid="stock-text"]'))).toContain(
      'automatski vraćaju',
    );
    expect(ctx.root.querySelector('[data-testid="shipment-fields"]')).toBeNull();
    ctx.fixture.componentInstance.submit();
    ctx.http
      .expectOne(`${DETAIL_URL}/status`)
      .flush(
        { code: 'CONCURRENT_EDIT', status: 409, title: 'Sukob', detail: 'Promenjeno.' },
        { status: 409, statusText: 'Conflict' },
      );
    expect(ctx.close.mock.calls[0]![0].kind).toBe('conflict');
    expect(ctx.close.mock.calls[0]![0].error.code).toBe('CONCURRENT_EDIT');
  });
});

describe('payment and shipment forms', () => {
  it('validates money and builds the payment request with the latest version', () => {
    expect(moneyValidator(new FormControl(1650))).toBeNull();
    expect(moneyValidator(new FormControl(1650.5))).toBeNull();
    expect(moneyValidator(new FormControl(0))).toEqual({ money: 'Iznos mora biti veći od nule.' });
    expect(moneyValidator(new FormControl(10.123))).toEqual({
      money: 'Iznos može imati najviše dve decimale.',
    });
    const now = Date.parse('2026-11-14T15:00:00Z');
    expect(
      buildPaymentRequest(
        { version: 12, placedAt: '2026-11-10T09:30:00Z' },
        1650,
        new Date(2026, 10, 14),
        now,
      ),
    ).toEqual({
      collectedAmount: 1650,
      collectedAt: null,
      version: 12,
    });
    expect(
      buildPaymentRequest(
        { version: 12, placedAt: '2026-11-10T09:30:00Z' },
        1600,
        new Date(2026, 10, 13),
        now,
      ).collectedAt,
    ).toBe('2026-11-13T11:00:00.000Z');
  });

  it('keeps the original time when the shipment day is unchanged', () => {
    const shipment = { shippedAt: '2026-11-12T08:15:00Z' };
    expect(
      buildShipmentRequest({ placedAt: '2026-11-10T09:30:00Z' }, shipment, {
        courierCompanyId: COURIER.id,
        trackingNumber: ' ',
        shippedOn: new Date(2026, 10, 12),
        note: '',
      }),
    ).toEqual({
      courierCompanyId: COURIER.id,
      trackingNumber: null,
      shippedAt: '2026-11-12T08:15:00Z',
      note: null,
    });
  });

  it('prefills the amount with the order total and today', async () => {
    const close = vi.fn();
    const delivered = orderDetail({
      status: 'Delivered',
      version: 12,
      payment: { collectedAmount: null, collectedAt: null, isCollected: false, canRecord: true },
    });
    TestBed.configureTestingModule({
      providers: [
        ...providers(),
        { provide: MAT_DIALOG_DATA, useValue: delivered },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(PaymentDialog);
    await settle(() => fixture.detectChanges());
    const dialog = fixture.componentInstance;
    expect(dialog.form.controls.amount.value).toBe(1650);
    expect(belgradeDate(dialog.form.controls.collectedOn.value!)).toBe(belgradeDate());
    dialog.form.controls.amount.setValue(0);
    dialog.submit();
    const http = TestBed.inject(HttpTestingController);
    expect(http.match(`${DETAIL_URL}/payment`).length).toBe(0);
    dialog.form.controls.amount.setValue(1650);
    dialog.submit();
    const request = http.expectOne(`${DETAIL_URL}/payment`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ collectedAmount: 1650, collectedAt: null, version: 12 });
  });
});

describe('OrderDetailPage', () => {
  async function openDetail(detail: AdminOrderDetail = orderDetail()) {
    TestBed.configureTestingModule({
      providers: [
        ...providers(),
        provideRouter(
          [
            { path: 'porudzbine/:id', component: OrderDetailPage },
            { path: 'porudzbine', children: [] },
          ],
          withComponentInputBinding(),
        ),
      ],
    });
    const harness = await RouterTestingHarness.create(`/porudzbine/${ORDER_ID}`);
    const http = TestBed.inject(HttpTestingController);
    const root = harness.routeNativeElement as HTMLElement;
    const render = () => settle(() => harness.detectChanges(), 12);
    http.expectOne(DETAIL_URL).flush(detail);
    await render();
    const page = harness.routeDebugElement!.componentInstance as OrderDetailPage;
    return { harness, http, root, render, page };
  }

  const overlay = () => document.querySelector('.cdk-overlay-container') as HTMLElement;

  it('shows customer, contact links, items, totals and the next step as buttons', async () => {
    const ctx = await openDetail();
    expect(text(ctx.root.querySelector('[data-testid="order-number"]'))).toBe('ZLD-2026-000042');
    expect(text(ctx.root.querySelector('[data-testid="status"]'))).toBe('Primljena');
    expect(ctx.root.querySelector('[data-testid="phone"]')?.getAttribute('href')).toBe(
      'tel:+381641234567',
    );
    expect(text(ctx.root.querySelector('[data-testid="phone"]'))).toBe('064 123 4567');
    expect(ctx.root.querySelector('[data-testid="email"]')?.getAttribute('href')).toBe(
      'mailto:milica@primer.rs',
    );
    expect(text(ctx.root.querySelector('[data-testid="address"]'))).toBe(
      'Kralja Petra 12 18000 Niš',
    );
    expect(text(ctx.root.querySelector('[data-testid="delivery-note"]'))).toBe('Interfon 4');
    expect(text(ctx.root.querySelector('[data-testid="item"]'))).toContain('2 × 650 RSD');
    expect(text(ctx.root.querySelector('[data-testid="total"]'))).toBe('1.650 RSD');
    expect(text(ctx.root.querySelector('[data-testid="timeline-entry"]'))).toContain(
      'Kupac (porudžbina sa sajta)',
    );
    const buttons = [...ctx.root.querySelectorAll('[data-testid="actions"] button')];
    expect(buttons.map(text)).toEqual([
      'Prihvati porudžbinu',
      'Odbij porudžbinu',
      'Otkaži porudžbinu',
    ]);
    expect(text(ctx.root.querySelector('[data-testid="payment"]'))).toContain(
      'Naplata se evidentira kada porudžbina bude isporučena',
    );
  });

  it('changes the status with the latest version and uses the new version afterwards', async () => {
    const ctx = await openDetail();
    ctx.root.querySelector<HTMLButtonElement>('[data-action="Accepted"]')!.click();
    await ctx.render();
    overlay().querySelector<HTMLTextAreaElement>('[data-testid="internal-note"]')!.value =
      'Javiti se';
    overlay()
      .querySelector<HTMLTextAreaElement>('[data-testid="internal-note"]')!
      .dispatchEvent(new Event('input'));
    overlay().querySelector<HTMLButtonElement>('[data-testid="confirm-status"]')!.click();
    await ctx.render();
    const request = ctx.http.expectOne(`${DETAIL_URL}/status`);
    expect(request.request.body).toEqual({
      newStatus: 'Accepted',
      version: 5,
      internalNote: 'Javiti se',
      customerMessage: null,
    });
    request.flush(
      orderDetail({
        status: 'Accepted',
        version: 6,
        allowedNextStatuses: [
          transition('Preparing'),
          transition('Cancelled', { stockReturn: 'Automatic' }),
        ],
      }),
    );
    await ctx.render();
    expect(text(ctx.root.querySelector('[data-testid="status"]'))).toBe('Prihvaćena');
    expect([...ctx.root.querySelectorAll('[data-testid="actions"] button')].map(text)).toEqual([
      'Počni pripremu',
      'Otkaži porudžbinu',
    ]);

    ctx.root.querySelector<HTMLButtonElement>('[data-action="Preparing"]')!.click();
    await ctx.render();
    overlay().querySelector<HTMLButtonElement>('[data-testid="confirm-status"]')!.click();
    await ctx.render();
    expect(ctx.http.expectOne(`${DETAIL_URL}/status`).request.body.version).toBe(6);
  });

  it('shows a reload banner on CONCURRENT_EDIT', async () => {
    const ctx = await openDetail();
    ctx.root.querySelector<HTMLButtonElement>('[data-action="Accepted"]')!.click();
    await ctx.render();
    overlay().querySelector<HTMLButtonElement>('[data-testid="confirm-status"]')!.click();
    await ctx.render();
    ctx.http
      .expectOne(`${DETAIL_URL}/status`)
      .flush(
        { code: 'CONCURRENT_EDIT', status: 409, title: 'Sukob', detail: 'Promenjeno.' },
        { status: 409, statusText: 'Conflict' },
      );
    await ctx.render();
    expect(text(ctx.root.querySelector('[data-testid="notice"]'))).toContain(
      'Porudžbinu je u međuvremenu promenio neko drugi.',
    );
    ctx.root.querySelector<HTMLButtonElement>('[data-testid="reload-latest"]')!.click();
    ctx.http
      .expectOne(DETAIL_URL)
      .flush(orderDetail({ status: 'Accepted', version: 7, allowedNextStatuses: [] }));
    await ctx.render();
    expect(ctx.root.querySelector('[data-testid="notice"]')).toBeNull();
    expect(text(ctx.root.querySelector('[data-testid="status"]'))).toBe('Prihvaćena');
  });

  it('reloads and explains INVALID_STATUS_TRANSITION', async () => {
    const ctx = await openDetail();
    ctx.root.querySelector<HTMLButtonElement>('[data-action="Accepted"]')!.click();
    await ctx.render();
    overlay().querySelector<HTMLButtonElement>('[data-testid="confirm-status"]')!.click();
    await ctx.render();
    ctx.http.expectOne(`${DETAIL_URL}/status`).flush(
      {
        code: 'INVALID_STATUS_TRANSITION',
        status: 409,
        title: 'Nedozvoljena promena',
        detail: 'Nije dozvoljeno.',
        allowedNextStatuses: [],
      },
      { status: 409, statusText: 'Conflict' },
    );
    await ctx.render();
    ctx.http
      .expectOne(DETAIL_URL)
      .flush(orderDetail({ status: 'Cancelled', version: 8, allowedNextStatuses: [] }));
    await ctx.render();
    expect(text(ctx.root.querySelector('[data-testid="notice"]'))).toContain(
      'Ova promena statusa više nije moguća.',
    );
    expect(text(ctx.root.querySelector('[data-testid="status"]'))).toBe('Otkazana');
    expect(text(ctx.root.querySelector('[data-testid="next-step"]'))).toContain(
      'Porudžbina je završena',
    );
  });

  it('records payment for a delivered order and links the tracking number', async () => {
    const ctx = await openDetail(
      orderDetail({
        status: 'Delivered',
        version: 12,
        allowedNextStatuses: [],
        payment: { collectedAmount: null, collectedAt: null, isCollected: false, canRecord: true },
        shipments: [
          {
            id: '88888888-8888-4888-8888-888888888888',
            courier: { id: COURIER.id, name: COURIER.name, isActive: true },
            trackingNumber: 'RS123',
            trackingUrl: 'https://brza.example/pracenje?broj=RS123',
            shippedAt: '2026-11-11T10:00:00Z',
            note: null,
            createdAt: '2026-11-11T10:00:00Z',
            updatedAt: '2026-11-11T10:00:00Z',
          },
        ],
      }),
    );
    const link = ctx.root.querySelector<HTMLAnchorElement>('[data-testid="tracking-link"]');
    expect(link?.getAttribute('href')).toBe('https://brza.example/pracenje?broj=RS123');
    expect(link?.getAttribute('target')).toBe('_blank');
    ctx.root.querySelector<HTMLButtonElement>('[data-testid="record-payment"]')!.click();
    await ctx.render();
    expect(overlay().querySelector<HTMLInputElement>('[data-testid="amount"]')?.value).toBe('1650');
    overlay().querySelector<HTMLButtonElement>('[data-testid="save-payment"]')!.click();
    await ctx.render();
    const request = ctx.http.expectOne(`${DETAIL_URL}/payment`);
    expect(request.request.body).toEqual({ collectedAmount: 1650, collectedAt: null, version: 12 });
    request.flush(
      orderDetail({
        status: 'Delivered',
        version: 13,
        allowedNextStatuses: [],
        payment: {
          collectedAmount: 1650,
          collectedAt: '2026-11-14T10:00:00Z',
          isCollected: true,
          canRecord: true,
        },
      }),
    );
    await ctx.render();
    expect(text(ctx.root.querySelector('[data-testid="collected-amount"]'))).toBe('1.650 RSD');
    expect(ctx.root.querySelector('[data-testid="clear-payment"]')).not.toBeNull();
  });

  it('adds an internal note', async () => {
    const ctx = await openDetail();
    const input = ctx.root.querySelector<HTMLTextAreaElement>('[data-testid="note-input"]')!;
    ctx.root.querySelector<HTMLButtonElement>('[data-testid="add-note"]')!.click();
    await ctx.render();
    expect(ctx.http.match(`${DETAIL_URL}/notes`).length).toBe(0);
    input.value = 'Kupac je zvao.';
    input.dispatchEvent(new Event('input'));
    ctx.root.querySelector<HTMLButtonElement>('[data-testid="add-note"]')!.click();
    await ctx.render();
    const request = ctx.http.expectOne(`${DETAIL_URL}/notes`);
    expect(request.request.body).toEqual({ note: 'Kupac je zvao.' });
    request.flush(
      orderDetail({
        notes: [
          {
            id: 'n1',
            note: 'Kupac je zvao.',
            adminUserId: 'a1',
            adminName: 'Milica',
            createdAt: '2026-11-14T10:00:00Z',
          },
        ],
      }),
    );
    await ctx.render();
    expect(text(ctx.root.querySelector('[data-testid="note"]'))).toContain('Kupac je zvao. Milica');
  });
});
