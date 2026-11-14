import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { ADMIN_NAV } from '../navigation';

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
        <nav class="px-2" aria-label="Glavna navigacija">
          <mat-nav-list>
            @for (item of navItems(); track item.path) {
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
                <span matListItemTitle>{{ item.label }}</span>
              </a>
            }
          </mat-nav-list>
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

  protected readonly profile = this.auth.profile;
  protected readonly user = this.auth.user;
  protected readonly roleLabel = computed(() => adminRoleLabel(this.auth.role()));
  /** Entries without a role requirement are always shown; role-bound ones once the profile is known. */
  protected readonly navItems = computed(() =>
    ADMIN_NAV.filter((item) => !item.roles || hasRole(this.user(), item.roles)),
  );

  constructor() {
    void this.auth.loadProfile();

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
