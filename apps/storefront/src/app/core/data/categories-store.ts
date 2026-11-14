import { isPlatformServer } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { asApiError } from '@zladovce/api';
import { PublicCategory } from '@zladovce/models';
import { CatalogApi } from './catalog-api';
import { LOADING, Remote } from './remote';

/**
 * Visible categories in shop order, loaded once (`ensureLoaded()`) and shared by the header
 * menu, the shop filters and the homepage.
 */
@Injectable({ providedIn: 'root' })
export class CategoriesStore {
  private readonly api = inject(CatalogApi);
  private readonly server = isPlatformServer(inject(PLATFORM_ID));
  private readonly state = signal<Remote<PublicCategory[]>>(LOADING);
  private requested = false;

  readonly remote = this.state.asReadonly();
  readonly categories = computed(() => {
    const remote = this.state();
    return remote.status === 'loaded' ? remote.data : [];
  });

  ensureLoaded(): void {
    if (this.requested) {
      return;
    }
    this.requested = true;
    this.api.categories().subscribe({
      next: (items) => this.state.set({ status: 'loaded', data: items }),
      error: (error: unknown) => {
        // At build time a failure keeps the "loading" state, so the prerendered HTML matches
        // what the browser shows first; the browser then loads the categories itself.
        if (!this.server) {
          this.state.set({ status: 'error', error: asApiError(error) });
          this.requested = false;
        }
      },
    });
  }

  /** Retry after an error. */
  reload(): void {
    this.state.set(LOADING);
    this.ensureLoaded();
  }
}
