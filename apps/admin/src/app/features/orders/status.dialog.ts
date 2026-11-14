import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { ApiError, asApiError } from '@zladovce/api';
import { HasRoleDirective } from '@zladovce/auth';
import { AdminOrderDetail, ChangeOrderStatusRequest, Courier } from '@zladovce/models';
import { validationMessage } from '@zladovce/ui';
import { OrdersApi } from '../../data/orders-api';
import { CouriersApi } from '../../data/couriers-api';
import { applyServerErrors } from '../../shared/server-errors';
import {
  belgradeDate,
  fromIsoDate,
  instantForSerbianDate,
  SERBIAN_DATES,
  toIsoDate,
} from '../../shared/serbian-dates';
import { OrderAction } from './order-actions';

export const STATUS_TEXT_MAX = 2000;
export const TRACKING_NUMBER_MAX = 100;
export const SHIPMENT_NOTE_MAX = 1000;

export interface StatusDialogData {
  order: AdminOrderDetail;
  action: OrderAction;
}

/** How the dialog ended: saved (new detail) or refused because the order changed meanwhile. */
export type StatusDialogResult =
  { kind: 'saved'; order: AdminOrderDetail } | { kind: 'conflict'; error: ApiError };

export interface StatusFormValue {
  customerMessage: string;
  internalNote: string;
  courierCompanyId: string;
  trackingNumber: string;
  shippedAt: Date | null;
  shipmentNote: string;
  restock: boolean | null;
}

const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/**
 * The request for one transition. `shipment` only for a transition that needs it (Shipped),
 * `restock` only when the administrator must choose (DeliveryFailed → Cancelled); the API
 * refuses either one anywhere else.
 */
export function buildStatusRequest(
  order: Pick<AdminOrderDetail, 'version' | 'placedAt'>,
  action: Pick<OrderAction, 'transition'>,
  value: StatusFormValue,
  now = Date.now(),
): ChangeOrderStatusRequest {
  const request: ChangeOrderStatusRequest = {
    newStatus: action.transition.status,
    version: order.version,
    internalNote: blankToNull(value.internalNote),
    customerMessage: blankToNull(value.customerMessage),
  };
  if (action.transition.requiresShipment) {
    request.shipment = {
      courierCompanyId: value.courierCompanyId,
      trackingNumber: blankToNull(value.trackingNumber),
      shippedAt: instantForSerbianDate(toIsoDate(value.shippedAt), {
        notBefore: order.placedAt,
        now,
      }),
      note: blankToNull(value.shipmentNote),
    };
  }
  if (action.transition.requiresRestockChoice) {
    request.restock = value.restock;
  }
  return request;
}

/**
 * Confirms one status change of an order and sends it. Asks only what this transition needs:
 * the courier, tracking number and date for "Poslata", the restock choice when a failed delivery
 * is cancelled; a message for the customer and an internal note are always optional.
 */
