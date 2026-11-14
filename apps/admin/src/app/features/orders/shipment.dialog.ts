import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { asApiError } from '@zladovce/api';
import {
  AdminOrderDetail,
  AdminOrderShipment,
  Courier,
  UpdateShipmentRequest,
} from '@zladovce/models';
import { validationMessage } from '@zladovce/ui';
import { CouriersApi } from '../../data/couriers-api';
import { OrdersApi } from '../../data/orders-api';
import { applyServerErrors } from '../../shared/server-errors';
import {
  belgradeDate,
  fromIsoDate,
  instantForSerbianDate,
  SERBIAN_DATES,
  toIsoDate,
} from '../../shared/serbian-dates';
import { SHIPMENT_NOTE_MAX, TRACKING_NUMBER_MAX } from './status.dialog';

export interface ShipmentDialogData {
  order: AdminOrderDetail;
  shipment: AdminOrderShipment;
}

/** Every member is sent. An unchanged day keeps the original time. */
export function buildShipmentRequest(
  order: Pick<AdminOrderDetail, 'placedAt'>,
  shipment: Pick<AdminOrderShipment, 'shippedAt'>,
  value: { courierCompanyId: string; trackingNumber: string; shippedOn: Date | null; note: string },
  now = Date.now(),
): UpdateShipmentRequest {
  const day = toIsoDate(value.shippedOn);
  const shippedAt =
    day === belgradeDate(shipment.shippedAt)
      ? shipment.shippedAt
      : (instantForSerbianDate(day, { notBefore: order.placedAt, now }) ??
        new Date(now).toISOString());
  return {
    courierCompanyId: value.courierCompanyId,
    trackingNumber: value.trackingNumber.trim() === '' ? null : value.trackingNumber.trim(),
    shippedAt,
    note: value.note.trim() === '' ? null : value.note.trim(),
  };
}

/** Changes a shipment (courier, tracking number, date, note) – e.g. adds the tracking number later. */
@Component({
  selector: 'adm-shipment-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
  ],
  providers: [SERBIAN_DATES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Izmena pošiljke</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Kurirska služba</mat-label>
          <mat-select formControlName="courierCompanyId" data-testid="courier">
            @for (courier of couriers(); track courier.id) {
              <mat-option [value]="courier.id"
                >{{ courier.name }}{{ courier.isActive ? '' : ' (neaktivna)' }}</mat-option
              >
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Broj pošiljke</mat-label>
          <input
            matInput
            formControlName="trackingNumber"
            maxlength="100"
            data-testid="tracking-number"
          />
          @if (form.controls.trackingNumber.errors; as errors) {
            <mat-error>{{ message(errors) }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Datum slanja</mat-label>
          <input
            matInput
            [matDatepicker]="picker"
            [min]="placedDay"
            [max]="today"
            formControlName="shippedOn"
          />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
          @if (form.controls.shippedOn.errors; as errors) {
            <mat-error>{{
              errors['matDatepickerParse']
                ? 'Upišite datum kao 14.11.2026.'
                : message(errors, { required: 'Upišite datum slanja.' })
            }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Napomena o pošiljci</mat-label>
          <textarea matInput rows="2" maxlength="1000" formControlName="note"></textarea>
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
        <button matButton="filled" type="submit" data-testid="save-shipment" [disabled]="saving()">
          {{ saving() ? 'Čuvanje…' : 'Sačuvaj pošiljku' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class ShipmentDialog {
  private readonly api = inject(OrdersApi);
  private readonly dialogRef = inject<MatDialogRef<ShipmentDialog, AdminOrderDetail>>(MatDialogRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly data = inject<ShipmentDialogData>(MAT_DIALOG_DATA);
  protected readonly message = validationMessage;
  protected readonly today = fromIsoDate(belgradeDate());
  protected readonly placedDay = fromIsoDate(belgradeDate(this.data.order.placedAt));

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  /** Active couriers plus the current one (which may have been deactivated meanwhile). */
  readonly couriers = signal<Pick<Courier, 'id' | 'name' | 'isActive'>[]>([
    this.data.shipment.courier,
  ]);

  private readonly fb = inject(FormBuilder);
  readonly form = this.fb.nonNullable.group({
    courierCompanyId: [this.data.shipment.courier.id, [Validators.required]],
    trackingNumber: [
      this.data.shipment.trackingNumber ?? '',
      [Validators.maxLength(TRACKING_NUMBER_MAX)],
    ],
    shippedOn: this.fb.control<Date | null>(
      fromIsoDate(belgradeDate(this.data.shipment.shippedAt)),
      [Validators.required],
    ),
    note: [this.data.shipment.note ?? '', [Validators.maxLength(SHIPMENT_NOTE_MAX)]],
  });

  constructor() {
    inject(CouriersApi)
      .list(true)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (active) => {
          const current = this.data.shipment.courier;
          this.couriers.set(
            active.some((c) => c.id === current.id) ? active : [current, ...active],
          );
        },
        error: () => this.error.set('Kurirske službe nisu učitane; možete zadržati postojeću.'),
      });
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
    this.saving.set(true);
    const { order, shipment } = this.data;
    this.api
      .updateShipment(
        order.id,
        shipment.id,
        buildShipmentRequest(order, shipment, this.form.getRawValue()),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => this.dialogRef.close(updated),
        error: (error: unknown) => {
          this.saving.set(false);
          const apiError = asApiError(error);
          const unmatched = applyServerErrors(this.form, apiError, {
            aliases: { shippedAt: 'shippedOn' },
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
