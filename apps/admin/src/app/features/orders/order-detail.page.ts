import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { ApiError, asApiError } from '@zladovce/api';
import { AdminOrderDetail, AdminOrderShipment, AdminOrderTimelineEntry } from '@zladovce/models';
import {
  notBlank,
  ORDER_STATUS_LABELS,
  orderStatusLabel,
  paymentMethodLabel,
} from '@zladovce/shared';
import {
  UiBadge,
  UiCard,
  UiCardTitle,
  UiErrorState,
  UiLoadingState,
  validationMessage,
} from '@zladovce/ui';
import { RsdPipe, SrDatePipe } from '@zladovce/utilities';
import { catchError, filter, map, of, switchMap } from 'rxjs';
import { OrderSummaryStore } from '../../core/order-summary';
import { OrdersApi } from '../../data/orders-api';
import { ConfirmService } from '../../shared/confirm-dialog';
import { OrderStatusBadge } from '../../shared/order-status-badge';
import { nextStepHint, OrderAction, orderActions } from './order-actions';
import { OrderEmails } from './order-emails';
import { PaymentDialog, PaymentDialogResult } from './payment.dialog';
import { ShipmentDialog, ShipmentDialogData } from './shipment.dialog';
import {
  StatusDialog,
  StatusDialogData,
  StatusDialogResult,
  STATUS_TEXT_MAX,
} from './status.dialog';

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; order: AdminOrderDetail };

/** Why the page shows a warning above the order. */
type Notice =
  | { kind: 'concurrent' }
  | { kind: 'transition'; detail: string }
  | { kind: 'notDelivered'; detail: string };

const DIALOG = {
  width: '36rem',
  maxWidth: 'calc(100vw - 2rem)',
  autoFocus: 'first-tabbable',
} as const;

/** `+381641234567` → `064 123 4567`; anything else unchanged. */
export function formatPhone(phone: string): string {
  const match = /^\+381(\d{2})(\d{3})(\d+)$/.exec(phone);
  return match ? `0${match[1]} ${match[2]} ${match[3]}` : phone;
}

/** Who made a timeline entry: the administrator, or the customer for the order itself. */
export function timelineActor(entry: AdminOrderTimelineEntry): string {
  if (entry.changedByAdminName) {
    return entry.changedByAdminName;
  }
  return entry.previousStatus === null ? 'Kupac (porudžbina sa sajta)' : 'Sistem';
}

/**
 * One order: who ordered what and where it goes, the next step as big buttons
 * (derived from `allowedNextStatuses`), payment, shipments, customer emails, notes and the full
 * history.
 * Every change answers with the whole order; its `version` is used for the next change.
 */
