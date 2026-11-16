import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService, hasRole } from '@zladovce/auth';
import { UiCard, UiCardTitle, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { AnalyticsApi } from '../../data/analytics-api';
import { BarList } from '../../shared/charts/bar-list';
import { TimeChart } from '../../shared/charts/time-chart';
import { PeriodSelector } from '../../shared/period-selector';
import { periodFromRoute } from '../../shared/period-route';
import { RemoteData } from '../../shared/remote-data';
import { MetricTileCard } from './metric-tile';
import {
  categoryBars,
  moneyTiles,
  ordersChart,
  orderTiles,
  productBars,
  revenueChart,
  statusBars,
} from './metrics';

/**
 * Business numbers of the dashboard for a chosen period (P1.8): money tiles with trends, revenue
 * and order charts, best sellers, sales by category and orders by status. The period lives in the
 * URL; every number and chart below the selector uses the same period.
 */
@Component({
  selector: 'adm-sales-overview',
  imports: [
    RouterLink,
    UiCard,
    UiCardTitle,
    UiErrorState,
    UiLoadingState,
    BarList,
    TimeChart,
    PeriodSelector,
    MetricTileCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section aria-labelledby="sales-heading" data-testid="sales-overview">
      <h2 id="sales-heading" class="sr-only">Prodaja u izabranom periodu</h2>
      <adm-period-selector
        [value]="period.value()"
        [current]="periodInfo()?.current ?? null"
        [previous]="periodInfo()?.previous ?? null"
        (changed)="period.set($event)"
      />

      <details
        class="mt-4 max-w-3xl rounded-lg border border-sage-200 bg-sage-50 px-4 py-3 text-sm text-ink-700"
        data-testid="cod-explainer"
      >
        <summary class="cursor-pointer font-semibold text-ink-900">
          Kako čitati ove brojeve (plaćanje pouzećem)
        </summary>
        <p class="mt-2">
          Kupci plaćaju kuriru kada preuzmu paket. Zato
          <strong>nova porudžbina još nije novac</strong>: „Poručena vrednost“ pokazuje šta je
          poručeno, a novac se računa tek kod isporučenih porudžbina („Vrednost isporučenih“ i
          „Procenjena naplata“).
        </p>
        <p class="mt-2">
          „Stvarno naplaćeno“ su iznosi koje ste sami upisali kod porudžbine kada je novac stigao.
          „Procenjena dobit“ je vrednost isporučenih minus troškovi koje ste upisali – ako neki
          trošak nije upisan, dobit izgleda veća nego što jeste.
        </p>
      </details>

      @if (summary().error; as error) {
        <ui-error-state
          title="Brojevi za ovaj period nisu učitani"
          [message]="error.detail"
          (retry)="summaryData.reload()"
        />
      } @else if (summary().data; as data) {
        <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="money-tiles">
          @for (tile of money(); track tile.key) {
            <adm-metric-tile [tile]="tile" [busy]="summary().busy" />
          }
        </div>
        <div class="mt-4 grid gap-4 sm:grid-cols-3" data-testid="order-tiles">
          @for (tile of orderNumbers(); track tile.key) {
            <adm-metric-tile [tile]="tile" size="md" [busy]="summary().busy" />
          }
        </div>
        @if (data.queues.awaitingConfirmation > 0) {
          <p class="mt-3 text-sm text-ink-700">
            Trenutno
            <a
              routerLink="/porudzbine"
              [queryParams]="{ status: 'Received' }"
              class="font-semibold text-olive-700 underline underline-offset-4"
              >{{ data.queues.awaitingConfirmation }} čeka potvrdu</a
            >
            (ne zavisi od izabranog perioda).
          </p>
        }
      } @else {
        <ui-loading-state label="Učitavanje brojeva…" />
      }

      <div class="mt-6 grid gap-6 xl:grid-cols-2">
        <ui-card data-testid="revenue-chart">
          <h3 uiCardTitle>Prihod: poručeno i isporučeno</h3>
          <p class="mt-1 text-sm text-ink-700">
            Vrednost porudžbina po {{ bucketWord() }}, u dinarima.
          </p>
          @if (revenue().error; as error) {
            <ui-error-state
              title="Grafikon nije učitan"
              [message]="error.detail"
              (retry)="revenueData.reload()"
            />
          } @else if (revenueChartData(); as chart) {
            <adm-time-chart
              class="mt-3"
              [data]="chart"
              label="Prihod: poručeno i isporučeno"
              [bucketHeader]="bucketHeader()"
              [busy]="revenue().busy"
            />
          } @else {
            <ui-loading-state label="Učitavanje grafikona…" />
          }
        </ui-card>

        <ui-card data-testid="orders-chart">
          <h3 uiCardTitle>Broj porudžbina</h3>
          <p class="mt-1 text-sm text-ink-700">
            Primljene porudžbine po {{ bucketWord() }} (bez otkazanih i odbijenih).
          </p>
          @if (orders().error; as error) {
            <ui-error-state
              title="Grafikon nije učitan"
              [message]="error.detail"
              (retry)="ordersData.reload()"
            />
          } @else if (ordersChartData(); as chart) {
            <adm-time-chart
              class="mt-3"
              type="column"
              format="count"
              [data]="chart"
              label="Broj porudžbina"
              [bucketHeader]="bucketHeader()"
              [busy]="orders().busy"
            />
          } @else {
            <ui-loading-state label="Učitavanje grafikona…" />
          }
        </ui-card>

        <ui-card data-testid="top-products">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h3 uiCardTitle>Najprodavaniji proizvodi</h3>
            <div class="flex gap-1" role="group" aria-label="Poređaj po">
              <button
                type="button"
                class="cursor-pointer rounded-full border px-3 py-1 text-sm font-semibold"
                [class]="
                  topBy() === 'revenue'
                    ? 'border-olive-700 bg-olive-700 text-white'
                    : 'border-sage-400 bg-white text-ink-900'
                "
                [attr.aria-pressed]="topBy() === 'revenue'"
                data-testid="top-by-revenue"
                (click)="topBy.set('revenue')"
              >
                Po prihodu
              </button>
              <button
                type="button"
                class="cursor-pointer rounded-full border px-3 py-1 text-sm font-semibold"
                [class]="
                  topBy() === 'quantity'
                    ? 'border-olive-700 bg-olive-700 text-white'
                    : 'border-sage-400 bg-white text-ink-900'
                "
                [attr.aria-pressed]="topBy() === 'quantity'"
                data-testid="top-by-quantity"
                (click)="topBy.set('quantity')"
              >
                Po količini
              </button>
            </div>
          </div>
          <p class="mt-1 mb-3 text-sm text-ink-700">
            Iz porudžbina isporučenih u ovom periodu (bez dostave).
          </p>
          @if (top().error; as error) {
            <ui-error-state
              title="Podaci nisu učitani"
              [message]="error.detail"
              (retry)="topData.reload()"
            />
          } @else if (top().data) {
            <adm-bar-list
              [class.opacity-60]="top().busy"
              [items]="topItems()"
              [format]="topBy() === 'revenue' ? 'rsd' : 'count'"
              label="Najprodavaniji proizvodi"
              emptyText="U ovom periodu nema isporučenih porudžbina."
            />
          } @else {
            <ui-loading-state />
          }
        </ui-card>

        <ui-card data-testid="sales-by-category">
          <h3 uiCardTitle>Prodaja po kategorijama</h3>
          <p class="mt-1 mb-3 text-sm text-ink-700">
            Prihod isporučenih porudžbina po kategoriji proizvoda.
          </p>
          @if (categories().error; as error) {
            <ui-error-state
              title="Podaci nisu učitani"
              [message]="error.detail"
              (retry)="categoriesData.reload()"
            />
          } @else if (categories().data; as data) {
            <adm-bar-list
              [class.opacity-60]="categories().busy"
              [items]="categoryItems()"
              label="Prodaja po kategorijama"
              emptyText="U ovom periodu nema isporučenih porudžbina."
            />
          } @else {
            <ui-loading-state />
          }
        </ui-card>

        <ui-card data-testid="status-distribution">
          <h3 uiCardTitle>Porudžbine po statusu</h3>
          <p class="mt-1 mb-3 text-sm text-ink-700">
            Trenutni status porudžbina primljenih u ovom periodu{{
              statuses().data ? ' (ukupno ' + statuses().data!.total + ').' : '.'
            }}
          </p>
          @if (statuses().error; as error) {
            <ui-error-state
              title="Podaci nisu učitani"
              [message]="error.detail"
              (retry)="statusData.reload()"
            />
          } @else if (statuses().data) {
            <adm-bar-list
              [class.opacity-60]="statuses().busy"
              [items]="statusItems()"
              format="count"
              [keepOrder]="true"
              label="Porudžbine po statusu"
            />
          } @else {
            <ui-loading-state />
          }
        </ui-card>
      </div>
    </section>
  `,
})
export class SalesOverview {
  private readonly api = inject(AnalyticsApi);
  private readonly auth = inject(AuthService);

  protected readonly period = periodFromRoute();
  protected readonly topBy = signal<'revenue' | 'quantity'>('revenue');

  protected readonly summaryData = new RemoteData(this.period.changes, (p) => this.api.summary(p));
  protected readonly revenueData = new RemoteData(this.period.changes, (p) =>
    this.api.revenueSeries(p),
  );
  protected readonly ordersData = new RemoteData(this.period.changes, (p) =>
    this.api.orderSeries(p),
  );
  protected readonly topData = new RemoteData(this.period.changes, (p) =>
    this.api.topProducts(p, 5),
  );
  protected readonly categoriesData = new RemoteData(this.period.changes, (p) =>
    this.api.salesByCategory(p),
  );
  protected readonly statusData = new RemoteData(this.period.changes, (p) =>
    this.api.statusDistribution(p),
  );

  protected readonly summary = this.summaryData.value;
  protected readonly revenue = this.revenueData.value;
  protected readonly orders = this.ordersData.value;
  protected readonly top = this.topData.value;
  protected readonly categories = this.categoriesData.value;
  protected readonly statuses = this.statusData.value;

  private readonly isOwner = computed(() => hasRole(this.auth.user(), ['Owner']));
  protected readonly periodInfo = computed(() => this.summary().data?.period ?? null);
  protected readonly money = computed(() => {
    const data = this.summary().data;
    return data ? moneyTiles(data, this.isOwner()) : [];
  });
  protected readonly orderNumbers = computed(() => {
    const data = this.summary().data;
    return data ? orderTiles(data) : [];
  });
  protected readonly revenueChartData = computed(() => {
    const data = this.revenue().data;
    return data ? revenueChart(data) : null;
  });
  protected readonly ordersChartData = computed(() => {
    const data = this.orders().data;
    return data ? ordersChart(data) : null;
  });
  protected readonly topItems = computed(() => {
    const data = this.top().data;
    if (!data) {
      return [];
    }
    return this.topBy() === 'revenue'
      ? productBars(data.byRevenue, 'revenue')
      : productBars(data.byQuantity, 'quantity');
  });
  protected readonly categoryItems = computed(() =>
    categoryBars(this.categories().data?.items ?? []),
  );
  protected readonly statusItems = computed(() => statusBars(this.statuses().data?.items ?? []));

  private readonly granularity = computed(
    () =>
      this.revenue().data?.period.granularity ?? this.summary().data?.period.granularity ?? 'Day',
  );
  protected readonly bucketWord = computed(() =>
    this.granularity() === 'Month' ? 'mesecima' : 'danima',
  );
  protected readonly bucketHeader = computed(() =>
    this.granularity() === 'Month' ? 'Mesec' : 'Dan',
  );
}
