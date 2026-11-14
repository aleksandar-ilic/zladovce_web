import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { asApiError } from '@zladovce/api';
import { AdminEmailItem, AdminOrderDetail } from '@zladovce/models';
import { UiBadge, UiCard, UiCardTitle } from '@zladovce/ui';
import { SrDatePipe } from '@zladovce/utilities';
import { filter, switchMap } from 'rxjs';
import { DeadEmailsStore } from '../../core/dead-emails';
import { EmailsApi } from '../../data/emails-api';
import { ConfirmService } from '../../shared/confirm-dialog';
import {
  EMAIL_STATUS_LABELS,
  EMAIL_STATUS_TONES,
  emailErrorText,
  emailTemplateLabel,
} from '../../shared/email-labels';

export const RESEND_CONFIRMATION_TEXT: readonly string[] = [
  'Kupcu ćemo ponovo poslati e-poruku sa potvrdom porudžbine i novim kodom za praćenje.',
  'Raniji kodovi i dalje rade. Ako želite da stari kodovi prestanu da važe, prvo ih poništite.',
];

export const REVOKE_TRACKING_TEXT: readonly string[] = [
  'Svi dosadašnji kodovi za praćenje ove porudžbine prestaju da važe, i oni iz e-poruka koje još nisu poslate. Kupac više neće moći da prati porudžbinu starim kodom.',
  'Koristite ovo ako je kod dospeo do pogrešne osobe. Posle toga kupcu možete ponovo poslati potvrdu sa novim kodom.',
];

/**
 * "E-poruke" of one order (oldest first, from the order detail): what was sent to the customer,
 * what is waiting or failed, retry for failed ones, resend the confirmation (new tracking code)
 * and revoke the tracking codes. After every action the parent reloads the order (`changed`).
 */
