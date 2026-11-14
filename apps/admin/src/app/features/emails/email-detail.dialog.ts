import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { ApiError, asApiError } from '@zladovce/api';
import { AdminEmailDetail } from '@zladovce/models';
import { UiBadge, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { SrDatePipe } from '@zladovce/utilities';
import { EmailsApi } from '../../data/emails-api';
import {
  EMAIL_STATUS_LABELS,
  EMAIL_STATUS_TONES,
  emailErrorText,
  emailTemplateLabel,
} from '../../shared/email-labels';

export interface EmailDetailDialogData {
  id: string;
}

/** `retried` when the email was queued again from the dialog (the list then reloads). */
export type EmailDetailDialogResult = 'retried' | undefined;

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; detail: AdminEmailDetail };

/** One outbox email with every send attempt; "Ponovo pošalji" for an email that could not be sent. */
@Component({
  selector: 'adm-email-detail-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    RouterLink,
    SrDatePipe,
    UiBadge,
    UiErrorState,
    UiLoadingState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>E-poruka</h2>
    <mat-dialog-content>
      @switch (state().status) {
        @case ('loading') {
          <ui-loading-state label="Učitavanje e-poruke…" />
        }
        @case ('error') {
          <ui-error-state title="E-poruka nije učitana" [message]="errorText()" (retry)="load()" />
        }
        @default {
          @let d = detail()!;
          <dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]" data-testid="email-info">
            <dt class="text-ink-500">Vrsta</dt>
            <dd class="font-semibold">{{ templateLabel() }}</dd>
            <dt class="text-ink-500">Stanje</dt>
            <dd>
              <ui-badge [tone]="tones[d.email.status]" data-testid="email-status">{{
                statusLabels[d.email.status]
              }}</ui-badge>
            </dd>
            @if (d.email.orderId) {
              <dt class="text-ink-500">Porudžbina</dt>
              <dd>
                <a
                  [routerLink]="['/porudzbine', d.email.orderId]"
                  class="font-semibold text-olive-700 underline underline-offset-4"
                  mat-dialog-close
                  >{{ d.email.orderNumber }}</a
                >
              </dd>
            }
            <dt class="text-ink-500">Primalac</dt>
            <dd class="break-all">{{ d.email.recipient }}</dd>
            <dt class="text-ink-500">Napravljena</dt>
            <dd>{{ d.email.createdAt | srDate: 'dateTime' }}</dd>
            <dt class="text-ink-500">Poslata</dt>
            <dd>{{ d.email.sentAt ? (d.email.sentAt | srDate: 'dateTime') : '—' }}</dd>
            @if (d.email.status === 'Pending' && d.email.attempts > 0) {
              <dt class="text-ink-500">Sledeći pokušaj</dt>
              <dd>{{ d.email.nextAttemptAt | srDate: 'dateTime' }}</dd>
            }
          </dl>

          @if (d.email.lastError && d.email.status !== 'Sent') {
            <div
              class="mt-4 rounded-md border border-danger-600/30 bg-danger-50 p-3 text-sm text-danger-700"
              data-testid="email-error"
            >
              <p class="font-semibold">{{ errorWords(d.email.lastError) }}</p>
              <p class="mt-1 break-words text-ink-700">{{ d.email.lastError }}</p>
            </div>
          }

          <h3 class="mt-6 text-base font-semibold">Pokušaji slanja</h3>
          @if (d.attemptLog.length === 0) {
            <p class="mt-2 text-sm text-ink-700">Još nije bilo pokušaja slanja.</p>
          } @else {
            <ol class="mt-2 flex flex-col divide-y divide-cream-200" data-testid="attempt-log">
              @for (attempt of d.attemptLog; track attempt.attemptNumber) {
                <li class="py-2 text-sm" data-testid="attempt">
                  <p class="flex flex-wrap items-center gap-2">
                    <span class="font-semibold">Pokušaj {{ attempt.attemptNumber }}</span>
                    <ui-badge [tone]="attempt.succeeded ? 'success' : 'danger'">{{
                      attempt.succeeded ? 'Uspešno' : 'Neuspešno'
                    }}</ui-badge>
                    <span class="text-ink-700">{{ attempt.createdAt | srDate: 'dateTime' }}</span>
                  </p>
                  @if (attempt.error) {
                    <p class="mt-1 text-ink-900">{{ errorWords(attempt.error) }}</p>
                    <p class="mt-0.5 break-words text-ink-500">{{ attempt.error }}</p>
                  }
                </li>
              }
            </ol>
          }
          @if (retryError(); as message) {
            <p class="mt-3 text-sm font-medium text-danger-700" role="alert">{{ message }}</p>
          }
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Zatvori</button>
      @if (detail()?.email?.status === 'Dead') {
        <button
          matButton="filled"
          type="button"
          data-testid="dialog-retry"
          [disabled]="retrying()"
          (click)="retry()"
        >
          {{ retrying() ? 'Slanje…' : 'Ponovo pošalji' }}
        </button>
      }
    </mat-dialog-actions>
  `,
})
export class EmailDetailDialog {
  private readonly data = inject<EmailDetailDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<EmailDetailDialog, EmailDetailDialogResult>>(MatDialogRef);
  private readonly api = inject(EmailsApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statusLabels = EMAIL_STATUS_LABELS;
  protected readonly tones = EMAIL_STATUS_TONES;
  protected readonly state = signal<DetailState>({ status: 'loading' });
  protected readonly retrying = signal(false);
  protected readonly retryError = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected detail(): AdminEmailDetail | null {
    const state = this.state();
    return state.status === 'loaded' ? state.detail : null;
  }

  protected templateLabel(): string {
    const detail = this.detail();
    return detail ? emailTemplateLabel(detail.email) : '';
  }

  protected errorText(): string {
    const state = this.state();
    return state.status === 'error' ? state.error.detail : '';
  }

  protected errorWords(error: string): string {
    return emailErrorText(error);
  }

  load(): void {
    this.state.set({ status: 'loading' });
    this.api
      .get(this.data.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => this.state.set({ status: 'loaded', detail }),
        error: (error: unknown) => this.state.set({ status: 'error', error: asApiError(error) }),
      });
  }

  retry(): void {
    if (this.retrying()) {
      return;
    }
    this.retrying.set(true);
    this.retryError.set(null);
    this.api
      .retry(this.data.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.ref.close('retried'),
        error: (error: unknown) => {
          this.retrying.set(false);
          const apiError = asApiError(error);
          this.retryError.set(
            apiError.code === 'EMAIL_NOT_RETRYABLE'
              ? 'Ova e-poruka više nije neuspešna, pa ne može ponovo da se pošalje. Prikazano je najnovije stanje.'
              : apiError.detail,
          );
          if (apiError.code === 'EMAIL_NOT_RETRYABLE') {
            this.load();
          }
        },
      });
  }
}
