import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError, asApiError } from '@zladovce/api';
import { InventoryItem, Paged } from '@zladovce/models';
import { INVENTORY_SORTS, STOCK_STATUS_LABELS, STOCK_STATUS_TONES } from '@zladovce/shared';
import { UiBadge, UiEmptyState, UiErrorState, UiLoadingState } from '@zladovce/ui';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  of,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { InventoryApi } from '../../data/inventory-api';
import { SERBIAN_PAGINATOR } from '../../shared/paginator-intl';
import { PAGE_SIZE_OPTIONS } from '../../shared/list-query';
import { AdjustStockDialog } from './adjust-stock.dialog';
import {
  InventoryListQuery,
  inventoryQueryParams,
  parseInventoryQuery,
  toInventoryApiQuery,
} from './inventory-query';
import { MovementsDialog } from './movements.dialog';
import { ThresholdDialog } from './threshold.dialog';

type ListState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; page: Paged<InventoryItem> };

const DIALOG = {
  width: '34rem',
  maxWidth: 'calc(100vw - 2rem)',
  autoFocus: 'first-tabbable',
} as const;

/**
 * Zalihe: every package with its stock, low-stock threshold and status. Stock changes only
 * through "Promeni stanje" (with a reason); every change is listed in "Istorija".
 */
