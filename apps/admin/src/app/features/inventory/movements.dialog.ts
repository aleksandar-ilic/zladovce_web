import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { ApiError, asApiError } from '@zladovce/api';
import { InventoryItem, InventoryMovement, Paged } from '@zladovce/models';
import { MOVEMENT_TYPE_LABELS } from '@zladovce/shared';
import { UiEmptyState, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { SrDatePipe } from '@zladovce/utilities';
import { InventoryApi } from '../../data/inventory-api';
import { SERBIAN_PAGINATOR } from '../../shared/paginator-intl';

type State =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; page: Paged<InventoryMovement> };

export const MOVEMENTS_PAGE_SIZE = 10;

/** `+12` / `−3` with a real minus sign. */
export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

/** Stock history of one package, newest first, page by page. */
@Component({
  selector: 'adm-movements-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatPaginatorModule,
    UiLoadingState,
    UiErrorState,
    UiEmptyState,
    SrDatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SERBIAN_PAGINATOR],
  template: `
    <h2 mat-dialog-title>Istorija stanja</h2>
    <mat-dialog-content>
      <p class="text-base font-semibold text-ink-900">
        {{ item.productName }} – {{ item.variantName }}
      </p>
      <p class="text-sm text-ink-500">Šifra: {{ item.sku }}</p>

      @switch (state().status) {
        @case ('loading') {
          <ui-loading-state label="Učitavanje istorije…" />
        }
        @case ('error') {
          <ui-error-state
            title="Istorija nije učitana"
            [message]="errorMessage()"
            (retry)="load(page())"
          />
        }
        @default {
          @if (movements().length === 0) {
            <ui-empty-state
              title="Još nema promena"
              description="Ovde će se videti svaka promena stanja."
            />
          } @else {
            <ol class="mt-4 flex flex-col gap-2" aria-label="Promene stanja, od najnovije">
              @for (movement of movements(); track movement.id) {
                <li class="rounded-md border border-cream-200 bg-white p-3" data-testid="movement">
                  <div class="flex flex-wrap items-baseline justify-between gap-2">
                    <span class="font-semibold text-ink-900">{{
                      typeLabels[movement.movementType]
                    }}</span>
                    <span class="text-sm text-ink-500">{{
                      movement.createdAt | srDate: 'dateTime'
                    }}</span>
                  </div>
                  <p class="mt-1 text-base">
                    <span
                      class="font-semibold"
                      [class.text-olive-700]="movement.quantityDelta > 0"
                      [class.text-danger-700]="movement.quantityDelta < 0"
                      >{{ delta(movement.quantityDelta) }}</span
                    >
                    <span class="text-ink-700"> → na stanju {{ movement.quantityAfter }}</span>
                  </p>
                  @if (movement.reason) {
                    <p class="mt-1 text-sm text-ink-700">Razlog: {{ movement.reason }}</p>
                  }
                  <p class="mt-1 text-xs text-ink-500">
                    {{ movement.adminName ? 'Uneo: ' + movement.adminName : 'Automatski (sistem)' }}
                  </p>
                </li>
              }
            </ol>
          }
          @if (total() > pageSize) {
            <mat-paginator
              class="mt-2 bg-transparent"
              [length]="total()"
              [pageIndex]="page() - 1"
              [pageSize]="pageSize"
              [hidePageSize]="true"
              (page)="pageChanged($event)"
            />
          }
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton="filled" type="button" mat-dialog-close>Zatvori</button>
    </mat-dialog-actions>
  `,
})
export class MovementsDialog {
  private readonly api = inject(InventoryApi);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly item = inject<InventoryItem>(MAT_DIALOG_DATA);

  protected readonly typeLabels = MOVEMENT_TYPE_LABELS;
  protected readonly delta = formatDelta;
  protected readonly pageSize = MOVEMENTS_PAGE_SIZE;
  protected readonly page = signal(1);
  protected readonly state = signal<State>({ status: 'loading' });

  constructor() {
    this.load(1);
  }

  protected movements(): InventoryMovement[] {
    const state = this.state();
    return state.status === 'loaded' ? state.page.items : [];
  }

  protected total(): number {
    const state = this.state();
    return state.status === 'loaded' ? state.page.totalItems : 0;
  }

  protected errorMessage(): string {
    const state = this.state();
    return state.status === 'error' ? state.error.detail : '';
  }

  load(page: number): void {
    this.page.set(page);
    this.state.set({ status: 'loading' });
    this.api
      .movements(this.item.variantId, page, MOVEMENTS_PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => this.state.set({ status: 'loaded', page: result }),
        error: (error: unknown) => this.state.set({ status: 'error', error: asApiError(error) }),
      });
  }

  protected pageChanged(event: PageEvent): void {
    this.load(event.pageIndex + 1);
  }
}
