import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ApiError, asApiError } from '@zladovce/api';
import { LowStockResponse } from '@zladovce/models';
import { STOCK_STATUS_LABELS, STOCK_STATUS_TONES } from '@zladovce/shared';
import { UiBadge, UiCard, UiCardTitle, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { InventoryApi } from '../../data/inventory-api';

export const LOW_STOCK_LIMIT = 5;

type State =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; data: LowStockResponse };

/** Dashboard card "Malo na stanju": packages at or below their threshold, emptiest first. */
@Component({
  selector: 'adm-low-stock-card',
  imports: [RouterLink, UiCard, UiCardTitle, UiBadge, UiLoadingState, UiErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ui-card data-testid="low-stock">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 uiCardTitle>Malo na stanju</h2>
        @if (state(); as s) {
          @if (s.status === 'loaded' && s.data.totalItems > 0) {
            <ui-badge tone="warning" data-testid="low-stock-total">{{
              s.data.totalItems
            }}</ui-badge>
          }
        }
      </div>
      @switch (state().status) {
        @case ('loading') {
          <ui-loading-state label="Učitavanje zaliha…" />
        }
        @case ('error') {
          <ui-error-state title="Zalihe nisu učitane" [message]="errorMessage()" (retry)="load()" />
        }
        @default {
          @if (data(); as data) {
            @if (data.items.length === 0) {
              <p class="mt-4 text-sm text-ink-700" data-testid="low-stock-empty">
                Sva pakovanja su dobro snabdevena.
              </p>
            } @else {
              <ul class="mt-4 flex flex-col divide-y divide-cream-200">
                @for (item of data.items; track item.variantId) {
                  <li class="flex items-center gap-3 py-2.5" data-testid="low-stock-item">
                    <div class="min-w-0 flex-1">
                      <a
                        class="font-semibold text-ink-900 underline-offset-4 hover:underline"
                        routerLink="/zalihe"
                        [queryParams]="{ q: item.sku }"
                        >{{ item.productName }} – {{ item.variantName }}</a
                      >
                      <p class="text-xs text-ink-500">
                        Upozorenje na {{ item.lowStockThreshold }} · {{ item.sku }}
                      </p>
                    </div>
                    <span class="text-lg font-semibold text-ink-900">{{
                      item.quantityOnHand
                    }}</span>
                    <ui-badge [tone]="tones[item.status]">{{ labels[item.status] }}</ui-badge>
                  </li>
                }
              </ul>
              @if (data.totalItems > data.items.length) {
                <p class="mt-2 text-sm text-ink-500">
                  Prikazano {{ data.items.length }} od {{ data.totalItems }}.
                </p>
              }
            }
            <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
              <a
                routerLink="/zalihe"
                [queryParams]="{ status: 'low' }"
                class="text-olive-700 underline underline-offset-4"
                data-testid="low-stock-link"
                >Zalihe: malo na stanju</a
              >
              <a
                routerLink="/zalihe"
                [queryParams]="{ status: 'out' }"
                class="text-olive-700 underline underline-offset-4"
                >Zalihe: nema na stanju</a
              >
            </div>
          }
        }
      }
    </ui-card>
  `,
})
export class LowStockCard {
  private readonly api = inject(InventoryApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly labels = STOCK_STATUS_LABELS;
  protected readonly tones = STOCK_STATUS_TONES;
  protected readonly state = signal<State>({ status: 'loading' });

  constructor() {
    this.load();
  }

  protected data(): LowStockResponse | null {
    const state = this.state();
    return state.status === 'loaded' ? state.data : null;
  }

  protected errorMessage(): string {
    const state = this.state();
    return state.status === 'error' ? state.error.detail : '';
  }

  load(): void {
    this.state.set({ status: 'loading' });
    this.api
      .lowStock(LOW_STOCK_LIMIT)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.state.set({ status: 'loaded', data }),
        error: (error: unknown) => this.state.set({ status: 'error', error: asApiError(error) }),
      });
  }
}
