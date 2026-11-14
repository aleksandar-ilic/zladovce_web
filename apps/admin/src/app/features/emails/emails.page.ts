import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError, asApiError } from '@zladovce/api';
import { AdminEmailItem, EmailOutboxStatus, Paged } from '@zladovce/models';
import { UiBadge, UiEmptyState, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { SrDatePipe } from '@zladovce/utilities';
import { catchError, filter, map, of, switchMap } from 'rxjs';
import { DeadEmailsStore } from '../../core/dead-emails';
import { EmailsApi } from '../../data/emails-api';
import {
  EMAIL_STATUS_LABELS,
  EMAIL_STATUS_TONES,
  EMAIL_STATUSES,
  emailErrorText,
  emailTemplateLabel,
} from '../../shared/email-labels';
import { PAGE_SIZE_OPTIONS } from '../../shared/list-query';
import { SERBIAN_PAGINATOR } from '../../shared/paginator-intl';
import {
  EmailDetailDialog,
  EmailDetailDialogData,
  EmailDetailDialogResult,
} from './email-detail.dialog';
import {
  DEFAULT_EMAIL_STATUSES,
  emailsQueryParams,
  EmailsListQuery,
  isDefaultStatuses,
  parseEmailsQuery,
  toEmailsApiQuery,
  toggleStatus,
} from './emails-query';

type ListState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; page: Paged<AdminEmailItem> };

/**
 * E-poruke: the outbox of customer emails. By default the ones that need attention (could not be
 * sent, or still waiting); status filter, order and paging live in the URL. A row opens the
 * attempt log; an email that could not be sent can be queued again.
 */
