import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { BlogPostState } from '@zladovce/models';
import { UiBadge, UiEmptyState, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { SrDatePipe } from '@zladovce/utilities';
import { catchError, map, of } from 'rxjs';
import { BlogApi } from '../../data/blog-api';
import { imageSrc } from '../../shared/images';
import {
  compactParams,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  readEnum,
  readPositiveInt,
  readString,
  readUuid,
} from '../../shared/list-query';
import { SERBIAN_PAGINATOR } from '../../shared/paginator-intl';
import { RemoteData } from '../../shared/remote-data';
import { BLOG_STATE_LABELS, BLOG_STATE_TONES, blogStateText } from './blog-form';

const STATES: readonly BlogPostState[] = ['Draft', 'Scheduled', 'Published'];

export interface BlogListQuery {
  q: string;
  status: BlogPostState | '';
  categoryId: string;
  page: number;
  pageSize: number;
}

export function parseBlogQuery(params: Params): BlogListQuery {
  return {
    q: readString(params, 'q'),
    status: readEnum(params, 'status', STATES) ?? '',
    categoryId: readUuid(params, 'kategorija') ?? '',
    page: readPositiveInt(params, 'page', 1),
    pageSize: readPositiveInt(params, 'pageSize', DEFAULT_PAGE_SIZE, 100),
  };
}

export function blogQueryParams(query: BlogListQuery): Params {
  return compactParams(
    {
      q: query.q.trim(),
      status: query.status,
      kategorija: query.categoryId,
      page: query.page,
      pageSize: query.pageSize,
    },
    { page: 1, pageSize: DEFAULT_PAGE_SIZE },
  );
}

/**
 * Blog: every post with its state (draft, scheduled, published), search, state and category
 * filters (kept in the URL), and "Nova objava". Categories are managed on their own page.
 */
@Component({
  selector: 'adm-blog-posts-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    SrDatePipe,
    UiBadge,
    UiEmptyState,
    UiErrorState,
    UiLoadingState,
  ],
  providers: [SERBIAN_PAGINATOR],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex max-w-5xl flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-3xl">Blog</h1>
        <p class="mt-2 max-w-2xl text-ink-700">
          Tekstovi o proizvodima, receptima i životu na imanju. Kupci vide samo objavljene; nacrti i
          zakazane objave se ne vide na sajtu.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <a matButton="outlined" routerLink="/blog/kategorije" data-testid="blog-categories-link"
          >Kategorije bloga</a
        >
        <a matButton="filled" routerLink="/blog/nova" class="min-h-12" data-testid="new-post"
          >Nova objava</a
        >
      </div>
    </div>

    <div class="mt-6 flex max-w-5xl flex-wrap items-start gap-3">
      <mat-form-field appearance="outline" class="w-full sm:w-72" subscriptSizing="dynamic">
        <mat-label>Pretraga po naslovu</mat-label>
        <input
          matInput
          type="search"
          #search
          [value]="query().q"
          (keydown.enter)="update({ q: search.value })"
          (change)="update({ q: search.value })"
          data-testid="search"
        />
      </mat-form-field>
      <mat-form-field appearance="outline" class="w-full sm:w-48" subscriptSizing="dynamic">
        <mat-label>Stanje</mat-label>
        <mat-select
          [value]="query().status"
          (valueChange)="update({ status: $event })"
          data-testid="status-filter"
        >
          <mat-option value="">Sve</mat-option>
          @for (state of states; track state) {
            <mat-option [value]="state">{{ labels[state] }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" class="w-full sm:w-56" subscriptSizing="dynamic">
        <mat-label>Kategorija</mat-label>
        <mat-select [value]="query().categoryId" (valueChange)="update({ categoryId: $event })">
          <mat-option value="">Sve kategorije</mat-option>
          @for (c of categories(); track c.id) {
            <mat-option [value]="c.id">{{ c.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>

    <div class="mt-4 max-w-5xl">
      @if (list().error; as error) {
        <ui-error-state
          title="Objave nisu učitane"
          [message]="error.detail"
          (retry)="listData.reload()"
        />
      } @else if (list().data; as page) {
        @if (page.items.length === 0) {
          @if (filtered()) {
            <ui-empty-state title="Nema objava za ovaj filter" />
          } @else {
            <ui-empty-state
              title="Još nema objava"
              description="Napišite prvu objavu – sačuvaće se kao nacrt dok je ne objavite."
            >
              <a matButton="filled" routerLink="/blog/nova">Nova objava</a>
            </ui-empty-state>
          }
        } @else {
          <ul class="flex flex-col gap-2" aria-label="Objave" [class.opacity-60]="list().busy">
            @for (post of page.items; track post.id) {
              <li
                class="relative flex items-center gap-4 rounded-lg border border-cream-200 bg-white p-3 hover:border-olive-400"
                data-testid="post-row"
              >
                @if (post.coverImage) {
                  <img
                    [src]="cover(post.coverImage)"
                    alt=""
                    class="hidden size-16 shrink-0 rounded-sm object-cover sm:block"
                  />
                } @else {
                  <div class="hidden size-16 shrink-0 rounded-sm bg-cream-100 sm:block"></div>
                }
                <div class="min-w-0 flex-1">
                  <a
                    [routerLink]="['/blog', post.id]"
                    class="font-semibold text-ink-900 after:absolute after:inset-0 after:content-['']"
                    >{{ post.title }}</a
                  >
                  <p class="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-700">
                    <ui-badge [tone]="tones[post.state]">{{ labels[post.state] }}</ui-badge>
                    <span>{{ stateText(post.state, post.publishedAt) }}</span>
                    @if (post.category) {
                      <span>· {{ post.category.name }}</span>
                    }
                  </p>
                </div>
                <span class="hidden text-sm text-ink-500 md:inline"
                  >Izmena {{ post.updatedAt | srDate: 'date' }}</span
                >
              </li>
            }
          </ul>
          <mat-paginator
            class="mt-4 bg-transparent"
            [length]="page.totalItems"
            [pageIndex]="query().page - 1"
            [pageSize]="query().pageSize"
            [pageSizeOptions]="pageSizes"
            (page)="pageChanged($event)"
          />
        }
      } @else {
        <ui-loading-state label="Učitavanje objava…" />
      }
    </div>
  `,
})
export class BlogPostsPage {
  private readonly api = inject(BlogApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly states = STATES;
  protected readonly labels = BLOG_STATE_LABELS;
  protected readonly tones = BLOG_STATE_TONES;
  protected readonly pageSizes = [...PAGE_SIZE_OPTIONS];

  readonly query = toSignal(this.route.queryParams.pipe(map(parseBlogQuery)), {
    initialValue: parseBlogQuery(this.route.snapshot.queryParams),
  });
  protected readonly filtered = computed(
    () => !!(this.query().q || this.query().status || this.query().categoryId),
  );
  protected readonly categories = toSignal(
    this.api.categories().pipe(
      map((list) => list.items),
      catchError(() => of([])),
    ),
    { initialValue: [] },
  );
  protected readonly listData = new RemoteData(
    this.route.queryParams.pipe(map(parseBlogQuery)),
    (query) =>
      this.api.posts({
        q: query.q || undefined,
        status: query.status || undefined,
        categoryId: query.categoryId || undefined,
        page: query.page,
        pageSize: query.pageSize,
      }),
  );
  protected readonly list = this.listData.value;

  protected cover(image: { baseUrl: string; widths: number[] }): string {
    return imageSrc(image, 400);
  }

  protected stateText(state: BlogPostState, publishedAt: string | null): string {
    return blogStateText(state, publishedAt).replace(/ – .*$/, '');
  }

  update(changes: Partial<BlogListQuery>): void {
    const next: BlogListQuery = { ...this.query(), page: 1, ...changes };
    void this.router.navigate([], { relativeTo: this.route, queryParams: blogQueryParams(next) });
  }

  protected pageChanged(event: PageEvent): void {
    this.update({ page: event.pageIndex + 1, pageSize: event.pageSize });
  }
}
