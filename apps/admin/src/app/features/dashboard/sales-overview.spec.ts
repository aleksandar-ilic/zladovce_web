import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { apiErrorInterceptor, provideAppConfig } from '@zladovce/api';
import { AuthService } from '@zladovce/auth';
import { DashboardSummary, PeriodMetrics } from '@zladovce/models';
import { moneyTiles, orderTiles, ordersChart, revenueChart } from './metrics';
import { SalesOverview } from './sales-overview';

const API = 'http://localhost:5080/api/v1';
const D = `${API}/admin/dashboard`;

const text = (element: Element | null | undefined): string =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

const PERIOD = {
  period: 'custom',
  current: { from: '2026-11-14', to: '2026-11-14' },
  previous: { from: '2026-11-13', to: '2026-11-13' },
  granularity: 'Day' as const,
  timeZone: 'Europe/Belgrade',
};

function metrics(overrides: Partial<PeriodMetrics> = {}): PeriodMetrics {
  return {
    orderedValue: 0,
    orderedCount: 0,
    deliveredValue: 0,
    deliveredCount: 0,
    estimatedCollected: 0,
    actualCollected: 0,
    collectedCount: 0,
    expenses: 0,
    estimatedProfit: 0,
    averageOrderValue: null,
    cancelledCount: 0,
    rejectedCount: 0,
    ...overrides,
  };
}

const SUMMARY: DashboardSummary = {
  period: PERIOD,
  current: metrics({
    orderedValue: 3350,
    orderedCount: 2,
    deliveredValue: 3350,
    deliveredCount: 2,
    estimatedCollected: 3350,
    actualCollected: 3000,
    collectedCount: 1,
    expenses: 500,
    estimatedProfit: 2850,
    averageOrderValue: 1675,
    cancelledCount: 4,
    rejectedCount: 1,
  }),
  previous: metrics({
    orderedValue: 1000,
    orderedCount: 1,
    expenses: 250,
    averageOrderValue: 1000,
  }),
  queues: {
    awaitingConfirmation: 2,
    accepted: 0,
    preparing: 0,
    inPreparation: 0,
    awaitingShipment: 0,
    deliveryFailed: 0,
  },
  currency: 'RSD',
};

describe('dashboard metrics', () => {
  it('builds the cash-on-delivery tiles with trends; only the owner gets the expenses link', () => {
    const tiles = moneyTiles(SUMMARY, true);
    expect(tiles.map((t) => [t.label, t.value])).toEqual([
      ['Poručena vrednost', 3350],
      ['Vrednost isporučenih', 3350],
      ['Procenjena naplata', 3350],
      ['Stvarno naplaćeno', 3000],
      ['Troškovi', 500],
      ['Procenjena dobit', 2850],
    ]);
    expect(tiles[0]?.detail).toBe('2 porudžbine');
    expect(tiles[0]?.trend?.text).toBe('+235%');
    expect(tiles[0]?.hint).toContain('To još nije novac');
    // More expenses than before is bad news.
    expect(tiles[4]?.trend).toMatchObject({ text: '+100%', tone: 'bad' });
    expect(tiles[4]?.link?.path).toBe('/troskovi');
    expect(tiles[5]?.hint).toContain('samo onoliko koliko su svi troškovi upisani');
    expect(moneyTiles(SUMMARY, false)[4]?.link).toBeUndefined();

    const orders = orderTiles(SUMMARY);
    expect(orders.map((t) => [t.label, t.value])).toEqual([
      ['Prosečna porudžbina', 1675],
      ['Otkazane', 4],
      ['Odbijene', 1],
    ]);
    expect(orders[1]?.trend?.tone).toBe('bad');
    expect(orderTiles({ ...SUMMARY, current: metrics() })[0]?.detail).toBe('nema porudžbina');
  });

  it('maps the series to chart data (day and month buckets)', () => {
    const revenue = revenueChart({
      period: PERIOD,
      currency: 'RSD',
      points: [
        {
          from: '2026-11-13',
          to: '2026-11-13',
          label: '2026-11-13',
          orderedValue: 0,
          deliveredValue: 0,
        },
        {
          from: '2026-11-14',
          to: '2026-11-14',
          label: '2026-11-14',
          orderedValue: 3350,
          deliveredValue: 3350,
        },
      ],
    });
    expect(revenue.series.map((s) => s.label)).toEqual(['Poručeno', 'Isporučeno']);
    expect(revenue.series[0]?.values).toEqual([0, 3350]);
    const orders = ordersChart({
      period: { ...PERIOD, granularity: 'Month' },
      points: [
        { from: '2026-10-01', to: '2026-10-31', label: '2026-10', orderCount: 0, placedCount: 1 },
        { from: '2026-11-01', to: '2026-11-15', label: '2026-11', orderCount: 2, placedCount: 7 },
      ],
    });
    expect(orders.labels).toEqual(['okt 2026.', 'nov 2026.']);
    expect(orders.series[0]?.values).toEqual([0, 2]);
  });
});

