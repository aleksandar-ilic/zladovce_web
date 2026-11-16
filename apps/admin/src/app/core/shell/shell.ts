import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AUTH_ROUTES, AuthService, hasRole } from '@zladovce/auth';
import { adminRoleLabel } from '@zladovce/shared';
import { UiBadge } from '@zladovce/ui';
import { map } from 'rxjs';
import { ADMIN_NAV, groupNav } from '../navigation';
import { deadEmailsText, pluralSr } from '../../shared/email-labels';
import { UnreadMessagesStore } from '../unread-messages';
import { DeadEmailsStore } from '../dead-emails';
import { OrderSummaryStore } from '../order-summary';

const DESKTOP = '(min-width: 1024px)';

/**
 * Guarded layout of the admin app: side navigation, top bar with the signed-in
 * administrator and sign-out, and the routed page. On small screens the navigation is a
 * drawer opened from the top bar.
 */
@Component({
  selector: 'adm-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatButtonModule,
    UiBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-dvh' },
  template: `
    <a class="skip-link" href="#sadrzaj" (click)="skipToContent($event, content)"
      >Preskoči na sadržaj</a
    >

    <mat-sidenav-container class="h-full" [hasBackdrop]="!desktop()">
      <mat-sidenav
        #sidenav
        class="border-r border-cream-200"
        [mode]="desktop() ? 'side' : 'over'"
        [opened]="desktop() || drawerOpen()"
        [disableClose]="desktop()"
        (closedStart)="drawerOpen.set(false)"
      >
        <div class="flex h-16 items-center px-5">
          <a
            routerLink="/"
            class="rounded-sm font-serif text-3xl font-semibold text-olive-800"
            aria-label="Zladovce – kontrolna tabla"
          >
            Zladovce
          </a>
        </div>
        <nav class="px-2 pb-6" aria-label="Glavna navigacija">
          @for (group of navGroups(); track group.section) {
            @if (group.section) {
              <h2
                class="mt-3 px-4 pt-2 text-xs font-semibold tracking-eyebrow text-ink-500 uppercase"
                [id]="'nav-' + $index"
              >
                {{ group.section }}
              </h2>
            }
            <mat-nav-list [attr.aria-labelledby]="group.section ? 'nav-' + $index : null">
              @for (item of group.items; track item.path) {
                <a
                  mat-list-item
                  [routerLink]="item.path"
                  routerLinkActive
                  #link="routerLinkActive"
                  [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
                  [activated]="link.isActive"
                  ariaCurrentWhenActive="page"
                  (click)="drawerOpen.set(false)"
                >
                  <svg
                    matListItemIcon
                    class="size-6"
                    style="fill: none"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path [attr.d]="item.icon" />
                  </svg>
                  <span matListItemTitle class="flex items-center justify-between gap-2"
                    >{{ item.label }}
                    @if (item.badge === 'receivedOrders' && receivedOrders() > 0) {
                      <span
                        class="inline-flex min-w-6 items-center justify-center rounded-full bg-danger-600 px-1.5 py-0.5 text-xs font-bold text-white"
                        data-testid="nav-badge"
                        >{{ receivedOrders()
                        }}<span class="sr-only">
                          {{
                            receivedOrders() === 1 ? 'nova porudžbina' : 'novih porudžbina'
                          }}</span
                        ></span
                      >
                    }
                    @if (item.badge === 'deadEmails' && deadEmails() > 0) {
                      <span
                        class="inline-flex min-w-6 items-center justify-center rounded-full bg-danger-600 px-1.5 py-0.5 text-xs font-bold text-white"
                        data-testid="nav-badge-emails"
                        >{{ deadEmails()
                        }}<span class="sr-only"> {{ deadEmailsWords() }}</span></span
                      >
                    }
                    @if (item.badge === 'unreadMessages' && unreadMessages() > 0) {
                      <span
                        class="inline-flex min-w-6 items-center justify-center rounded-full bg-olive-700 px-1.5 py-0.5 text-xs font-bold text-white"
                        data-testid="nav-badge-messages"
                        >{{ unreadMessages()
                        }}<span class="sr-only"> {{ unreadMessagesWords() }}</span></span
                      >
                    }
                  </span>
                </a>
              }
            </mat-nav-list>
          }
        </nav>
      </mat-sidenav>

      <mat-sidenav-content class="flex flex-col">
        <mat-toolbar class="sticky top-0 z-10 shrink-0 gap-2 border-b border-cream-200 font-sans">
          @if (!desktop()) {
            <button
              matIconButton
              type="button"
              aria-label="Otvori meni"
              [attr.aria-expanded]="drawerOpen()"
              (click)="drawerOpen.set(true)"
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
          }
          <span class="text-base font-semibold text-ink-700">Administracija</span>
          <span class="flex-1"></span>

          @if (user(); as admin) {
            <div class="flex min-w-0 items-center gap-3" data-testid="current-admin">
              <span class="hidden truncate text-sm font-semibold text-ink-900 sm:inline">{{
                admin.fullName || admin.email
              }}</span>
              <ui-badge tone="success">{{ roleLabel() }}</ui-badge>
            </div>
          } @else if (profile().status === 'loading') {
            <span class="text-sm text-ink-500" role="status">Učitavanje naloga…</span>
          }

          <button matButton type="button" [disabled]="signingOut()" (click)="signOut()">
            Odjavi se
          </button>
        </mat-toolbar>

        <main #content id="sadrzaj" tabindex="-1" class="flex-1 p-5 outline-none md:p-8">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly authRoutes = inject(AUTH_ROUTES);

  protected readonly desktop = toSignal(
    inject(BreakpointObserver)
      .observe(DESKTOP)
      .pipe(map((state) => state.matches)),
    { initialValue: true },
  );
  protected readonly drawerOpen = signal(false);
  protected readonly signingOut = signal(false);

  private readonly orderSummary = inject(OrderSummaryStore);
  /** New orders (Received) for the "Porudžbine" badge; refreshed every minute and on navigation. */
  protected readonly receivedOrders = this.orderSummary.received;
  private readonly deadEmailsStore = inject(DeadEmailsStore);
  /** Emails that could not be sent, for the "E-poruke" badge; same refresh as the orders badge. */
  protected readonly deadEmails = computed(() => this.deadEmailsStore.count() ?? 0);
  protected readonly deadEmailsWords = computed(() =>
    deadEmailsText(this.deadEmails()).replace(/^\d+ /, ''),
  );
  private readonly unreadStore = inject(UnreadMessagesStore);
  /** Unread contact-form messages, for the "Poruke kupaca" badge. */
  protected readonly unreadMessages = computed(() => this.unreadStore.count() ?? 0);
  protected readonly unreadMessagesWords = computed(() =>
    pluralSr(
      this.unreadMessages(),
      'nepročitana poruka',
      'nepročitane poruke',
      'nepročitanih poruka',
    ),
  );
  protected readonly profile = this.auth.profile;
  protected readonly user = this.auth.user;
  protected readonly roleLabel = computed(() => adminRoleLabel(this.auth.role()));
  /** Entries without a role requirement are always shown; role-bound ones once the profile is known. */
  protected readonly navItems = computed(() =>
    ADMIN_NAV.filter((item) => !item.roles || hasRole(this.user(), item.roles)),
  );
  protected readonly navGroups = computed(() => groupNav(this.navItems()));

  constructor() {
    void this.auth.loadProfile();
    const destroyRef = inject(DestroyRef);
    this.orderSummary.start(destroyRef);
    this.deadEmailsStore.start(destroyRef);
    this.unreadStore.start(destroyRef);

    // The session can end at any time (sign-out, expired token, deactivated account).
    effect(() => {
      if (this.auth.status() === 'signedOut') {
        void this.router.navigateByUrl(this.authRoutes.signIn);
      }
    });
  }

  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    await this.auth.signOut();
  }

  protected skipToContent(event: Event, content: HTMLElement): void {
    event.preventDefault();
    content.focus();
  }
}
