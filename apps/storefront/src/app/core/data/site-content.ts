import { isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SeoRoutes } from '@zladovce/models';
import { catchError, defer, EMPTY, Observable, of, shareReplay } from 'rxjs';
import { deliveryFacts } from '../../shared/delivery-facts';
import { ContentFlag } from '../navigation';
import { ContentApi } from './content-api';
import { cachedThenFresh } from './hydration';
import { StoreSettings } from './store-settings';

/** Flags derived from `GET /seo/routes`: CMS pages with content and whether a post is public. */
export function flagsFromRoutes(routes: Partial<SeoRoutes> | null | undefined): ContentFlag[] {
  const flags: ContentFlag[] = [];
  const keys = new Set((routes?.pages ?? []).map((page) => page.key));
  for (const key of ['about', 'privacy', 'terms', 'delivery'] as const) {
    if (keys.has(key)) {
      flags.push(key);
    }
  }
  if ((routes?.blogPosts ?? []).length > 0) {
    flags.push('blog');
  }
  return flags;
}

/**
 * Which optional pages have content, for the menu, the footer and the checkout terms link
 * (navigation.ts `requires`).
 *
 * Sources: `GET /seo/routes` (CMS pages with content, public blog posts), `GET /content/faq`
 * (published items) and `GET /store` (delivery facts – the delivery page falls back to them).
 * The prerender reads them at build time, so the links are in the static HTML; the browser
 * reuses that answer while hydrating and then asks the API again, so a page published or
 * emptied after the build gains or loses its link without a rebuild. Until the first answer
 * (and when the API is unreachable) only links to pages that always exist are shown.
 */
@Injectable({ providedIn: 'root' })
export class SiteContent {
  private readonly api = inject(ContentApi);
  private readonly store = inject(StoreSettings);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly router = inject(Router);
  /** Decided once, when the service is created during bootstrap. */
  private readonly hydrating = this.browser && !this.router.navigated;
  private readonly routeFlags = signal<readonly ContentFlag[]>([]);
  private readonly hasFaq = signal(false);
  private requested = false;

  readonly available = computed<ReadonlySet<ContentFlag>>(() => {
    const flags = new Set<ContentFlag>(this.routeFlags());
    if (this.hasFaq()) {
      flags.add('faq');
    }
    if (deliveryFacts(this.store.shipping()).length > 0) {
      flags.add('delivery');
    }
    return flags;
  });

  /**
   * `GET /seo/routes` (build-time answer, then the fresh one while hydrating), shared by every
   * subscriber; null when it failed. The homepage uses it to skip asking for an empty CMS page.
   */
  readonly routes$: Observable<SeoRoutes | null> = defer(() =>
    cachedThenFresh((options) => this.api.seoRoutes(options), this.hydrating).pipe(
      catchError(() => of(null)),
    ),
  ).pipe(shareReplay(1));

  has(flag: ContentFlag): boolean {
    return this.available().has(flag);
  }

  ensureLoaded(): void {
    if (this.requested) {
      return;
    }
    this.requested = true;
    this.store.ensureLoaded();
    this.routes$.subscribe((routes) => {
      if (routes) {
        this.routeFlags.set(flagsFromRoutes(routes));
      }
    });
    cachedThenFresh((options) => this.api.faq(options), this.hydrating)
      .pipe(catchError(() => EMPTY))
      .subscribe((items) => this.hasFaq.set(items.length > 0));
  }
}
