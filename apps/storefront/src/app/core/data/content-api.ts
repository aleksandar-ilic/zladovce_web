import { inject, Injectable } from '@angular/core';
import { ApiClient } from '@zladovce/api';
import {
  AboutPage,
  ContactRequest,
  FormAccepted,
  HomePage,
  LatestBlogPosts,
  NewsletterStatus,
  Paged,
  PublicBlogCategory,
  PublicBlogCategoryList,
  PublicBlogPost,
  PublicBlogPostListItem,
  PublicFaq,
  PublicFaqItem,
  PublicTestimonial,
  PublicTestimonials,
  RichTextPage,
  SeoRoutes,
} from '@zladovce/models';
import { map, Observable } from 'rxjs';
import { FetchOptions } from './catalog-api';

export type RichTextPageKey = 'privacy' | 'terms' | 'delivery';

export interface BlogPostQuery {
  /** Blog category slug; an unknown slug answers 404. */
  category?: string;
  page?: number;
  pageSize?: number;
}

const cacheOption = (options: FetchOptions) => (options.fresh ? { transferCache: false } : {});

/**
 * Public content of Phase 7: CMS pages, FAQ, testimonials, blog, newsletter and the contact
 * form. Pages answer 404 while they have no content; callers treat that as "not set".
 */
@Injectable({ providedIn: 'root' })
export class ContentApi {
  private readonly api = inject(ApiClient);

  homePage(options: FetchOptions = {}): Observable<HomePage> {
    return this.api.get<HomePage>('/content/pages/home', cacheOption(options));
  }

  aboutPage(options: FetchOptions = {}): Observable<AboutPage> {
    return this.api.get<AboutPage>('/content/pages/about', cacheOption(options));
  }

  richTextPage(key: RichTextPageKey, options: FetchOptions = {}): Observable<RichTextPage> {
    return this.api.get<RichTextPage>(`/content/pages/${key}`, cacheOption(options));
  }

  faq(options: FetchOptions = {}): Observable<PublicFaqItem[]> {
    return this.api
      .get<PublicFaq>('/content/faq', cacheOption(options))
      .pipe(map((response) => response.items));
  }

  testimonials(options: FetchOptions = {}): Observable<PublicTestimonial[]> {
    return this.api
      .get<PublicTestimonials>('/content/testimonials', cacheOption(options))
      .pipe(map((response) => response.items));
  }

  /** Which pages, posts and categories are public (used for the conditional menu links). */
  seoRoutes(options: FetchOptions = {}): Observable<SeoRoutes> {
    return this.api.get<SeoRoutes>('/seo/routes', cacheOption(options));
  }

  blogCategories(options: FetchOptions = {}): Observable<PublicBlogCategory[]> {
    return this.api
      .get<PublicBlogCategoryList>('/blog/categories', cacheOption(options))
      .pipe(map((response) => response.items));
  }

  blogPosts(
    query: BlogPostQuery,
    options: FetchOptions = {},
  ): Observable<Paged<PublicBlogPostListItem>> {
    return this.api.get<Paged<PublicBlogPostListItem>>('/blog/posts', {
      ...cacheOption(options),
      params: { category: query.category, page: query.page, pageSize: query.pageSize },
    });
  }

  blogPost(slug: string, options: FetchOptions = {}): Observable<PublicBlogPost> {
    return this.api.get<PublicBlogPost>(
      `/blog/posts/${encodeURIComponent(slug)}`,
      cacheOption(options),
    );
  }

  latestPosts(limit = 3, options: FetchOptions = {}): Observable<PublicBlogPostListItem[]> {
    return this.api
      .get<LatestBlogPosts>('/blog/latest-posts', { ...cacheOption(options), params: { limit } })
      .pipe(map((response) => response.items));
  }

  /** Always 202 with the same message, whatever the state of the address (no enumeration). */
  subscribe(email: string, website: string): Observable<FormAccepted> {
    return this.api.post<FormAccepted>('/newsletter/subscriptions', {
      email,
      consent: true,
      website,
    });
  }

  confirmSubscription(token: string): Observable<NewsletterStatus> {
    return this.api.post<NewsletterStatus>('/newsletter/confirm', { token });
  }

  unsubscribe(token: string): Observable<NewsletterStatus> {
    return this.api.post<NewsletterStatus>('/newsletter/unsubscribe', { token });
  }

  contact(request: Required<ContactRequest>): Observable<FormAccepted> {
    return this.api.post<FormAccepted>('/contact', request);
  }
}
