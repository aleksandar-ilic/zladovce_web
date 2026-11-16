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
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { Paged, PublicBlogCategory, PublicBlogPostListItem } from '@zladovce/models';
import { UiButton, UiEmptyState, UiErrorState, UiLoadingState } from '@zladovce/ui';
import {
  catchError,
  combineLatest,
  concat,
  distinctUntilChanged,
  EMPTY,
  map,
  of,
  Subject,
  switchMap,
} from 'rxjs';
import { ContentApi } from '../../core/data/content-api';
import { cachedThenFresh } from '../../core/data/hydration';
import { PageState, pageStateWithRefresh } from '../../core/data/page-state';
import { BLOG_CATEGORY_PATH, BLOG_PATH } from '../../core/navigation';
import { SeoService, SITE_NAME } from '../../core/seo';
import { breadcrumbJsonLd, Crumb } from '../../core/structured-data';
import { SITE_URL } from '../../core/site-url';
import { BlogCard } from '../../shared/blog-card';
import { Breadcrumbs } from '../../shared/breadcrumbs';
import { pageWindow } from '../shop/shop-query';
import { NotFoundPage } from '../not-found/not-found.page';

export const BLOG_PAGE_SIZE = 9;

export const BLOG_DESCRIPTION =
  'Blog porodice Zladovce – tekstovi o onome što pravimo i kako to pravimo.';

/** `?page=2` → 2; missing, invalid or < 1 → 1. */
export function pageFromQuery(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 1 ? page : 1;
}

interface ListKey {
  category: string | null;
  page: number;
}

/**
 * Blog (`/blog`) and blog category (`/blog/kategorija/:categorySlug`): category chips (links,
 * so every category has its own clean, prerendered URL), the posts newest first with cover,
 * category, Serbian date and excerpt, and paging (`?page=` – client side, page 1 is
 * canonical). An unknown category is the 404 view; an empty blog says so plainly.
 */
