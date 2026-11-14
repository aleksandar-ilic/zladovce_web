import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ApiError, asApiError } from '@zladovce/api';
import { AdminOrderDetail, SetOrderPaymentRequest } from '@zladovce/models';
import { validationMessage } from '@zladovce/ui';
import { RsdPipe } from '@zladovce/utilities';
import { OrdersApi } from '../../data/orders-api';
import { applyServerErrors } from '../../shared/server-errors';
import {
  belgradeDate,
  fromIsoDate,
  instantForSerbianDate,
  SERBIAN_DATES,
  toIsoDate,
} from '../../shared/serbian-dates';

export type PaymentDialogResult =
  { kind: 'saved'; order: AdminOrderDetail } | { kind: 'conflict'; error: ApiError };

/** Whole dinars or dinars and para (at most two decimals), above zero. */
export function moneyValidator(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { money: 'Iznos mora biti veći od nule.' };
  }
  return Math.round(amount * 100) / 100 === amount
    ? null
    : { money: 'Iznos može imati najviše dve decimale.' };
}

/** The request for "Evidentiraj naplatu": the date becomes an instant (today = now). */
export function buildPaymentRequest(
  order: Pick<AdminOrderDetail, 'version' | 'placedAt'>,
  amount: number,
  collectedOn: Date | null,
  now = Date.now(),
): SetOrderPaymentRequest {
  return {
    collectedAmount: amount,
    collectedAt: instantForSerbianDate(toIsoDate(collectedOn), { notBefore: order.placedAt, now }),
    version: order.version,
  };
}

/**
 * "Evidentiraj naplatu" for a delivered order: the amount the courier handed over (prefilled with
 * the order total) and the day it arrived (today by default).
 */
@Component({
  selector: 'adm-payment-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    RsdPipe,
  ],
  providers: [SERBIAN_DATES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Evidentiraj naplatu</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content>
        <p class="text-base text-ink-700">
          Porudžbina <strong class="text-ink-900">{{ order.orderNumber }}</strong>, ukupno
          <strong class="text-ink-900">{{ order.total | rsd }}</strong>.
        </p>
        <p class="mt-2 text-sm text-ink-700">
          Upišite koliko vam je kurirska služba stvarno uplatila za ovu porudžbinu i kada.
        </p>
        <mat-form-field appearance="outline" class="mt-4 w-full">
          <mat-label>Naplaćeni iznos</mat-label>
          <input
            matInput
            type="number"
            inputmode="decimal"
            min="0.01"
            step="0.01"
            formControlName="amount"
            data-testid="amount"
          />
          <span matTextSuffix>RSD</span>
          @if (form.controls.amount.errors; as errors) {
            <mat-error>{{ message(errors, { required: 'Upišite naplaćeni iznos.' }) }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Datum naplate</mat-label>
          <input
            matInput
            [matDatepicker]="picker"
            [min]="placedDay"
            [max]="today"
            formControlName="collectedOn"
            data-testid="collected-on"
          />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
          <mat-hint>Na primer 14.11.2026.</mat-hint>
          @if (form.controls.collectedOn.errors; as errors) {
            <mat-error>{{ dateMessage(errors) }}</mat-error>
          }
        </mat-form-field>
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
        <button matButton="filled" type="submit" data-testid="save-payment" [disabled]="saving()">
          {{ saving() ? 'Čuvanje…' : 'Sačuvaj naplatu' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class PaymentDialog {
  private readonly api = inject(OrdersApi);
  private readonly dialogRef =
    inject<MatDialogRef<PaymentDialog, PaymentDialogResult>>(MatDialogRef);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly order = inject<AdminOrderDetail>(MAT_DIALOG_DATA);
  protected readonly message = validationMessage;
  protected readonly today = fromIsoDate(belgradeDate());
  protected readonly placedDay = fromIsoDate(belgradeDate(this.order.placedAt));

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  private readonly fb = inject(FormBuilder);
  readonly form = this.fb.group({
    amount: this.fb.control<number | null>(this.order.payment.collectedAmount ?? this.order.total, [
      Validators.required,
      moneyValidator,
      Validators.max(9_999_999),
    ]),
    collectedOn: this.fb.control<Date | null>(
      this.order.payment.collectedAt
        ? fromIsoDate(belgradeDate(this.order.payment.collectedAt))
        : this.today,
      [Validators.required],
    ),
  });

  protected dateMessage(errors: Record<string, unknown>): string {
    if (errors['matDatepickerParse']) {
      return 'Upišite datum kao 14.11.2026.';
    }
    if (errors['matDatepickerMax']) {
      return 'Datum naplate ne može biti u budućnosti.';
    }
    if (errors['matDatepickerMin']) {
      return 'Datum naplate ne može biti pre datuma porudžbine.';
    }
    return validationMessage(errors, { required: 'Upišite datum naplate.' }) ?? '';
  }

  submit(): void {
    if (this.saving()) {
      return;
    }
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { amount, collectedOn } = this.form.getRawValue();
    this.saving.set(true);
    this.api
      .setPayment(this.order.id, buildPaymentRequest(this.order, Number(amount), collectedOn))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (order) => this.dialogRef.close({ kind: 'saved', order }),
        error: (error: unknown) => {
          this.saving.set(false);
          const apiError = asApiError(error);
          if (apiError.code === 'CONCURRENT_EDIT' || apiError.code === 'ORDER_NOT_DELIVERED') {
            this.dialogRef.close({ kind: 'conflict', error: apiError });
            return;
          }
          const unmatched = applyServerErrors(this.form, apiError, {
            aliases: { collectedAmount: 'amount', collectedAt: 'collectedOn' },
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