@Component({
  selector: 'adm-order-emails',
  imports: [MatButtonModule, RouterLink, SrDatePipe, UiBadge, UiCard, UiCardTitle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ui-card data-testid="order-emails">
      <h2 uiCardTitle>E-poruke</h2>
      <p class="mt-1 text-sm text-ink-500">
        Obaveštenja poslata kupcu na {{ order().customer.email }}.
      </p>
      @if (order().emails.length === 0) {
        <p class="mt-3 text-sm text-ink-700">Za ovu porudžbinu još nema e-poruka.</p>
      } @else {
        <ul class="mt-3 flex flex-col divide-y divide-cream-200">
          @for (email of order().emails; track email.id) {
            <li class="py-2.5" data-testid="order-email" [attr.data-status]="email.status">
              <p class="flex flex-wrap items-center gap-2">
                <span class="font-semibold">{{ templateLabel(email) }}</span>
                <ui-badge [tone]="tones[email.status]" data-testid="order-email-status">{{
                  statusLabels[email.status]
                }}</ui-badge>
              </p>
              <p class="mt-0.5 text-sm text-ink-700">
                @if (email.sentAt) {
                  Vreme slanja: {{ email.sentAt | srDate: 'dateTime' }}
                } @else {
                  Napravljena {{ email.createdAt | srDate: 'dateTime' }}
                }
                · pokušaja: {{ email.attempts }}
              </p>
              @if (email.lastError && (email.status === 'Dead' || email.status === 'Pending')) {
                <p class="mt-1 text-sm text-danger-700" data-testid="order-email-error">
                  {{ errorWords(email.lastError) }}
                  @if (email.status === 'Pending') {
                    <span class="text-ink-700"
                      >Novi pokušaj {{ email.nextAttemptAt | srDate: 'dateTime' }}.</span
                    >
                  } @else {
                    <span class="text-ink-700">Svi automatski pokušaji su iskorišćeni.</span>
                  }
                </p>
              }
              @if (email.status === 'Dead') {
                <button
                  matButton="outlined"
                  type="button"
                  class="mt-2"
                  data-testid="order-email-retry"
                  [disabled]="busy()"
                  (click)="retry(email)"
                >
                  Ponovo pošalji
                </button>
              }
            </li>
          }
        </ul>
      }

      @if (revokedNotice(); as count) {
        <div
          class="mt-3 rounded-md border border-warning-700/25 bg-warning-50 p-3 text-sm text-ink-900"
          role="status"
          data-testid="revoked-notice"
        >
          <p class="font-semibold">Kodovi za praćenje su poništeni ({{ count }}).</p>
          <p class="mt-1">
            Kupac više ne može da prati porudžbinu starim kodom. Ako treba da je prati, pošaljite
            potvrdu ponovo – u njoj je novi kod.
          </p>
        </div>
      }

      <div class="mt-4 flex flex-wrap gap-2 border-t border-cream-200 pt-4">
        <button
          matButton="outlined"
          type="button"
          data-testid="resend-confirmation"
          [disabled]="busy()"
          (click)="resendConfirmation()"
        >
          Pošalji potvrdu ponovo
        </button>
        <button
          matButton
          type="button"
          class="danger-button"
          data-testid="revoke-tracking"
          [disabled]="busy()"
          (click)="revokeTracking()"
        >
          Poništi kodove za praćenje
        </button>
      </div>
      <a
        routerLink="/e-poruke"
        [queryParams]="{ status: 'all', orderId: order().id }"
        class="mt-3 inline-block text-sm font-semibold text-olive-700 underline underline-offset-4"
        data-testid="order-emails-link"
        >Sve e-poruke ove porudžbine</a
      >
    </ui-card>
  `,
})
export class OrderEmails {
  readonly order = input.required<AdminOrderDetail>();
  /** Something changed on the server: the parent loads the order again. */
  readonly changed = output<void>();

  private readonly api = inject(EmailsApi);
  private readonly confirm = inject(ConfirmService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly deadEmails = inject(DeadEmailsStore);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statusLabels = EMAIL_STATUS_LABELS;
  protected readonly tones = EMAIL_STATUS_TONES;
  protected readonly busy = signal(false);
  protected readonly revokedNotice = signal<number | null>(null);

  protected templateLabel(email: AdminEmailItem): string {
    return emailTemplateLabel(email);
  }

  protected errorWords(error: string): string {
    return emailErrorText(error);
  }

  retry(email: AdminEmailItem): void {
    if (this.busy() || email.status !== 'Dead') {
      return;
    }
    this.busy.set(true);
    this.api
      .retry(email.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.done('E-poruka je ponovo u redu za slanje.'),
        error: (error: unknown) => this.failed(error),
      });
  }

  resendConfirmation(): void {
    if (this.busy()) {
      return;
    }
    const orderId = this.order().id;
    this.confirm
      .ask({
        title: 'Poslati potvrdu ponovo?',
        message: RESEND_CONFIRMATION_TEXT,
        confirmLabel: 'Pošalji potvrdu',
      })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.busy.set(true);
          return this.api.resendConfirmation(orderId);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.revokedNotice.set(null);
          this.done('Potvrda sa novim kodom za praćenje je u redu za slanje.');
        },
        error: (error: unknown) => this.failed(error),
      });
  }

  revokeTracking(): void {
    if (this.busy()) {
      return;
    }
    const orderId = this.order().id;
    this.confirm
      .ask({
        title: 'Poništiti kodove za praćenje?',
        message: REVOKE_TRACKING_TEXT,
        confirmLabel: 'Poništi kodove',
        tone: 'danger',
      })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.busy.set(true);
          return this.api.revokeTracking(orderId);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          this.revokedNotice.set(result.revokedCount);
          this.done(`Poništeno kodova za praćenje: ${result.revokedCount}.`);
        },
        error: (error: unknown) => this.failed(error),
      });
  }

  private done(message: string): void {
    this.busy.set(false);
    this.deadEmails.refresh(true);
    this.snackBar.open(message, 'U redu', { duration: 5000 });
    this.changed.emit();
  }

  private failed(error: unknown): void {
    this.busy.set(false);
    const apiError = asApiError(error);
    this.snackBar.open(
      apiError.code === 'EMAIL_NOT_RETRYABLE'
        ? 'Ova e-poruka više nije neuspešna; prikazano je najnovije stanje.'
        : apiError.detail,
      'U redu',
      { duration: 6000 },
    );
    this.changed.emit();
  }
}
