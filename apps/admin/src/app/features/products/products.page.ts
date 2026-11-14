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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError, asApiError } from '@zladovce/api';
import { AdminCategory, AdminProductListItem, Paged, ProductImage } from '@zladovce/models';
import { ADMIN_PRODUCT_SORTS, STOCK_STATUS_LABELS, STOCK_STATUS_TONES } from '@zladovce/shared';
import { UiBadge, UiEmptyState, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { formatRsd } from '@zladovce/utilities';
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
import { CategoriesApi } from '../../data/categories-api';
import { ProductsApi } from '../../data/products-api';
import { imageSrc } from '../../shared/images';
import { PAGE_SIZE_OPTIONS } from '../../shared/list-query';
import { SERBIAN_PAGINATOR } from '../../shared/paginator-intl';
import {
  hasProductFilters,
  parseProductQuery,
  ProductListQuery,
  productQueryParams,
  toApiQuery,
} from './products-query';

type ListState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; page: Paged<AdminProductListItem> };

/** "od 650 RSD" when the packages have different prices. */
export function priceLabel(
  item: Pick<AdminProductListItem, 'priceFrom' | 'hasPriceRange'>,
): string {
  if (item.priceFrom === null) {
    return '—';
  }
  return item.hasPriceRange ? `od ${formatRsd(item.priceFrom)}` : formatRsd(item.priceFrom);
}

function variantCountLabel(count: number): string {
  return count % 10 === 1 && count % 100 !== 11 ? `${count} pakovanje` : `${count} pakovanja`;
}

/**
 * Proizvodi: search, filters (category, sale status, archived), sort and paging. All filters live
 * in the address (query parameters), so Back, refresh and shared links keep them.
 */
