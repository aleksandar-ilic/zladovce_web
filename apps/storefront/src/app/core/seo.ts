import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, ResolveEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SITE_URL } from './site-url';

/** SEO fields a route can declare in its `data`. The page title uses the router's own `title`. */
export interface SeoData {
  /** Content of `<meta name="description">`. */
  description?: string;
  /** Adds `<meta name="robots" content="noindex">` (cart, checkout, tracking, 404). */
  noindex?: boolean;
}

/** Everything a page with its own data (product, category) sets once the data is there. */
export interface PageSeo {
  /** Full document title, e.g. `Džem od šljiva – Zladovce`. */
  title: string;
  description?: string | null;
  /** Path of the canonical URL (`/proizvod/dzem-od-sljiva`); query strings are never canonical. */
  path: string;
  /** Absolute image URL for Open Graph. */
  image?: string | null;
  type?: 'website' | 'product' | 'article';
  /** `article:published_time` / `article:modified_time` (ISO) for blog posts. */
  publishedTime?: string | null;
  modifiedTime?: string | null;
  noindex?: boolean;
  /** JSON-LD objects, each written as its own `<script type="application/ld+json">`. */
  jsonLd?: readonly object[];
}

export const SITE_NAME = 'Zladovce';

export const HOME_TITLE = 'Zladovce – domaći džemovi, sokovi, sirće i kompoti';

export const HOME_DESCRIPTION =
  'Zladovce – porodični posao sa juga Srbije. Domaći džemovi, voćni sokovi, sirće i kompoti, sa dostavom širom Srbije i plaćanjem pouzećem.';

export const SHOP_DESCRIPTION =
  'Domaći džemovi, voćni sokovi, sirće i kompoti porodice Zladovce sa juga Srbije. Dostava širom Srbije, plaćanje pouzećem.';
const JSON_LD_ATTRIBUTE = 'data-sf-jsonld';

/** JSON for a `<script>` element: `<` is escaped so the content can never close the element. */
export function serializeJsonLd(value: object): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Keeps title, description, robots, canonical URL, Open Graph tags and JSON-LD in line with
 * the current page – in the prerendered HTML and after client-side navigation (tags of the
 * previous page are replaced or removed).
 *
 * Static routes are described by their route `title` and `data` (applied when the route is
 * resolved, before the page is created). Pages with their own data call `setPage()`.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly router = inject(Router);
  private readonly meta = inject(Meta);
  private readonly titleService = inject(Title);
  private readonly document = inject(DOCUMENT);
  private readonly siteUrl = inject(SITE_URL);
  private started = false;

  /** Called once by the application shell. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.router.events
      .pipe(filter((event): event is ResolveEnd => event instanceof ResolveEnd))
      .subscribe((event) => this.applyRoute(event.state.root, event.urlAfterRedirects));
  }

  /** Absolute URL of a site path. */
  absoluteUrl(path: string): string {
    return `${this.siteUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  setPage(page: PageSeo): void {
    this.titleService.setTitle(page.title);
    this.apply(page);
  }

  private applyRoute(root: ActivatedRouteSnapshot, url: string): void {
    let route = root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    const data = route.data as SeoData;
    this.apply({
      // Routes without a title (product, category) set it themselves through setPage().
      title: route.title ?? this.titleService.getTitle(),
      description: data.description,
      path: url.split(/[?#]/)[0] || '/',
      noindex: data.noindex,
    });
  }

  private apply(page: PageSeo): void {
    this.setName('description', page.description);
    this.setName('robots', page.noindex ? 'noindex' : null);

    const url = page.noindex ? null : this.absoluteUrl(page.path);
    this.setCanonical(url);
    this.setProperty('og:site_name', SITE_NAME);
    this.setProperty('og:locale', 'sr_RS');
    this.setProperty('og:type', page.type ?? 'website');
    this.setProperty('og:title', page.title);
    this.setProperty('og:description', page.description);
    this.setProperty('og:url', url);
    this.setProperty('og:image', page.image);
    this.setProperty('article:published_time', page.publishedTime);
    this.setProperty('article:modified_time', page.modifiedTime);
    this.setName('twitter:card', page.image ? 'summary_large_image' : 'summary');
    this.setJsonLd(page.jsonLd ?? []);
  }

  private setName(name: string, content: string | null | undefined): void {
    if (content) {
      this.meta.updateTag({ name, content });
    } else {
      this.meta.removeTag(`name="${name}"`);
    }
  }

  private setProperty(property: string, content: string | null | undefined): void {
    if (content) {
      this.meta.updateTag({ property, content });
    } else {
      this.meta.removeTag(`property="${property}"`);
    }
  }

  private setCanonical(url: string | null): void {
    const head = this.document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!url) {
      link?.remove();
      return;
    }
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  private setJsonLd(items: readonly object[]): void {
    const head = this.document.head;
    head.querySelectorAll(`script[${JSON_LD_ATTRIBUTE}]`).forEach((script) => script.remove());
    for (const item of items) {
      const script = this.document.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      script.setAttribute(JSON_LD_ATTRIBUTE, '');
      script.textContent = serializeJsonLd(item);
      head.appendChild(script);
    }
  }
}
