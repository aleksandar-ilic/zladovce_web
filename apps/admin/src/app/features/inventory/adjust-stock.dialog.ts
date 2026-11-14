import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { asApiError } from '@zladovce/api';
import { InventoryItem } from '@zladovce/models';
import { notBlank } from '@zladovce/shared';
import { validationMessage } from '@zladovce/ui';
import { startWith } from 'rxjs';
import { InventoryApi } from '../../data/inventory-api';
import { applyServerErrors } from '../../shared/server-errors';

export type AdjustDirection = 'add' | 'remove';

export const MAX_ADJUSTMENT = 1_000_000;

/** Quick reasons; choosing one fills the reason field (it can still be edited). */
export const QUICK_REASONS: Record<AdjustDirection, readonly string[]> = {
  add: ['Nova proizvodnja', 'Povrat robe', 'Popis'],
  remove: ['Oštećeno', 'Isteklo', 'Popis', 'Poklon ili degustacija'],
};

/** Stock after the change, or null while the amount is not a valid whole number. */
export function resultingStock(
  current: number,
  direction: AdjustDirection,
  amount: number | null,
): number | null {
  if (amount === null || !Number.isInteger(amount) || amount <= 0) {
    return null;
  }
  return direction === 'add' ? current + amount : current - amount;
}

/**
 * "Promeni stanje": add (+) or remove (−) a number of pieces, with a mandatory reason.
 * Shows the resulting stock before confirming and refuses to go below zero.
 * Closes with the updated inventory row.
 */
@Component({
  selector: 'adm-adjust-stock-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Promeni stanje</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content>
        <p class="text-base font-semibold text-ink-900">
          {{ item.productName }} – {{ item.variantName }}
        </p>
        <p class="text-sm text-ink-500">Šifra: {{ item.sku }}</p>
        <p class="mt-2 text-base text-ink-700" data-testid="current">
          Trenutno na stanju: <strong>{{ item.quantityOnHand }}</strong>
        </p>

        <mat-button-toggle-group
          class="mt-4"
          formControlName="direction"
          aria-label="Vrsta promene"
          [hideSingleSelectionIndicator]="true"
        >
          <mat-button-toggle value="add" data-testid="add">+ Dodaj na stanje</mat-button-toggle>
          <mat-button-toggle value="remove" data-testid="remove"
            >− Skini sa stanja</mat-button-toggle
          >
        </mat-button-toggle-group>

        <mat-form-field appearance="outline" class="mt-4 w-full">
          <mat-label>Količina (komada)</mat-label>
          <input
            matInput
            type="number"
            inputmode="numeric"
            min="1"
            step="1"
            formControlName="amount"
            data-testid="amount"
          />
          @if (form.controls.amount.errors; as errors) {
            <mat-error>{{
              message(errors, { pattern: 'Unesite ceo broj veći od nule.' })
            }}</mat-error>
          }
        </mat-form-field>

        <p class="text-sm font-semibold text-ink-900">Razlog</p>
        <div class="mt-1 mb-2 flex flex-wrap gap-2" role="group" aria-label="Brzi izbor razloga">
          @for (reason of quickReasons(); track reason) {
            <button
              type="button"
              class="cursor-pointer rounded-full border border-sage-400 px-3 py-1 text-sm hover:bg-sage-50"
              [class.bg-olive-100]="form.controls.reason.value === reason"
              (click)="pickReason(reason)"
            >
              {{ reason }}
            </button>
          }
        </div>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Razlog promene</mat-label>
          <textarea
            matInput
            rows="2"
            maxlength="500"
            formControlName="reason"
            data-testid="reason"
          ></textarea>
          <mat-hint>Obavezno. Na primer: „Nova proizvodnja, 12 tegli“.</mat-hint>
          @if (form.controls.reason.errors; as errors) {
            <mat-error>{{ message(errors, { required: 'Upišite razlog promene.' }) }}</mat-error>
          }
        </mat-form-field>

        <div
          class="mt-3 rounded-md px-4 py-3 text-base"
          [class.bg-sage-50]="!belowZero()"
          [class.bg-danger-50]="belowZero()"
          data-testid="preview"
          aria-live="polite"
        >
          @if (result() === null) {
            Unesite količinu da vidite novo stanje.
          } @else if (belowZero()) {
            <span class="font-medium text-danger-700"
              >Ne možete skinuti više nego što ima na stanju ({{ item.quantityOnHand }}).</span
            >
          } @else {
            Novo stanje: <strong>{{ item.quantityOnHand }}</strong>
            {{ direction() === 'add' ? '+' : '−' }} {{ form.controls.amount.value }} =
            <strong data-testid="result">{{ result() }}</strong>
          }
        </div>

        @if (error(); as text) {
          <p
            class="mt-3 rounded-md bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
            role="alert"
          >
            {{ text }}
          </p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Odustani</button>
        <button matButton="filled" type="submit" data-testid="submit" [disabled]="saving()">
          {{ saving() ? 'Čuvanje…' : 'Potvrdi promenu' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class AdjustStockDialog {
  private readonly api = inject(InventoryApi);
  private readonly dialogRef = inject<MatDialogRef<AdjustStockDialog, InventoryItem>>(MatDialogRef);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly item = inject<InventoryItem>(MAT_DIALOG_DATA);

  protected readonly message = validationMessage;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    direction: ['add' as AdjustDirection],
    amount: inject(FormBuilder).control<number | null>(null, [
      Validators.required,
      Validators.min(1),
      Validators.max(MAX_ADJUSTMENT),
      Validators.pattern(/^\d+$/),
    ]),
    reason: ['', [Validators.required, notBlank, Validators.maxLength(500)]],
  });

  private readonly value = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );
  protected readonly direction = computed(() => this.value().direction ?? 'add');
  readonly result = computed(() =>
    resultingStock(this.item.quantityOnHand, this.direction(), this.value().amount ?? null),
  );
  protected readonly belowZero = computed(() => (this.result() ?? 0) < 0);
  protected readonly quickReasons = computed(() => QUICK_REASONS[this.direction()]);

  protected pickReason(reason: string): void {
    this.form.controls.reason.setValue(reason);
    this.form.controls.reason.markAsDirty();
  }

  submit(): void {
    if (this.saving()) {
      return;
    }
    this.error.set(null);
    if (this.form.invalid || this.belowZero()) {
      this.form.markAllAsTouched();
      return;
    }
    const { direction, amount, reason } = this.form.getRawValue();
    const delta = direction === 'add' ? (amount ?? 0) : -(amount ?? 0);
    this.saving.set(true);
    this.api
      .adjust(this.item.variantId, delta, reason.trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => this.dialogRef.close(updated),
        error: (error: unknown) => {
          this.saving.set(false);
          const apiError = asApiError(error);
          const unmatched = applyServerErrors(this.form, apiError, {
            aliases: { quantityDelta: 'amount' },
          });
          this.error.set(
            unmatched.length > 0
              ? unmatched.join(' ')
              : apiError.isValidation
                ? null
                : apiError.detail,
          );
        },
      });
  }
}