@Component({
  selector: 'adm-order-detail-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    OrderEmails,
    OrderStatusBadge,
    RsdPipe,
    SrDatePipe,
    UiBadge,
    UiCard,
    UiCardTitle,
    UiErrorState,
    UiLoadingState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      routerLink="/porudzbine"
      class="text-sm font-semibold text-olive-700 underline underline-offset-4"
      >← Porudžbine</a
    >
    @switch (state().status) {
      @case ('loading') {
        <ui-loading-state label="Učitavanje porudžbine…" />
      }
      @case ('error') {
        <ui-error-state
          title="Porudžbina nije učitana"
          [message]="errorMessage()"
          [retryable]="!notFound()"
          (retry)="reload()"
        />
      }
      @default {
        @let o = order()!;
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <h1 class="text-3xl" data-testid="order-number">{{ o.orderNumber }}</h1>
          <adm-order-status-badge [status]="o.status" data-testid="status" />
        </div>
        <p class="mt-1 text-sm text-ink-700">Poručeno {{ o.placedAt | srDate: 'dateTime' }}</p>

        @if (notice(); as n) {
          <div
            class="mt-4 max-w-5xl rounded-lg border border-warning-700/25 bg-warning-50 p-4 text-ink-900"
            role="alert"
            data-testid="notice"
          >
            @switch (n.kind) {
              @case ('concurrent') {
                <p class="font-semibold">Porudžbinu je u međuvremenu promenio neko drugi.</p>
                <p class="mt-1">
                  Vaša promena nije sačuvana. Učitajte najnovije stanje porudžbine, pa pokušajte
                  ponovo.
                </p>
                <button
                  matButton="filled"
                  type="button"
                  class="mt-3"
                  data-testid="reload-latest"
                  (click)="reload()"
                >
                  Učitaj najnovije stanje
                </button>
              }
              @case ('transition') {
                <p class="font-semibold">Ova promena statusa više nije moguća.</p>
                <p class="mt-1">{{ n.detail }} Prikazano je najnovije stanje porudžbine.</p>
              }
              @default {
                <p class="font-semibold">Naplata se evidentira samo za isporučene porudžbine.</p>
                <p class="mt-1">{{ n.detail }} Prikazano je najnovije stanje porudžbine.</p>
              }
            }
          </div>
        }

        <ui-card class="mt-6 block max-w-5xl" data-testid="next-step">
          @if (hint(); as text) {
            <h2 uiCardTitle>Sledeći korak</h2>
            <p class="mt-2 text-base text-ink-700">{{ text }}</p>
          } @else {
            <h2 uiCardTitle>Porudžbina je završena</h2>
            <p class="mt-2 text-base text-ink-700">
              Status „{{ statusLabel(o.status) }}“ je konačan; dalje promene statusa nisu moguće.
            </p>
          }
          @if (actions().length > 0) {
            <div class="mt-4 flex flex-wrap gap-3" data-testid="actions">
              @for (action of actions(); track action.transition.status) {
                @switch (action.kind) {
                  @case ('primary') {
                    <button
                      matButton="filled"
                      type="button"
                      class="min-h-12 text-base"
                      [attr.data-action]="action.transition.status"
                      [disabled]="busy()"
                      (click)="changeStatus(action)"
                    >
                      {{ action.label }}
                    </button>
                  }
                  @case ('secondary') {
                    <button
                      matButton="outlined"
                      type="button"
                      [attr.data-action]="action.transition.status"
                      [disabled]="busy()"
                      (click)="changeStatus(action)"
                    >
                      {{ action.label }}
                    </button>
                  }
                  @default {
                    <button
                      matButton
                      type="button"
                      class="danger-button"
                      [attr.data-action]="action.transition.status"
                      [disabled]="busy()"
                      (click)="changeStatus(action)"
                    >
                      {{ action.label }}
                    </button>
                  }
                }
              }
            </div>
          }
        </ui-card>

        <div class="mt-6 grid max-w-5xl items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div class="flex flex-col gap-6">
            <ui-card data-testid="customer">
              <h2 uiCardTitle>Kupac i dostava</h2>
              <dl class="mt-4 grid gap-x-6 gap-y-3 text-base sm:grid-cols-[auto_1fr]">
                <dt class="text-sm text-ink-500">Ime i prezime</dt>
                <dd class="font-semibold">{{ o.customer.firstName }} {{ o.customer.lastName }}</dd>
                <dt class="text-sm text-ink-500">Telefon</dt>
                <dd>
                  <a
                    class="font-semibold text-olive-700 underline underline-offset-4"
                    [href]="'tel:' + o.customer.phone"
                    data-testid="phone"
                    >{{ phone(o.customer.phone) }}</a
                  >
                </dd>
                <dt class="text-sm text-ink-500">E-pošta</dt>
                <dd class="break-all">
                  <a
                    class="text-olive-700 underline underline-offset-4"
                    [href]="'mailto:' + o.customer.email"
                    data-testid="email"
                    >{{ o.customer.email }}</a
                  >
                </dd>
                <dt class="text-sm text-ink-500">Adresa</dt>
                <dd data-testid="address">
                  {{ o.shippingAddress.street }}<br />
                  {{ o.shippingAddress.postalCode }} {{ o.shippingAddress.city }}
                </dd>
                <dt class="text-sm text-ink-500">Napomena za dostavu</dt>
                <dd data-testid="delivery-note" class="whitespace-pre-line">
                  {{ o.deliveryNote || '—' }}
                </dd>
              </dl>
            </ui-card>

            <ui-card data-testid="items">
              <h2 uiCardTitle>Proizvodi</h2>
              <ul class="mt-3 divide-y divide-cream-200">
                @for (item of o.items; track item.id) {
                  <li
                    class="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5"
                    data-testid="item"
                  >
                    <div class="min-w-0">
                      <p class="font-semibold">{{ item.productName }} – {{ item.variantName }}</p>
                      <p class="text-sm text-ink-500">Šifra {{ item.sku }}</p>
                    </div>
                    <p class="text-right">
                      <span class="text-sm text-ink-700"
                        >{{ item.quantity }} × {{ item.unitPrice | rsd }}</span
                      >
                      <span class="ml-3 font-semibold">{{ item.lineTotal | rsd }}</span>
                    </p>
                  </li>
                }
              </ul>
              <dl class="mt-3 space-y-1.5 border-t border-cream-200 pt-3">
                <div class="flex justify-between gap-4">
                  <dt class="text-ink-700">Međuzbir</dt>
                  <dd>{{ o.subtotal | rsd }}</dd>
                </div>
                <div class="flex justify-between gap-4">
                  <dt class="text-ink-700">Dostava</dt>
                  <dd>{{ o.shippingPrice > 0 ? (o.shippingPrice | rsd) : 'Besplatna' }}</dd>
                </div>
                <div class="flex justify-between gap-4 text-lg font-semibold">
                  <dt>Ukupno</dt>
                  <dd data-testid="total">{{ o.total | rsd }}</dd>
                </div>
                <div class="flex justify-between gap-4 text-sm">
                  <dt class="text-ink-700">Način plaćanja</dt>
                  <dd>{{ payment(o.paymentMethod) }}</dd>
                </div>
              </dl>
            </ui-card>

            <ui-card data-testid="timeline">
              <h2 uiCardTitle>Istorija</h2>
              <ol class="mt-4 flex flex-col gap-4 border-l-2 border-cream-200 pl-4">
                @for (entry of o.timeline; track entry.id) {
                  <li class="relative" data-testid="timeline-entry">
                    <span
                      class="absolute top-1.5 -left-[1.4rem] size-3 rounded-full border-2 border-white bg-olive-600"
                      aria-hidden="true"
                    ></span>
                    <p class="flex flex-wrap items-center gap-2">
                      <adm-order-status-badge [status]="entry.newStatus" />
                      <span class="text-sm text-ink-700">{{
                        entry.createdAt | srDate: 'dateTime'
                      }}</span>
                    </p>
                    <p class="mt-1 text-sm text-ink-700">{{ actor(entry) }}</p>
                    @if (entry.customerMessage) {
                      <p class="mt-1 text-sm">
                        <span class="font-semibold">Poruka kupcu:</span> {{ entry.customerMessage }}
                      </p>
                    }
                    @if (entry.internalNote) {
                      <p class="mt-1 text-sm">
                        <span class="font-semibold">Interna napomena:</span>
                        {{ entry.internalNote }}
                      </p>
                    }
                  </li>
                }
              </ol>
            </ui-card>
          </div>

          <div class="flex flex-col gap-6">
            <ui-card data-testid="payment">
              <h2 uiCardTitle>Naplata</h2>
              @if (o.payment.isCollected) {
                <p class="mt-3 flex flex-wrap items-center gap-2">
                  <ui-badge tone="success">Naplaćeno</ui-badge>
                  <span class="font-semibold" data-testid="collected-amount">{{
                    o.payment.collectedAmount | rsd
                  }}</span>
                </p>
                <p class="mt-1 text-sm text-ink-700">
                  Evidentirano {{ o.payment.collectedAt | srDate }}
                  @if (o.payment.collectedAmount !== o.total) {
                    Iznos se razlikuje od ukupnog iznosa porudžbine ({{ o.total | rsd }}).
                  }
                </p>
                @if (o.payment.canRecord) {
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button
                      matButton="outlined"
                      type="button"
                      [disabled]="busy()"
                      (click)="recordPayment()"
                    >
                      Izmeni naplatu
                    </button>
                    <button
                      matButton
                      type="button"
                      class="danger-button"
                      data-testid="clear-payment"
                      [disabled]="busy()"
                      (click)="clearPayment()"
                    >
                      Obriši evidenciju
                    </button>
                  </div>
                }
              } @else if (o.payment.canRecord) {
                <p class="mt-3 text-base text-ink-700">
                  Porudžbina je isporučena. Kada kurirska služba uplati novac, evidentirajte
                  naplatu.
                </p>
                <button
                  matButton="filled"
                  type="button"
                  class="mt-3"
                  data-testid="record-payment"
                  [disabled]="busy()"
                  (click)="recordPayment()"
                >
                  Evidentiraj naplatu
                </button>
              } @else {
                <p class="mt-3 text-sm text-ink-700">
                  {{ payment(o.paymentMethod) }}. Naplata se evidentira kada porudžbina bude
                  isporučena.
                </p>
              }
            </ui-card>

            <ui-card data-testid="shipments">
              <h2 uiCardTitle>Pošiljke</h2>
              @if (o.shipments.length === 0) {
                <p class="mt-3 text-sm text-ink-700">
                  Pošiljka se upisuje kada porudžbinu označite kao poslatu.
                </p>
              } @else {
                <ul class="mt-3 flex flex-col divide-y divide-cream-200">
                  @for (shipment of o.shipments; track shipment.id) {
                    <li class="py-2.5" data-testid="shipment">
                      <p class="font-semibold">{{ shipment.courier.name }}</p>
                      <p class="text-sm text-ink-700">Poslato {{ shipment.shippedAt | srDate }}</p>
                      <p class="text-sm">
                        Broj pošiljke:
                        @if (shipment.trackingNumber) {
                          @if (shipment.trackingUrl) {
                            <a
                              [href]="shipment.trackingUrl"
                              target="_blank"
                              rel="noopener noreferrer"
                              class="font-semibold text-olive-700 underline underline-offset-4"
                              data-testid="tracking-link"
                              >{{ shipment.trackingNumber
                              }}<span class="sr-only"> (otvara stranicu kurira)</span></a
                            >
                          } @else {
                            <span class="font-semibold">{{ shipment.trackingNumber }}</span>
                          }
                        } @else {
                          <span class="text-ink-500">nije upisan</span>
                        }
                      </p>
                      @if (shipment.note) {
                        <p class="text-sm text-ink-700">{{ shipment.note }}</p>
                      }
                      <button
                        matButton
                        type="button"
                        class="mt-1"
                        data-testid="edit-shipment"
                        [disabled]="busy()"
                        (click)="editShipment(shipment)"
                      >
                        {{ shipment.trackingNumber ? 'Izmeni pošiljku' : 'Dodaj broj pošiljke' }}
                      </button>
                    </li>
                  }
                </ul>
              }
            </ui-card>

            <adm-order-emails [order]="o" (changed)="reload()" />

            <ui-card data-testid="notes">
              <h2 uiCardTitle>Interne napomene</h2>
              <p class="mt-1 text-sm text-ink-500">Vidi ih samo administracija.</p>
              @if (o.notes.length > 0) {
                <ul class="mt-3 flex flex-col gap-3">
                  @for (note of o.notes; track note.id) {
                    <li class="rounded-md bg-cream-100 px-3 py-2" data-testid="note">
                      <p class="whitespace-pre-line">{{ note.note }}</p>
                      <p class="mt-1 text-xs text-ink-500">
                        {{ note.adminName }} · {{ note.createdAt | srDate: 'dateTime' }}
                      </p>
                    </li>
                  }
                </ul>
              }
              <form class="mt-4" (submit)="$event.preventDefault(); addNote()" novalidate>
                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Nova napomena</mat-label>
                  <textarea
                    matInput
                    rows="2"
                    maxlength="2000"
                    [formControl]="noteControl"
                    data-testid="note-input"
                  ></textarea>
                  @if (noteControl.errors; as errors) {
                    <mat-error>{{ message(errors, { required: 'Upišite napomenu.' }) }}</mat-error>
                  }
                </mat-form-field>
                @if (noteError(); as text) {
                  <p class="mb-2 text-sm font-medium text-danger-700" role="alert">{{ text }}</p>
                }
                <button
                  matButton="outlined"
                  type="submit"
                  data-testid="add-note"
                  [disabled]="savingNote()"
                >
                  {{ savingNote() ? 'Čuvanje…' : 'Dodaj napomenu' }}
                </button>
              </form>
            </ui-card>
          </div>
        </div>
      }
    }
  `,
})
export class OrderDetailPage {
  /** Route parameter `:id`. */
  readonly id = input.required<string>();

  private readonly api = inject(OrdersApi);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly summary = inject(OrderSummaryStore);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly message = validationMessage;
  readonly state = signal<DetailState>({ status: 'loading' });
  readonly notice = signal<Notice | null>(null);
  protected readonly busy = signal(false);
  protected readonly savingNote = signal(false);
  protected readonly noteError = signal<string | null>(null);
  readonly noteControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, notBlank, Validators.maxLength(STATUS_TEXT_MAX)],
  });

  readonly order = computed(() => {
    const state = this.state();
    return state.status === 'loaded' ? state.order : null;
  });
  readonly actions = computed(() => {
    const order = this.order();
    return order ? orderActions(order) : [];
  });
  protected readonly hint = computed(() => {
    const order = this.order();
    return order ? nextStepHint(order) : null;
  });
  protected readonly notFound = computed(() => {
    const state = this.state();
    return state.status === 'error' && state.error.isNotFound;
  });

  constructor() {
    toObservable(this.id)
      .pipe(
        switchMap((id) => {
          this.state.set({ status: 'loading' });
          return this.api.get(id).pipe(
            map((order): DetailState => ({ status: 'loaded', order })),
            catchError((error: unknown) =>
              of<DetailState>({ status: 'error', error: asApiError(error) }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.state.set(state));
  }

  protected statusLabel(status: AdminOrderDetail['status']): string {
    return orderStatusLabel(status);
  }

  protected phone(value: string): string {
    return formatPhone(value);
  }

  protected payment(method: string): string {
    return paymentMethodLabel(method);
  }

  protected actor(entry: AdminOrderTimelineEntry): string {
    return timelineActor(entry);
  }

  protected errorMessage(): string {
    const state = this.state();
    if (state.status !== 'error') {
      return '';
    }
    return state.error.isNotFound ? 'Porudžbina sa ovim brojem ne postoji.' : state.error.detail;
  }

  /** Loads the latest state (after a conflict, or on request). */
  reload(after?: () => void): void {
    this.api
      .get(this.id())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (order) => {
          this.state.set({ status: 'loaded', order });
          if (after) {
            after();
          } else {
            this.notice.set(null);
          }
        },
        error: (error: unknown) => this.state.set({ status: 'error', error: asApiError(error) }),
      });
  }

  changeStatus(action: OrderAction): void {
    const order = this.order();
    if (!order || this.busy()) {
      return;
    }
    this.dialog
      .open<StatusDialog, StatusDialogData, StatusDialogResult>(StatusDialog, {
        ...DIALOG,
        data: { order, action },
      })
      .afterClosed()
      .pipe(filter((result): result is StatusDialogResult => !!result))
      .subscribe((result) => {
        if (result.kind === 'saved') {
          this.saved(
            result.order,
            `Status je promenjen: ${ORDER_STATUS_LABELS[result.order.status]}.`,
          );
        } else {
          this.handleConflict(result.error);
        }
      });
  }

  recordPayment(): void {
    const order = this.order();
    if (!order) {
      return;
    }
    this.dialog
      .open<PaymentDialog, AdminOrderDetail, PaymentDialogResult>(PaymentDialog, {
        ...DIALOG,
        data: order,
      })
      .afterClosed()
      .pipe(filter((result): result is PaymentDialogResult => !!result))
      .subscribe((result) => {
        if (result.kind === 'saved') {
          this.saved(result.order, 'Naplata je evidentirana.');
        } else {
          this.handleConflict(result.error);
        }
      });
  }

  clearPayment(): void {
    const order = this.order();
    if (!order) {
      return;
    }
    this.confirm
      .ask({
        title: 'Obrisati evidenciju naplate?',
        message:
          'Porudžbina će ponovo biti prikazana kao nenaplaćena. Ovo koristite samo ako je naplata upisana greškom.',
        confirmLabel: 'Obriši evidenciju',
        tone: 'danger',
      })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.busy.set(true);
          return this.api.setPayment(order.id, {
            collectedAmount: null,
            collectedAt: null,
            version: order.version,
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.saved(updated, 'Evidencija naplate je obrisana.');
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.handleConflict(asApiError(error));
        },
      });
  }

  editShipment(shipment: AdminOrderShipment): void {
    const order = this.order();
    if (!order) {
      return;
    }
    this.dialog
      .open<ShipmentDialog, ShipmentDialogData, AdminOrderDetail>(ShipmentDialog, {
        ...DIALOG,
        data: { order, shipment },
      })
      .afterClosed()
      .pipe(filter((updated): updated is AdminOrderDetail => !!updated))
      .subscribe((updated) => this.saved(updated, 'Pošiljka je sačuvana.'));
  }

  addNote(): void {
    const order = this.order();
    if (!order || this.savingNote()) {
      return;
    }
    this.noteError.set(null);
    if (this.noteControl.invalid) {
      this.noteControl.markAsTouched();
      return;
    }
    this.savingNote.set(true);
    this.api
      .addNote(order.id, this.noteControl.value.trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.savingNote.set(false);
          this.noteControl.reset('');
          this.saved(updated, 'Napomena je dodata.');
        },
        error: (error: unknown) => {
          this.savingNote.set(false);
          const apiError = asApiError(error);
          this.noteError.set(apiError.fieldErrors('note').join(' ') || apiError.detail);
        },
      });
  }

  private saved(order: AdminOrderDetail, message: string): void {
    this.state.set({ status: 'loaded', order });
    this.notice.set(null);
    this.summary.refresh(true);
    this.snackBar.open(message, 'U redu', { duration: 4000 });
  }

  private handleConflict(error: ApiError): void {
    if (error.code === 'CONCURRENT_EDIT') {
      this.notice.set({ kind: 'concurrent' });
      return;
    }
    if (error.code === 'INVALID_STATUS_TRANSITION') {
      const allowed = error.extension<string[]>('allowedNextStatuses') ?? [];
      const detail =
        allowed.length > 0
          ? `Status porudžbine je u međuvremenu promenjen; sada su moguće samo ove promene: ${allowed
              .map((status) => orderStatusLabel(status as AdminOrderDetail['status']))
              .join(', ')}.`
          : 'Status porudžbine je u međuvremenu promenjen.';
      this.reload(() => this.notice.set({ kind: 'transition', detail }));
      this.summary.refresh(true);
      return;
    }
    if (error.code === 'ORDER_NOT_DELIVERED') {
      this.reload(() => this.notice.set({ kind: 'notDelivered', detail: error.detail }));
      return;
    }
    this.snackBar.open(error.detail, 'U redu', { duration: 6000 });
  }
}
