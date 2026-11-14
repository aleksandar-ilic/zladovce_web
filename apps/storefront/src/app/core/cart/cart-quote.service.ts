import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  Injector,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { ApiError, asApiError } from '@zladovce/api';
import { CartQuote } from '@zladovce/models';
import { CartLine, CartStore } from '@zladovce/shared';
import { catchError, debounce, EMPTY, Observable, Subject, switchMap, tap, timer } from 'rxjs';
import { CartApi } from '../data/cart-api';
import { adjustmentMessage, lineLabel } from './cart-messages';

/** Wait this long after the last quantity change before asking for a new quote. */
export const QUOTE_DEBOUNCE_MS = 350;

/** Identity of the cart content that a quote answers (ids and quantities, in order). */
export function cartSignature(lines: readonly CartLine[]): string {
  return lines.map((line) => `${line.variantId}:${line.quantity}`).join('|');
}

/**
 * Prices the browser cart through `POST /cart/quote` and applies the answer to the CartStore:
 * the quote's lines replace the cart (removed and reduced lines, current `unitPrice` stored as
 * the next `knownUnitPrice`), and every adjustment becomes a plain Serbian notice.
 *
 * - `watch()` (from a component) re-quotes whenever the cart changes, here or in another tab;
 *   the change made by applying a quote does not trigger another one. Rapid changes are
 *   debounced, a newer request cancels the one in flight, and an answer for a cart that has
 *   changed meanwhile is discarded.
 * - Browser only: on the server nothing is requested.
 */
@Injectable({ providedIn: 'root' })
export class CartQuoteService {
  private readonly cart = inject(CartStore);
  private readonly api = inject(CartApi);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly requests = new Subject<number>();
  /** Product labels seen in quotes, to name a product that later disappears. */
  private readonly labels = new Map<string, string>();
  private readonly quotedSignature = signal<string | null>(null);

  readonly quote = signal<CartQuote | null>(null);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);
  /** Messages from the last quote that changed the cart; kept until dismissed or replaced. */
  readonly notices = signal<readonly string[]>([]);
  /** True while the cart differs from what the shown quote priced. */
  readonly stale = computed(() => this.quotedSignature() !== cartSignature(this.cart.lines()));

  constructor() {
    if (!this.browser) {
      return;
    }
    const subscription = this.requests
      .pipe(
        debounce((delay) => timer(delay)),
        switchMap(() => this.request()),
      )
      .subscribe();
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  /**
   * Keeps the quote in line with the cart for as long as the calling component lives:
   * the first quote is requested at once, later changes after a short pause.
   */
  watch(injector = inject(Injector)): void {
    effect(
      () => {
        const signature = cartSignature(this.cart.lines());
        untracked(() => {
          if (signature === this.quotedSignature()) {
            return;
          }
          if (this.quote() === null && !this.loading()) {
            this.refresh();
          } else {
            this.schedule();
          }
        });
      },
      { injector },
    );
  }

  /** Quote now (also: retry after an error). */
  refresh(): void {
    this.requests.next(0);
  }

  /** Quote after the debounce pause; each call restarts the pause. */
  schedule(): void {
    this.requests.next(QUOTE_DEBOUNCE_MS);
  }

  dismissNotices(): void {
    this.notices.set([]);
  }

  /** Remembers the name of a variant (product page), so a later notice can name it. */
  rememberLabel(variantId: string, label: string): void {
    this.labels.set(variantId, label);
  }

  private request(): Observable<unknown> {
    const lines = this.cart.lines();
    const signature = cartSignature(lines);
    if (lines.length === 0) {
      this.quote.set(null);
      this.quotedSignature.set(signature);
      this.loading.set(false);
      this.error.set(null);
      return EMPTY;
    }
    for (const line of lines) {
      if (line.label && !this.labels.has(line.variantId)) {
        this.labels.set(line.variantId, line.label);
      }
    }
    this.loading.set(true);
    return this.api
      .quote({
        items: lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          knownUnitPrice: line.knownUnitPrice ?? null,
        })),
      })
      .pipe(
        tap((quote) => {
          this.loading.set(false);
          if (cartSignature(this.cart.lines()) !== signature) {
            // The cart changed while this request was running; the newer change is quoted next.
            return;
          }
          this.apply(quote);
        }),
        catchError((error: unknown) => {
          this.loading.set(false);
          this.error.set(asApiError(error));
          return EMPTY;
        }),
      );
  }

  /**
   * Applies a quote to the cart: its lines replace the cart and its adjustments become notices.
   * Also used by checkout for the fresh quote that comes with a 409 refusal. Returns the notices.
   */
  apply(quote: CartQuote): readonly string[] {
    for (const line of quote.lines) {
      this.labels.set(line.variantId, lineLabel(line));
    }
    const notices = quote.adjustments.map((adjustment) =>
      adjustmentMessage(adjustment, this.labels.get(adjustment.variantId) ?? null),
    );
    const next: CartLine[] = quote.lines.map((line) => ({
      variantId: line.variantId,
      quantity: line.quantity,
      knownUnitPrice: line.unitPrice,
      label: lineLabel(line),
    }));
    this.error.set(null);
    this.quote.set(quote);
    // Set first, so the cart change below is recognised as this quote's own.
    this.quotedSignature.set(cartSignature(next));
    this.cart.replaceAll(next);
    if (notices.length > 0) {
      this.notices.set(notices);
    }
    return notices;
  }
}
