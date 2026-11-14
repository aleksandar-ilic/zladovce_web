import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError, asApiError } from '@zladovce/api';
import { AdminOrderListItem, Paged } from '@zladovce/models';
import { ORDER_STATUS_LABELS } from '@zladovce/shared';
import { UiBadge, UiEmptyState, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { RsdPipe, SrDatePipe } from '@zladovce/utilities';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { countOf, openCount, OrderSummaryStore } from '../../core/order-summary';
import { OrdersApi } from '../../data/orders-api';
import { PAGE_SIZE_OPTIONS } from '../../shared/list-query';
import { OrderStatusBadge } from '../../shared/order-status-badge';
import { SERBIAN_PAGINATOR } from '../../shared/paginator-intl';
import { fromIsoDate, SERBIAN_DATES, toIsoDate } from '../../shared/serbian-dates';
import {
  ORDER_SORTS,
  ORDER_VIEWS,
  OrderView,
  OrdersListQuery,
  ordersQueryParams,
  parseOrdersQuery,
  toOrdersApiQuery,
} from './orders-query';

type ListState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; page: Paged<AdminOrderListItem> };

export const VIEW_LABELS: Record<OrderView, string> = {
  open: 'Za obradu',
  all: 'Sve',
  ...ORDER_STATUS_LABELS,
};

/** "1 proizvod", "2 proizvoda", "5 proizvoda". */
export function itemsLabel(count: number): string {
  const one = count % 10 === 1 && count % 100 !== 11;
  return `${count} ${one ? 'proizvod' : 'proizvoda'}`;
}

/**
 * Porudžbine: "Za obradu" (new, accepted and in preparation) by default, any single status or
 * all, with search, date range, sort and paging in the URL. Counts on the tabs come from the
 * summary, so the administrator sees at once where work is waiting.
 */
