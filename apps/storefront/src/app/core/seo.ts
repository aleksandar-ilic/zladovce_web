import { inject, Injectable } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/** SEO fields a route can declare in its `data`. The page title uses the router's own `title`. */
export interface SeoData {
  /** Content of `<meta name="description">`. */
  description?: string;
  /** Adds `<meta name="robots" content="noindex">` (cart, checkout, tracking, 404). */
  noindex?: boolean;
}

/**
 * Keeps the document's meta tags in line with the current route, both in the prerendered
 * HTML and after client-side navigation (tags of the previous page are removed).
 * Phase 4 extends it with canonical URLs, Open Graph tags and JSON-LD.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly router = inject(Router);
  private readonly meta = inject(Meta);
  private started = false;

  /** Called once by the application shell. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.apply(this.currentData()));
  }

  private currentData(): SeoData {
    let route: ActivatedRouteSnapshot = this.router.routerState.snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    return route.data as SeoData;
  }

  private apply(data: SeoData): void {
    if (data.description) {
      this.meta.updateTag({ name: 'description', content: data.description });
    } else {
      this.meta.removeTag('name="description"');
    }
    if (data.noindex) {
      this.meta.updateTag({ name: 'robots', content: 'noindex' });
    } else {
      this.meta.removeTag('name="robots"');
    }
  }
}