@Component({
  selector: 'adm-emails-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatPaginatorModule,
    SrDatePipe,
    UiBadge,
    UiEmptyState,
    UiErrorState,
    UiLoadingState,
  ],
  providers: [SERBIAN_PAGINATOR],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-3xl">E-poruke</h1>
    <p class="mt-2 max-w-2xl text-ink-700">
      Obaveštenja koja prodavnica šalje kupcima (potvrda porudžbine i promene statusa). Neuspela
      slanja server ponavlja sam; tek kada svi pokušaji propadnu, e-poruka je „Neuspešno“ i možete
      je poslati ponovo.
    </p>

    <div
      class="mt-6 flex max-w-6xl flex-wrap items-center gap-2"
      role="group"
      aria-label="Filter po stanju"
      data-testid="status-filter"
    >
      @for (status of statuses; track status) {
        <button
          type="button"
          class="inline-flex cursor-pointer items-center rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors"
          [class]="
            isSelected(status)
              ? 'border-olive-700 bg-olive-700 text-white'
              : 'border-sage-400 bg-white text-ink-900 hover:bg-sage-50'
          "
          [attr.aria-pressed]="isSelected(status)"
          [attr.data-status]="status"
          (click)="toggle(status)"
        >
          {{ statusLabels[status] }}
        </button>
      }
      <button
        type="button"
        class="inline-flex cursor-pointer items-center rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors"
        [class]="
          query().statuses.length === 0
            ? 'border-olive-700 bg-olive-700 text-white'
            : 'border-sage-400 bg-white text-ink-900 hover:bg-sage-50'
        "
        [attr.aria-pressed]="query().statuses.length === 0"
        data-status="all"
        (click)="showAll()"
      >
        Sve
      </button>
      @if (!isDefault()) {
        <button matButton type="button" data-testid="default-filter" (click)="showDefault()">
          Samo one kojima treba pažnja
        </button>
      }
    </div>

    @if (query().orderId) {
      <p class="mt-3 flex flex-wrap items-center gap-2 text-sm" data-testid="order-filter">
        Prikazane su samo e-poruke jedne porudžbine.
        <button matButton type="button" (click)="update({ orderId: '' })">
          Prikaži sve porudžbine
        </button>
      </p>
    }

    <div class="mt-6 max-w-6xl">
      @switch (state().status) {
        @case ('loading') {
          <ui-loading-state label="Učitavanje e-poruka…" />
        }
        @case ('error') {
          <ui-error-state
            title="E-poruke nisu učitane"
            [message]="errorMessage()"
            (retry)="reload()"
          />
        }
        @default {
          @if (items().length === 0) {
            @if (isDefault()) {
              <ui-empty-state
                title="Sve e-poruke su poslate"
                description="Nema e-poruka koje čekaju slanje ili koje nisu mogle da se pošalju."
              >
                <button matButton="outlined" type="button" (click)="showAll()">
                  Prikaži sve e-poruke
                </button>
              </ui-empty-state>
            } @else {
              <ui-empty-state title="Nema e-poruka za ovaj filter" />
            }
          } @else {
            <ul class="flex flex-col gap-2" aria-label="E-poruke">
              @for (email of items(); track email.id) {
                <!-- The whole row opens the details: the Detalji button is stretched over it. -->
                <li
                  class="relative flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-cream-200 bg-white p-3 hover:border-olive-400 hover:shadow-soft"
                  data-testid="email-row"
                  [attr.data-status]="email.status"
                >
                  <div class="min-w-0 flex-1 basis-64">
                    <p class="flex flex-wrap items-center gap-2">
                      <span class="font-semibold">{{ templateLabel(email) }}</span>
                      <ui-badge [tone]="tones[email.status]" data-testid="email-status">{{
                        statusLabels[email.status]
                      }}</ui-badge>
                    </p>
                    <p class="mt-0.5 text-sm text-ink-700">
                      @if (email.orderId) {
                        <a
                          [routerLink]="['/porudzbine', email.orderId]"
                          class="relative z-10 font-semibold text-olive-700 underline underline-offset-4"
                          data-testid="email-order"
                          >{{ email.orderNumber }}</a
                        >
                        ·
                      }
                      <span class="break-all">{{ email.recipient }}</span>
                    </p>
                    @if (email.lastError && email.status !== 'Sent') {
                      <p class="mt-1 text-sm text-danger-700" data-testid="email-error">
                        {{ errorWords(email.lastError) }}
                        @if (email.status === 'Pending') {
                          <span class="text-ink-700"
                            >Novi pokušaj {{ email.nextAttemptAt | srDate: 'dateTime' }}.</span
                          >
                        }
                      </p>
                    }
                  </div>
                  <dl class="grid grid-cols-[auto_auto] gap-x-3 text-sm text-ink-700">
                    <dt>Pokušaji</dt>
                    <dd class="font-semibold text-ink-900" data-testid="email-attempts">
                      {{ email.attempts }}
                    </dd>
                    <dt>Napravljena</dt>
                    <dd>{{ email.createdAt | srDate: 'dateTime' }}</dd>
                    <dt>Poslata</dt>
                    <dd>{{ email.sentAt ? (email.sentAt | srDate: 'dateTime') : '—' }}</dd>
                  </dl>
                  <div class="flex items-center gap-3">
                    <button
                      type="button"
                      class="cursor-pointer rounded-sm px-2 py-1.5 text-sm font-semibold text-olive-700 underline underline-offset-4 after:absolute after:inset-0 after:rounded-lg after:content-['']"
                      data-testid="email-details"
                      [attr.aria-label]="
                        'Detalji: ' +
                        templateLabel(email) +
                        (email.orderNumber ? ', ' + email.orderNumber : '')
                      "
                      (click)="open(email)"
                    >
                      Detalji
                    </button>
                    @if (email.status === 'Dead') {
                      <button
                        matButton="filled"
                        type="button"
                        class="z-10"
                        data-testid="email-retry"
                        [disabled]="retrying() === email.id"
                        (click)="retry(email)"
                      >
                        Ponovo pošalji
                      </button>
                    }
                  </div>
                </li>
              }
            </ul>
          }
          @if (total() > 0) {
            <mat-paginator
              class="mt-4 bg-transparent"
              [length]="total()"
              [pageIndex]="query().page - 1"
              [pageSize]="query().pageSize"
              [pageSizeOptions]="pageSizes"
              (page)="pageChanged($event)"
            />
          }
        }
      }
    </div>
  `,
})
export class EmailsPage {
  private readonly api = inject(EmailsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly deadEmails = inject(DeadEmailsStore);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statuses = EMAIL_STATUSES;
  protected readonly statusLabels = EMAIL_STATUS_LABELS;
  protected readonly tones = EMAIL_STATUS_TONES;
  protected readonly pageSizes = [...PAGE_SIZE_OPTIONS];

  readonly query = toSignal(this.route.queryParams.pipe(map(parseEmailsQuery)), {
    initialValue: parseEmailsQuery(this.route.snapshot.queryParams),
  });
  protected readonly isDefault = computed(() => isDefaultStatuses(this.query().statuses));
  protected readonly state = signal<ListState>({ status: 'loading' });
  protected readonly retrying = signal<string | null>(null);
  protected readonly items = computed(() => {
    const state = this.state();
    return state.status === 'loaded' ? state.page.items : [];
  });
  protected readonly total = computed(() => {
    const state = this.state();
    return state.status === 'loaded' ? state.page.totalItems : 0;
  });

  constructor() {
    this.route.queryParams
      .pipe(
        map(parseEmailsQuery),
        switchMap((query) => {
          this.state.set({ status: 'loading' });
          return this.api.list(toEmailsApiQuery(query)).pipe(
            map((page): ListState => ({ status: 'loaded', page })),
            catchError((error: unknown) =>
              of<ListState>({ status: 'error', error: asApiError(error) }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.state.set(state));
  }

  protected isSelected(status: EmailOutboxStatus): boolean {
    return this.query().statuses.includes(status);
  }

  protected templateLabel(email: AdminEmailItem): string {
    return emailTemplateLabel(email);
  }

  protected errorWords(error: string): string {
    return emailErrorText(error);
  }

  protected errorMessage(): string {
    const state = this.state();
    return state.status === 'error' ? state.error.detail : '';
  }

  toggle(status: EmailOutboxStatus): void {
    this.update({ statuses: toggleStatus(this.query().statuses, status) });
  }

  protected showAll(): void {
    this.update({ statuses: [] });
  }

  protected showDefault(): void {
    this.update({ statuses: DEFAULT_EMAIL_STATUSES });
  }

  update(changes: Partial<EmailsListQuery>): void {
    const next: EmailsListQuery = { ...this.query(), page: 1, ...changes };
    void this.router.navigate([], { relativeTo: this.route, queryParams: emailsQueryParams(next) });
  }

  protected pageChanged(event: PageEvent): void {
    this.update({ page: event.pageIndex + 1, pageSize: event.pageSize });
  }

  open(email: AdminEmailItem): void {
    this.dialog
      .open<EmailDetailDialog, EmailDetailDialogData, EmailDetailDialogResult>(EmailDetailDialog, {
        data: { id: email.id },
        width: '40rem',
        maxWidth: 'calc(100vw - 2rem)',
        autoFocus: 'dialog',
      })
      .afterClosed()
      .pipe(filter((result) => result === 'retried'))
      .subscribe(() => this.retried());
  }

  retry(email: AdminEmailItem): void {
    if (this.retrying()) {
      return;
    }
    this.retrying.set(email.id);
    this.api
      .retry(email.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.retrying.set(null);
          this.retried();
        },
        error: (error: unknown) => {
          this.retrying.set(null);
          const apiError = asApiError(error);
          this.snackBar.open(
            apiError.code === 'EMAIL_NOT_RETRYABLE'
              ? 'Ova e-poruka više nije neuspešna; prikazano je najnovije stanje.'
              : apiError.detail,
            'U redu',
            { duration: 6000 },
          );
          this.reload();
        },
      });
  }

  private retried(): void {
    this.snackBar.open('E-poruka je ponovo u redu za slanje.', 'U redu', { duration: 4000 });
    this.reload();
  }

  reload(): void {
    this.deadEmails.refresh(true);
    this.api
      .list(toEmailsApiQuery(this.query()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => this.state.set({ status: 'loaded', page }),
        error: (error: unknown) => this.state.set({ status: 'error', error: asApiError(error) }),
      });
  }
}
