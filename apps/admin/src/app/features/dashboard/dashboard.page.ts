import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiError, asApiError, HealthClient, HealthResult } from '@zladovce/api';
import { AuthService } from '@zladovce/auth';
import { adminRoleLabel } from '@zladovce/shared';
import { UiBadge, UiCard, UiCardTitle, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { SrDatePipe } from '@zladovce/utilities';
import { DeadEmailsCard } from './dead-emails-card';
import { LowStockCard } from './low-stock-card';
import { OrdersCard } from './orders-card';

type HealthState =
  | { status: 'loading' }
  | { status: 'healthy'; result: HealthResult }
  | { status: 'error'; error: ApiError };

/**
 * Kontrolna tabla: orders waiting for work (Phase 5), packages running low (Phase 3), who is
 * signed in and whether the API answers. Phase 7 adds the business metrics and charts.
 */
@Component({
  selector: 'adm-dashboard-page',
  imports: [
    UiCard,
    UiCardTitle,
    UiBadge,
    UiLoadingState,
    UiErrorState,
    SrDatePipe,
    DeadEmailsCard,
    LowStockCard,
    OrdersCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-3xl">Kontrolna tabla</h1>

    <div class="mt-6 grid max-w-5xl gap-6 lg:grid-cols-[1.4fr_1fr]">
      <adm-dead-emails-card />
      <adm-orders-card />
      <adm-low-stock-card />

      <ui-card data-testid="welcome">
        @switch (profile().status) {
          @case ('loaded') {
            @if (profile().user; as admin) {
              <h2 uiCardTitle>Dobro došli, {{ admin.fullName || admin.email }}</h2>
              <dl class="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
                <dt class="text-ink-500">E-adresa</dt>
                <dd class="font-semibold break-all">{{ admin.email }}</dd>
                <dt class="text-ink-500">Uloga</dt>
                <dd>
                  <ui-badge tone="success">{{ roleLabel() }}</ui-badge>
                </dd>
              </dl>
            }
          }
          @case ('error') {
            <ui-error-state
              title="Podaci o nalogu nisu učitani"
              [message]="profile().error?.detail ?? ''"
              (retry)="reloadProfile()"
            />
          }
          @default {
            <ui-loading-state label="Učitavanje naloga…" />
          }
        }
      </ui-card>

      <ui-card data-testid="health">
        <h2 uiCardTitle>Stanje sistema</h2>
        @switch (health().status) {
          @case ('healthy') {
            <div class="mt-5 flex items-center gap-3">
              <ui-badge tone="success">Dostupan</ui-badge>
              <span class="text-sm text-ink-700">Server odgovara na zahteve.</span>
            </div>
            <p class="mt-3 text-sm text-ink-500">
              Poslednja provera: {{ checkedAt() | srDate: 'dateTime' }}
            </p>
            <button
              type="button"
              class="mt-4 cursor-pointer rounded-sm text-sm font-semibold text-olive-700 underline underline-offset-4 hover:text-olive-900"
              (click)="checkHealth()"
            >
              Proveri ponovo
            </button>
          }
          @case ('error') {
            <div class="mt-5"><ui-badge tone="danger">Nedostupan</ui-badge></div>
            <ui-error-state
              title="Server ne odgovara"
              [message]="healthError()"
              (retry)="checkHealth()"
            />
          }
          @default {
            <ui-loading-state label="Provera servera…" />
          }
        }
      </ui-card>
    </div>
  `,
})
export class DashboardPage {
  private readonly auth = inject(AuthService);
  private readonly healthClient = inject(HealthClient);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly profile = this.auth.profile;
  protected readonly roleLabel = computed(() => adminRoleLabel(this.auth.role()));

  protected readonly health = signal<HealthState>({ status: 'loading' });
  protected readonly checkedAt = computed(() => {
    const state = this.health();
    return state.status === 'healthy' ? state.result.checkedAt : null;
  });
  protected readonly healthError = computed(() => {
    const state = this.health();
    return state.status === 'error' ? state.error.detail : '';
  });

  constructor() {
    // The shell starts loading the profile; this only covers opening the page directly.
    void this.auth.loadProfile();
    this.checkHealth();
  }

  protected reloadProfile(): void {
    void this.auth.loadProfile(true);
  }

  protected checkHealth(): void {
    this.health.set({ status: 'loading' });
    this.healthClient
      .check()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => this.health.set({ status: 'healthy', result }),
        error: (error: unknown) => this.health.set({ status: 'error', error: asApiError(error) }),
      });
  }
}