@Component({
  selector: 'adm-orders-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    OrderStatusBadge,
    RsdPipe,
    SrDatePipe,
    UiBadge,
    UiEmptyState,
    UiErrorState,
    UiLoadingState,
  ],
  providers: [SERBIAN_PAGINATOR, SERBIAN_DATES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-3xl">Porudžbine</h1>
    <p class="mt-2 max-w-2xl text-ink-700">
      Nove porudžbine su na vrhu. Otvorite porudžbinu da vidite podatke kupca i sledeći korak.
    </p>

    <nav
      class="mt-6 flex max-w-6xl flex-wrap gap-2"
      aria-label="Status porudžbina"
      data-testid="status-tabs"
    >
      @for (view of views; track view) {
        <a
          routerLink="/porudzbine"
          [queryParams]="viewParams(view)"
          class="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold no-underline transition-colors"
          [class]="
            query().view === view
              ? 'border-olive-700 bg-olive-700 text-white'
              : 'border-sage-400 bg-white text-ink-900 hover:bg-sage-50'
          "
          [attr.aria-current]="query().view === view ? 'page' : null"
          [attr.data-view]="view"
        >
          {{ viewLabels[view] }}
          @if (countFor(view); as count) {
            <span
              class="rounded-full px-1.5 text-xs"
              [class]="query().view === view ? 'bg-white/20' : 'bg-cream-200'"
              data-testid="tab-count"
              >{{ count }}</span
            >
          }
        </a>
      }
    </nav>

    <div class="mt-6 grid max-w-6xl gap-x-4 sm:grid-cols-2 lg:grid-cols-4" role="search">
      <mat-form-field appearance="outline" class="sm:col-span-2">
        <mat-label>Pretraga: broj, ime, e-pošta ili telefon</mat-label>
        <input
          matInput
          type="search"
          data-testid="search"
          [value]="searchText()"
          (input)="search($any($event.target).value)"
        />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Period (od – do)</mat-label>
        <mat-date-range-input [formGroup]="range" [rangePicker]="rangePicker">
          <input matStartDate formControlName="start" placeholder="Od" data-testid="from" />
          <input matEndDate formControlName="end" placeholder="Do" data-testid="to" />
        </mat-date-range-input>
        <mat-datepicker-toggle matIconSuffix [for]="rangePicker" />
        <mat-date-range-picker #rangePicker />
        <mat-hint>Na primer 01.11.2026. – 14.11.2026.</mat-hint>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Redosled</mat-label>
        <mat-select
          [value]="query().sort"
          (valueChange)="update({ sort: $event })"
          data-testid="sort"
        >
          @for (sort of sorts; track sort.value) {
            <mat-option [value]="sort.value">{{ sort.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>
    @if (filtered()) {
      <button
        matButton
        type="button"
        class="mb-2"
        (click)="clearFilters()"
        data-testid="clear-filters"
      >
        Poništi pretragu i period
      </button>
    }

    <div class="max-w-6xl">
      @switch (state().status) {
        @case ('loading') {
          <ui-loading-state label="Učitavanje porudžbina…" />
        }
        @case ('error') {
          <ui-error-state
            title="Porudžbine nisu učitane"
            [message]="errorMessage()"
            (retry)="reload()"
          />
        }
        @default {
          @if (items().length === 0) {
            @if (filtered()) {
              <ui-empty-state
                title="Nema porudžbina za ovu pretragu"
                description="Promenite pretragu ili period."
              >
                <button matButton="outlined" type="button" (click)="clearFilters()">
                  Poništi filtere
                </button>
              </ui-empty-state>
            } @else if (query().view === 'open') {
              <ui-empty-state
                title="Nema porudžbina za obradu"
                description="Sve porudžbine su obrađene. Nove će se pojaviti ovde čim stignu."
              >
                <a matButton="outlined" routerLink="/porudzbine" [queryParams]="{ status: 'all' }"
                  >Prikaži sve porudžbine</a
                >
              </ui-empty-state>
            } @else {
              <ui-empty-state title="Nema porudžbina sa ovim statusom" />
            }
          } @else {
            <ul class="flex flex-col gap-2" aria-label="Porudžbine">
              @for (order of items(); track order.id) {
                <li data-testid="order-row">
                  <a
                    [routerLink]="['/porudzbine', order.id]"
                    class="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-cream-200 bg-white p-3 text-ink-900 no-underline hover:border-olive-400 hover:shadow-soft"
                  >
                    <div class="min-w-0 flex-1 basis-56">
                      <p class="flex flex-wrap items-center gap-2">
                        <span class="font-semibold" data-testid="order-number">{{
                          order.orderNumber
                        }}</span>
                        <adm-order-status-badge [status]="order.status" />
                        @if (order.status === 'Delivered') {
                          @if (order.isPaymentCollected) {
                            <ui-badge tone="success" data-testid="collected">Naplaćeno</ui-badge>
                          } @else {
                            <ui-badge tone="warning" data-testid="not-collected"
                              >Čeka naplatu</ui-badge
                            >
                          }
                        }
                      </p>
                      <p class="mt-0.5 text-sm text-ink-700">
                        {{ order.customerName }} · {{ order.city }}
                      </p>
                    </div>
                    <div class="text-sm text-ink-700">
                      <p>{{ order.placedAt | srDate: 'dateTime' }}</p>
                      <p>{{ itemsText(order) }}</p>
                    </div>
                    <p class="w-28 text-right text-lg font-semibold" data-testid="order-total">
                      {{ order.total | rsd }}
                    </p>
                  </a>
                </li>
              }
            </ul>
          }
          @if (total() > 0) {
            <mat-paginator
              class="mt-4 bg-transparent"
              [length]="total()"
              [pageIndex]="query().page - 1"
              [pageSize]="query().pageSize"
              [pageSizeOptions]="pageSizes"
              (page)="pageChanged($event)"
            />
          }
        }
      }
    </div>
  `,
})
export class OrdersPage {
  private readonly api = inject(OrdersApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly summaryStore = inject(OrderSummaryStore);

  protected readonly views = ORDER_VIEWS;
  protected readonly viewLabels = VIEW_LABELS;
  protected readonly sorts = ORDER_SORTS;
  protected readonly pageSizes = [...PAGE_SIZE_OPTIONS];

  readonly query = toSignal(this.route.queryParams.pipe(map(parseOrdersQuery)), {
    initialValue: parseOrdersQuery(this.route.snapshot.queryParams),
  });
  protected readonly filtered = computed(
    () => this.query().q !== '' || this.query().from !== '' || this.query().to !== '',
  );
  protected readonly searchText = signal(this.query().q);
  protected readonly state = signal<ListState>({ status: 'loading' });
  protected readonly items = computed(() => {
    const state = this.state();
    return state.status === 'loaded' ? state.page.items : [];
  });
  protected readonly total = computed(() => {
    const state = this.state();
    return state.status === 'loaded' ? state.page.totalItems : 0;
  });

  readonly range = new FormGroup({
    start: new FormControl<Date | null>(fromIsoDate(this.query().from)),
    end: new FormControl<Date | null>(fromIsoDate(this.query().to)),
  });

  private readonly searches = new Subject<string>();

  constructor() {
    this.route.queryParams
      .pipe(
        map(parseOrdersQuery),
        tap((query) => {
          if (this.searchText().trim() !== query.q) {
            this.searchText.set(query.q);
          }
          if (
            toIsoDate(this.range.value.start) !== query.from ||
            toIsoDate(this.range.value.end) !== query.to
          ) {
            this.range.setValue(
              { start: fromIsoDate(query.from), end: fromIsoDate(query.to) },
              { emitEvent: false },
            );
          }
        }),
        switchMap((query) => {
          this.state.set({ status: 'loading' });
          return this.api.list(toOrdersApiQuery(query)).pipe(
            map((page): ListState => ({ status: 'loaded', page })),
            catchError((error: unknown) =>
              of<ListState>({ status: 'error', error: asApiError(error) }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.state.set(state));

    this.searches
      .pipe(
        debounceTime(400),
        map((text) => text.trim()),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((q) => {
        if (q !== this.query().q) {
          this.update({ q }, true);
        }
      });

    this.range.valueChanges.pipe(takeUntilDestroyed()).subscribe(({ start, end }) => {
      // A range is applied when both ends are chosen, and removed when both are cleared.
      if ((start && end) || (!start && !end)) {
        const from = toIsoDate(start);
        const to = toIsoDate(end);
        if (from !== this.query().from || to !== this.query().to) {
          this.update({ from, to });
        }
      }
    });
  }

  protected countFor(view: OrderView): number | null {
    const summary = this.summaryStore.summary();
    if (!summary) {
      return null;
    }
    if (view === 'all') {
      return summary.total || null;
    }
    return (view === 'open' ? openCount(summary) : countOf(summary, view)) || null;
  }

  protected viewParams(view: OrderView): Record<string, string | null> {
    return ordersQueryParams({ ...this.query(), view, page: 1 });
  }

  protected itemsText(order: AdminOrderListItem): string {
    return `${itemsLabel(order.itemCount)}, ${order.totalQuantity} kom.`;
  }

  protected errorMessage(): string {
    const state = this.state();
    return state.status === 'error' ? state.error.detail : '';
  }

  protected search(text: string): void {
    this.searchText.set(text);
    this.searches.next(text);
  }

  update(changes: Partial<OrdersListQuery>, replaceUrl = false): void {
    const next: OrdersListQuery = { ...this.query(), page: 1, ...changes };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: ordersQueryParams(next),
      replaceUrl,
    });
  }

  protected pageChanged(event: PageEvent): void {
    this.update({ page: event.pageIndex + 1, pageSize: event.pageSize });
  }

  protected clearFilters(): void {
    this.searchText.set('');
    this.range.setValue({ start: null, end: null }, { emitEvent: false });
    this.update({ q: '', from: '', to: '' });
  }

  protected reload(): void {
    this.state.set({ status: 'loading' });
    this.summaryStore.refresh(true);
    this.api
      .list(toOrdersApiQuery(this.query()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => this.state.set({ status: 'loaded', page }),
        error: (error: unknown) => this.state.set({ status: 'error', error: asApiError(error) }),
      });
  }
}
