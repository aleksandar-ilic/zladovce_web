import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartFeedback } from '../cart/cart-feedback';
import { ProductImage } from '../../shared/product-image';

/**
 * Confirmation after adding to the cart. The live region is always in the page so screen
 * readers announce each new message; the panel itself appears at the bottom (small screens)
 * or bottom right, stays while hovered or focused, and links to the cart.
 */
@Component({
  selector: 'sf-cart-toast',
  imports: [RouterLink, ProductImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4 sm:inset-x-auto sm:right-0 sm:justify-end"
      aria-live="polite"
      role="status"
    >
      @if (feedback.message(); as message) {
        <div
          class="sf-toast pointer-events-auto flex w-full max-w-sm items-center gap-4 rounded-lg border border-cream-200 bg-white p-4 shadow-overlay"
          (mouseenter)="feedback.hold()"
          (mouseleave)="feedback.release()"
          (focusin)="feedback.hold()"
          (focusout)="feedback.release()"
          data-testid="cart-toast"
        >
          <sf-product-image
            class="aspect-square w-14 shrink-0 rounded-md"
            [image]="message.image"
            [alt]="message.imageAlt"
            sizes="3.5rem"
          />
          <div class="min-w-0 flex-1">
            <p class="font-semibold text-olive-800">{{ message.title }}</p>
            <p class="truncate text-sm text-ink-700">{{ message.detail }}</p>
            <a
              routerLink="/korpa"
              class="mt-1 inline-block text-sm font-semibold text-olive-800 underline underline-offset-4"
              (click)="feedback.dismiss()"
              >Pogledaj korpu</a
            >
          </div>
          <button
            type="button"
            class="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center self-start rounded-md text-ink-700 hover:bg-cream-100"
            aria-label="Zatvori obaveštenje"
            (click)="feedback.dismiss()"
          >
            <svg
              class="size-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      }
    </div>
  `,
})
export class CartToast {
  protected readonly feedback = inject(CartFeedback);
}