@Component({
  selector: 'adm-inventory-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatPaginatorModule,
    UiBadge,
    UiLoadingState,
    UiErrorState,
    UiEmptyState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SERBIAN_PAGINATOR],
  template: `
    <h1 class="text-3xl">Zalihe</h1>
    <p class="mt-2 max-w-2xl text-ink-700">
      Stanje svakog pakovanja. Kada stigne nova proizvodnja ili se nešto ošteti, izaberite „Promeni
      stanje“ i upišite razlog – svaka promena se pamti u istoriji.
    </p>

    <div class="mt-6 grid max-w-6xl gap-x-4 sm:grid-cols-2 lg:grid-cols-4" role="search">
      <mat-form-field appearance="outline" class="sm:col-span-2">
        <mat-label>Pretraga po proizvodu, pakovanju ili šifri</mat-label>
        <input
          matInput
          type="search"
          data-testid="search"
          [value]="searchText()"
          (input)="search($any($event.target).value)"
        />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Stanje</mat-label>
        <mat-select
          data-testid="status-filter"
          [value]="query().status ?? ''"
          (valueChange)="update({ status: $event || undefined })"
        >
          <mat-option value="">Sva pakovanja</mat-option>
          <mat-option value="ok">{{ stockLabels.ok }}</mat-option>
          <mat-option value="low">{{ stockLabels.low }}</mat-option>
          <mat-option value="out">{{ stockLabels.out }}</mat-option>
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Redosled</mat-label>
        <mat-select [value]="query().sort" (valueChange)="update({ sort: $event })">
          @for (sort of sorts; track sort.value) {
            <mat-option [value]="sort.value">{{ sort.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>

    <div class="max-w-6xl">
      @switch (state().status) {
        @case ('loading') {
          <ui-loading-state label="Učitavanje zaliha…" />
        }
        @case ('error') {
          <ui-error-state
            title="Zalihe nisu učitane"
            [message]="errorMessage()"
            (retry)="reload()"
          />
        }
        @default {
          @if (items().length === 0) {
            @if (filtered()) {
              <ui-empty-state
                title="Nema pakovanja za izabrane filtere"
                description="Promenite pretragu ili izaberite „Sva pakovanja“."
              >
                <button matButton="outlined" type="button" (click)="clearFilters()">
                  Poništi filtere
                </button>
              </ui-empty-state>
            } @else {
              <ui-empty-state
                title="Još nema pakovanja na zalihama"
                description="Zalihe se pojavljuju čim dodate proizvod sa pakovanjima."
              >
                <a matButton="filled" routerLink="/proizvodi/novi">Novi proizvod</a>
              </ui-empty-state>
            }
          } @else {
            <ul class="flex flex-col gap-2" aria-label="Zalihe po pakovanjima">
              @for (item of items(); track item.variantId) {
                <li
                  class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-cream-200 bg-white p-3"
                  data-testid="inventory-row"
                >
                  <div class="min-w-0 flex-1 basis-56">
                    <a
                      class="font-semibold text-ink-900 underline-offset-4 hover:underline"
                      [routerLink]="['/proizvodi', item.productId]"
                      >{{ item.productName }}</a
                    >
                    <p class="text-sm text-ink-700">{{ item.variantName }} · {{ item.sku }}</p>
                    <div class="mt-1 flex flex-wrap gap-1.5">
                      <ui-badge [tone]="stockTones[item.status]">{{
                        stockLabels[item.status]
                      }}</ui-badge>
                      @if (!item.isActive) {
                        <ui-badge>Nije u prodaji</ui-badge>
                      }
                    </div>
                  </div>
                  <div class="text-center">
                    <p class="text-2xl font-semibold text-ink-900" data-testid="quantity">
                      {{ item.quantityOnHand }}
                    </p>
                    <p class="text-xs text-ink-500">na stanju</p>
                  </div>
                  <div class="text-center">
                    <p class="text-lg text-ink-900">{{ item.lowStockThreshold }}</p>
                    <p class="text-xs text-ink-500">upozorenje</p>
                  </div>
                  <div class="flex w-full flex-wrap gap-1 sm:w-auto">
                    <button
                      matButton="filled"
                      type="button"
                      data-testid="adjust"
                      (click)="adjust(item)"
                    >
                      Promeni stanje
                    </button>
                    <button matButton type="button" (click)="threshold(item)">Upozorenje</button>
                    <button matButton type="button" data-testid="history" (click)="history(item)">
                      Istorija
                    </button>
                  </div>
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
export class InventoryPage {
  private readonly api = inject(InventoryApi);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sorts = INVENTORY_SORTS;
  protected readonly stockLabels = STOCK_STATUS_LABELS;
  protected readonly stockTones = STOCK_STATUS_TONES;
  protected readonly pageSizes = [...PAGE_SIZE_OPTIONS];

  readonly query = toSignal(this.route.queryParams.pipe(map(parseInventoryQuery)), {
    initialValue: parseInventoryQuery(this.route.snapshot.queryParams),
  });
  protected readonly filtered = computed(() => this.query().q !== '' || !!this.query().status);
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

  private readonly searches = new Subject<string>();

  constructor() {
    this.route.queryParams
      .pipe(
        map(parseInventoryQuery),
        tap((query) => {
          if (this.searchText().trim() !== query.q) {
            this.searchText.set(query.q);
          }
        }),
        switchMap((query) => {
          this.state.set({ status: 'loading' });
          return this.api.list(toInventoryApiQuery(query)).pipe(
            map((page): ListState => ({ status: 'loaded', page })),
            catchError((error: unknown) =>
              of<ListState>({ status: 'error', error: asApiError(error) }),
            ),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => this.state.set(state));

    this.searches
      .pipe(
        debounceTime(400),
        map((text) => text.trim()),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((q) => {
        if (q !== this.query().q) {
          this.update({ q }, true);
        }
      });
  }

  protected errorMessage(): string {
    const state = this.state();
    return state.status === 'error' ? state.error.detail : '';
  }

  protected search(text: string): void {
    this.searchText.set(text);
    this.searches.next(text);
  }

  update(changes: Partial<InventoryListQuery>, replaceUrl = false): void {
    const next: InventoryListQuery = { ...this.query(), page: 1, ...changes };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: inventoryQueryParams(next),
      replaceUrl,
    });
  }

  protected pageChanged(event: PageEvent): void {
    this.update({ page: event.pageIndex + 1, pageSize: event.pageSize });
  }

  protected clearFilters(): void {
    this.searchText.set('');
    this.update({ q: '', status: undefined });
  }

  protected reload(): void {
    this.state.set({ status: 'loading' });
    this.api
      .list(toInventoryApiQuery(this.query()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => this.state.set({ status: 'loaded', page }),
        error: (error: unknown) => this.state.set({ status: 'error', error: asApiError(error) }),
      });
  }

  protected adjust(item: InventoryItem): void {
    this.dialog
      .open<AdjustStockDialog, InventoryItem, InventoryItem>(AdjustStockDialog, {
        ...DIALOG,
        data: item,
      })
      .afterClosed()
      .pipe(filter((updated): updated is InventoryItem => !!updated))
      .subscribe((updated) => {
        this.replace(updated);
        this.snackBar.open(
          `Stanje je promenjeno: ${updated.productName} – ${updated.variantName}, sada ${updated.quantityOnHand}.`,
          'U redu',
          { duration: 5000 },
        );
      });
  }

  protected threshold(item: InventoryItem): void {
    this.dialog
      .open<ThresholdDialog, InventoryItem, InventoryItem>(ThresholdDialog, {
        ...DIALOG,
        data: item,
      })
      .afterClosed()
      .pipe(filter((updated): updated is InventoryItem => !!updated))
      .subscribe((updated) => {
        this.replace(updated);
        this.snackBar.open('Upozorenje je sačuvano.', 'U redu', { duration: 4000 });
      });
  }

  protected history(item: InventoryItem): void {
    this.dialog.open(MovementsDialog, { ...DIALOG, width: '40rem', data: item });
  }

  /** Puts an updated row in place (the list keeps its order until the next load). */
  private replace(updated: InventoryItem): void {
    this.state.update((state) =>
      state.status === 'loaded'
        ? {
            ...state,
            page: {
              ...state.page,
              items: state.page.items.map((i) => (i.variantId === updated.variantId ? updated : i)),
            },
          }
        : state,
    );
  }
}
