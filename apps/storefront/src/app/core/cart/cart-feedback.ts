import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { PublicImage } from '@zladovce/models';

export interface CartFeedbackMessage {
  /** Increases with every message, so the same product added twice is announced twice. */
  id: number;
  title: string;
  detail: string;
  image: PublicImage | null;
  imageAlt: string;
}

/** How long the confirmation stays on screen (it can be closed earlier). */
export const CART_FEEDBACK_MS = 6000;

/**
 * Confirmation after "Dodaj u korpu", shown by the shell's toast (`sf-cart-toast`), which
 * announces it through an `aria-live` region and links to the cart.
 */
@Injectable({ providedIn: 'root' })
export class CartFeedback {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private nextId = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly message = signal<CartFeedbackMessage | null>(null);

  show(message: Omit<CartFeedbackMessage, 'id'>): void {
    this.message.set({ ...message, id: this.nextId++ });
    this.clearTimer();
    if (this.browser) {
      this.timer = setTimeout(() => this.dismiss(), CART_FEEDBACK_MS);
    }
  }

  dismiss(): void {
    this.clearTimer();
    this.message.set(null);
  }

  /** Keeps the message while the pointer or focus is on it. */
  hold(): void {
    this.clearTimer();
  }

  release(): void {
    if (this.browser && this.message()) {
      this.clearTimer();
      this.timer = setTimeout(() => this.dismiss(), CART_FEEDBACK_MS / 2);
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
