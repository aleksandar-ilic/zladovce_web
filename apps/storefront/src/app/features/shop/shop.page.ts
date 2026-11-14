import { A11yModule } from '@angular/cdk/a11y';
import { DOCUMENT, isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  PLATFORM_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { asApiError } from '@zladovce/api';
import { Paged, PublicCategoryDetail, PublicProductListItem } from '@zladovce/models';
import { UiButton, UiEmptyState, UiErrorState, UiLoadingState } from '@zladovce/ui';
import {
  catchError,
  combineLatest,
  concat,
  debounceTime,
  distinctUntilChanged,
  EMPTY,
  map,
  Observable,
  of,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { CatalogApi } from '../../core/data/catalog-api';
import { CategoriesStore } from '../../core/data/categories-store';
import { LOADING, Remote } from '../../core/data/remote';
import { SeoService, SHOP_DESCRIPTION, SITE_NAME } from '../../core/seo';
import { SITE_URL } from '../../core/site-url';
import { breadcrumbJsonLd, Crumb, shareImageUrl, truncate } from '../../core/structured-data';
import { Breadcrumbs } from '../../shared/breadcrumbs';
import { ProductCard } from '../../shared/product-card';
import { ProductImage } from '../../shared/product-image';
import {
  activeFilterCount,
  EMPTY_SHOP_QUERY,
  pageWindow,
  parseShopQuery,
  productCountLabel,
  SHOP_SORTS,
  ShopQuery,
  shopLinkParams,
  shopQueryParams,
  ShopSort,
  toCatalogQuery,
  withChange,
} from './shop-query';

type ProductsState = Remote<Paged<PublicProductListItem>>;
type CategoryState = Remote<PublicCategoryDetail> | null;

/**
 * Shop (`/prodavnica`) and category page (`/prodavnica/:categorySlug`): one product grid with
 * search, category, price range, "na stanju", sort and paging. Every filter lives in the URL
 * (shareable; Back and refresh keep it). Small screens get the filters in a drawer.
 *
 * Prerendered: the build-time list is shown first, then the browser reloads it once without
 * the transfer cache so price and availability are current.
 */
@Component({
  selector: 'sf-shop-page',
  imports: [
    RouterLink,
    A11yModule,
    NgTemplateOutlet,
    Breadcrumbs,
    ProductCard,
    ProductImage,
    UiButton,
    UiEmptyState,
    UiErrorState,
    UiLoadingState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Page header -->
    <section class="border-b border-cream-200 bg-cream-100">
      <div class="mx-auto max-w-page px-gutter pb-10 pt-8 md:pb-14 md:pt-10">
        <sf-breadcrumbs [crumbs]="crumbs()" />
        @switch (headerKind()) {
          @case ('notFound') {
            <h1 class="mt-6 text-3xl md:text-4xl">Kategorija nije pronađena</h1>
            <p class="mt-4 max-w-prose text-lg text-ink-700">
              Kategorija koju tražite ne postoji ili trenutno nije u ponudi.
            </p>
            <a uiButton variant="secondary" class="mt-6" routerLink="/prodavnica"
              >Pogledajte celu ponudu</a
            >
          }
          @case ('category') {
            @let c = categoryData()!;
            <div
              [class]="c.image ? 'mt-6 grid items-center gap-8 md:grid-cols-[1fr_20rem]' : 'mt-6'"
            >
              <div>
                <p class="eyebrow">Kategorija</p>
                <h1 class="mt-3 text-4xl md:text-5xl" data-testid="page-title">{{ c.name }}</h1>
                @if (c.description) {
                  <p class="mt-4 max-w-prose text-lg text-ink-700">{{ c.description }}</p>
                }
              </div>
              @if (c.image) {
                <sf-product-image
                  class="hidden aspect-[4/3] rounded-lg md:block"
                  [image]="c.image"
                  [alt]="c.image.altText || c.name"
                  sizes="20rem"
                  priority
                />
              }
            </div>
          }
          @case ('categoryLoading') {
            <p class="eyebrow mt-6">Kategorija</p>
            <h1 class="mt-3 text-4xl md:text-5xl">&nbsp;</h1>
          }
          @default {
            <h1 class="mt-6 text-4xl md:text-5xl" data-testid="page-title">Prodavnica</h1>
            <p class="mt-4 max-w-prose text-lg text-ink-700">
              Domaći džemovi, voćni sokovi, sirće i kompoti iz porodične kuhinje. Izaberite proizvod
              i pakovanje, a porudžbinu plaćate pouzećem.
            </p>
          }
        }
      </div>
    </section>

    @if (headerKind() !== 'notFound') {
      <div class="mx-auto max-w-page px-gutter py-10 md:py-14">
        <div class="lg:grid lg:grid-cols-[15rem_1fr] lg:gap-12">
          <!-- Desktop filters -->
          <aside class="hidden lg:block" aria-label="Filteri">
            <ng-container *ngTemplateOutlet="filtersTemplate; context: { $implicit: 'd' }" />
          </aside>

          <div class="min-w-0">
            <!-- Toolbar -->
            <div class="flex flex-wrap items-end justify-between gap-4">
              <p class="text-sm text-ink-700" aria-live="polite" data-testid="result-count">
                {{ countText() }}
              </p>
              <div class="flex w-full items-end gap-3 sm:w-auto">
                <button
                  #filtersButton
                  uiButton
                  type="button"
                  variant="secondary"
                  class="flex-1 lg:hidden"
                  aria-haspopup="dialog"
                  aria-controls="sf-filter-drawer"
                  [attr.aria-expanded]="filtersOpen()"
                  (click)="filtersOpen.set(true)"
                  data-testid="open-filters"
                >
                  <svg
                    class="size-5"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    aria-hidden="true"
                  >
                    <path d="M3 5h14M6 10h8M8.5 15h3" />
                  </svg>
                  Filteri
                  @if (filterCount() > 0) {
                    <span class="rounded-full bg-olive-700 px-2 text-xs leading-5 text-white">{{
                      filterCount()
                    }}</span>
                  }
                </button>
                <div class="flex-1 sm:flex-none">
                  <label for="sf-sort" class="block text-sm font-semibold text-ink-900"
                    >Redosled</label
                  >
                  <select
                    id="sf-sort"
                    class="mt-1.5 block h-11 w-full rounded-md border border-sage-300 bg-white px-3 text-base text-ink-900 hover:border-sage-500 focus:outline-2 focus:outline-olive-700 sm:w-56"
                    [value]="query().sort"
                    (change)="setSort($any($event.target).value)"
                    data-testid="sort"
                  >
                    @for (sort of sorts; track sort.value) {
                      <option [value]="sort.value" [selected]="sort.value === query().sort">
                        {{ sort.label }}
                      </option>
                    }
                  </select>
                </div>
              </div>
            </div>

            <!-- Results -->
            <div class="mt-8" [attr.aria-busy]="refreshing() || products().status === 'loading'">
              @switch (products().status) {
                @case ('loading') {
                  <ui-loading-state label="Učitavanje proizvoda…" />
                }
                @case ('error') {
                  <ui-error-state
                    title="Proizvodi nisu učitani"
                    [message]="errorMessage()"
                    (retry)="retry()"
                  />
                }
                @default {
                  @if (page(); as page) {
                    @if (page.items.length === 0) {
                      @if (filterCount() > 0 || query().page > 1) {
                        <ui-empty-state
                          title="Nema proizvoda za izabrane filtere"
                          description="Pokušajte sa drugom pretragom ili poništite filtere."
                        >
                          <button uiButton type="button" variant="secondary" (click)="reset()">
                            Poništi filtere
                          </button>
                        </ui-empty-state>
                      } @else {
                        <ui-empty-state
                          title="Ponuda se priprema"
                          description="U ovoj kategoriji trenutno nema proizvoda. Pogledajte ostale kategorije ili svratite uskoro."
                        />
                      }
                    } @else {
                      <ul
                        class="grid gap-5 min-[480px]:grid-cols-2 md:gap-7 xl:grid-cols-3"
                        [class.opacity-60]="refreshing()"
                        data-testid="product-grid"
                      >
                        @for (product of page.items; track product.id; let i = $index) {
                          <li>
                            <sf-product-card [product]="product" [priority]="i < 3" />
                          </li>
                        }
                      </ul>

                      @if (page.totalPages > 1) {
                        <nav class="mt-12 flex justify-center" aria-label="Stranice">
                          <ul class="flex flex-wrap items-center gap-1.5">
                            <li>
                              @if (page.page > 1) {
                                <a
                                  [routerLink]="[]"
                                  [queryParams]="pageParams(page.page - 1)"
                                  class="inline-flex h-11 items-center rounded-md px-3 font-semibold text-olive-800 hover:bg-olive-50"
                                  rel="prev"
                                  >← Prethodna</a
                                >
                              }
                            </li>
                            @for (n of pages(); track $index) {
                              <li>
                                @if (n === null) {
                                  <span class="px-1 text-ink-500" aria-hidden="true">…</span>
                                } @else if (n === page.page) {
                                  <span
                                    class="inline-flex size-11 items-center justify-center rounded-md bg-olive-700 font-semibold text-white"
                                    aria-current="page"
                                    >{{ n }}</span
                                  >
                                } @else {
                                  <a
                                    [routerLink]="[]"
                                    [queryParams]="pageParams(n)"
                                    class="inline-flex size-11 items-center justify-center rounded-md font-semibold text-ink-700 hover:bg-olive-50"
                                    [attr.aria-label]="'Strana ' + n"
                                    >{{ n }}</a
                                  >
                                }
                              </li>
                            }
                            <li>
                              @if (page.page < page.totalPages) {
                                <a
                                  [routerLink]="[]"
                                  [queryParams]="pageParams(page.page + 1)"
                                  class="inline-flex h-11 items-center rounded-md px-3 font-semibold text-olive-800 hover:bg-olive-50"
                                  rel="next"
                                  >Sledeća →</a
                                >
                              }
                            </li>
                          </ul>
                        </nav>
                      }
                    }
                  }
                }
              }
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Mobile filter drawer -->
    @if (filtersOpen()) {
      <div class="fixed inset-0 z-50 lg:hidden">
        <div
          class="absolute inset-0 bg-olive-900/40"
          aria-hidden="true"
          (click)="closeFilters()"
        ></div>
        <div
          id="sf-filter-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sf-filter-title"
          class="absolute inset-y-0 left-0 flex w-[min(22rem,90vw)] flex-col bg-cream-50 shadow-overlay"
          cdkTrapFocus
          cdkTrapFocusAutoCapture
          (keydown.escape)="closeFilters()"
          data-testid="filter-drawer"
        >
          <div class="flex h-16 items-center justify-between border-b border-cream-200 px-gutter">
            <h2 id="sf-filter-title" class="text-2xl">Filteri</h2>
            <button
              type="button"
              class="inline-flex size-11 cursor-pointer items-center justify-center rounded-md text-olive-800 hover:bg-olive-100"
              aria-label="Zatvori filtere"
              cdkFocusInitial
              (click)="closeFilters()"
            >
              <svg
                class="size-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div class="flex-1 overflow-y-auto px-gutter py-6">
            <ng-container *ngTemplateOutlet="filtersTemplate; context: { $implicit: 'm' }" />
          </div>
          <div class="border-t border-cream-200 p-gutter">
            <button uiButton type="button" block (click)="closeFilters()">
              Prikaži {{ resultsLabel() }}
            </button>
          </div>
        </div>
      </div>
    }

    <ng-template #filtersTemplate let-prefix>
      <div class="flex flex-col gap-8">
        <div>
          <label [for]="prefix + '-q'" class="block text-sm font-semibold text-ink-900"
            >Pretraga</label
          >
          <input
            [id]="prefix + '-q'"
            type="search"
            class="mt-1.5 block h-11 w-full rounded-md border border-sage-300 bg-white px-3.5 text-base text-ink-900 placeholder:text-ink-500 hover:border-sage-500 focus:outline-2 focus:outline-olive-700"
            placeholder="Na primer: džem"
            autocomplete="off"
            [value]="searchText()"
            (input)="search($any($event.target).value)"
            (keydown.enter)="searchNow($any($event.target).value)"
            data-testid="search"
          />
        </div>

        <nav [attr.aria-label]="'Kategorije'">
          <h2 class="text-sm font-semibold font-sans tracking-normal text-ink-900">Kategorija</h2>
          <ul class="mt-2 flex flex-col">
            <li>
              <a
                routerLink="/prodavnica"
                [queryParams]="linkParams()"
                [attr.aria-current]="categorySlug() === null ? 'page' : null"
                [class]="categoryLinkClass(categorySlug() === null)"
                (click)="closeFilters(false)"
                >Sve kategorije</a
              >
            </li>
            @for (c of categories(); track c.id) {
              <li>
                <a
                  [routerLink]="['/prodavnica', c.slug]"
                  [queryParams]="linkParams()"
                  [attr.aria-current]="categorySlug() === c.slug ? 'page' : null"
                  [class]="categoryLinkClass(categorySlug() === c.slug)"
                  (click)="closeFilters(false)"
                  data-testid="category-filter"
                >
                  <span>{{ c.name }}</span>
                  <span class="text-xs text-ink-500">{{ c.productCount }}</span>
                </a>
              </li>
            }
          </ul>
        </nav>

        <fieldset>
          <legend class="text-sm font-semibold text-ink-900">Cena (RSD)</legend>
          <div class="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label [for]="prefix + '-min'" class="block text-xs text-ink-700">Od</label>
              <input
                [id]="prefix + '-min'"
                type="number"
                inputmode="numeric"
                min="0"
                step="10"
                class="mt-1 block h-11 w-full rounded-md border border-sage-300 bg-white px-3 text-base text-ink-900 hover:border-sage-500 focus:outline-2 focus:outline-olive-700"
                [value]="query().minPrice ?? ''"
                (change)="setPrice('minPrice', $any($event.target).value)"
                data-testid="min-price"
              />
            </div>
            <div>
              <label [for]="prefix + '-max'" class="block text-xs text-ink-700">Do</label>
              <input
                [id]="prefix + '-max'"
                type="number"
                inputmode="numeric"
                min="0"
                step="10"
                class="mt-1 block h-11 w-full rounded-md border border-sage-300 bg-white px-3 text-base text-ink-900 hover:border-sage-500 focus:outline-2 focus:outline-olive-700"
                [value]="query().maxPrice ?? ''"
                (change)="setPrice('maxPrice', $any($event.target).value)"
                data-testid="max-price"
              />
            </div>
          </div>
        </fieldset>

        <label class="flex cursor-pointer items-center gap-3 text-base text-ink-900">
          <input
            type="checkbox"
            class="size-5 cursor-pointer accent-olive-700"
            [checked]="query().inStock"
            (change)="setInStock($any($event.target).checked)"
            data-testid="in-stock"
          />
          Samo proizvodi na stanju
        </label>

        @if (filterCount() > 0) {
          <button
            uiButton
            type="button"
            variant="ghost"
            size="sm"
            class="self-start"
            (click)="reset()"
            data-testid="reset-filters"
          >
            Poništi filtere
          </button>
        }
      </div>
    </ng-template>
  `,
})
export class ShopPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CatalogApi);
  private readonly categoriesStore = inject(CategoriesStore);
  private readonly seo = inject(SeoService);
  private readonly siteUrl = inject(SITE_URL);
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly filtersButton = viewChild('filtersButton', {
    read: ElementRef<HTMLButtonElement>,
  });
  /** Rendered at build time and now hydrating: refresh the list once without the cache. */
  private readonly hydrating = this.browser && !this.router.navigated;
  private readonly searches = new Subject<string>();
  private readonly retries = new Subject<void>();

  protected readonly sorts = SHOP_SORTS;
  protected readonly categories = this.categoriesStore.categories;

  readonly categorySlug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('categorySlug'))),
    { initialValue: this.route.snapshot.paramMap.get('categorySlug') },
  );
  readonly query = toSignal(this.route.queryParams.pipe(map(parseShopQuery)), {
    initialValue: EMPTY_SHOP_QUERY,
  });

  protected readonly products = signal<ProductsState>(LOADING);
  protected readonly refreshing = signal(false);
  protected readonly category = signal<CategoryState>(null);
  protected readonly searchText = signal('');
  readonly filtersOpen = signal(false);

  protected readonly page = computed(() => {
    const state = this.products();
    return state.status === 'loaded' ? state.data : null;
  });
  protected readonly categoryData = computed(() => {
    const state = this.category();
    return state?.status === 'loaded' ? state.data : null;
  });
  protected readonly headerKind = computed(() => {
    if (this.categorySlug() === null) {
      return 'shop';
    }
    const state = this.category();
    if (state?.status === 'error' && state.error.isNotFound) {
      return 'notFound';
    }
    return state?.status === 'loaded' ? 'category' : 'categoryLoading';
  });
  protected readonly crumbs = computed<Crumb[]>(() => {
    const base: Crumb[] = [
      { name: 'Početna', path: '/' },
      { name: 'Prodavnica', path: '/prodavnica' },
    ];
    const slug = this.categorySlug();
    if (slug === null) {
      return base;
    }
    const name =
      this.categoryData()?.name ?? (this.headerKind() === 'notFound' ? 'Nije pronađena' : '…');
    return [...base, { name, path: `/prodavnica/${slug}` }];
  });
  protected readonly filterCount = computed(() =>
    activeFilterCount(this.query(), this.categorySlug()),
  );
  protected readonly countText = computed(() => {
    const page = this.page();
    if (!page) {
      return '';
    }
    return page.totalItems === 0 ? 'Nema proizvoda' : productCountLabel(page.totalItems);
  });
  protected readonly resultsLabel = computed(() => {
    const page = this.page();
    return page ? productCountLabel(page.totalItems) : 'proizvode';
  });
  protected readonly pages = computed(() => {
    const page = this.page();
    return page ? pageWindow(page.page, page.totalPages) : [];
  });
  protected readonly linkParams = computed(() => shopLinkParams(withChange(this.query(), {})));
  protected readonly errorMessage = computed(() => {
    const state = this.products();
    return state.status === 'error' ? state.error.detail : '';
  });

  constructor() {
    this.categoriesStore.ensureLoaded();

    combineLatest([this.route.paramMap, this.route.queryParams, this.retriesWithStart()])
      .pipe(
        map(([params, query]) => ({
          slug: params.get('categorySlug'),
          query: parseShopQuery(query),
        })),
        tap(() => {
          if (this.products().status === 'loaded') {
            this.refreshing.set(true);
          } else {
            this.products.set(LOADING);
          }
        }),
        switchMap(({ slug, query }, index) => this.loadProducts(slug, query, index === 0)),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.products.set(state);
        this.refreshing.set(false);
      });

    this.route.paramMap
      .pipe(
        map((params) => params.get('categorySlug')),
        distinctUntilChanged(),
        switchMap((slug) => (slug === null ? of(null) : this.loadCategory(slug))),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.category.set(state);
        this.updateSeo();
      });

    this.searches
      .pipe(
        debounceTime(400),
        map((text) => text.trim()),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((q) => {
        if (q !== this.query().q) {
          this.navigate(withChange(this.query(), { q }), true);
        }
      });

    // Keep the search box in line with the URL (Back, links, "Poništi filtere").
    effect(() => {
      const q = this.query().q;
      untracked(() => this.searchText.set(q));
    });

    // The page behind the open drawer must not scroll.
    effect(() => {
      const open = this.filtersOpen();
      if (this.browser) {
        this.document.body.style.overflow = open ? 'hidden' : '';
      }
    });
  }

  protected search(text: string): void {
    this.searchText.set(text);
    this.searches.next(text);
  }

  protected searchNow(text: string): void {
    const q = text.trim();
    if (q !== this.query().q) {
      this.navigate(withChange(this.query(), { q }));
    }
  }

  protected setSort(sort: string): void {
    this.navigate(withChange(this.query(), { sort: sort as ShopSort }));
  }

  protected setPrice(key: 'minPrice' | 'maxPrice', raw: string): void {
    const value = raw.trim() === '' ? null : Number(raw);
    const next = value === null || !Number.isFinite(value) || value < 0 ? null : Math.round(value);
    // Parsing the result normalises it (swaps min/max when needed).
    const query = parseShopQuery(shopLinkParams(withChange(this.query(), { [key]: next })));
    this.navigate(query);
  }

  protected setInStock(inStock: boolean): void {
    this.navigate(withChange(this.query(), { inStock }));
  }

  protected reset(): void {
    const sort = this.query().sort;
    void this.router.navigate(['/prodavnica'], {
      queryParams: shopLinkParams({ ...EMPTY_SHOP_QUERY, sort }),
    });
  }

  protected pageParams(page: number): Params {
    return shopLinkParams({ ...this.query(), page });
  }

  protected retry(): void {
    this.retries.next();
  }

  protected closeFilters(returnFocus = true): void {
    if (!this.filtersOpen()) {
      return;
    }
    this.filtersOpen.set(false);
    if (returnFocus) {
      this.filtersButton()?.nativeElement.focus();
    }
  }

  protected categoryLinkClass(active: boolean): string {
    return `flex items-center justify-between gap-3 rounded-md px-3 py-2 text-base ${
      active
        ? 'bg-olive-100 font-semibold text-olive-900'
        : 'text-ink-700 hover:bg-olive-50 hover:text-olive-900'
    }`;
  }

  private navigate(query: ShopQuery, replaceUrl = false): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: shopQueryParams(query),
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }

  private retriesWithStart(): Observable<void> {
    return concat(of(undefined), this.retries);
  }

  private loadProducts(
    slug: string | null,
    query: ShopQuery,
    first: boolean,
  ): Observable<ProductsState> {
    const catalogQuery = toCatalogQuery(query, slug);
    const cached = this.api.products(catalogQuery);
    const request =
      first && this.hydrating
        ? concat(
            cached,
            this.api.products(catalogQuery, { fresh: true }).pipe(catchError(() => EMPTY)),
          )
        : cached;
    return request.pipe(
      map((data): ProductsState => ({ status: 'loaded', data })),
      catchError((error: unknown) =>
        // At build time an error keeps the loading state; the browser loads the list itself.
        of<ProductsState>(this.browser ? { status: 'error', error: asApiError(error) } : LOADING),
      ),
    );
  }

  private loadCategory(slug: string): Observable<CategoryState> {
    return concat(
      of<CategoryState>(LOADING),
      this.api.category(slug).pipe(
        map((data): CategoryState => ({ status: 'loaded', data })),
        catchError((error: unknown) =>
          of<CategoryState>({ status: 'error', error: asApiError(error) }),
        ),
      ),
    );
  }

  private updateSeo(): void {
    const slug = this.categorySlug();
    const state = this.category();
    if (slug === null || !state || state.status === 'loading') {
      return;
    }
    if (state.status === 'error') {
      this.seo.setPage({
        title: `Kategorija nije pronađena – ${SITE_NAME}`,
        path: `/prodavnica/${slug}`,
        noindex: true,
      });
      return;
    }
    const category = state.data;
    const path = `/prodavnica/${category.slug}`;
    this.seo.setPage({
      title: category.seo.title || `${category.name} – ${SITE_NAME}`,
      description: truncate(category.seo.description || category.description || SHOP_DESCRIPTION),
      path,
      image: shareImageUrl(category.image),
      jsonLd: [
        breadcrumbJsonLd(
          [
            { name: 'Početna', path: '/' },
            { name: 'Prodavnica', path: '/prodavnica' },
            { name: category.name, path },
          ],
          this.siteUrl,
        ),
      ],
    });
  }
}
