import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { asApiError } from '@zladovce/api';
import { AdminContactMessage } from '@zladovce/models';
import { UiBadge, UiEmptyState, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { SrDatePipe } from '@zladovce/utilities';
import { tap } from 'rxjs';
import { UnreadMessagesStore } from '../../core/unread-messages';
import { ContactMessagesApi } from '../../data/people-api';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../shared/list-query';
import { SERBIAN_PAGINATOR } from '../../shared/paginator-intl';
import { RemoteData } from '../../shared/remote-data';

/**
 * Poruke kupaca: what customers sent through the contact form, newest first. A copy also goes
 * to the shop's e-mail (reply there – the reply goes straight to the customer). Messages are
 * marked read so the menu badge shows only new ones.
 */
@Component({
  selector: 'adm-contact-messages-page',
  imports: [
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
    <h1 class="text-3xl">Poruke kupaca</h1>
    <p class="mt-2 max-w-2xl text-ink-700">
      Poruke sa kontakt forme sajta. Kopija svake poruke stiže i na e-poštu prodavnice – kada tamo
      kliknete „Odgovori“, odgovor ide pravo kupcu.
    </p>

    <div
      class="mt-6 flex max-w-4xl flex-wrap items-center gap-2"
      role="group"
      aria-label="Prikaz poruka"
    >
      <button
        type="button"
        class="inline-flex min-h-10 cursor-pointer items-center rounded-full border px-3.5 text-sm font-semibold"
        [class]="
          !unreadOnly()
            ? 'border-olive-700 bg-olive-700 text-white'
            : 'border-sage-400 bg-white text-ink-900'
        "
        [attr.aria-pressed]="!unreadOnly()"
        (click)="setUnread(false)"
      >
        Sve poruke
      </button>
      <button
        type="button"
        class="inline-flex min-h-10 cursor-pointer items-center rounded-full border px-3.5 text-sm font-semibold"
        [class]="
          unreadOnly()
            ? 'border-olive-700 bg-olive-700 text-white'
            : 'border-sage-400 bg-white text-ink-900'
        "
        [attr.aria-pressed]="unreadOnly()"
        data-testid="unread-only"
        (click)="setUnread(true)"
      >
        Samo nepročitane
        @if (unreadCount() > 0) {
          ({{ unreadCount() }})
        }
      </button>
    </div>

    <div class="mt-4 max-w-4xl">
      @if (list().error; as e) {
        <ui-error-state
          title="Poruke nisu učitane"
          [message]="e.detail"
          (retry)="listData.reload()"
        />
      } @else if (list().data; as data) {
        @if (data.messages.items.length === 0) {
          <ui-empty-state [title]="unreadOnly() ? 'Nema nepročitanih poruka' : 'Još nema poruka'" />
        } @else {
          <ul class="flex flex-col gap-3" aria-label="Poruke" [class.opacity-60]="list().busy">
            @for (m of data.messages.items; track m.id) {
              <li
                class="rounded-lg border bg-white p-4"
                [class.border-olive-400]="!m.readAt"
                [class.border-cream-200]="!!m.readAt"
                data-testid="message-row"
                [attr.data-unread]="!m.readAt"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <p class="font-semibold">{{ m.name }}</p>
                  <a
                    class="text-sm break-all text-olive-700 underline underline-offset-4"
                    [href]="'mailto:' + m.email"
                    >{{ m.email }}</a
                  >
                  @if (!m.readAt) {
                    <ui-badge tone="success">Nova</ui-badge>
                  }
                  <span class="flex-1"></span>
                  <span class="text-sm text-ink-500">{{ m.createdAt | srDate: 'dateTime' }}</span>
                </div>
                <p class="mt-2 whitespace-pre-line text-ink-900">{{ m.message }}</p>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  @if (m.readAt) {
                    <span class="text-sm text-ink-500"
                      >Pročitano {{ m.readAt | srDate: 'dateTime'
                      }}{{ m.readByAdminName ? ', ' + m.readByAdminName : '' }}</span
                    >
                    <button
                      matButton
                      type="button"
                      data-testid="mark-unread"
                      [disabled]="busyId() === m.id"
                      (click)="mark(m, false)"
                    >
                      Označi kao nepročitano
                    </button>
                  } @else {
                    <button
                      matButton="tonal"
                      type="button"
                      data-testid="mark-read"
                      [disabled]="busyId() === m.id"
                      (click)="mark(m, true)"
                    >
                      Označi kao pročitano
                    </button>
                  }
                </div>
              </li>
            }
          </ul>
          <mat-paginator
            class="mt-4 bg-transparent"
            [length]="data.messages.totalItems"
            [pageIndex]="page() - 1"
            [pageSize]="pageSize()"
            [pageSizeOptions]="pageSizes"
            (page)="pageChanged($event)"
          />
        }
      } @else {
        <ui-loading-state label="Učitavanje poruka…" />
      }
    </div>
  `,
})
export class ContactMessagesPage {
  private readonly api = inject(ContactMessagesApi);
  private readonly unread = inject(UnreadMessagesStore);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly pageSizes = [...PAGE_SIZE_OPTIONS];
  readonly unreadOnly = signal(false);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly busyId = signal<string | null>(null);
  private readonly query = computed(() => ({
    unreadOnly: this.unreadOnly(),
    page: this.page(),
    pageSize: this.pageSize(),
  }));

  protected readonly listData = new RemoteData(toObservable(this.query), (query) =>
    // Every answer carries the current unread count: the badge follows at once.
    this.api.list(query).pipe(tap((response) => this.unread.set(response.unreadCount))),
  );
  protected readonly list = this.listData.value;
  protected readonly unreadCount = computed(() => this.list().data?.unreadCount ?? 0);

  setUnread(value: boolean): void {
    this.unreadOnly.set(value);
    this.page.set(1);
  }

  protected pageChanged(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.pageSize.set(event.pageSize);
  }

  mark(message: AdminContactMessage, read: boolean): void {
    this.busyId.set(message.id);
    (read ? this.api.markRead(message.id) : this.api.markUnread(message.id)).subscribe({
      next: () => {
        this.busyId.set(null);
        this.listData.reload();
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.snackBar.open(asApiError(error).detail, 'U redu', { duration: 6000 });
      },
    });
  }
}