describe('sales overview', () => {
  async function open(role: 'Owner' | 'Staff') {
    TestBed.configureTestingModule({
      providers: [
        provideAppConfig({ apiBaseUrl: API, healthUrl: 'http://localhost:5080/health' }),
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([{ path: '', component: SalesOverview }]),
        { provide: AuthService, useValue: { user: signal({ role }), role: signal(role) } },
      ],
    });
    const harness = await RouterTestingHarness.create(
      '/?period=custom&from=2026-11-14&to=2026-11-14',
    );
    return { harness, controller: TestBed.inject(HttpTestingController) };
  }

  function flushAll(controller: HttpTestingController) {
    const summary = controller.expectOne((r) => r.url === `${D}/summary`);
    expect(summary.request.params.get('period')).toBe('custom');
    expect(summary.request.params.get('from')).toBe('2026-11-14');
    expect(summary.request.params.get('to')).toBe('2026-11-14');
    summary.flush(SUMMARY);
    controller
      .expectOne((r) => r.url === `${D}/revenue-series`)
      .flush({
        period: PERIOD,
        currency: 'RSD',
        points: [
          {
            from: '2026-11-14',
            to: '2026-11-14',
            label: '2026-11-14',
            orderedValue: 3350,
            deliveredValue: 3350,
          },
        ],
      });
    controller
      .expectOne((r) => r.url === `${D}/order-series`)
      .flush({
        period: PERIOD,
        points: [
          {
            from: '2026-11-14',
            to: '2026-11-14',
            label: '2026-11-14',
            orderCount: 2,
            placedCount: 7,
          },
        ],
      });
    const top = controller.expectOne((r) => r.url === `${D}/top-products`);
    expect(top.request.params.get('limit')).toBe('5');
    top.flush({
      period: PERIOD,
      currency: 'RSD',
      byRevenue: [
        { productId: 'p1', productName: 'Džem od borovnice', quantity: 2, revenue: 1780 },
      ],
      byQuantity: [
        { productId: 'p1', productName: 'Džem od borovnice', quantity: 2, revenue: 1780 },
      ],
    });
    controller
      .expectOne((r) => r.url === `${D}/sales-by-category`)
      .flush({
        period: PERIOD,
        currency: 'RSD',
        totalRevenue: 3350,
        items: [{ categoryId: null, categoryName: 'Bez kategorije', quantity: 3, revenue: 3350 }],
      });
    controller
      .expectOne((r) => r.url === `${D}/status-distribution`)
      .flush({
        period: PERIOD,
        total: 8,
        items: [
          { status: 'Delivered', label: 'Isporučena', count: 2 },
          { status: 'Cancelled', label: 'Otkazana', count: 5 },
        ],
      });
  }

  it('shows the API numbers for the period from the URL', async () => {
    const { harness, controller } = await open('Owner');
    flushAll(controller);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const root = harness.routeNativeElement as HTMLElement;
    const value = (key: string) =>
      text(root.querySelector(`[data-testid="tile-${key}"] [data-testid="tile-value"]`));
    expect(value('orderedValue')).toBe('3.350 RSD');
    expect(value('deliveredValue')).toBe('3.350 RSD');
    expect(value('actualCollected')).toBe('3.000 RSD');
    expect(value('expenses')).toBe('500 RSD');
    expect(value('estimatedProfit')).toBe('2.850 RSD');
    expect(
      text(root.querySelector('[data-testid="tile-orderedValue"] [data-testid="tile-trend"]')),
    ).toBe('+235%');
    expect(text(root.querySelector('[data-testid="period-range"]'))).toContain('14.11.2026.');
    expect(
      root.querySelector('[data-testid="tile-expenses"] [data-testid="tile-link"]'),
    ).not.toBeNull();
    expect(text(root.querySelector('[data-testid="top-products"] li'))).toBe(
      'Džem od borovnice: 1.780 RSD · 2 kom.',
    );
    expect(text(root.querySelector('[data-testid="sales-by-category"] li'))).toContain(
      'Bez kategorije',
    );
    expect(
      root.querySelectorAll('[data-testid="revenue-chart"] [data-testid="chart"]'),
    ).toHaveLength(1);
    controller.verify();
  });

  it('hides the expenses link from staff and keeps working when one request fails', async () => {
    const { harness, controller } = await open('Staff');
    controller.expectOne((r) => r.url === `${D}/summary`).flush(SUMMARY);
    controller
      .expectOne((r) => r.url === `${D}/revenue-series`)
      .flush({ code: 'X', detail: 'Greška grafikona.' }, { status: 500, statusText: 'x' });
    await harness.fixture.whenStable();
    harness.detectChanges();
    const root = harness.routeNativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="tile-expenses"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="tile-link"]')).toBeNull();
    expect(text(root.querySelector('[data-testid="revenue-chart"]'))).toContain(
      'Grafikon nije učitan',
    );
  });
});
