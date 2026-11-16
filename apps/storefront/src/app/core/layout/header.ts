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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CartStore } from '@zladovce/shared';
import { filter } from 'rxjs';
import { imageSrc, imageSrcset } from '../../shared/images';
import { CategoriesStore } from '../data/categories-store';
import { SiteContent } from '../data/site-content';
import { StoreSettings } from '../data/store-settings';
import { CART_PATH, MAIN_NAV, SHOP_PATH, visibleNav } from '../navigation';

/**
 * Site header: store logo (the wordmark while none is set), main navigation – "O nama" and
 * "Blog" only while they have content (SiteContent) – (with a small category menu next to "Prodavnica"),
 * cart link with item count and, on small screens, a navigation drawer. The drawer is a modal
 * dialog: focus is trapped inside it, Escape and the backdrop close it, and focus returns to
 * the menu button. Categories are loaded when a menu is first opened.
 */
@Component({
  selector: 'sf-header',
  imports: [RouterLink, RouterLinkActive, A11yModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sticky top-0 z-40 block',
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'closeCategories(true)',
  },
  template: `
    <!-- The blur lives on this bar, not on the host: backdrop-filter would confine the fixed drawer. -->
    <div class="border-b border-cream-200 bg-cream-50/95 backdrop-blur-sm">
      <div
        class="mx-auto flex h-16 max-w-page items-center justify-between gap-4 px-gutter md:h-20"
      >
        <a
          routerLink="/"
          class="shrink-0 rounded-sm font-serif text-3xl font-semibold tracking-tight text-olive-800 md:text-4xl"
          aria-label="Zladovce – početna strana"
        >
          @if (logo(); as logo) {
            <img
              class="h-10 w-auto md:h-12"
              [attr.src]="logo.src"
              [attr.srcset]="logo.srcset"
              sizes="12rem"
              [attr.width]="logo.width"
              [attr.height]="logo.height"
              alt=""
              data-testid="store-logo"
            />
          } @else {
            Zladovce
          }
        </a>

        <nav class="hidden lg:block" aria-label="Glavna navigacija">
          <ul class="flex items-center gap-0.5 xl:gap-1">
            @for (item of nav(); track item.path) {
              <li class="relative flex items-center">
                <a
                  [routerLink]="item.path"
                  routerLinkActive="bg-olive-100 text-olive-900"
                  [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
                  ariaCurrentWhenActive="page"
                  class="whitespace-nowrap rounded-md px-3 py-2 text-base font-semibold text-ink-700 transition-colors duration-150 hover:bg-olive-50 hover:text-olive-900"
                >
                  {{ item.label }}
                </a>
                @if (item.path === shopPath) {
                  <button
                    #categoriesButton
                    type="button"
                    class="ml-0.5 inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-ink-700 hover:bg-olive-50 hover:text-olive-900"
                    aria-label="Kategorije proizvoda"
                    aria-controls="sf-categories-menu"
                    [attr.aria-expanded]="categoriesOpen()"
                    (click)="toggleCategories()"
                    data-testid="categories-toggle"
                  >
                    <svg
                      class="size-4 transition-transform duration-150"
                      [class.rotate-180]="categoriesOpen()"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m4 6 4 4 4-4" />
                    </svg>
                  </button>
                  @if (categoriesOpen()) {
                    <div
                      id="sf-categories-menu"
                      class="absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-cream-200 bg-white p-2 shadow-overlay"
                      data-testid="categories-menu"
                    >
                      <ul class="flex flex-col">
                        <li>
                          <a
                            [routerLink]="shopPath"
                            class="block rounded-md px-3 py-2.5 font-semibold text-olive-800 hover:bg-olive-50"
                            (click)="closeCategories()"
                            >Sva ponuda</a
                          >
                        </li>
                        @for (category of categories(); track category.id) {
                          <li>
                            <a
                              [routerLink]="[shopPath, category.slug]"
                              class="flex items-center justify-between rounded-md px-3 py-2.5 text-ink-700 hover:bg-olive-50 hover:text-olive-900"
                              (click)="closeCategories()"
                            >
                              <span>{{ category.name }}</span>
                              <span class="text-xs text-ink-500">{{ category.productCount }}</span>
                            </a>
                          </li>
                        } @empty {
                          @if (categoriesState() === 'loading') {
                            <li class="px-3 py-2.5 text-sm text-ink-500" role="status">
                              Učitavanje…
                            </li>
                          } @else if (categoriesState() === 'error') {
                            <li class="px-3 py-2.5 text-sm text-ink-700">
                              Kategorije trenutno nisu dostupne.
                            </li>
                          }
                        }
                      </ul>
                    </div>
                  }
                }
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
            class="inline-flex size-11 cursor-pointer items-center justify-center rounded-md text-olive-800 transition-colors duration-150 hover:bg-olive-100 lg:hidden"
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
      <div class="fixed inset-0 z-50 lg:hidden">
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
              @for (item of nav(); track item.path) {
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
                  @if (item.path === shopPath && categories().length > 0) {
                    <ul
                      class="mb-1 ml-4 flex flex-col border-l border-cream-200 pl-2"
                      aria-label="Kategorije"
                    >
                      @for (category of categories(); track category.id) {
                        <li>
                          <a
                            [routerLink]="[shopPath, category.slug]"
                            routerLinkActive="bg-olive-100 text-olive-900"
                            ariaCurrentWhenActive="page"
                            class="block rounded-md px-4 py-2.5 text-base text-ink-700 hover:bg-olive-50"
                            (click)="closeMenu()"
                            data-testid="mobile-category"
                          >
                            {{ category.name }}
                          </a>
                        </li>
                      }
                    </ul>
                  }
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
  private readonly categoriesStore = inject(CategoriesStore);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly menuButton = viewChild.required<ElementRef<HTMLButtonElement>>('menuButton');
  private readonly categoriesButton = viewChild<ElementRef<HTMLButtonElement>>('categoriesButton');

  private readonly siteContent = inject(SiteContent);
  private readonly store = inject(StoreSettings);

  protected readonly nav = computed(() => visibleNav(MAIN_NAV, this.siteContent.available()));
  protected readonly logo = computed(() => {
    const logo = this.store.settings()?.logo;
    return logo && logo.widths.length > 0
      ? { src: imageSrc(logo, 400), srcset: imageSrcset(logo), width: logo.width, height: logo.height }
      : null;
  });
  protected readonly cartPath = CART_PATH;
  protected readonly shopPath = SHOP_PATH;
  protected readonly menuOpen = signal(false);
  protected readonly categoriesOpen = signal(false);
  protected readonly categories = this.categoriesStore.categories;
  protected readonly categoriesState = computed(() => this.categoriesStore.remote().status);
  protected readonly cartCount = this.cart.totalQuantity;
  protected readonly cartLabel = computed(() => `Korpa, broj proizvoda: ${this.cartCount()}`);

  constructor() {
    this.siteContent.ensureLoaded();
    // The page behind the open drawer must not scroll.
    effect(() => {
      this.document.body.style.overflow = this.menuOpen() ? 'hidden' : '';
    });
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationStart),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.categoriesOpen.set(false));
  }

  protected openMenu(): void {
    this.categoriesStore.ensureLoaded();
    this.menuOpen.set(true);
  }

  protected toggleCategories(): void {
    if (this.categoriesOpen()) {
      this.closeCategories();
      return;
    }
    this.categoriesStore.ensureLoaded();
    this.categoriesOpen.set(true);
  }

  protected closeCategories(returnFocus = false): void {
    if (!this.categoriesOpen()) {
      return;
    }
    this.categoriesOpen.set(false);
    if (returnFocus) {
      this.categoriesButton()?.nativeElement.focus();
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (this.categoriesOpen() && target && !this.host.nativeElement.contains(target)) {
      this.categoriesOpen.set(false);
    }
  }

  protected closeMenu(): void {
    if (!this.menuOpen()) {
      return;
    }
    this.menuOpen.set(false);
    this.menuButton().nativeElement.focus();
  }
}
