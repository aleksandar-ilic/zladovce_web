import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiError, asApiError } from '@zladovce/api';
import { Courier } from '@zladovce/models';
import { UiBadge, UiEmptyState, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { filter } from 'rxjs';
import { CouriersApi } from '../../data/couriers-api';
import { ConfirmService } from '../../shared/confirm-dialog';
import { CourierDialog, courierRequest } from './courier.dialog';

type State =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; couriers: Courier[] };

const DIALOG = {
  width: '36rem',
  maxWidth: 'calc(100vw - 2rem)',
  autoFocus: 'first-tabbable',
} as const;

/**
 * Kuriri (owner): courier companies offered when an order is marked as shipped, with an optional
 * tracking page address. Couriers are never deleted (shipments refer to them); one that is no
 * longer used is deactivated.
 */
@Component({
  selector: 'adm-couriers-page',
  imports: [MatButtonModule, UiBadge, UiEmptyState, UiErrorState, UiLoadingState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex max-w-4xl flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl">Kurirske službe</h1>
        <p class="mt-2 max-w-2xl text-ink-700">
          Službe kojima šaljete pakete. Pri slanju porudžbine birate jednu od aktivnih. Službu koju
          više ne koristite isključite – stare pošiljke je i dalje prikazuju.
        </p>
      </div>
      <button matButton="filled" type="button" data-testid="new-courier" (click)="open(null)">
        Nova kurirska služba
      </button>
    </div>

    <div class="mt-6 max-w-4xl">
      @switch (state().status) {
        @case ('loading') {
          <ui-loading-state label="Učitavanje kurirskih službi…" />
        }
        @case ('error') {
          <ui-error-state
            title="Kurirske službe nisu učitane"
            [message]="errorMessage()"
            (retry)="load()"
          />
        }
        @default {
          @if (couriers().length === 0) {
            <ui-empty-state
              title="Još nema kurirskih službi"
              description="Dodajte bar jednu da biste porudžbine mogli da označite kao poslate."
            >
              <button matButton="filled" type="button" (click)="open(null)">
                Nova kurirska služba
              </button>
            </ui-empty-state>
          } @else {
            <ul class="flex flex-col gap-2">
              @for (courier of couriers(); track courier.id) {
                <li
                  class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-cream-200 bg-white p-3"
                  data-testid="courier-row"
                >
                  <div class="min-w-0 flex-1 basis-56">
                    <p class="flex flex-wrap items-center gap-2 font-semibold">
                      {{ courier.name }}
                      @if (courier.isActive) {
                        <ui-badge tone="success">Aktivna</ui-badge>
                      } @else {
                        <ui-badge>Isključena</ui-badge>
                      }
                    </p>
                    <p class="mt-0.5 text-sm break-all text-ink-700">
                      {{ courier.trackingUrlTemplate || 'Bez stranice za praćenje' }}
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-1">
                    <button matButton="outlined" type="button" (click)="open(courier)">
                      Izmeni
                    </button>
                    <button
                      matButton
                      type="button"
                      data-testid="toggle-active"
                      [class.danger-button]="courier.isActive"
                      [disabled]="busy()"
                      (click)="toggle(courier)"
                    >
                      {{ courier.isActive ? 'Isključi' : 'Uključi' }}
                    </button>
                  </div>
                </li>
              }
            </ul>
          }
        }
      }
    </div>
  `,
})
export class CouriersPage {
  private readonly api = inject(CouriersApi);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<State>({ status: 'loading' });
  protected readonly busy = signal(false);
  protected readonly couriers = computed(() => {
    const state = this.state();
    return state.status === 'loaded' ? state.couriers : [];
  });

  constructor() {
    this.load();
  }

  protected errorMessage(): string {
    const state = this.state();
    return state.status === 'error' ? state.error.detail : '';
  }

  load(): void {
    this.state.set({ status: 'loading' });
    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (couriers) => this.state.set({ status: 'loaded', couriers }),
        error: (error: unknown) => this.state.set({ status: 'error', error: asApiError(error) }),
      });
  }

  open(courier: Courier | null): void {
    this.dialog
      .open<CourierDialog, Courier | null, Courier>(CourierDialog, { ...DIALOG, data: courier })
      .afterClosed()
      .pipe(filter((saved): saved is Courier => !!saved))
      .subscribe((saved) => {
        this.snackBar.open(`Sačuvano: ${saved.name}.`, 'U redu', { duration: 4000 });
        this.load();
      });
  }

  toggle(courier: Courier): void {
    const deactivate = courier.isActive;
    const ask = deactivate
      ? this.confirm.ask({
          title: `Isključiti „${courier.name}“?`,
          message:
            'Služba se više neće nuditi pri slanju porudžbina. Postojeće pošiljke ostaju kakve jesu, a službu možete ponovo uključiti.',
          confirmLabel: 'Isključi',
          tone: 'danger',
        })
      : null;
    const run = () => {
      this.busy.set(true);
      this.api
        .update(
          courier.id,
          courierRequest({
            name: courier.name,
            trackingUrlTemplate: courier.trackingUrlTemplate ?? '',
            isActive: !deactivate,
            sortOrder: courier.sortOrder,
          }),
        )
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (saved) => {
            this.busy.set(false);
            this.snackBar.open(
              saved.isActive ? `„${saved.name}“ je uključena.` : `„${saved.name}“ je isključena.`,
              'U redu',
              { duration: 4000 },
            );
            this.load();
          },
          error: (error: unknown) => {
            this.busy.set(false);
            this.snackBar.open(asApiError(error).detail, 'U redu', { duration: 6000 });
          },
        });
    };
    if (ask) {
      ask.pipe(filter(Boolean)).subscribe(run);
    } else {
      run();
    }
  }
}
