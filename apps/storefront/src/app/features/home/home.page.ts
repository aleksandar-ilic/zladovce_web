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
import {
  HomePage as HomePageResponse,
  PublicBlogPostListItem,
  PublicProductListItem,
  PublicTestimonial,
} from '@zladovce/models';
import { UiButton, UiErrorState, UiLoadingState } from '@zladovce/ui';
import {
  catchError,
  concat,
  distinctUntilChanged,
  EMPTY,
  map,
  of,
  Subject,
  switchMap,
} from 'rxjs';
import { CatalogApi } from '../../core/data/catalog-api';
import { CategoriesStore } from '../../core/data/categories-store';
import { ContentApi } from '../../core/data/content-api';
import { cachedThenFresh } from '../../core/data/hydration';
import { SiteContent } from '../../core/data/site-content';
import { LOADING, Remote } from '../../core/data/remote';
import { StoreSettings } from '../../core/data/store-settings';
import { BLOG_PATH } from '../../core/navigation';
import { HOME_DESCRIPTION, HOME_TITLE, SeoService } from '../../core/seo';
import { BlogCard } from '../../shared/blog-card';
import { deliveryFacts, TextItem } from '../../shared/delivery-facts';
import { NewsletterSignup } from '../../shared/newsletter-signup';
import { ProductCard } from '../../shared/product-card';
import { ProductImage } from '../../shared/product-image';
import { productCountLabel } from '../shop/shop-query';
import { homeView } from './home-content';

export { deliveryFacts } from '../../shared/delivery-facts';

export const FEATURED_LIMIT = 4;
export const BESTSELLER_LIMIT = 4;
export const BLOG_PREVIEW_LIMIT = 3;

/**
 * Homepage: hero, introduction, featured categories and products (real data), the family
 * story, why our products, quality, testimonials, how ordering works with the delivery facts,
 * blog previews and the newsletter sign-up.
 *
 * Texts and images come from the CMS homepage (`GET /content/pages/home`) where the owner has
 * entered them; every section without CMS content keeps the honest default copy (home-content.ts).
 * Introduction and quality exist only with CMS text; testimonials and blog previews only when
 * there are real ones.
 */
