import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { PublicBlogPost, PublicBlogPostListItem } from '@zladovce/models';
import { routes } from '../../app.routes';
import { API, paged, SITE, settle, testProviders, text } from '../../testing/fixtures';
import { BLOG_PAGE_SIZE, pageFromQuery } from './blog-list.page';

const COVER = {
  key: 'blog/c1',
  baseUrl: 'http://localhost:9000/media/blog/c1',
  widths: [400, 800, 1600],
  width: 1600,
  height: 900,
};

function item(overrides: Partial<PublicBlogPostListItem> = {}): PublicBlogPostListItem {
  return {
    title: 'Kako kuvamo džem',
    slug: 'kako-kuvamo-dzem',
    excerpt: 'Polako i strpljivo.',
    coverImage: COVER,
    category: { name: 'Iz kuhinje', slug: 'iz-kuhinje' },
    publishedAt: '2026-11-14T10:00:00Z',
    ...overrides,
  };
}

const POST: PublicBlogPost = {
  ...item(),
  contentHtml:
    '<h2>Voće</h2><p>Biramo <a href="/prodavnica">zrelo</a> voće.</p><img src="http://localhost:9000/media/blog/i/800.webp" alt="Tegla"><script>alert(1)</script>',
  updatedAt: '2026-11-15T08:00:00Z',
  seoTitle: null,
  seoDescription: null,
};

const CATEGORIES = {
  items: [
    { name: 'Iz kuhinje', slug: 'iz-kuhinje', postCount: 2 },
    { name: 'Prazna', slug: 'prazna', postCount: 0 },
  ],
};

async function open(path: string) {
  TestBed.configureTestingModule({ providers: [provideRouter(routes), ...testProviders()] });
  const harness = await RouterTestingHarness.create(path);
  const render = () => settle(() => harness.detectChanges(), 6);
  const root = () => harness.routeNativeElement as HTMLElement;
  return {
    harness,
    render,
    root,
    http: TestBed.inject(HttpTestingController),
    el: (id: string) => root().querySelector<HTMLElement>(`[data-testid="${id}"]`),
  };
}

