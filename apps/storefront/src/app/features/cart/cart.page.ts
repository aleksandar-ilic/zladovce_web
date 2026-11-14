import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartStore } from '@zladovce/shared';
import { UiButton, UiCard, UiEmptyState } from '@zladovce/ui';

/**
 * Cart (client-rendered). Phase 2 shows the real state of the CartStore; Phase 4 replaces
 * the summary with priced lines from the quote endpoint.
 */
@Component({
  selector: 'sf-cart-page',
  imports: [RouterLink, UiButton, UiCard, UiEmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-page px-gutter py-section">
      <h1 class="text-3xl md:text-4xl">Korpa</h1>

      <div class="mt-8">
        @if (cart.isEmpty()) {
          <ui-card padding="lg">
            <ui-empty-state
              title="Vaša korpa je prazna"
              description="Kada dodate proizvode u korpu, videćete ih ovde."
            >
              <a uiButton variant="secondary" routerLink="/">Nazad na početnu</a>
            </ui-empty-state>
          </ui-card>
        } @else {
          <ui-card padding="lg">
            <p class="text-lg text-ink-900">
              Broj proizvoda u korpi: <strong>{{ cart.totalQuantity() }}</strong>
            </p>
            <div class="mt-6">
              <button uiButton type="button" variant="secondary" (click)="cart.clear()">
                Isprazni korpu
              </button>
            </div>
          </ui-card>
        }
      </div>
    </div>
  `,
})
export class CartPage {
  protected readonly cart = inject(CartStore);
}
