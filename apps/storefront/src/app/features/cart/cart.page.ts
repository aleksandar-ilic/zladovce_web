import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartQuote, CartQuoteLine } from '@zladovce/models';
import { CART_MAX_LINE_QUANTITY, CartStore } from '@zladovce/shared';
import { UiButton, UiCard, UiEmptyState, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { formatRsd, RsdPipe } from '@zladovce/utilities';
import { lineLabel } from '../../core/cart/cart-messages';
import { CartQuoteService } from '../../core/cart/cart-quote.service';
import { ProductImage } from '../../shared/product-image';
import { QuantityStepper } from '../../shared/quantity-stepper';

/** Shipping row of the summary. */
export function shippingText(quote: CartQuote): string {
  if (!quote.shipping.enabled) {
    return 'Trenutno nije dostupna';
  }
  return quote.shipping.isFree || quote.shipping.price === 0
    ? 'Besplatna dostava'
    : formatRsd(quote.shipping.price);
}

/** "Još 1.200 RSD do besplatne dostave." – only while the threshold is not reached. */
export function freeShippingText(quote: CartQuote): string | null {
  const missing = quote.shipping.amountUntilFreeShipping;
  return missing !== null && missing > 0 ? `Još ${formatRsd(missing)} do besplatne dostave.` : null;
}

/** Minimum order message, only while the subtotal is below the minimum. */
export function minimumOrderText(quote: CartQuote): string | null {
  if (quote.meetsMinimumOrder || quote.minOrderAmount === null || quote.lines.length === 0) {
    return null;
  }
  const missing = quote.amountUntilMinimumOrder ?? quote.minOrderAmount - quote.subtotal;
  return `Najmanji iznos porudžbine je ${formatRsd(quote.minOrderAmount)}. Dodajte proizvode u vrednosti od još ${formatRsd(missing)}.`;
}

/**
 * Cart (client-rendered): every line priced by `POST /cart/quote` – re-quoted after each change
 * (debounced), with adjustments explained in plain Serbian. Checkout arrives in Phase 5: the
 * "Nastavi na poručivanje" button is shown disabled with an honest note, never as a dead link.
 */
@Component({
  selector: 'sf-cart-page',
  imports: [
    RouterLink,
    RsdPipe,
    ProductImage,
    QuantityStepper,
    UiButton,
    UiCard,
    UiEmptyState,
    UiErrorState,
    UiLoadingState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-page px-gutter pb-section pt-10 md:pt-14">
      <h1 class="text-4xl md:text-5xl">Korpa</h1>

      <p class="sr-only" aria-live="polite" data-testid="cart-announcement">{{ announcement() }}</p>

      @if (quotes.notices().length > 0) {
        <div
          class="mt-8 rounded-lg border border-warning-700/25 bg-warning-50 p-5 text-ink-900"
          role="status"
          data-testid="cart-notices"
        >
          <p class="font-semibold">Korpa je usklađena sa trenutnom ponudom:</p>
          <ul class="mt-2 list-disc space-y-1 pl-5">
            @for (notice of quotes.notices(); track $index) {
              <li>{{ notice }}</li>
            }
          </ul>
          <button
            uiButton
            type="button"
            variant="ghost"
            size="sm"
            class="mt-3"
            (click)="quotes.dismissNotices()"
          >
            U redu
          </button>
        </div>
      }

      <div class="mt-8">
        @if (cart.isEmpty()) {
          <ui-card padding="lg">
            <ui-empty-state
              title="Vaša korpa je prazna"
              description="Kada dodate proizvode u korpu, videćete ih ovde."
            >
              <a uiButton routerLink="/prodavnica">Pogledajte ponudu</a>
            </ui-empty-state>
          </ui-card>
        } @else if (!quote()) {
          @if (quotes.error(); as error) {
            <ui-card>
              <ui-error-state
                title="Korpa trenutno ne može da se učita"
                [message]="error.detail"
                (retry)="quotes.refresh()"
              />
            </ui-card>
          } @else {
            <ui-loading-state label="Proveravamo cene i dostupnost…" />
          }
        } @else {
          @let q = quote()!;
          <div class="grid items-start gap-8 lg:grid-cols-[1fr_22rem] lg:gap-12">
            <section aria-labelledby="sf-cart-items">
              <h2 id="sf-cart-items" class="sr-only">Proizvodi u korpi</h2>
              <ul class="divide-y divide-cream-200 border-y border-cream-200">
                @for (line of lines(); track line.variantId) {
                  <li class="flex gap-4 py-5 sm:gap-6" data-testid="cart-line">
                    <a
                      [routerLink]="['/proizvod', line.productSlug]"
                      class="w-20 shrink-0 sm:w-28"
                      tabindex="-1"
                      aria-hidden="true"
                    >
                      <sf-product-image
                        class="aspect-[4/5] rounded-md"
                        [image]="line.image"
                        alt=""
                        sizes="7rem"
                      />
                    </a>
                    <div class="flex min-w-0 flex-1 flex-col gap-3">
                      <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <div class="min-w-0">
                          <a
                            [routerLink]="['/proizvod', line.productSlug]"
                            class="font-serif text-xl font-semibold text-olive-900 underline-offset-4 hover:underline"
                            >{{ line.productName }}</a
                          >
                          <p class="text-sm text-ink-700">{{ line.variantName }}</p>
                          <p class="mt-1 text-sm text-ink-700" data-testid="unit-price">
                            {{ line.unitPrice | rsd }}
                            @if (line.discountPrice !== null) {
                              <s class="ml-1 text-ink-500"
                                ><span class="sr-only">Redovna cena: </span
                                >{{ line.regularPrice | rsd }}</s
                              >
                            }
                            <span class="text-ink-500"> / kom.</span>
                          </p>
                        </div>
                        <p class="text-lg font-semibold text-ink-900" data-testid="line-total">
                          {{ lineTotal(line) | rsd }}
                        </p>
                      </div>
                      <div class="flex flex-wrap items-center justify-between gap-3">
                        <sf-quantity-stepper
                          [value]="cart.quantityOf(line.variantId)"
                          [min]="1"
                          [max]="maxFor(line)"
                          [itemName]="label(line)"
                          [label]="'Količina: ' + label(line)"
                          (valueChange)="setQuantity(line, $event)"
                        />
                        <button
                          type="button"
                          class="cursor-pointer rounded-sm text-sm font-semibold text-ink-700 underline underline-offset-4 hover:text-danger-700"
                          [attr.aria-label]="'Ukloni iz korpe: ' + label(line)"
                          (click)="remove(line)"
                          data-testid="remove-line"
                        >
                          Ukloni
                        </button>
                      </div>
                      @if (cart.quantityOf(line.variantId) >= line.maxOrderQuantity) {
                        <p class="text-xs text-ink-500">
                          Najveća količina koju trenutno možete poručiti.
                        </p>
                      }
                    </div>
                  </li>
                }
              </ul>
              <a
                routerLink="/prodavnica"
                class="mt-6 inline-block font-semibold text-olive-800 underline underline-offset-4"
                >← Nastavi kupovinu</a
              >
            </section>

            <aside
              class="rounded-lg border border-cream-200 bg-white p-6 shadow-card lg:sticky lg:top-28"
              aria-labelledby="sf-cart-summary"
              [attr.aria-busy]="busy()"
              data-testid="cart-summary"
            >
              <h2 id="sf-cart-summary" class="text-2xl">Pregled porudžbine</h2>
              <dl class="mt-5 space-y-3 text-base">
                <div class="flex justify-between gap-4">
                  <dt class="text-ink-700">Međuzbir</dt>
                  <dd class="font-semibold" data-testid="subtotal">{{ q.subtotal | rsd }}</dd>
                </div>
                <div class="flex justify-between gap-4">
                  <dt class="text-ink-700">Dostava</dt>
                  <dd class="text-right font-semibold" data-testid="shipping">{{ shipping() }}</dd>
                </div>
                <div class="flex justify-between gap-4 border-t border-cream-200 pt-3 text-lg">
                  <dt class="font-semibold">Ukupno</dt>
                  <dd class="font-semibold" data-testid="total">{{ q.total | rsd }}</dd>
                </div>
              </dl>
              @if (busy()) {
                <p class="mt-2 text-xs text-ink-500">Iznosi se ažuriraju…</p>
              }
              @if (freeShipping(); as text) {
                <p
                  class="mt-4 rounded-md bg-sage-50 px-3 py-2 text-sm text-sage-700"
                  data-testid="free-shipping"
                >
                  {{ text }}
                </p>
              }
              @if (minimumOrder(); as text) {
                <p
                  class="mt-4 rounded-md bg-warning-50 px-3 py-2 text-sm text-warning-700"
                  data-testid="minimum-order"
                >
                  {{ text }}
                </p>
              }
              @if (!q.shipping.enabled) {
                <p class="mt-4 text-sm text-ink-700">Dostava je trenutno isključena.</p>
              }
              <p class="mt-4 text-sm text-ink-700">Plaćanje pouzećem, kuriru pri preuzimanju.</p>
              <button
                uiButton
                type="button"
                block
                size="lg"
                class="mt-5"
                disabled
                aria-describedby="sf-checkout-note"
                data-testid="checkout"
              >
                Nastavi na poručivanje
              </button>
              <p id="sf-checkout-note" class="mt-2 text-center text-sm text-ink-700">
                Poručivanje će uskoro biti dostupno.
              </p>
            </aside>
          </div>
        }
      </div>
    </div>
  `,
})
export class CartPage {
  protected readonly cart = inject(CartStore);
  protected readonly quotes = inject(CartQuoteService);
  private readonly removed = signal<string | null>(null);

  protected readonly quote = this.quotes.quote;
  protected readonly busy = computed(() => this.quotes.loading() || this.quotes.stale());
  /** Quote lines that are still in the cart (a removed line disappears at once). */
  protected readonly lines = computed(() => {
    const quote = this.quote();
    const inCart = new Set(this.cart.lines().map((l) => l.variantId));
    return quote ? quote.lines.filter((line) => inCart.has(line.variantId)) : [];
  });
  protected readonly shipping = computed(() => {
    const quote = this.quote();
    return quote ? shippingText(quote) : '';
  });
  protected readonly freeShipping = computed(() => {
    const quote = this.quote();
    return quote && !this.busy() ? freeShippingText(quote) : null;
  });
  protected readonly minimumOrder = computed(() => {
    const quote = this.quote();
    return quote && !this.busy() ? minimumOrderText(quote) : null;
  });
  protected readonly announcement = computed(() => {
    const removed = this.removed();
    const quote = this.quote();
    if (this.busy() || !quote) {
      return removed ?? '';
    }
    const total = `Ukupno: ${formatRsd(quote.total)}.`;
    return removed ? `${removed} ${total}` : `Korpa je ažurirana. ${total}`;
  });

  constructor() {
    this.quotes.watch();
  }

  protected label(line: CartQuoteLine): string {
    return lineLabel(line);
  }

  protected maxFor(line: CartQuoteLine): number {
    return Math.max(1, Math.min(line.maxOrderQuantity, CART_MAX_LINE_QUANTITY));
  }

  /** Shown at once from the cart quantity; the quote confirms it a moment later. */
  protected lineTotal(line: CartQuoteLine): number {
    return Math.round(line.unitPrice * this.cart.quantityOf(line.variantId) * 100) / 100;
  }

  protected setQuantity(line: CartQuoteLine, quantity: number): void {
    this.removed.set(null);
    this.cart.setQuantity(line.variantId, Math.min(quantity, this.maxFor(line)));
  }

  protected remove(line: CartQuoteLine): void {
    this.removed.set(`${lineLabel(line)} je uklonjen iz korpe.`);
    this.cart.remove(line.variantId);
  }
}
