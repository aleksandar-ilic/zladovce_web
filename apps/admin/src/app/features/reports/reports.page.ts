import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { asApiError } from '@zladovce/api';
import { STOCK_STATUS_TONES } from '@zladovce/shared';
import { UiBadge, UiCard, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { RsdPipe, SrDatePipe } from '@zladovce/utilities';
import { of } from 'rxjs';
import { AnalyticsApi, SalesGroupBy } from '../../data/analytics-api';
import { belgradeDate } from '../../shared/serbian-dates';
import { PeriodSelector } from '../../shared/period-selector';
import { periodFromRoute } from '../../shared/period-route';
import { RemoteData } from '../../shared/remote-data';

/** CSV name used when the browser does not expose the server's `Content-Disposition`. */
export function salesCsvName(groupBy: SalesGroupBy, from: string, to: string): string {
  const name = groupBy === 'category' ? 'prodaja-po-kategorijama' : 'prodaja-po-proizvodima';
  return `${name}-${from}-${to}.csv`;
}

/**
 * Izveštaji: sales of delivered orders in a period (by product variant and by category, with
 * shipping shown separately) and the current inventory with its value. Each table can be saved
 * as a CSV file that opens directly in Excel.
 */
@Component({
  selector: 'adm-reports-page',
  imports: [
    MatButtonModule,
    RsdPipe,
    SrDatePipe,
    UiBadge,
    UiCard,
    UiErrorState,
    UiLoadingState,
    PeriodSelector,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-3xl">Izveštaji</h1>
    <p class="mt-2 max-w-3xl text-ink-700">
      Prodaja se računa iz <strong>isporučenih</strong> porudžbina (novac pouzećem stiže pri
      isporuci). Svaku tabelu možete preuzeti kao CSV datoteku i otvoriti je u Excel-u.
    </p>

    <section class="mt-6 max-w-6xl" aria-labelledby="sales-report">
      <h2 id="sales-report" class="text-2xl">Prodaja</h2>
      <adm-period-selector
        class="mt-3"
        [value]="period.value()"
        [current]="sales().data?.period?.current ?? null"
        (changed)="period.set($event)"
      />

      @if (sales().error; as error) {
        <ui-error-state
          title="Izveštaj nije učitan"
          [message]="error.detail"
          (retry)="salesData.reload()"
        />
      } @else if (sales().data; as report) {
        <div
          class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          [class.opacity-60]="sales().busy"
          data-testid="sales-totals"
        >
          <div class="rounded-lg border border-cream-200 bg-white p-4">
            <p class="text-sm font-semibold text-ink-700">Isporučene porudžbine</p>
            <p class="mt-1 text-2xl font-semibold" data-testid="delivered-orders">
              {{ report.deliveredOrders }}
            </p>
          </div>
          <div class="rounded-lg border border-cream-200 bg-white p-4">
            <p class="text-sm font-semibold text-ink-700">Prodato komada</p>
            <p class="mt-1 text-2xl font-semibold">{{ report.totalQuantity }}</p>
          </div>
          <div class="rounded-lg border border-cream-200 bg-white p-4">
            <p class="text-sm font-semibold text-ink-700">Prihod od proizvoda</p>
            <p class="mt-1 text-2xl font-semibold" data-testid="total-revenue">
              {{ report.totalRevenue | rsd }}
            </p>
          </div>
          <div class="rounded-lg border border-cream-200 bg-white p-4">
            <p class="text-sm font-semibold text-ink-700">Naplaćena dostava</p>
            <p class="mt-1 text-2xl font-semibold" data-testid="shipping-revenue">
              {{ report.shippingRevenue | rsd }}
            </p>
            <p class="text-xs text-ink-500">Nije uračunata u prihod od proizvoda.</p>
          </div>
        </div>

        <ui-card class="mt-4" padding="sm">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex gap-1" role="tablist" aria-label="Prikaz prodaje">
              <button
                type="button"
                role="tab"
                class="cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-semibold"
                [class]="
                  groupBy() === 'variant'
                    ? 'border-olive-700 bg-olive-700 text-white'
                    : 'border-sage-400 bg-white text-ink-900'
                "
                [attr.aria-selected]="groupBy() === 'variant'"
                data-testid="by-variant"
                (click)="groupBy.set('variant')"
              >
                Po proizvodima
              </button>
              <button
                type="button"
                role="tab"
                class="cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-semibold"
                [class]="
                  groupBy() === 'category'
                    ? 'border-olive-700 bg-olive-700 text-white'
                    : 'border-sage-400 bg-white text-ink-900'
                "
                [attr.aria-selected]="groupBy() === 'category'"
                data-testid="by-category"
                (click)="groupBy.set('category')"
              >
                Po kategorijama
              </button>
            </div>
            <button
              matButton="outlined"
              type="button"
              data-testid="sales-csv"
              [disabled]="downloading() !== null"
              (click)="downloadSales()"
            >
              {{
                downloading() === 'sales'
                  ? 'Preuzimanje…'
                  : 'Preuzmi CSV (' +
                    (groupBy() === 'variant' ? 'po proizvodima' : 'po kategorijama') +
                    ')'
              }}
            </button>
          </div>

          <div class="mt-3 overflow-x-auto" [class.opacity-60]="sales().busy">
            @if (groupBy() === 'variant') {
              @if (report.byVariant.length === 0) {
                <p class="py-6 text-center text-ink-700" data-testid="sales-empty">
                  U ovom periodu nema isporučenih porudžbina.
                </p>
              } @else {
                <table class="w-full min-w-[40rem] text-left text-sm" data-testid="sales-table">
                  <caption class="sr-only">
                    Prodaja po proizvodima
                  </caption>
                  <thead>
                    <tr class="border-b border-cream-200 text-ink-700">
                      <th scope="col" class="py-2 pr-3 font-semibold">Proizvod</th>
                      <th scope="col" class="py-2 pr-3 font-semibold">Šifra</th>
                      <th scope="col" class="py-2 pr-3 font-semibold">Kategorija</th>
                      <th scope="col" class="py-2 pr-3 text-right font-semibold">Količina</th>
                      <th scope="col" class="py-2 text-right font-semibold">Prihod</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of report.byVariant; track row.variantId) {
                      <tr class="border-b border-cream-100">
                        <th scope="row" class="py-2 pr-3 font-normal">
                          {{ row.productName }} – {{ row.variantName }}
                        </th>
                        <td class="py-2 pr-3 text-ink-700">{{ row.sku }}</td>
                        <td class="py-2 pr-3 text-ink-700">{{ row.categoryName }}</td>
                        <td class="py-2 pr-3 text-right tabular-nums">{{ row.quantity }}</td>
                        <td class="py-2 text-right tabular-nums">{{ row.revenue | rsd }}</td>
                      </tr>
                    }
                  </tbody>
                  <tfoot>
                    <tr class="font-semibold">
                      <th scope="row" class="py-2 pr-3" colspan="3">Ukupno</th>
                      <td class="py-2 pr-3 text-right tabular-nums">{{ report.totalQuantity }}</td>
                      <td class="py-2 text-right tabular-nums">{{ report.totalRevenue | rsd }}</td>
                    </tr>
                  </tfoot>
                </table>
              }
            } @else {
              @if (report.byCategory.length === 0) {
                <p class="py-6 text-center text-ink-700">
                  U ovom periodu nema isporučenih porudžbina.
                </p>
              } @else {
                <table class="w-full min-w-[28rem] text-left text-sm" data-testid="category-table">
                  <caption class="sr-only">
                    Prodaja po kategorijama
                  </caption>
                  <thead>
                    <tr class="border-b border-cream-200 text-ink-700">
                      <th scope="col" class="py-2 pr-3 font-semibold">Kategorija</th>
                      <th scope="col" class="py-2 pr-3 text-right font-semibold">Količina</th>
                      <th scope="col" class="py-2 text-right font-semibold">Prihod</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of report.byCategory; track row.categoryId ?? row.categoryName) {
                      <tr class="border-b border-cream-100">
                        <th scope="row" class="py-2 pr-3 font-normal">{{ row.categoryName }}</th>
                        <td class="py-2 pr-3 text-right tabular-nums">{{ row.quantity }}</td>
                        <td class="py-2 text-right tabular-nums">{{ row.revenue | rsd }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            }
          </div>
        </ui-card>
      } @else {
        <ui-loading-state label="Učitavanje izveštaja…" />
      }
    </section>

    <section class="mt-10 max-w-6xl" aria-labelledby="inventory-report">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="inventory-report" class="text-2xl">Zalihe</h2>
          <p class="mt-1 text-sm text-ink-700">
            Trenutno stanje svih pakovanja (ne zavisi od perioda). Vrednost = količina × redovna
            cena.
          </p>
        </div>
        <button
          matButton="outlined"
          type="button"
          data-testid="inventory-csv"
          [disabled]="downloading() !== null"
          (click)="downloadInventory()"
        >
          {{ downloading() === 'inventory' ? 'Preuzimanje…' : 'Preuzmi CSV' }}
        </button>
      </div>
      @if (inventory().error; as error) {
        <ui-error-state
          title="Zalihe nisu učitane"
          [message]="error.detail"
          (retry)="inventoryData.reload()"
        />
      } @else if (inventory().data; as report) {
        <ui-card class="mt-3" padding="sm">
          <p class="text-sm text-ink-700">
            Ukupno <strong class="text-ink-900">{{ report.totalQuantity }}</strong> komada, vrednost
            <strong class="text-ink-900" data-testid="stock-value">{{
              report.totalStockValue | rsd
            }}</strong>
            · stanje od {{ report.generatedAt | srDate: 'dateTime' }}
          </p>
          <div class="mt-3 overflow-x-auto">
            <table class="w-full min-w-[44rem] text-left text-sm" data-testid="inventory-table">
              <caption class="sr-only">
                Zalihe
              </caption>
              <thead>
                <tr class="border-b border-cream-200 text-ink-700">
                  <th scope="col" class="py-2 pr-3 font-semibold">Proizvod</th>
                  <th scope="col" class="py-2 pr-3 font-semibold">Šifra</th>
                  <th scope="col" class="py-2 pr-3 text-right font-semibold">Stanje</th>
                  <th scope="col" class="py-2 pr-3 font-semibold">Status</th>
                  <th scope="col" class="py-2 pr-3 text-right font-semibold">Redovna cena</th>
                  <th scope="col" class="py-2 text-right font-semibold">Vrednost</th>
                </tr>
              </thead>
              <tbody>
                @for (row of report.items; track row.variantId) {
                  <tr class="border-b border-cream-100">
                    <th scope="row" class="py-2 pr-3 font-normal">
                      {{ row.productName }} – {{ row.variantName }}
                      @if (!row.isActive) {
                        <span class="text-xs text-ink-500">(skriveno)</span>
                      }
                    </th>
                    <td class="py-2 pr-3 text-ink-700">{{ row.sku }}</td>
                    <td class="py-2 pr-3 text-right tabular-nums">{{ row.quantityOnHand }}</td>
                    <td class="py-2 pr-3">
                      <ui-badge [tone]="tones[row.status]">{{ row.statusLabel }}</ui-badge>
                    </td>
                    <td class="py-2 pr-3 text-right tabular-nums">{{ row.regularPrice | rsd }}</td>
                    <td class="py-2 text-right tabular-nums">{{ row.stockValue | rsd }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </ui-card>
      } @else {
        <ui-loading-state label="Učitavanje zaliha…" />
      }
    </section>
  `,
})
export class ReportsPage {
  private readonly api = inject(AnalyticsApi);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly period = periodFromRoute();
  protected readonly tones = STOCK_STATUS_TONES;
  protected readonly groupBy = signal<SalesGroupBy>('variant');
  protected readonly downloading = signal<'sales' | 'inventory' | null>(null);

  protected readonly salesData = new RemoteData(this.period.changes, (p) =>
    this.api.salesReport(p),
  );
  protected readonly inventoryData = new RemoteData(of(true), () => this.api.inventoryReport());
  protected readonly sales = this.salesData.value;
  protected readonly inventory = this.inventoryData.value;
  private readonly range = computed(() => this.sales().data?.period.current ?? null);

  downloadSales(): void {
    const range = this.range();
    const fallback = salesCsvName(
      this.groupBy(),
      range?.from ?? belgradeDate(),
      range?.to ?? belgradeDate(),
    );
    this.run('sales', this.api.downloadSalesCsv(this.period.value(), this.groupBy(), fallback));
  }

  downloadInventory(): void {
    this.run('inventory', this.api.downloadInventoryCsv(`zalihe-${belgradeDate()}.csv`));
  }

  private run(
    which: 'sales' | 'inventory',
    request: ReturnType<AnalyticsApi['downloadInventoryCsv']>,
  ) {
    this.downloading.set(which);
    request.subscribe({
      next: (name) => {
        this.downloading.set(null);
        this.snackBar.open(`Datoteka „${name}“ je preuzeta.`, 'U redu', { duration: 5000 });
      },
      error: (error: unknown) => {
        this.downloading.set(null);
        this.snackBar.open(`Preuzimanje nije uspelo. ${asApiError(error).detail}`, 'U redu', {
          duration: 8000,
        });
      },
    });
  }
}
