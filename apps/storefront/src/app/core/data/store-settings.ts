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
  private requested = false;

  /** Null until loaded, and when the request failed (sections that need it stay hidden). */
  readonly settings = this.state.asReadonly();
  readonly shipping = computed(() => this.state()?.shipping ?? null);

  ensureLoaded(): void {
    if (this.requested) {
      return;
    }
    this.requested = true;
    this.api.get<PublicStore>('/store').subscribe({
      next: (store) => this.state.set(store),
      error: () => {
        // The browser tries again on the next call; the prerender renders without it.
        if (!this.server) {
          this.requested = false;
        }
      },
    });
  }
}
