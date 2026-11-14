import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { asApiError } from '@zladovce/api';
import { PublicProduct, PublicProductListItem, PublicVariant } from '@zladovce/models';
import { CART_MAX_LINES, CartStore } from '@zladovce/shared';
import { UiButton, UiErrorState, UiLoadingState } from '@zladovce/ui';
import {
  catchError,
  concat,
  distinctUntilChanged,
  EMPTY,
  map,
  Observable,
  of,
  Subject,
  switchMap,
} from 'rxjs';
import { CartFeedback } from '../../core/cart/cart-feedback';
import { CartQuoteService } from '../../core/cart/cart-quote.service';
import { CatalogApi } from '../../core/data/catalog-api';
import { LOADING, Remote } from '../../core/data/remote';
import { StoreSettings } from '../../core/data/store-settings';
import { SeoService, SITE_NAME } from '../../core/seo';
import { SITE_URL } from '../../core/site-url';
import {
  breadcrumbJsonLd,
  Crumb,
  htmlToText,
  productJsonLd,
  shareImageUrl,
  truncate,
} from '../../core/structured-data';
import { Availability } from '../../shared/availability';
import { Breadcrumbs } from '../../shared/breadcrumbs';
import { Price } from '../../shared/price';
import { ProductCard } from '../../shared/product-card';
import { QuantityStepper } from '../../shared/quantity-stepper';
import { ProductGallery } from './product-gallery';
import {
  addBlockReason,
  applyAvailability,
  defaultVariant,
  remainingQuantity,
  variantLabel,
} from './purchase';

type ProductState = Remote<PublicProduct>;

/**
 * Product details (`/proizvod/:slug`): gallery, name, short description, package selector,
 * price with discount, availability, quantity (never above what may still go into the cart),
 * "Dodaj u korpu" with a confirmation, description and related products.
 *
 * Prerendered; in the browser the price and availability of every package are refreshed from
 * `GET /catalog/availability` right after hydration.
 */
