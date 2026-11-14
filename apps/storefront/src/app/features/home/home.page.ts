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
import { Router, RouterLink } from '@angular/router';
import { asApiError } from '@zladovce/api';
import { PublicProductListItem, PublicStoreShipping } from '@zladovce/models';
import { UiButton, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { formatRsd } from '@zladovce/utilities';
import { catchError, concat, EMPTY, map, of, Subject, switchMap } from 'rxjs';
import { CatalogApi } from '../../core/data/catalog-api';
import { CategoriesStore } from '../../core/data/categories-store';
import { LOADING, Remote } from '../../core/data/remote';
import { StoreSettings } from '../../core/data/store-settings';
import { ProductCard } from '../../shared/product-card';
import { ProductImage } from '../../shared/product-image';
import { productCountLabel } from '../shop/shop-query';

interface TextItem {
  title: string;
  text: string;
}

export const FEATURED_LIMIT = 4;
export const BESTSELLER_LIMIT = 4;

/** Delivery facts from the store settings; only values that are actually configured. */
export function deliveryFacts(shipping: PublicStoreShipping | null): TextItem[] {
  if (!shipping || !shipping.enabled) {
    return [];
  }
  const facts: TextItem[] = [];
  if (shipping.price > 0) {
    facts.push({ title: 'Cena dostave', text: formatRsd(shipping.price) });
  }
  if (shipping.freeShippingThreshold !== null && shipping.freeShippingThreshold > 0) {
    facts.push({
      title: 'Besplatna dostava',
      text: `Za porudžbine od ${formatRsd(shipping.freeShippingThreshold)}`,
    });
  }
  if (shipping.minOrderAmount !== null && shipping.minOrderAmount > 0) {
    facts.push({ title: 'Najmanja porudžbina', text: formatRsd(shipping.minOrderAmount) });
  }
  if (shipping.estimatedDeliveryText?.trim()) {
    facts.push({ title: 'Rok isporuke', text: shipping.estimatedDeliveryText.trim() });
  }
  if (shipping.deliveryInfo?.trim()) {
    facts.push({ title: 'Napomena', text: shipping.deliveryInfo.trim() });
  }
  return facts;
}

/**
 * Homepage: hero, featured categories and products (real data), the family story, why our
 * products, how ordering works and delivery facts from the store settings.
 *
 * The copy states only what is known (family business from the south of Serbia, what is made,
 * cash on delivery, no account needed); no certificates, awards, ingredients or "organski".
 * Testimonials, blog previews and the newsletter come with their backend (Phase 7).
 */
@Component({
  selector: 'sf-home-page',
  imports: [RouterLink, UiButton, UiErrorState, UiLoadingState, ProductCard, ProductImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Hero -->
    <section class="overflow-hidden bg-cream-100" aria-labelledby="hero-naslov">
      <div
        class="mx-auto grid max-w-page items-center gap-12 px-gutter py-section md:grid-cols-[1.1fr_1fr] lg:gap-16"
      >
        <div>
          <p class="eyebrow">Porodični posao sa juga Srbije</p>
          <h1 id="hero-naslov" class="mt-4 text-display">
            Domaći ukusi, pripremljeni kao za svoju kuću
          </h1>
          <p class="mt-6 max-w-prose text-lg text-ink-700">
            Zladovce je porodični posao sa juga Srbije. Pravimo domaće džemove, voćne sokove, sirće
            i kompote i šaljemo ih na adrese širom zemlje.
          </p>
          <div class="mt-9 flex flex-wrap gap-3">
            <a uiButton size="lg" routerLink="/prodavnica">Pogledajte ponudu</a>
            <a uiButton size="lg" variant="secondary" routerLink="/" fragment="porucivanje"
              >Kako se poručuje</a
            >
          </div>
        </div>

        @if (heroImages().length > 0) {
          <div class="grid grid-cols-[1.4fr_1fr] gap-4" data-testid="hero-photos">
            @for (product of heroImages(); track product.id; let i = $index) {
              <a
                [routerLink]="['/proizvod', product.slug]"
                class="group block overflow-hidden rounded-xl shadow-card"
                [class]="i === 0 ? 'row-span-2' : ''"
                [attr.aria-label]="product.name"
              >
                <sf-product-image
                  class="size-full transition-transform duration-700 ease-gentle group-hover:scale-[1.03]"
                  [class]="i === 0 ? 'aspect-[3/4]' : 'aspect-square'"
                  [image]="product.image"
                  [alt]="product.image?.altText || product.name"
                  [sizes]="
                    i === 0 ? '(min-width: 768px) 30vw, 60vw' : '(min-width: 768px) 20vw, 40vw'
                  "
                  priority
                />
              </a>
            }
          </div>
        } @else {
          <div class="rounded-xl border border-sage-200 bg-sage-50 p-8 md:p-10">
            <h2 class="text-2xl">Šta pravimo</h2>
            <ul class="mt-6 divide-y divide-sage-200">
              @for (group of productGroups; track group.title) {
                <li
                  class="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                >
                  <span class="font-serif text-xl font-semibold text-olive-800">{{
                    group.title
                  }}</span>
                  <span class="text-sm text-ink-700 sm:text-right">{{ group.text }}</span>
                </li>
              }
            </ul>
          </div>
        }
      </div>
    </section>

    <!-- Featured categories -->
    @if (showCategories()) {
      <section class="mx-auto max-w-page px-gutter py-section" aria-labelledby="kategorije-naslov">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p class="eyebrow">Ponuda</p>
            <h2 id="kategorije-naslov" class="mt-3 text-3xl md:text-4xl">Izaberite po ukusu</h2>
          </div>
          <a
            routerLink="/prodavnica"
            class="font-semibold text-olive-800 underline underline-offset-4"
            >Cela ponuda →</a
          >
        </div>
        @switch (categoriesRemote().status) {
          @case ('loading') {
            <ui-loading-state label="Učitavanje kategorija…" />
          }
          @case ('error') {
            <ui-error-state
              title="Kategorije nisu učitane"
              [message]="categoriesError()"
              (retry)="reloadCategories()"
            />
          }
          @default {
            <ul
              class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
              data-testid="home-categories"
            >
              @for (category of featuredCategories(); track category.id) {
                <li>
                  <a
                    [routerLink]="['/prodavnica', category.slug]"
                    class="group relative block overflow-hidden rounded-xl shadow-soft"
                  >
                    <sf-product-image
                      class="aspect-[4/5] transition-transform duration-700 ease-gentle group-hover:scale-[1.03]"
                      [image]="category.image"
                      alt=""
                      sizes="(min-width: 1024px) 18rem, (min-width: 640px) 45vw, 92vw"
                    />
                    <div
                      class="absolute inset-x-0 bottom-0 bg-linear-to-t from-olive-900/85 via-olive-900/40 to-transparent px-5 pb-5 pt-16"
                    >
                      <h3 class="text-2xl text-cream-50">{{ category.name }}</h3>
                      <p class="mt-1 text-sm text-cream-100">
                        {{ countLabel(category.productCount) }}
                      </p>
                    </div>
                  </a>
                </li>
              }
            </ul>
          }
        }
      </section>
    }

    <!-- Featured products -->
    @if (featured().status !== 'loaded' || featuredItems().length > 0) {
      <section class="border-y border-cream-200 bg-white" aria-labelledby="izdvajamo-naslov">
        <div class="mx-auto max-w-page px-gutter py-section">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p class="eyebrow">Izdvajamo</p>
              <h2 id="izdvajamo-naslov" class="mt-3 text-3xl md:text-4xl">Iz naše kuhinje</h2>
            </div>
            <a
              routerLink="/prodavnica"
              class="font-semibold text-olive-800 underline underline-offset-4"
              >Svi proizvodi →</a
            >
          </div>
          @switch (featured().status) {
            @case ('loading') {
              <ui-loading-state label="Učitavanje proizvoda…" />
            }
            @case ('error') {
              <ui-error-state
                title="Proizvodi nisu učitani"
                [message]="featuredError()"
                (retry)="reloadFeatured()"
              />
            }
            @default {
              <ul
                class="mt-10 grid gap-5 min-[480px]:grid-cols-2 md:gap-7 lg:grid-cols-4"
                data-testid="home-featured"
              >
                @for (product of featuredItems(); track product.id) {
                  <li>
                    <sf-product-card
                      [product]="product"
                      sizes="(min-width: 1024px) 18rem, (min-width: 480px) 45vw, 92vw"
                    />
                  </li>
                }
              </ul>
            }
          }
        </div>
      </section>
    }

    <!-- Best sellers: only real sales (delivered orders); not rendered at all while there are none. -->
    @if (bestsellerItems().length > 0) {
      <section
        class="mx-auto max-w-page px-gutter py-section"
        aria-labelledby="najprodavanije-naslov"
      >
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p class="eyebrow">Kupci biraju</p>
            <h2 id="najprodavanije-naslov" class="mt-3 text-3xl md:text-4xl">Najprodavanije</h2>
          </div>
          <a
            routerLink="/prodavnica"
            [queryParams]="{ sort: 'bestselling' }"
            class="font-semibold text-olive-800 underline underline-offset-4"
            >Sve po prodaji →</a
          >
        </div>
        <ul
          class="mt-10 grid gap-5 min-[480px]:grid-cols-2 md:gap-7 lg:grid-cols-4"
          data-testid="home-bestsellers"
        >
          @for (product of bestsellerItems(); track product.id) {
            <li>
              <sf-product-card
                [product]="product"
                sizes="(min-width: 1024px) 18rem, (min-width: 480px) 45vw, 92vw"
              />
            </li>
          }
        </ul>
      </section>
    }

    <!-- Family story -->
    <section id="o-nama" class="scroll-mt-24" aria-labelledby="o-nama-naslov">
      <div
        class="mx-auto grid max-w-page gap-10 px-gutter py-section md:grid-cols-[1fr_1.2fr] md:gap-16"
      >
        <div>
          <p class="eyebrow">O nama</p>
          <h2 id="o-nama-naslov" class="mt-3 text-3xl md:text-4xl">Porodica iza svake tegle</h2>
        </div>
        <div class="max-w-prose">
          <p class="text-lg text-ink-700">
            Iza imena Zladovce stoji jedna porodica i njena kuhinja. Proizvode pripremamo sami,
            onako kako ih pravimo i za svoju trpezu.
          </p>
          <p class="mt-4 text-ink-700">
            Ono što pravimo kod kuće sada šaljemo i vama – u teglama i flašama, spakovano tako da
            stigne čitavo na vašu adresu.
          </p>
        </div>
      </div>
    </section>

    <!-- Why our products -->
    <section class="bg-sage-50" aria-labelledby="zasto-naslov">
      <div class="mx-auto max-w-page px-gutter py-section">
        <p class="eyebrow">Zašto naši proizvodi</p>
        <h2 id="zasto-naslov" class="mt-3 max-w-2xl text-3xl md:text-4xl">
          Domaće, jednostavno i bez iznenađenja
        </h2>
        <ul class="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          @for (reason of reasons; track reason.title) {
            <li class="border-t border-sage-300 pt-5">
              <h3 class="text-xl">{{ reason.title }}</h3>
              <p class="mt-2 text-ink-700">{{ reason.text }}</p>
            </li>
          }
        </ul>
      </div>
    </section>

    <!-- How to order -->
    <section
      id="porucivanje"
      class="scroll-mt-24 border-t border-cream-200 bg-cream-100"
      aria-labelledby="porucivanje-naslov"
    >
      <div class="mx-auto max-w-page px-gutter py-section">
        <p class="eyebrow">Kako poručiti</p>
        <h2 id="porucivanje-naslov" class="mt-3 text-3xl md:text-4xl">
          Tri koraka, bez naloga i kartice
        </h2>
        <ol class="mt-10 grid gap-6 md:grid-cols-3">
          @for (step of steps; track step.title; let i = $index) {
            <li class="rounded-lg border border-cream-200 bg-white p-6 shadow-soft">
              <span class="font-serif text-4xl font-semibold text-olive-500" aria-hidden="true">{{
                i + 1
              }}</span>
              <h3 class="mt-3 text-xl">{{ step.title }}</h3>
              <p class="mt-2 text-ink-700">{{ step.text }}</p>
            </li>
          }
        </ol>
        <div class="mt-8">
          <a uiButton routerLink="/prodavnica">Počnite od prodavnice</a>
        </div>

        @if (delivery().length > 0) {
          <div
            class="mt-12 rounded-lg border border-cream-200 bg-white p-6 md:p-8"
            data-testid="delivery"
          >
            <h3 class="text-2xl">Dostava</h3>
            <dl class="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              @for (fact of delivery(); track fact.title) {
                <div>
                  <dt class="text-sm font-semibold text-ink-900">{{ fact.title }}</dt>
                  <dd class="mt-1 text-ink-700">{{ fact.text }}</dd>
                </div>
              }
            </dl>
          </div>
        }
      </div>
    </section>
  `,
})
export class HomePage {
  private readonly api = inject(CatalogApi);
  private readonly categoriesStore = inject(CategoriesStore);
  private readonly store = inject(StoreSettings);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly hydrating = this.browser && !inject(Router).navigated;
  private readonly featuredRetries = new Subject<void>();

  protected readonly productGroups: readonly TextItem[] = [
    { title: 'Džemovi', text: 'Za doručak, palačinke i kolače' },
    { title: 'Voćni sokovi', text: 'Za svaki dan i za goste' },
    { title: 'Sirće', text: 'Za salate i zimnicu' },
    { title: 'Kompoti', text: 'Voće iz tegle, tokom cele godine' },
  ];

  protected readonly reasons: readonly TextItem[] = [
    {
      title: 'Iz porodične kuhinje',
      text: 'Pripremamo ih sami, na isti način na koji ih pravimo za svoju porodicu.',
    },
    {
      title: 'Jasno na svakom proizvodu',
      text: 'Pakovanje, cena i dostupnost piše na strani proizvoda pre nego što ga dodate u korpu.',
    },
    {
      title: 'Plaćate kad stigne',
      text: 'Nema plaćanja unapred: porudžbinu plaćate kuriru pri preuzimanju.',
    },
    {
      title: 'Na adresu širom Srbije',
      text: 'Paket šaljemo kurirskom službom na adresu koju navedete.',
    },
  ];

  protected readonly steps: readonly TextItem[] = [
    {
      title: 'Izaberite',
      text: 'U prodavnici izaberite proizvode i pakovanja i dodajte ih u korpu.',
    },
    {
      title: 'Poručite',
      text: 'Upišite ime, telefon i adresu za dostavu. Korisnički nalog nije potreban.',
    },
    {
      title: 'Platite pouzećem',
      text: 'Porudžbinu plaćate kuriru kada vam preda paket.',
    },
  ];

  protected readonly featured = signal<Remote<PublicProductListItem[]>>(LOADING);
  protected readonly categoriesRemote = this.categoriesStore.remote;
  /** Empty while loading, after an error and when nothing has sold yet: the section is then hidden. */
  protected readonly bestsellerItems = signal<PublicProductListItem[]>([]);

  protected readonly featuredItems = computed(() => {
    const state = this.featured();
    return state.status === 'loaded' ? state.data : [];
  });
  protected readonly heroImages = computed(() =>
    this.featuredItems()
      .filter((p) => p.image !== null)
      .slice(0, 3),
  );
  protected readonly featuredCategories = computed(() =>
    this.categoriesStore
      .categories()
      .filter((c) => c.productCount > 0)
      .slice(0, 4),
  );
  protected readonly showCategories = computed(
    () => this.categoriesRemote().status !== 'loaded' || this.featuredCategories().length > 0,
  );
  protected readonly delivery = computed(() => deliveryFacts(this.store.shipping()));
  protected readonly featuredError = computed(() => {
    const state = this.featured();
    return state.status === 'error' ? state.error.detail : '';
  });
  protected readonly categoriesError = computed(() => {
    const state = this.categoriesRemote();
    return state.status === 'error' ? state.error.detail : '';
  });

  constructor() {
    this.categoriesStore.ensureLoaded();
    this.store.ensureLoaded();
    concat(of(undefined), this.featuredRetries)
      .pipe(
        switchMap((_, index) => {
          const query = { featured: true, pageSize: FEATURED_LIMIT, sort: 'newest' as const };
          const cached = this.api.products(query);
          const request =
            index === 0 && this.hydrating
              ? concat(
                  cached,
                  this.api.products(query, { fresh: true }).pipe(catchError(() => EMPTY)),
                )
              : cached;
          return concat(
            of<Remote<PublicProductListItem[]>>(LOADING),
            request.pipe(
              map((page): Remote<PublicProductListItem[]> => ({
                status: 'loaded',
                data: page.items,
              })),
              catchError((error: unknown) =>
                of<Remote<PublicProductListItem[]>>(
                  this.browser ? { status: 'error', error: asApiError(error) } : LOADING,
                ),
              ),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.featured.set(state));

    const bestsellers = this.api.bestsellers(BESTSELLER_LIMIT);
    (this.hydrating
      ? concat(
          bestsellers.pipe(catchError(() => EMPTY)),
          this.api.bestsellers(BESTSELLER_LIMIT, { fresh: true }).pipe(catchError(() => EMPTY)),
        )
      : bestsellers.pipe(catchError(() => EMPTY))
    )
      .pipe(takeUntilDestroyed())
      .subscribe((items) => this.bestsellerItems.set(items));
  }

  protected countLabel(count: number): string {
    return productCountLabel(count);
  }

  protected reloadFeatured(): void {
    this.featuredRetries.next();
  }

  protected reloadCategories(): void {
    this.categoriesStore.reload();
  }
}
