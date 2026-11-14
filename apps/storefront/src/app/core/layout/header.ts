import { A11yModule } from '@angular/cdk/a11y';
import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CartStore } from '@zladovce/shared';
import { CART_PATH, MAIN_NAV } from '../navigation';

/**
 * Site header: wordmark, main navigation, cart link with item count and, on small screens,
 * a navigation drawer. The drawer is a modal dialog: focus is trapped inside it, Escape and
 * the backdrop close it, and focus returns to the menu button.
 */
@Component({
  selector: 'sf-header',
  imports: [RouterLink, RouterLinkActive, A11yModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sticky top-0 z-40 block' },
  template: `
    <!-- The blur lives on this bar, not on the host: backdrop-filter would confine the fixed drawer. -->
    <div class="border-b border-cream-200 bg-cream-50/95 backdrop-blur-sm">
      <div
        class="mx-auto flex h-16 max-w-page items-center justify-between gap-4 px-gutter md:h-20"
      >
        <a
          routerLink="/"
          class="rounded-sm font-serif text-3xl font-semibold tracking-tight text-olive-800 md:text-4xl"
          aria-label="Zladovce – početna strana"
        >
          Zladovce
        </a>

        <nav class="hidden md:block" aria-label="Glavna navigacija">
          <ul class="flex items-center gap-1">
            @for (item of nav; track item.path) {
              <li>
                <a
                  [routerLink]="item.path"
                  routerLinkActive="bg-olive-100 text-olive-900"
                  [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
                  ariaCurrentWhenActive="page"
                  class="rounded-md px-3.5 py-2 text-base font-semibold text-ink-700 transition-colors duration-150 hover:bg-olive-50 hover:text-olive-900"
                >
                  {{ item.label }}
                </a>
              </li>
            }
          </ul>
        </nav>

        <div class="flex items-center gap-1">
          <a
            [routerLink]="cartPath"
            class="relative inline-flex size-11 items-center justify-center rounded-md text-olive-800 transition-colors duration-150 hover:bg-olive-100"
            [attr.aria-label]="cartLabel()"
          >
            <svg
              class="size-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 8h14l-1.2 11.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8Z" />
              <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
            </svg>
            <span
              class="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-olive-700 px-1 text-xs font-semibold leading-5 text-white"
              aria-hidden="true"
              data-testid="cart-count"
            >
              {{ cartCount() }}
            </span>
          </a>

          <button
            #menuButton
            type="button"
            class="inline-flex size-11 cursor-pointer items-center justify-center rounded-md text-olive-800 transition-colors duration-150 hover:bg-olive-100 md:hidden"
            aria-label="Otvori meni"
            aria-haspopup="dialog"
            [attr.aria-expanded]="menuOpen()"
            aria-controls="sf-mobile-menu"
            (click)="openMenu()"
          >
            <svg
              class="size-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    @if (menuOpen()) {
      <div class="fixed inset-0 z-50 md:hidden">
        <div
          class="absolute inset-0 bg-olive-900/40"
          aria-hidden="true"
          (click)="closeMenu()"
        ></div>
        <div
          id="sf-mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Meni"
          class="absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col bg-cream-50 shadow-overlay"
          cdkTrapFocus
          cdkTrapFocusAutoCapture
          (keydown.escape)="closeMenu()"
        >
          <div class="flex h-16 items-center justify-between border-b border-cream-200 px-gutter">
            <span class="font-serif text-2xl font-semibold text-olive-800">Meni</span>
            <button
              type="button"
              class="inline-flex size-11 cursor-pointer items-center justify-center rounded-md text-olive-800 hover:bg-olive-100"
              aria-label="Zatvori meni"
              cdkFocusInitial
              (click)="closeMenu()"
            >
              <svg
                class="size-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <nav class="flex-1 overflow-y-auto px-3 py-4" aria-label="Glavna navigacija">
            <ul class="flex flex-col gap-1">
              @for (item of nav; track item.path) {
                <li>
                  <a
                    [routerLink]="item.path"
                    routerLinkActive="bg-olive-100 text-olive-900"
                    [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
                    ariaCurrentWhenActive="page"
                    class="block rounded-md px-4 py-3 text-lg font-semibold text-ink-700 hover:bg-olive-50"
                    (click)="closeMenu()"
                  >
                    {{ item.label }}
                  </a>
                </li>
              }
              <li class="mt-2 border-t border-cream-200 pt-3">
                <a
                  [routerLink]="cartPath"
                  routerLinkActive="bg-olive-100 text-olive-900"
                  ariaCurrentWhenActive="page"
                  class="flex items-center justify-between rounded-md px-4 py-3 text-lg font-semibold text-ink-700 hover:bg-olive-50"
                  (click)="closeMenu()"
                >
                  <span>Korpa</span>
                  <span class="text-base font-normal text-ink-500">{{ cartCount() }}</span>
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    }
  `,
})
export class Header {
  private readonly cart = inject(CartStore);
  private readonly document = inject(DOCUMENT);
  private readonly menuButton = viewChild.required<ElementRef<HTMLButtonElement>>('menuButton');

  protected readonly nav = MAIN_NAV;
  protected readonly cartPath = CART_PATH;
  protected readonly menuOpen = signal(false);
  protected readonly cartCount = this.cart.totalQuantity;
  protected readonly cartLabel = computed(() => `Korpa, broj proizvoda: ${this.cartCount()}`);

  constructor() {
    // The page behind the open drawer must not scroll.
    effect(() => {
      this.document.body.style.overflow = this.menuOpen() ? 'hidden' : '';
    });
  }

  protected openMenu(): void {
    this.menuOpen.set(true);
  }

  protected closeMenu(): void {
    if (!this.menuOpen()) {
      return;
    }
    this.menuOpen.set(false);
    this.menuButton().nativeElement.focus();
  }
}