@Component({
  selector: 'sf-product-page',
  imports: [
    RouterLink,
    Availability,
    Breadcrumbs,
    Price,
    ProductCard,
    ProductGallery,
    QuantityStepper,
    UiButton,
    UiErrorState,
    UiLoadingState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state().status) {
      @case ('loading') {
        <div class="mx-auto max-w-page px-gutter py-section">
          <ui-loading-state label="Učitavanje proizvoda…" />
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-page px-gutter py-section">
          @if (notFound()) {
            <div class="mx-auto max-w-prose text-center">
              <h1 class="text-3xl md:text-4xl">Proizvod nije pronađen</h1>
              <p class="mt-4 text-lg text-ink-700">
                Proizvod koji tražite ne postoji ili trenutno nije u ponudi.
              </p>
              <a uiButton class="mt-8" routerLink="/prodavnica">Pogledajte ponudu</a>
            </div>
          } @else {
            <ui-error-state
              title="Proizvod nije učitan"
              [message]="errorMessage()"
              (retry)="retry()"
            />
          }
        </div>
      }
      @default {
        @let p = product()!;
        <div class="mx-auto max-w-page px-gutter pb-section pt-8">
          <sf-breadcrumbs [crumbs]="crumbs()" />

          <div class="mt-8 grid gap-10 md:grid-cols-2 lg:gap-16">
            <sf-product-gallery [images]="p.images" [name]="p.name" />

            <div class="flex flex-col" data-testid="purchase">
              <a
                [routerLink]="['/prodavnica', p.category.slug]"
                class="eyebrow self-start underline-offset-4 hover:underline"
                >{{ p.category.name }}</a
              >
              <h1 class="mt-3 text-4xl md:text-5xl" data-testid="product-name">{{ p.name }}</h1>
              @if (p.shortDescription) {
                <p class="mt-4 text-lg text-ink-700">{{ p.shortDescription }}</p>
              }

              @if (variant(); as v) {
                <div class="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <sf-price
                    size="lg"
                    [price]="v.price"
                    [original]="v.discountPrice !== null ? v.regularPrice : null"
                  />
                  <sf-availability [inStock]="v.inStock" />
                </div>
              }

              @if (p.variants.length > 0) {
                <fieldset class="mt-8">
                  <legend class="text-sm font-semibold text-ink-900">Pakovanje</legend>
                  <div class="mt-3 flex flex-wrap gap-2.5">
                    @for (v of p.variants; track v.id) {
                      <label
                        class="relative cursor-pointer rounded-md border px-4 py-2.5 text-base transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-olive-700"
                        [class]="chipClass(v)"
                        data-testid="variant-chip"
                      >
                        <input
                          type="radio"
                          class="sr-only"
                          name="sf-variant"
                          [value]="v.id"
                          [checked]="v.id === variant()?.id"
                          (change)="selectVariant(v.id)"
                          [attr.aria-describedby]="v.inStock ? null : 'sf-variant-out-' + v.id"
                        />
                        <span class="font-semibold">{{ label(v) }}</span>
                        @if (!v.inStock) {
                          <span [id]="'sf-variant-out-' + v.id" class="ml-1.5 text-xs">
                            (nema na stanju)</span
                          >
                        }
                      </label>
                    }
                  </div>
                </fieldset>
              }

              <div class="mt-8 flex flex-wrap items-end gap-3">
                <div>
                  <span class="block text-sm font-semibold text-ink-900" aria-hidden="true"
                    >Količina</span
                  >
                  <sf-quantity-stepper
                    class="mt-1.5"
                    [value]="quantity()"
                    [min]="1"
                    [max]="maxQuantity()"
                    [disabled]="blockReason() !== null"
                    (valueChange)="quantity.set($event)"
                  />
                </div>
                <button
                  uiButton
                  size="lg"
                  type="button"
                  class="min-w-56 flex-1 sm:flex-none"
                  [disabled]="blockReason() !== null"
                  (click)="addToCart()"
                  data-testid="add-to-cart"
                >
                  {{ blockReason() === 'unavailable' ? 'Nema na stanju' : 'Dodaj u korpu' }}
                </button>
              </div>

              <div class="mt-3 min-h-6 text-sm" aria-live="polite" data-testid="purchase-note">
                @switch (blockReason()) {
                  @case ('limitReached') {
                    <p class="text-ink-700">
                      U korpi već imate najveću količinu ovog pakovanja koju trenutno možete
                      poručiti ({{ inCart() }}).
                    </p>
                  }
                  @case ('cartFull') {
                    <p class="text-ink-700">
                      Korpa može da sadrži najviše {{ maxLines }} različitih proizvoda.
                    </p>
                  }
                  @case ('unavailable') {
                    <p class="text-ink-700">Ovo pakovanje trenutno nije na stanju.</p>
                  }
                  @default {
                    @if (added(); as added) {
                      <p class="font-semibold text-olive-800">{{ added }}</p>
                    } @else if (inCart() > 0) {
                      <p class="text-ink-700">
                        U korpi: {{ inCart() }} kom.
                        <a
                          routerLink="/korpa"
                          class="font-semibold text-olive-800 underline underline-offset-4"
                          >Pogledaj korpu</a
                        >
                      </p>
                    }
                  }
                }
              </div>

              <ul class="mt-8 flex flex-col gap-3 border-t border-cream-200 pt-6 text-ink-700">
                <li class="flex gap-3">
                  <svg
                    class="mt-1 size-5 shrink-0 text-olive-600"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="2.5" y="5" width="15" height="10" rx="1.5" />
                    <path d="M10 8.5v3M8.5 10h3" />
                  </svg>
                  <span>Plaćanje pouzećem, kuriru pri preuzimanju paketa.</span>
                </li>
                <li class="flex gap-3">
                  <svg
                    class="mt-1 size-5 shrink-0 text-olive-600"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M2.5 6h9v7h-9zM11.5 8.5h3l2.5 2.5v2h-5.5" />
                    <circle cx="5.5" cy="14.5" r="1.5" />
                    <circle cx="14" cy="14.5" r="1.5" />
                  </svg>
                  <span> Dostava na adresu širom Srbije{{ deliveryNote() }} </span>
                </li>
                <li class="flex gap-3">
                  <svg
                    class="mt-1 size-5 shrink-0 text-olive-600"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="10" cy="7" r="3" />
                    <path d="M4 17c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5" />
                  </svg>
                  <span>Poručivanje bez registracije i korisničkog naloga.</span>
                </li>
              </ul>
            </div>
          </div>

          @if (p.description) {
            <section class="mt-16 max-w-3xl md:mt-24" aria-labelledby="sf-opis">
              <h2 id="sf-opis" class="text-3xl">O proizvodu</h2>
              <div
                class="rich-text mt-6"
                [innerHTML]="p.description"
                data-testid="description"
              ></div>
            </section>
          }

          @if (related().length > 0) {
            <section class="mt-16 md:mt-24" aria-labelledby="sf-povezano">
              <h2 id="sf-povezano" class="text-3xl">Iz iste kategorije</h2>
              <ul class="mt-8 grid gap-5 min-[480px]:grid-cols-2 md:gap-7 lg:grid-cols-4">
                @for (item of related(); track item.id) {
                  <li>
                    <sf-product-card
                      [product]="item"
                      sizes="(min-width: 1024px) 18rem, (min-width: 480px) 45vw, 92vw"
                    />
                  </li>
                }
              </ul>
            </section>
          }
        </div>
      }
    }
  `,
})
export class ProductPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CatalogApi);
  private readonly cart = inject(CartStore);
  private readonly feedback = inject(CartFeedback);
  private readonly quotes = inject(CartQuoteService);
  private readonly store = inject(StoreSettings);
  private readonly seo = inject(SeoService);
  private readonly siteUrl = inject(SITE_URL);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  /** Rendered at build time and now hydrating: refresh price and stock once. */
  private readonly hydrating = this.browser && !this.router.navigated;
  private readonly retries = new Subject<void>();

  protected readonly maxLines = CART_MAX_LINES;
  readonly state = signal<ProductState>(LOADING);
  readonly related = signal<PublicProductListItem[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly quantity = signal(1);
  /** Confirmation under the button after adding (also announced by the cart toast). */
  readonly added = signal<string | null>(null);

  readonly product = computed(() => {
    const state = this.state();
    return state.status === 'loaded' ? state.data : null;
  });
  readonly variant = computed<PublicVariant | null>(() => {
    const product = this.product();
    if (!product) {
      return null;
    }
    const selected = this.selectedId();
    return product.variants.find((v) => v.id === selected) ?? defaultVariant(product.variants);
  });
  readonly inCart = computed(() => {
    const variant = this.variant();
    return variant ? (this.cart.lines().find((l) => l.variantId === variant.id)?.quantity ?? 0) : 0;
  });
  readonly maxQuantity = computed(() =>
    Math.max(1, remainingQuantity(this.variant(), this.inCart())),
  );
  readonly blockReason = computed(() =>
    addBlockReason(this.variant(), this.inCart(), this.cart.isFull()),
  );
  protected readonly notFound = computed(() => {
    const state = this.state();
    return state.status === 'error' && state.error.isNotFound;
  });
  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.error.detail : '';
  });
  protected readonly crumbs = computed<Crumb[]>(() => {
    const product = this.product();
    if (!product) {
      return [];
    }
    return [
      { name: 'Početna', path: '/' },
      { name: 'Prodavnica', path: '/prodavnica' },
      { name: product.category.name, path: `/prodavnica/${product.category.slug}` },
      { name: product.name, path: `/proizvod/${product.slug}` },
    ];
  });
  protected readonly deliveryNote = computed(() => {
    const text = this.store.shipping()?.estimatedDeliveryText?.trim();
    return text ? ` – ${text}` : '.';
  });

  constructor() {
    this.store.ensureLoaded();
    const slugs = this.route.paramMap.pipe(
      map((params) => params.get('slug') ?? ''),
      distinctUntilChanged(),
    );

    slugs
      .pipe(
        switchMap((slug, index) =>
          concat(of(undefined), this.retries).pipe(
            switchMap(() => this.loadProduct(slug, index === 0)),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        const previous = this.product();
        this.state.set(state);
        if (state.status === 'loaded' && previous?.id !== state.data.id) {
          this.selectedId.set(null);
          this.quantity.set(1);
          this.added.set(null);
        }
        this.clampQuantity();
        this.updateSeo();
      });

    slugs
      .pipe(
        switchMap((slug, index) => {
          const cached = this.api.related(slug, 4);
          const request =
            index === 0 && this.hydrating
              ? concat(cached, this.api.related(slug, 4, { fresh: true }))
              : cached;
          return concat(of([]), request.pipe(catchError(() => of([]))));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((items) => this.related.set(items));
  }

  protected label(variant: PublicVariant): string {
    return variantLabel(variant);
  }

  protected chipClass(variant: PublicVariant): string {
    const selected = variant.id === this.variant()?.id;
    if (selected) {
      return 'border-olive-700 bg-olive-700 text-white';
    }
    return variant.inStock
      ? 'border-sage-300 bg-white text-ink-900 hover:border-olive-600'
      : 'border-dashed border-sage-300 bg-cream-100 text-ink-700 hover:border-sage-500';
  }

  selectVariant(id: string): void {
    this.selectedId.set(id);
    this.added.set(null);
    this.quantity.set(1);
  }

  addToCart(): void {
    const product = this.product();
    const variant = this.variant();
    if (!product || !variant || this.blockReason() !== null) {
      return;
    }
    const label = `${product.name}, ${variantLabel(variant)}`;
    const result = this.cart.add(variant.id, this.quantity(), {
      knownUnitPrice: variant.price,
      label,
      maxQuantity: variant.maxOrderQuantity,
    });
    if (result.added === 0) {
      return;
    }
    this.quotes.rememberLabel(variant.id, label);
    const message =
      result.limitedBy === 'quantity'
        ? `Dodato u korpu: ${result.added} kom. (najviše što trenutno možete poručiti).`
        : `Dodato u korpu: ${result.added} kom.`;
    this.added.set(message);
    this.feedback.show({
      title: 'Dodato u korpu',
      detail: `${label} × ${result.added}`,
      image: product.images[0] ?? null,
      imageAlt: '',
    });
    this.quantity.set(1);
  }

  protected retry(): void {
    this.retries.next();
  }

  private clampQuantity(): void {
    this.quantity.update((q) => Math.min(Math.max(1, q), this.maxQuantity()));
  }

  private loadProduct(slug: string, first: boolean): Observable<ProductState> {
    const request = this.api.product(slug).pipe(
      map((data): ProductState => ({ status: 'loaded', data })),
      catchError((error: unknown) =>
        of<ProductState>(this.browser ? { status: 'error', error: asApiError(error) } : LOADING),
      ),
    );
    const refreshed = (state: ProductState): Observable<ProductState> =>
      state.status !== 'loaded' || !first || !this.hydrating || state.data.variants.length === 0
        ? EMPTY
        : this.api.availability(state.data.variants.map((v) => v.id)).pipe(
            map((availability): ProductState => ({
              status: 'loaded',
              data: applyAvailability(state.data, availability.items),
            })),
            catchError(() => EMPTY),
          );
    return concat(
      of<ProductState>(LOADING),
      request.pipe(switchMap((state) => concat(of(state), refreshed(state)))),
    );
  }

  private updateSeo(): void {
    const state = this.state();
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    if (state.status === 'error') {
      this.seo.setPage({
        title: `Proizvod nije pronađen – ${SITE_NAME}`,
        path: `/proizvod/${slug}`,
        noindex: true,
      });
      return;
    }
    const product = this.product();
    if (!product) {
      return;
    }
    const path = `/proizvod/${product.slug}`;
    this.seo.setPage({
      title: product.seo.title || `${product.name} – ${SITE_NAME}`,
      description: truncate(
        product.seo.description || product.shortDescription || htmlToText(product.description),
      ),
      path,
      type: 'product',
      image: shareImageUrl(product.images[0]),
      jsonLd: [productJsonLd(product, this.siteUrl), breadcrumbJsonLd(this.crumbs(), this.siteUrl)],
    });
  }
}
