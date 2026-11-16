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
import { PublicBlogPost, PublicBlogPostListItem } from '@zladovce/models';
import { UiErrorState, UiLoadingState } from '@zladovce/ui';
import { SrDatePipe } from '@zladovce/utilities';
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
import { ContentApi } from '../../core/data/content-api';
import { cachedThenFresh } from '../../core/data/hydration';
import { PageState, pageStateWithRefresh } from '../../core/data/page-state';
import { BLOG_CATEGORY_PATH, BLOG_PATH } from '../../core/navigation';
import { SeoService, SITE_NAME } from '../../core/seo';
import { SITE_URL } from '../../core/site-url';
import {
  blogPostingJsonLd,
  breadcrumbJsonLd,
  Crumb,
  htmlToText,
  shareImageUrl,
  truncate,
} from '../../core/structured-data';
import { BlogCard } from '../../shared/blog-card';
import { Breadcrumbs } from '../../shared/breadcrumbs';
import { ProductImage } from '../../shared/product-image';
import { NotFoundPage } from '../not-found/not-found.page';

/** Other posts shown under an article. */
export const MORE_POSTS_LIMIT = 3;

/**
 * Blog article (`/blog/:slug`, prerendered for every public post): cover image, category,
 * Serbian publication date, the content (sanitised by the API and again by Angular's
 * `[innerHTML]` sanitizer), the latest other posts, `BlogPosting` and `BreadcrumbList` JSON-LD
 * and Open Graph `article`. Drafts, scheduled and archived posts are 404 → the 404 view.
 */
@Component({
  selector: 'sf-blog-post-page',
  imports: [
    BlogCard,
    Breadcrumbs,
    NotFoundPage,
    ProductImage,
    RouterLink,
    SrDatePipe,
    UiErrorState,
    UiLoadingState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state().status) {
      @case ('missing') {
        <sf-not-found-page />
      }
      @case ('loading') {
        <div class="mx-auto max-w-page px-gutter py-section">
          <ui-loading-state label="Učitavanje teksta…" />
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-page px-gutter py-section">
          <ui-error-state
            title="Tekst nije učitan"
            [message]="errorMessage()"
            (retry)="retries.next()"
          />
        </div>
      }
      @default {
        @let p = post()!;
        <article class="pb-section" data-testid="blog-article">
          <div class="mx-auto max-w-3xl px-gutter pt-8">
            <sf-breadcrumbs [crumbs]="crumbs()" />
            <p class="mt-8 flex flex-wrap items-center gap-x-2 text-sm text-ink-700">
              @if (p.category; as c) {
                <a
                  [routerLink]="[categoryPath, c.slug]"
                  class="eyebrow underline-offset-4 hover:underline"
                  data-testid="post-category"
                  >{{ c.name }}</a
                >
                <span aria-hidden="true">·</span>
              }
              <time [attr.datetime]="p.publishedAt" data-testid="post-date">{{
                p.publishedAt | srDate: 'long'
              }}</time>
            </p>
            <h1 class="mt-3 text-4xl md:text-5xl" data-testid="post-title">{{ p.title }}</h1>
            <p class="mt-5 text-xl text-ink-700">{{ p.excerpt }}</p>
          </div>

          @if (p.coverImage; as cover) {
            <div class="mx-auto mt-10 max-w-5xl px-gutter">
              <sf-product-image
                class="aspect-[16/9] rounded-xl shadow-card"
                [image]="cover"
                alt=""
                sizes="(min-width: 1024px) 64rem, 100vw"
                priority
                data-testid="post-cover"
              />
            </div>
          }

          <div class="mx-auto mt-10 max-w-3xl px-gutter">
            <div class="rich-text" [innerHTML]="p.contentHtml" data-testid="post-body"></div>
            <p class="mt-12 border-t border-cream-200 pt-6">
              <a
                [routerLink]="blogPath"
                class="font-semibold text-olive-800 underline underline-offset-4"
                >← Svi tekstovi</a
              >
            </p>
          </div>
        </article>

        @if (more().length > 0) {
          <section
            class="border-t border-cream-200 bg-white"
            aria-labelledby="sf-more-posts"
            data-testid="more-posts"
          >
            <div class="mx-auto max-w-page px-gutter py-section">
              <h2 id="sf-more-posts" class="text-3xl">Još iz bloga</h2>
              <ul class="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                @for (item of more(); track item.slug) {
                  <li><sf-blog-card [post]="item" /></li>
                }
              </ul>
            </div>
          </section>
        }
      }
    }
  `,
})
export class BlogPostPage {
  private readonly api = inject(ContentApi);
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);
  private readonly siteUrl = inject(SITE_URL);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly hydrating = this.browser && !inject(Router).navigated;
  protected readonly retries = new Subject<void>();

  protected readonly blogPath = BLOG_PATH;
  protected readonly categoryPath = BLOG_CATEGORY_PATH;

  readonly state = signal<PageState<PublicBlogPost>>({ status: 'loading' });
  private readonly latest = signal<PublicBlogPostListItem[]>([]);
  private readonly slug = signal('');

  protected readonly post = computed(() => {
    const state = this.state();
    return state.status === 'loaded' ? state.data : null;
  });
  /** The latest posts without the one on screen. */
  protected readonly more = computed(() =>
    this.latest()
      .filter((item) => item.slug !== this.slug())
      .slice(0, MORE_POSTS_LIMIT),
  );
  protected readonly crumbs = computed<Crumb[]>(() => {
    const post = this.post();
    return [
      { name: 'Početna', path: '/' },
      { name: 'Blog', path: BLOG_PATH },
      ...(post?.category
        ? [{ name: post.category.name, path: `${BLOG_CATEGORY_PATH}/${post.category.slug}` }]
        : []),
      { name: post?.title ?? '', path: `${BLOG_PATH}/${this.slug()}` },
    ];
  });
  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.error.detail : '';
  });

  constructor() {
    const slugs = this.route.paramMap.pipe(
      map((params) => params.get('slug') ?? ''),
      distinctUntilChanged(),
    );
    slugs
      .pipe(
        switchMap((slug, index) => {
          this.slug.set(slug);
          return concat(of(0), this.retries).pipe(
            switchMap((_, attempt) =>
              pageStateWithRefresh(
                (options) => this.api.blogPost(slug, options),
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

    cachedThenFresh(
      (options) => this.api.latestPosts(MORE_POSTS_LIMIT + 1, options),
      this.hydrating,
    )
      .pipe(
        catchError(() => EMPTY),
        takeUntilDestroyed(),
      )
      .subscribe((items) => this.latest.set(items));
  }

  private updateSeo(): void {
    const state = this.state();
    const path = `${BLOG_PATH}/${this.slug()}`;
    if (state.status === 'missing') {
      this.seo.setPage({ title: `Tekst nije pronađen – ${SITE_NAME}`, path, noindex: true });
      return;
    }
    const post = this.post();
    if (!post) {
      return;
    }
    this.seo.setPage({
      title: post.seoTitle?.trim() || `${post.title} – ${SITE_NAME}`,
      description: truncate(
        post.seoDescription?.trim() || post.excerpt || htmlToText(post.contentHtml),
      ),
      path: `${BLOG_PATH}/${post.slug}`,
      type: 'article',
      image: shareImageUrl(post.coverImage),
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      jsonLd: [
        blogPostingJsonLd(post, this.siteUrl),
        breadcrumbJsonLd(this.crumbs(), this.siteUrl),
      ],
    });
  }
}