const head = () => document.head;
const meta = (attr: string, name: string) =>
  head().querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`)?.content ?? null;
const canonical = () => head().querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
const jsonLd = () =>
  [...head().querySelectorAll('script[type="application/ld+json"]')].map(
    (s) => JSON.parse(s.textContent ?? '{}') as Record<string, unknown>,
  );

describe('blog helpers', () => {
  it('reads the page number from the query', () => {
    expect(pageFromQuery('3')).toBe(3);
    expect(pageFromQuery('0')).toBe(1);
    expect(pageFromQuery('x')).toBe(1);
    expect(pageFromQuery(null)).toBe(1);
  });
});

describe('blog', () => {
  // Requests are matched explicitly; the post-hydration refreshes are left open on purpose.
  afterEach(() => {
    head()
      .querySelectorAll('meta, link[rel="canonical"], script[data-sf-jsonld]')
      .forEach((element) => element.remove());
  });

  it('lists posts with category chips, Serbian dates, covers and paging', async () => {
    const ctx = await open('/blog');
    ctx.http.expectOne(`${API}/blog/categories`).flush(CATEGORIES);
    const list = ctx.http.expectOne((r) => r.url === `${API}/blog/posts`);
    expect(list.request.params.get('page')).toBe('1');
    expect(list.request.params.get('pageSize')).toBe(String(BLOG_PAGE_SIZE));
    expect(list.request.params.has('category')).toBe(false);
    list.flush(paged([item(), item({ slug: 'drugi', title: 'Drugi', coverImage: null })], 1, 9, 20));
    await ctx.render();

    expect(text(ctx.el('page-title'))).toBe('Blog');
    const chips = [...(ctx.el('blog-chips')?.querySelectorAll('a') ?? [])];
    expect(chips.map((a) => [text(a), a.getAttribute('href')])).toEqual([
      ['Sve', '/blog'],
      ['Iz kuhinje', '/blog/kategorija/iz-kuhinje'],
    ]);
    expect(chips[0]?.getAttribute('aria-current')).toBe('page');
    const cards = ctx.root().querySelectorAll('[data-testid="blog-card"]');
    expect(cards.length).toBe(2);
    expect(text(cards[0]!)).toContain('14. novembar 2026.');
    expect(cards[0]!.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-14T10:00:00Z');
    expect(cards[0]!.querySelector('img')?.getAttribute('src')).toBe(
      'http://localhost:9000/media/blog/c1/800.webp',
    );
    expect(cards[1]!.querySelector('[data-testid="image-placeholder"]')).not.toBeNull();
    expect(cards[0]!.querySelector('a')?.getAttribute('href')).toBe('/blog/kako-kuvamo-dzem');
    const pager = ctx.el('blog-pager');
    expect(pager?.querySelector('a[rel="next"]')?.getAttribute('href')).toBe('/blog?page=2');
    expect(document.title).toBe('Blog – Zladovce');
    expect(canonical()).toBe(`${SITE}/blog`);
  });

  it('shows a friendly empty state when nothing is published', async () => {
    const ctx = await open('/blog');
    ctx.http.expectOne(`${API}/blog/categories`).flush({ items: [] });
    ctx.http.expectOne((r) => r.url === `${API}/blog/posts`).flush(paged([]));
    await ctx.render();
    expect(text(ctx.el('blog-empty'))).toContain('Prvi tekstovi stižu uskoro');
    expect(ctx.el('blog-chips')).toBeNull();
  });

  it('filters by category through a clean URL with breadcrumbs', async () => {
    const ctx = await open('/blog/kategorija/iz-kuhinje?page=2');
    ctx.http.expectOne(`${API}/blog/categories`).flush(CATEGORIES);
    const list = ctx.http.expectOne((r) => r.url === `${API}/blog/posts`);
    expect(list.request.params.get('category')).toBe('iz-kuhinje');
    expect(list.request.params.get('page')).toBe('2');
    list.flush(paged([item()], 2, 9, 10));
    await ctx.render();
    expect(text(ctx.el('page-title'))).toBe('Iz kuhinje');
    const active = ctx.el('blog-chips')?.querySelector('a[aria-current="page"]');
    expect(text(active)).toBe('Iz kuhinje');
    expect(ctx.root().querySelector('nav[aria-label="Putanja"]')).not.toBeNull();
    expect(document.title).toBe('Iz kuhinje – Blog – Zladovce');
    // Query strings are never canonical.
    expect(canonical()).toBe(`${SITE}/blog/kategorija/iz-kuhinje`);
    expect(ctx.el('blog-pager')?.querySelector('a[rel="prev"]')?.getAttribute('href')).toBe(
      '/blog/kategorija/iz-kuhinje',
    );
  });

  it('an unknown category is the 404 view', async () => {
    const ctx = await open('/blog/kategorija/nema');
    ctx.http.expectOne(`${API}/blog/categories`).flush(CATEGORIES);
    ctx.http
      .expectOne((r) => r.url === `${API}/blog/posts`)
      .flush({ code: 'NOT_FOUND', detail: 'x' }, { status: 404, statusText: 'NF' });
    await ctx.render();
    expect(ctx.root().querySelector('sf-not-found-page')).not.toBeNull();
    expect(meta('name', 'robots')).toBe('noindex');
  });

  it('article: cover, date, category, sanitised content, more posts, BlogPosting and Open Graph', async () => {
    const ctx = await open('/blog/kako-kuvamo-dzem');
    ctx.http.expectOne(`${API}/blog/posts/kako-kuvamo-dzem`).flush(POST);
    ctx.http
      .expectOne((r) => r.url === `${API}/blog/latest-posts`)
      .flush({ items: [item(), item({ slug: 'drugi', title: 'Drugi tekst' })] });
    await ctx.render();

    expect(text(ctx.el('post-title'))).toBe('Kako kuvamo džem');
    expect(text(ctx.el('post-date'))).toBe('14. novembar 2026.');
    expect(ctx.el('post-category')?.getAttribute('href')).toBe('/blog/kategorija/iz-kuhinje');
    expect(ctx.el('post-cover')?.querySelector('img')?.getAttribute('loading')).toBe('eager');
    const body = ctx.el('post-body')!;
    expect(body.querySelector('h2')).not.toBeNull();
    expect(body.querySelector('img')?.getAttribute('alt')).toBe('Tegla');
    expect(body.querySelector('script')).toBeNull();
    // The current post is not repeated under "Još iz bloga".
    const more = ctx.el('more-posts');
    expect([...(more?.querySelectorAll('[data-testid="blog-card-link"]') ?? [])].map(text)).toEqual(
      ['Drugi tekst'],
    );

    expect(document.title).toBe('Kako kuvamo džem – Zladovce');
    expect(meta('name', 'description')).toBe('Polako i strpljivo.');
    expect(meta('property', 'og:type')).toBe('article');
    expect(meta('property', 'og:image')).toBe('http://localhost:9000/media/blog/c1/1600.webp');
    expect(meta('property', 'article:published_time')).toBe('2026-11-14T10:00:00Z');
    expect(canonical()).toBe(`${SITE}/blog/kako-kuvamo-dzem`);
    const [posting, crumbs] = jsonLd();
    expect(posting).toMatchObject({
      '@type': 'BlogPosting',
      headline: 'Kako kuvamo džem',
      datePublished: '2026-11-14T10:00:00Z',
      dateModified: '2026-11-15T08:00:00Z',
      image: ['http://localhost:9000/media/blog/c1/1600.webp'],
      articleSection: 'Iz kuhinje',
      url: `${SITE}/blog/kako-kuvamo-dzem`,
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}/blog/kako-kuvamo-dzem` },
      publisher: { '@type': 'Organization', name: 'Zladovce' },
    });
    expect(crumbs).toMatchObject({ '@type': 'BreadcrumbList' });
    expect((crumbs as { itemListElement: unknown[] }).itemListElement).toHaveLength(4);
  });

  it('an unpublished or unknown article is the 404 view', async () => {
    const ctx = await open('/blog/nacrt');
    ctx.http
      .expectOne(`${API}/blog/posts/nacrt`)
      .flush({ code: 'NOT_FOUND', detail: 'x' }, { status: 404, statusText: 'NF' });
    ctx.http.expectOne((r) => r.url === `${API}/blog/latest-posts`).flush({ items: [] });
    await ctx.render();
    expect(ctx.root().querySelector('sf-not-found-page')).not.toBeNull();
    expect(meta('name', 'robots')).toBe('noindex');
    expect(TestBed.inject(Router).url).toBe('/blog/nacrt');
  });
});
