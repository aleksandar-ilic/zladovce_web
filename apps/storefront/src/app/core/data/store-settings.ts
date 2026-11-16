import { isPlatformServer } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { ApiClient } from '@zladovce/api';
import { PublicStore } from '@zladovce/models';

/**
 * Public store settings (`GET /store`): shipping, contact, social links and SEO defaults.
 * Loaded once per application (`ensureLoaded()` from the components that need it); every value
 * may be null and is then simply not shown.
 */
@Injectable({ providedIn: 'root' })
export class StoreSettings {
  private readonly api = inject(ApiClient);
  private readonly server = isPlatformServer(inject(PLATFORM_ID));
  private readonly state = signal<PublicStore | null>(null);
  private readonly statusState = signal<'loading' | 'loaded' | 'error'>('loading');
  private requested = false;

  /** Null until loaded, and when the request failed (sections that need it stay hidden). */
  readonly settings = this.state.asReadonly();
  readonly shipping = computed(() => this.state()?.shipping ?? null);
  /** `error` after a failed request in the browser (the prerender stays `loading`). */
  readonly status = this.statusState.asReadonly();

  ensureLoaded(): void {
    if (this.requested) {
      return;
    }
    this.requested = true;
    if (this.state() === null) {
      this.statusState.set('loading');
    }
    this.api.get<PublicStore>('/store').subscribe({
      next: (store) => {
        this.state.set(store);
        this.statusState.set('loaded');
      },
      error: () => {
        // The browser tries again on the next call; the prerender renders without it.
        if (!this.server) {
          this.requested = false;
          this.statusState.set('error');
        }
      },
    });
  }
}