@Component({
  selector: 'sf-home-page',
  imports: [
    RouterLink,
    UiButton,
    UiErrorState,
    UiLoadingState,
    BlogCard,
    NewsletterSignup,
    ProductCard,
    ProductImage,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let v = view();
    <!-- Hero -->
    <section class="overflow-hidden bg-cream-100" aria-labelledby="hero-naslov">
      <div
        class="mx-auto grid max-w-page items-center gap-12 px-gutter py-section md:grid-cols-[1.1fr_1fr] lg:gap-16"
      >
        <div>
          <p class="eyebrow">Porodični posao sa juga Srbije</p>
          <h1 id="hero-naslov" class="mt-4 text-display" data-testid="hero-title">
            {{ v.hero.title }}
          </h1>
          <p
            class="mt-6 max-w-prose whitespace-pre-line text-lg text-ink-700"
            data-testid="hero-subtitle"
          >
            {{ v.hero.subtitle }}
          </p>
          <div class="mt-9 flex flex-wrap gap-3">
            <a uiButton size="lg" routerLink="/prodavnica" data-testid="hero-primary">{{
              v.hero.primaryCtaLabel
            }}</a>
            <a
              uiButton
              size="lg"
              variant="secondary"
              routerLink="/"
              fragment="porucivanje"
              data-testid="hero-secondary"
              >{{ v.hero.secondaryCtaLabel }}</a
            >
          </div>
        </div>

        @if (v.hero.image; as image) {
          <sf-product-image
            class="aspect-[4/5] rounded-xl shadow-card md:aspect-[4/5]"
            [image]="image"
            [alt]="image.alt || ''"
            sizes="(min-width: 768px) 45vw, 92vw"
            priority
            data-testid="hero-image"
          />
        } @else if (heroImages().length > 0) {
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

    <!-- Introduction (CMS only) -->
    @if (v.intro; as intro) {
      <section
        class="mx-auto max-w-page px-gutter pt-section"
        [attr.aria-labelledby]="intro.title ? 'uvod-naslov' : null"
        [attr.aria-label]="intro.title ? null : 'Uvod'"
        data-testid="home-intro"
      >
        <div class="mx-auto max-w-3xl text-center">
          @if (intro.title) {
            <h2 id="uvod-naslov" class="text-3xl md:text-4xl">{{ intro.title }}</h2>
          }
          @for (paragraph of intro.paragraphs; track $index) {
            <p class="mt-5 whitespace-pre-line text-lg text-ink-700">{{ paragraph }}</p>
          }
        </div>
      </section>
    }

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
          <h2 id="o-nama-naslov" class="mt-3 text-3xl md:text-4xl" data-testid="story-title">
            {{ v.story.title }}
          </h2>
          @if (v.story.image; as image) {
            <sf-product-image
              class="mt-8 aspect-[4/3] rounded-xl shadow-soft"
              [image]="image"
              [alt]="image.alt || ''"
              sizes="(min-width: 768px) 40vw, 92vw"
              data-testid="story-image"
            />
          }
        </div>
        <div class="max-w-prose" data-testid="story-text">
          @for (paragraph of v.story.paragraphs; track $index; let first = $first) {
            <p
              class="whitespace-pre-line text-ink-700"
              [class]="first ? 'text-lg' : 'mt-4'"
            >
              {{ paragraph }}
            </p>
          }
        </div>
      </div>
    </section>

    <!-- Why our products -->
    <section class="bg-sage-50" aria-labelledby="zasto-naslov">
      <div class="mx-auto max-w-page px-gutter py-section">
        <p class="eyebrow">Zašto naši proizvodi</p>
        <h2 id="zasto-naslov" class="mt-3 max-w-2xl text-3xl md:text-4xl" data-testid="why-title">
          {{ v.whyUs.title }}
        </h2>
        <ul class="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4" data-testid="why-items">
          @for (reason of v.whyUs.items; track $index) {
            <li class="border-t border-sage-300 pt-5">
              <h3 class="text-xl">{{ reason.title }}</h3>
              @if (reason.text) {
                <p class="mt-2 whitespace-pre-line text-ink-700">{{ reason.text }}</p>
              }
            </li>
          }
        </ul>
      </div>
    </section>

    <!-- Quality (CMS only) -->
    @if (v.quality; as quality) {
      <section
        class="mx-auto max-w-page px-gutter py-section"
        [attr.aria-labelledby]="quality.title ? 'kvalitet-naslov' : null"
        [attr.aria-label]="quality.title ? null : 'Kvalitet'"
        data-testid="home-quality"
      >
        <div class="grid gap-8 md:grid-cols-[1fr_1.2fr] md:gap-16">
          <div>
            <p class="eyebrow">Kvalitet</p>
            @if (quality.title) {
              <h2 id="kvalitet-naslov" class="mt-3 text-3xl md:text-4xl">{{ quality.title }}</h2>
            }
          </div>
          <div class="max-w-prose">
            @for (paragraph of quality.paragraphs; track $index; let first = $first) {
              <p class="whitespace-pre-line text-ink-700" [class]="first ? 'text-lg' : 'mt-4'">
                {{ paragraph }}
              </p>
            }
          </div>
        </div>
      </section>
    }

    <!-- Testimonials: only real ones entered by the owner -->
    @if (testimonials().length > 0) {
      <section
        class="border-y border-cream-200 bg-white"
        aria-labelledby="utisci-naslov"
        data-testid="home-testimonials"
      >
        <div class="mx-auto max-w-page px-gutter py-section">
          <p class="eyebrow">Utisci</p>
          <h2 id="utisci-naslov" class="mt-3 text-3xl md:text-4xl">Šta kažu kupci</h2>
          <ul class="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            @for (item of testimonials(); track item.id) {
              <li>
                <figure class="flex h-full flex-col rounded-lg bg-cream-50 p-6 shadow-soft">
                  <blockquote
                    class="flex-1 whitespace-pre-line font-serif text-xl leading-relaxed text-olive-900"
                  >
                    „{{ item.text }}“
                  </blockquote>
                  <figcaption class="mt-5 text-sm text-ink-700">
                    <span class="font-semibold text-ink-900">{{ item.authorName }}</span>
                    @if (item.place) {
                      <span>, {{ item.place }}</span>
                    }
                  </figcaption>
                </figure>
              </li>
            }
          </ul>
        </div>
      </section>
    }

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
                  <dd class="mt-1 whitespace-pre-line text-ink-700">{{ fact.text }}</dd>
                </div>
              }
            </dl>
          </div>
        }
      </div>
    </section>

    <!-- Blog previews: only when posts are published -->
    @if (posts().length > 0) {
      <section
        class="mx-auto max-w-page px-gutter py-section"
        aria-labelledby="blog-naslov"
        data-testid="home-blog"
      >
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p class="eyebrow">Blog</p>
            <h2 id="blog-naslov" class="mt-3 text-3xl md:text-4xl">Iz našeg bloga</h2>
          </div>
          <a
            [routerLink]="blogPath"
            class="font-semibold text-olive-800 underline underline-offset-4"
            >Svi tekstovi →</a
          >
        </div>
        <ul class="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          @for (post of posts(); track post.slug) {
            <li><sf-blog-card [post]="post" /></li>
          }
        </ul>
      </section>
    }

    <!-- Newsletter -->
    <section
      id="novosti"
      class="scroll-mt-24 bg-sage-50"
      aria-labelledby="novosti-naslov"
      data-testid="home-newsletter"
    >
      <div
        class="mx-auto grid max-w-page gap-8 px-gutter py-section md:grid-cols-[1fr_1.1fr] md:gap-16"
      >
        <div>
          <p class="eyebrow">Novosti</p>
          <h2 id="novosti-naslov" class="mt-3 text-3xl md:text-4xl">Javićemo vam šta je novo</h2>
          <p class="mt-4 max-w-prose text-lg text-ink-700">
            Ostavite adresu e-pošte i povremeno ćemo vam pisati o novim proizvodima i ponudi.
          </p>
        </div>
        <sf-newsletter-signup />
      </div>
    </section>
  `,
})
export class HomePage {
  private readonly api = inject(CatalogApi);
  private readonly content = inject(ContentApi);
  private readonly categoriesStore = inject(CategoriesStore);
  private readonly store = inject(StoreSettings);
  private readonly seo = inject(SeoService);
  private readonly siteContent = inject(SiteContent);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly hydrating = this.browser && !inject(Router).navigated;
  private readonly featuredRetries = new Subject<void>();

  protected readonly blogPath = BLOG_PATH;

  protected readonly productGroups: readonly TextItem[] = [
    { title: 'Džemovi', text: 'Za doručak, palačinke i kolače' },
    { title: 'Voćni sokovi', text: 'Za svaki dan i za goste' },
    { title: 'Sirće', text: 'Za salate i zimnicu' },
    { title: 'Kompoti', text: 'Voće iz tegle, tokom cele godine' },
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
      text: 'Porudžbinu plaćate kuriru kada vam preda paket. Do tada je pratite kodom iz e-poruke potvrde.',
    },
  ];

  /** The CMS homepage; null while it is empty (404), not loaded or unreachable. */
  readonly page = signal<HomePageResponse | null>(null);
  protected readonly view = computed(() => homeView(this.page()?.content));
  protected readonly testimonials = signal<PublicTestimonial[]>([]);
  protected readonly posts = signal<PublicBlogPostListItem[]>([]);

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

    // CMS content, asked for only when `/seo/routes` lists the home page (an empty page is a
    // 404, which the browser would log); unknown routes → ask anyway. A 404 or any failure keeps
    // the default copy.
    this.siteContent.routes$
      .pipe(
        map((routes) => (routes === null ? null : routes.pages.some((p) => p.key === 'home'))),
        distinctUntilChanged(),
        switchMap((hasContent, index) =>
          hasContent === false
            ? of(null)
            : cachedThenFresh(
                (options) => this.content.homePage(options),
                index === 0 && this.hydrating,
              ).pipe(
                catchError((error: unknown) => (asApiError(error).isNotFound ? of(null) : EMPTY)),
              ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((page) => {
        this.page.set(page);
        this.updateSeo(page);
      });
    cachedThenFresh((options) => this.content.testimonials(options), this.hydrating)
      .pipe(
        catchError(() => EMPTY),
        takeUntilDestroyed(),
      )
      .subscribe((items) => this.testimonials.set(items));
    cachedThenFresh(
      (options) => this.content.latestPosts(BLOG_PREVIEW_LIMIT, options),
      this.hydrating,
    )
      .pipe(
        catchError(() => EMPTY),
        takeUntilDestroyed(),
      )
      .subscribe((items) => this.posts.set(items));

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

  /** The owner's SEO title and description replace the defaults of the route when set. */
  private updateSeo(page: HomePageResponse | null): void {
    this.seo.setPage({
      title: page?.seoTitle?.trim() || HOME_TITLE,
      description: page?.seoDescription?.trim() || HOME_DESCRIPTION,
      path: '/',
    });
  }
}