@Component({
  selector: 'sf-blog-list-page',
  imports: [
    BlogCard,
    Breadcrumbs,
    NotFoundPage,
    RouterLink,
    UiButton,
    UiEmptyState,
    UiErrorState,
    UiLoadingState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state().status === 'missing') {
      <sf-not-found-page />
    } @else {
      <div class="mx-auto max-w-page px-gutter pb-section pt-8 md:pt-10">
        @if (categorySlug()) {
          <sf-breadcrumbs [crumbs]="crumbs()" />
        }
        <p class="eyebrow" [class.mt-6]="categorySlug()">Blog</p>
        <h1 class="mt-3 text-4xl md:text-5xl" data-testid="page-title">{{ heading() }}</h1>
        @if (!categorySlug()) {
          <p class="mt-4 max-w-prose text-lg text-ink-700">
            Tekstovi porodice Zladovce o onome što pravimo i kako to pravimo.
          </p>
        }

        @if (chips().length > 0) {
          <nav class="mt-8" aria-label="Kategorije bloga">
            <ul class="flex flex-wrap gap-2" data-testid="blog-chips">
              <li>
                <a
                  [routerLink]="blogPath"
                  class="inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold transition-colors"
                  [class]="chipClass(categorySlug() === null)"
                  [attr.aria-current]="categorySlug() === null ? 'page' : null"
                  >Sve</a
                >
              </li>
              @for (c of chips(); track c.slug) {
                <li>
                  <a
                    [routerLink]="[categoryPath, c.slug]"
                    class="inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold transition-colors"
                    [class]="chipClass(categorySlug() === c.slug)"
                    [attr.aria-current]="categorySlug() === c.slug ? 'page' : null"
                    >{{ c.name }}</a
                  >
                </li>
              }
            </ul>
          </nav>
        }

        @switch (state().status) {
          @case ('loading') {
            <ui-loading-state label="Učitavanje tekstova…" />
          }
          @case ('error') {
            <ui-error-state
              title="Tekstovi nisu učitani"
              [message]="errorMessage()"
              (retry)="retries.next()"
            />
          }
          @default {
            @if (page(); as page) {
              @if (page.items.length === 0) {
                @if (page.page > 1) {
                  <ui-empty-state
                    title="Ova strana je prazna"
                    description="Tekstova ima manje nego što adresa pokazuje."
                  >
                    <a uiButton variant="secondary" [routerLink]="[]">Prva strana</a>
                  </ui-empty-state>
                } @else {
                  <ui-empty-state
                    title="Prvi tekstovi stižu uskoro"
                    description="Na blogu još nema objavljenih tekstova. Do tada vas čekaju naši proizvodi."
                    data-testid="blog-empty"
                  >
                    <a uiButton variant="secondary" routerLink="/prodavnica">Pogledajte ponudu</a>
                  </ui-empty-state>
                }
              } @else {
                <ul
                  class="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3"
                  data-testid="blog-posts"
                >
                  @for (post of page.items; track post.slug; let i = $index) {
                    <li><sf-blog-card [post]="post" [priority]="i < 3" /></li>
                  }
                </ul>

                @if (page.totalPages > 1) {
                  <nav class="mt-12 flex justify-center" aria-label="Stranice">
                    <ul class="flex flex-wrap items-center gap-1.5" data-testid="blog-pager">
                      <li>
                        @if (page.page > 1) {
                          <a
                            [routerLink]="[]"
                            [queryParams]="pageParams(page.page - 1)"
                            class="inline-flex h-11 items-center rounded-md px-3 font-semibold text-olive-800 hover:bg-olive-50"
                            rel="prev"
                            >← Novije</a
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
                            >Starije →</a
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
    }
  `,
})
export class BlogListPage {
  private readonly api = inject(ContentApi);
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);
  private readonly siteUrl = inject(SITE_URL);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly hydrating = this.browser && !inject(Router).navigated;
  protected readonly retries = new Subject<void>();

  protected readonly blogPath = BLOG_PATH;
  protected readonly categoryPath = BLOG_CATEGORY_PATH;

  readonly state = signal<PageState<Paged<PublicBlogPostListItem>>>({ status: 'loading' });
  readonly categories = signal<PublicBlogCategory[]>([]);
  readonly categorySlug = signal<string | null>(null);

  protected readonly page = computed(() => {
    const state = this.state();
    return state.status === 'loaded' ? state.data : null;
  });
  protected readonly chips = computed(() =>
    this.categories().filter((c) => c.postCount > 0 || c.slug === this.categorySlug()),
  );
  protected readonly category = computed(
    () => this.categories().find((c) => c.slug === this.categorySlug()) ?? null,
  );
  protected readonly heading = computed(() =>
    this.categorySlug() ? (this.category()?.name ?? 'Blog') : 'Blog',
  );
  protected readonly crumbs = computed<Crumb[]>(() => [
    { name: 'Početna', path: '/' },
    { name: 'Blog', path: BLOG_PATH },
    { name: this.heading(), path: `${BLOG_CATEGORY_PATH}/${this.categorySlug()}` },
  ]);
  protected readonly pages = computed(() => {
    const page = this.page();
    return page ? pageWindow(page.page, page.totalPages) : [];
  });
  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.error.detail : '';
  });

  constructor() {
    cachedThenFresh((options) => this.api.blogCategories(options), this.hydrating)
      .pipe(
        catchError(() => EMPTY),
        takeUntilDestroyed(),
      )
      .subscribe((items) => {
        this.categories.set(items);
        this.updateSeo();
      });

    combineLatest([
      this.route.paramMap.pipe(map((params) => params.get('categorySlug'))),
      this.route.queryParamMap.pipe(map((params) => pageFromQuery(params.get('page')))),
    ])
      .pipe(
        map(([category, page]): ListKey => ({ category, page })),
        distinctUntilChanged((a, b) => a.category === b.category && a.page === b.page),
        switchMap((key, index) => {
          this.categorySlug.set(key.category);
          return concat(of(0), this.retries).pipe(
            switchMap((_, attempt) =>
              pageStateWithRefresh(
                (options) =>
                  this.api.blogPosts(
                    {
                      category: key.category ?? undefined,
                      page: key.page,
                      pageSize: BLOG_PAGE_SIZE,
                    },
                    options,
                  ),
                index === 0 && attempt === 0 && this.hydrating,
                this.browser,
              ),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.state.set(state);
        this.updateSeo();
      });
  }

  protected chipClass(active: boolean): string {
    return active
      ? 'border-olive-700 bg-olive-700 text-white'
      : 'border-sage-300 bg-white text-ink-700 hover:border-olive-600 hover:text-olive-900';
  }

  protected pageParams(page: number): Params {
    return { page: page > 1 ? page : null };
  }

  private updateSeo(): void {
    const slug = this.categorySlug();
    const path = slug ? `${BLOG_CATEGORY_PATH}/${slug}` : BLOG_PATH;
    const state = this.state();
    if (state.status === 'missing') {
      this.seo.setPage({ title: `Stranica nije pronađena – ${SITE_NAME}`, path, noindex: true });
      return;
    }
    if (slug) {
      const name = this.category()?.name ?? 'Blog';
      this.seo.setPage({
        title: `${name} – Blog – ${SITE_NAME}`,
        description: `Tekstovi iz kategorije „${name}“ na blogu porodice Zladovce.`,
        path,
        jsonLd: [breadcrumbJsonLd(this.crumbs(), this.siteUrl)],
      });
    } else {
      this.seo.setPage({ title: `Blog – ${SITE_NAME}`, description: BLOG_DESCRIPTION, path });
    }
  }
}
