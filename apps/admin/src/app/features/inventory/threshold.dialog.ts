import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { asApiError } from '@zladovce/api';
import { InventoryItem } from '@zladovce/models';
import { validationMessage } from '@zladovce/ui';
import { InventoryApi } from '../../data/inventory-api';
import { applyServerErrors } from '../../shared/server-errors';

/** Low-stock threshold of one package. Closes with the updated inventory row. */
@Component({
  selector: 'adm-threshold-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Upozorenje za malo na stanju</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content>
        <p class="text-base font-semibold text-ink-900">
          {{ item.productName }} – {{ item.variantName }}
        </p>
        <p class="mt-2 text-sm text-ink-700">
          Kada na stanju ostane ovoliko komada ili manje, pakovanje se označava sa „Malo na stanju“
          i prikazuje na kontrolnoj tabli.
        </p>
        <mat-form-field appearance="outline" class="mt-4 w-full">
          <mat-label>Upozori kad ostane (komada)</mat-label>
          <input
            matInput
            type="number"
            inputmode="numeric"
            min="0"
            step="1"
            formControlName="threshold"
          />
          @if (form.controls.threshold.errors; as errors) {
            <mat-error>{{ message(errors, { pattern: 'Unesite ceo broj.' }) }}</mat-error>
          }
        </mat-form-field>
        @if (error(); as text) {
          <p
            class="rounded-md bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
            role="alert"
          >
            {{ text }}
          </p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Odustani</button>
        <button matButton="filled" type="submit" [disabled]="saving()">
          {{ saving() ? 'Čuvanje…' : 'Sačuvaj' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class ThresholdDialog {
  private readonly api = inject(InventoryApi);
  private readonly dialogRef = inject<MatDialogRef<ThresholdDialog, InventoryItem>>(MatDialogRef);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly item = inject<InventoryItem>(MAT_DIALOG_DATA);

  protected readonly message = validationMessage;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).group({
    threshold: [
      this.item.lowStockThreshold as number | null,
      [
        Validators.required,
        Validators.min(0),
        Validators.max(1_000_000),
        Validators.pattern(/^\d+$/),
      ],
    ],
  });

  submit(): void {
    if (this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.api
      .setThreshold(this.item.variantId, this.form.controls.threshold.value ?? 0)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => this.dialogRef.close(updated),
        error: (error: unknown) => {
          this.saving.set(false);
          const apiError = asApiError(error);
          const unmatched = applyServerErrors(this.form, apiError, {
            aliases: { lowStockThreshold: 'threshold' },
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