@Component({
  selector: 'adm-status-dialog',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatRadioModule,
    HasRoleDirective,
  ],
  providers: [SERBIAN_DATES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ action.title }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content>
        <p class="text-base text-ink-700">
          Porudžbina <strong class="text-ink-900">{{ order.orderNumber }}</strong>
        </p>
        @if (action.explanation) {
          <p class="mt-2 text-base text-ink-700">{{ action.explanation }}</p>
        }
        @if (action.stockText; as stock) {
          <p
            class="mt-2 rounded-md bg-sage-50 px-3 py-2 text-sm text-sage-700"
            data-testid="stock-text"
          >
            {{ stock }}
          </p>
        }

        @if (needsShipment) {
          <fieldset class="mt-4" data-testid="shipment-fields">
            <legend class="mb-2 text-base font-semibold text-ink-900">Pošiljka</legend>
            @if (couriersState() === 'loading') {
              <p class="text-sm text-ink-500" role="status">Učitavanje kurirskih službi…</p>
            } @else if (couriersState() === 'error') {
              <p class="text-sm text-danger-700" role="alert">
                Kurirske službe nisu učitane.
                <button matButton type="button" (click)="loadCouriers()">Pokušaj ponovo</button>
              </p>
            } @else if (couriers().length === 0) {
              <div
                class="rounded-md bg-warning-50 px-4 py-3 text-sm text-warning-700"
                data-testid="no-couriers"
              >
                <p>
                  Još nema nijedne aktivne kurirske službe, a bez nje porudžbina ne može da se
                  označi kao poslata.
                </p>
                <p *authHasRole="'Owner'" class="mt-2">
                  <a routerLink="/kuriri" class="font-semibold underline" mat-dialog-close
                    >Dodajte kurirsku službu</a
                  >
                  pa se vratite na porudžbinu.
                </p>
                <p *authHasRole="'Staff'" class="mt-2">
                  Zamolite vlasnika da doda kurirsku službu u „Kuriri“.
                </p>
              </div>
            } @else {
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Kurirska služba</mat-label>
                <mat-select formControlName="courierCompanyId" data-testid="courier">
                  @for (courier of couriers(); track courier.id) {
                    <mat-option [value]="courier.id">{{ courier.name }}</mat-option>
                  }
                </mat-select>
                @if (form.controls.courierCompanyId.errors; as errors) {
                  <mat-error>{{
                    message(errors, { required: 'Izaberite kurirsku službu.' })
                  }}</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Broj pošiljke</mat-label>
                <input
                  matInput
                  formControlName="trackingNumber"
                  maxlength="100"
                  autocomplete="off"
                  data-testid="tracking-number"
                />
                <mat-hint>Nije obavezno – možete ga upisati i kasnije.</mat-hint>
                @if (form.controls.trackingNumber.errors; as errors) {
                  <mat-error>{{ message(errors) }}</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Datum slanja</mat-label>
                <input
                  matInput
                  [matDatepicker]="shippedPicker"
                  [min]="placedDay"
                  [max]="today"
                  formControlName="shippedAt"
                  data-testid="shipped-at"
                />
                <mat-datepicker-toggle matIconSuffix [for]="shippedPicker" />
                <mat-datepicker #shippedPicker />
                <mat-hint>Na primer 14.11.2026.</mat-hint>
                @if (form.controls.shippedAt.errors; as errors) {
                  <mat-error>{{ dateMessage(errors) }}</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Napomena o pošiljci</mat-label>
                <textarea
                  matInput
                  rows="2"
                  maxlength="1000"
                  formControlName="shipmentNote"
                ></textarea>
                <mat-hint>Nije obavezno. Vidi je samo administracija.</mat-hint>
              </mat-form-field>
            }
          </fieldset>
        }

        @if (needsRestock) {
          <fieldset class="mt-4" data-testid="restock-fields">
            <legend class="text-base font-semibold text-ink-900">
              Vratiti proizvode na stanje?
            </legend>
            <p class="mt-1 text-sm text-ink-700">
              Paket nije isporučen. Ako su proizvodi vraćeni neoštećeni, mogu ponovo da se prodaju.
              Ako su oštećeni, pokvareni ili nisu vraćeni, ne vraćajte ih na stanje.
            </p>
            <mat-radio-group
              class="mt-2 flex flex-col gap-1"
              formControlName="restock"
              aria-label="Vratiti proizvode na stanje?"
            >
              <mat-radio-button [value]="true" data-testid="restock-yes"
                >Da, vrati proizvode na stanje</mat-radio-button
              >
              <mat-radio-button [value]="false" data-testid="restock-no"
                >Ne, ne vraćaj ih na stanje</mat-radio-button
              >
            </mat-radio-group>
            @if (restockError()) {
              <p
                class="mt-1 text-sm font-medium text-danger-700"
                role="alert"
                data-testid="restock-error"
              >
                {{ restockError() }}
              </p>
            }
          </fieldset>
        }

        <mat-form-field appearance="outline" class="mt-4 w-full">
          <mat-label>Poruka kupcu</mat-label>
          <textarea
            matInput
            rows="2"
            maxlength="2000"
            formControlName="customerMessage"
            data-testid="customer-message"
          ></textarea>
          <mat-hint
            >Nije obavezno. Kupac će ovu poruku videti u e-poruci o promeni statusa i na stranici za
            praćenje porudžbine, zato pišite ljubazno i bez internih detalja.</mat-hint
          >
          @if (form.controls.customerMessage.errors; as errors) {
            <mat-error>{{ message(errors) }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="mt-6 w-full">
          <mat-label>Interna napomena</mat-label>
          <textarea
            matInput
            rows="2"
            maxlength="2000"
            formControlName="internalNote"
            data-testid="internal-note"
          ></textarea>
          <mat-hint>Nije obavezno. Vidi je samo administracija.</mat-hint>
          @if (form.controls.internalNote.errors; as errors) {
            <mat-error>{{ message(errors) }}</mat-error>
          }
        </mat-form-field>

        @if (error(); as text) {
          <p
            class="mt-4 rounded-md bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
            role="alert"
            data-testid="dialog-error"
          >
            {{ text }}
          </p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Odustani</button>
        <button
          matButton="filled"
          type="submit"
          data-testid="confirm-status"
          [class.danger-button]="action.kind === 'danger'"
          [disabled]="saving() || blockedByCouriers()"
        >
          {{ saving() ? 'Čuvanje…' : action.label }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class StatusDialog {
  private readonly api = inject(OrdersApi);
  private readonly couriersApi = inject(CouriersApi);
  private readonly dialogRef = inject<MatDialogRef<StatusDialog, StatusDialogResult>>(MatDialogRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly data = inject<StatusDialogData>(MAT_DIALOG_DATA);

  protected readonly order = this.data.order;
  protected readonly action = this.data.action;
  protected readonly needsShipment = this.action.transition.requiresShipment;
  protected readonly needsRestock = this.action.transition.requiresRestockChoice;
  protected readonly message = validationMessage;
  protected readonly today = fromIsoDate(belgradeDate());
  protected readonly placedDay = fromIsoDate(belgradeDate(this.order.placedAt));

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly couriers = signal<Courier[]>([]);
  readonly couriersState = signal<'loading' | 'loaded' | 'error'>('loading');
  private readonly submitted = signal(false);
  private readonly restockValue = signal<boolean | null>(null);
  protected readonly restockError = computed(() =>
    this.submitted() && this.restockValue() === null
      ? 'Izaberite da li se proizvodi vraćaju na stanje.'
      : null,
  );
  protected readonly blockedByCouriers = computed(
    () => this.needsShipment && (this.couriersState() !== 'loaded' || this.couriers().length === 0),
  );

  private readonly fb = inject(FormBuilder);
  readonly form = this.fb.nonNullable.group({
    customerMessage: ['', [Validators.maxLength(STATUS_TEXT_MAX)]],
    internalNote: ['', [Validators.maxLength(STATUS_TEXT_MAX)]],
    courierCompanyId: ['', this.needsShipment ? [Validators.required] : []],
    trackingNumber: ['', [Validators.maxLength(TRACKING_NUMBER_MAX)]],
    shippedAt: this.fb.control<Date | null>(
      this.today,
      this.needsShipment ? [Validators.required] : [],
    ),
    shipmentNote: ['', [Validators.maxLength(SHIPMENT_NOTE_MAX)]],
    restock: this.fb.control<boolean | null>(null, this.needsRestock ? [Validators.required] : []),
  });

  constructor() {
    if (this.needsShipment) {
      this.loadCouriers();
    }
    this.form.controls.restock.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.restockValue.set(value));
  }

  loadCouriers(): void {
    this.couriersState.set('loading');
    this.couriersApi
      .list(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (couriers) => {
          this.couriers.set(couriers);
          this.couriersState.set('loaded');
          if (couriers.length === 1) {
            this.form.controls.courierCompanyId.setValue(couriers[0]!.id);
          }
        },
        error: () => this.couriersState.set('error'),
      });
  }

  protected dateMessage(errors: Record<string, unknown>): string {
    if (errors['matDatepickerParse']) {
      return 'Upišite datum kao 14.11.2026.';
    }
    if (errors['matDatepickerMax']) {
      return 'Datum slanja ne može biti u budućnosti.';
    }
    if (errors['matDatepickerMin']) {
      return 'Datum slanja ne može biti pre datuma porudžbine.';
    }
    return validationMessage(errors, { required: 'Upišite datum slanja.' }) ?? '';
  }

  submit(): void {
    if (this.saving()) {
      return;
    }
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid || this.blockedByCouriers()) {
      this.form.markAllAsTouched();
      return;
    }
    const request = buildStatusRequest(this.order, this.action, this.form.getRawValue());
    this.saving.set(true);
    this.api
      .changeStatus(this.order.id, request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (order) => this.dialogRef.close({ kind: 'saved', order }),
        error: (error: unknown) => {
          this.saving.set(false);
          const apiError = asApiError(error);
          if (
            apiError.code === 'CONCURRENT_EDIT' ||
            apiError.code === 'INVALID_STATUS_TRANSITION'
          ) {
            this.dialogRef.close({ kind: 'conflict', error: apiError });
            return;
          }
          const unmatched = applyServerErrors(this.form, apiError, {
            aliases: {
              'shipment.courierCompanyId': 'courierCompanyId',
              'shipment.trackingNumber': 'trackingNumber',
              'shipment.shippedAt': 'shippedAt',
              'shipment.note': 'shipmentNote',
            },
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