@Component({
  selector: 'adm-products-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
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
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-3xl">Proizvodi</h1>
      <a matButton="filled" routerLink="/proizvodi/novi">Novi proizvod</a>
    </div>

    <div class="mt-6 grid max-w-6xl gap-x-4 sm:grid-cols-2 lg:grid-cols-4" role="search">
      <mat-form-field appearance="outline" class="sm:col-span-2">
        <mat-label>Pretraga po nazivu ili šifri</mat-label>
        <input
          matInput
          type="search"
          data-testid="search"
          [value]="searchText()"
          (input)="search($any($event.target).value)"
        />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Kategorija</mat-label>
        <mat-select
          data-testid="category-filter"
          [value]="query().category ?? ''"
          (valueChange)="update({ category: $event || undefined })"
        >
          <mat-option value="">Sve kategorije</mat-option>
          @for (category of categories(); track category.id) {
            <mat-option [value]="category.id">{{ category.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Prodaja</mat-label>
        <mat-select
          data-testid="status-filter"
          [value]="query().status ?? ''"
          (valueChange)="update({ status: $event || undefined })"
        >
          <mat-option value="">Svi proizvodi</mat-option>
          <mat-option value="active">U prodaji</mat-option>
          <mat-option value="inactive">Nisu u prodaji</mat-option>
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
      <div class="flex items-center gap-4 pb-4 sm:col-span-2 lg:col-span-3">
        <mat-checkbox
          data-testid="archived-filter"
          [checked]="query().archived"
          (change)="update({ archived: $event.checked })"
        >
          Prikaži samo arhivirane
        </mat-checkbox>
        @if (filtered()) {
          <button matButton type="button" (click)="clearFilters()">Poništi filtere</button>
        }
      </div>
    </div>

    <div class="max-w-6xl">
      @switch (state().status) {
        @case ('loading') {
          <ui-loading-state label="Učitavanje proizvoda…" />
        }
        @case ('error') {
          <ui-error-state
            title="Proizvodi nisu učitani"
            [message]="errorMessage()"
            (retry)="reload()"
          />
        }
        @default {
          @if (items().length === 0) {
            @if (filtered()) {
              <ui-empty-state
                title="Nema proizvoda za izabrane filtere"
                description="Promenite pretragu ili poništite filtere."
              >
                <button matButton="outlined" type="button" (click)="clearFilters()">
                  Poništi filtere
                </button>
              </ui-empty-state>
            } @else {
              <ui-empty-state
                title="Još nema proizvoda"
                description="Dodajte prvi proizvod: naziv, opis, pakovanja sa cenama i fotografije."
              >
                <a matButton="filled" routerLink="/proizvodi/novi">Novi proizvod</a>
              </ui-empty-state>
            }
          } @else {
            <ul class="flex flex-col gap-2" aria-label="Proizvodi">
              @for (item of items(); track item.id) {
                <li data-testid="product-row">
                  <a
                    [routerLink]="['/proizvodi', item.id]"
                    class="flex flex-wrap items-center gap-3 rounded-lg border border-cream-200 bg-white p-3 hover:border-olive-400 sm:flex-nowrap"
                  >
                    @if (item.mainImage; as image) {
                      <img
                        [src]="thumb(image)"
                        alt=""
                        class="size-16 shrink-0 rounded-md bg-cream-100 object-cover"
                        loading="lazy"
                      />
                    } @else {
                      <div
                        class="flex size-16 shrink-0 items-center justify-center rounded-md bg-cream-100 text-center text-xs text-ink-500"
                      >
                        Bez slike
                      </div>
                    }
                    <div class="min-w-0 flex-1">
                      <p class="font-semibold text-ink-900">{{ item.name }}</p>
                      <p class="text-sm text-ink-500">
                        {{ item.category.name }} · {{ item.sku }} ·
                        {{ variants(item.variantCount) }}
                      </p>
                      <div class="mt-1 flex flex-wrap gap-1.5">
                        @if (item.isArchived) {
                          <ui-badge tone="warning">Arhiviran</ui-badge>
                        } @else if (item.isActive) {
                          <ui-badge tone="success">U prodaji</ui-badge>
                        } @else {
                          <ui-badge>Nije u prodaji</ui-badge>
                        }
                        @if (item.isFeatured) {
                          <ui-badge tone="info">Istaknut</ui-badge>
                        }
                        <ui-badge [tone]="stockTones[item.stockStatus]">{{
                          stockLabels[item.stockStatus]
                        }}</ui-badge>
                      </div>
                    </div>
                    <div class="w-full text-left sm:w-auto sm:text-right">
                      <p class="font-semibold text-ink-900" data-testid="price">
                        {{ price(item) }}
                      </p>
                      <p class="text-sm text-ink-500">Zaliha: {{ item.totalStock }}</p>
                    </div>
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
export class ProductsPage {
  private readonly api = inject(ProductsApi);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sorts = ADMIN_PRODUCT_SORTS;
  protected readonly stockLabels = STOCK_STATUS_LABELS;
  protected readonly stockTones = STOCK_STATUS_TONES;
  protected readonly pageSizes = [...PAGE_SIZE_OPTIONS];
  protected readonly price = priceLabel;
  protected readonly variants = variantCountLabel;

  /** Filters as they are in the URL. */
  readonly query = toSignal(this.route.queryParams.pipe(map(parseProductQuery)), {
    initialValue: parseProductQuery(this.route.snapshot.queryParams),
  });
  protected readonly filtered = computed(() => hasProductFilters(this.query()));
  protected readonly searchText = signal(this.query().q);
  protected readonly categories = signal<AdminCategory[]>([]);
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
    this.categoriesApi
      .list()
      .pipe(
        catchError(() => of([])), // the filter is optional; the list still works without it
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((categories) => this.categories.set(categories));

    // Data: reloaded on every change of the URL query (filters, Back, refresh).
    this.route.queryParams
      .pipe(
        map(parseProductQuery),
        tap((query) => {
          // Back/forward or "Poništi filtere"; text still being typed is left alone.
          if (this.searchText().trim() !== query.q) {
            this.searchText.set(query.q);
          }
        }),
        switchMap((query) => {
          this.state.set({ status: 'loading' });
          return this.api.list(toApiQuery(query)).pipe(
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

  protected thumb(image: ProductImage): string {
    return imageSrc(image, 160);
  }

  protected search(text: string): void {
    this.searchText.set(text);
    this.searches.next(text);
  }

  /** Changes filters (back to page 1 unless the page itself changes) and writes them to the URL. */
  update(changes: Partial<ProductListQuery>, replaceUrl = false): void {
    const next: ProductListQuery = { ...this.query(), page: 1, ...changes };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: productQueryParams(next),
      replaceUrl,
    });
  }

  protected pageChanged(event: PageEvent): void {
    this.update({ page: event.pageIndex + 1, pageSize: event.pageSize });
  }

  protected clearFilters(): void {
    this.searchText.set('');
    this.update({ q: '', category: undefined, status: undefined, archived: false });
  }

  protected reload(): void {
    this.state.set({ status: 'loading' });
    this.api
      .list(toApiQuery(this.query()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => this.state.set({ status: 'loaded', page }),
        error: (error: unknown) => this.state.set({ status: 'error', error: asApiError(error) }),
      });
  }
}
