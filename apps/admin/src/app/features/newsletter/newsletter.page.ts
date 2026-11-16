import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { asApiError } from '@zladovce/api';
import { NewsletterSubscriberStatus } from '@zladovce/models';
import { UiBadge, UiBadgeTone, UiEmptyState, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { SrDatePipe } from '@zladovce/utilities';
import { NewsletterApi } from '../../data/people-api';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../shared/list-query';
import { SERBIAN_PAGINATOR } from '../../shared/paginator-intl';
import { RemoteData } from '../../shared/remote-data';
import { belgradeDate } from '../../shared/serbian-dates';

export const SUBSCRIBER_STATUSES: readonly NewsletterSubscriberStatus[] = [
  'Confirmed',
  'Pending',
  'Unsubscribed',
];

export const SUBSCRIBER_STATUS_LABELS: Record<NewsletterSubscriberStatus, string> = {
  Confirmed: 'Potvrđeni',
  Pending: 'Čekaju potvrdu',
  Unsubscribed: 'Odjavljeni',
};

const SINGLE: Record<NewsletterSubscriberStatus, string> = {
  Confirmed: 'Potvrđen',
  Pending: 'Čeka potvrdu',
  Unsubscribed: 'Odjavljen',
};

const TONES: Record<NewsletterSubscriberStatus, UiBadgeTone> = {
  Confirmed: 'success',
  Pending: 'warning',
  Unsubscribed: 'neutral',
};

/**
 * Newsletter (owner only): who signed up on the site. An address counts only after the person
 * confirmed it from the e-mail; the CSV holds only confirmed addresses (for sending from an e-mail
 * marketing service – the shop itself does not send newsletters).
 */
@Component({
  selector: 'adm-newsletter-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
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
    <div class="flex max-w-4xl flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-3xl">Newsletter</h1>
        <p class="mt-2 max-w-2xl text-ink-700">
          Adrese prijavljene na sajtu. Prijava važi tek kada osoba potvrdi adresu klikom u e-poruci.
          Za slanje vesti preuzmite listu potvrđenih adresa i koristite je u servisu za e-poštu.
        </p>
      </div>
      <button
        matButton="filled"
        type="button"
        class="min-h-12"
        data-testid="export"
        [disabled]="exporting()"
        (click)="exportCsv()"
      >
        {{ exporting() ? 'Preuzimanje…' : 'Preuzmi potvrđene (CSV)' }}
      </button>
    </div>

    <div
      class="mt-6 flex max-w-4xl flex-wrap items-center gap-2"
      role="group"
      aria-label="Filter po stanju"
    >
      <button
        type="button"
        class="inline-flex min-h-10 cursor-pointer items-center rounded-full border px-3.5 text-sm font-semibold"
        [class]="
          status() === ''
            ? 'border-olive-700 bg-olive-700 text-white'
            : 'border-sage-400 bg-white text-ink-900'
        "
        [attr.aria-pressed]="status() === ''"
        (click)="setStatus('')"
      >
        Svi
      </button>
      @for (s of statuses; track s) {
        <button
          type="button"
          class="inline-flex min-h-10 cursor-pointer items-center rounded-full border px-3.5 text-sm font-semibold"
          [class]="
            status() === s
              ? 'border-olive-700 bg-olive-700 text-white'
              : 'border-sage-400 bg-white text-ink-900'
          "
          [attr.aria-pressed]="status() === s"
          [attr.data-status]="s"
          (click)="setStatus(s)"
        >
          {{ labels[s] }} ({{ count(s) }})
        </button>
      }
      <mat-form-field appearance="outline" class="ml-auto w-full sm:w-64" subscriptSizing="dynamic">
        <mat-label>Pretraga po adresi</mat-label>
        <input
          matInput
          type="search"
          #search
          (keydown.enter)="setQuery(search.value)"
          (change)="setQuery(search.value)"
          data-testid="subscriber-search"
        />
      </mat-form-field>
    </div>

    <div class="mt-4 max-w-4xl">
      @if (list().error; as e) {
        <ui-error-state
          title="Lista nije učitana"
          [message]="e.detail"
          (retry)="listData.reload()"
        />
      } @else if (list().data; as data) {
        @if (data.subscribers.items.length === 0) {
          <ui-empty-state
            title="Nema prijavljenih adresa"
            [description]="
              q() || status()
                ? 'Ništa ne odgovara izabranom filteru.'
                : 'Kada se neko prijavi na sajtu, pojaviće se ovde.'
            "
          />
        } @else {
          <div
            class="overflow-x-auto rounded-lg border border-cream-200 bg-white"
            [class.opacity-60]="list().busy"
          >
            <table class="w-full min-w-[36rem] text-left text-sm" data-testid="subscribers-table">
              <caption class="sr-only">
                Prijavljene adrese
              </caption>
              <thead>
                <tr class="border-b border-cream-200 text-ink-700">
                  <th scope="col" class="p-3 font-semibold">E-adresa</th>
                  <th scope="col" class="p-3 font-semibold">Stanje</th>
                  <th scope="col" class="p-3 font-semibold">Prijava</th>
                  <th scope="col" class="p-3 font-semibold">Potvrda / odjava</th>
                </tr>
              </thead>
              <tbody>
                @for (s of data.subscribers.items; track s.id) {
                  <tr class="border-b border-cream-100">
                    <th scope="row" class="p-3 font-normal break-all">{{ s.email }}</th>
                    <td class="p-3">
                      <ui-badge [tone]="tones[s.status]">{{ single[s.status] }}</ui-badge>
                    </td>
                    <td class="p-3">{{ s.createdAt | srDate: 'date' }}</td>
                    <td class="p-3">
                      {{
                        s.unsubscribedAt
                          ? (s.unsubscribedAt | srDate: 'date')
                          : s.confirmedAt
                            ? (s.confirmedAt | srDate: 'date')
                            : '—'
                      }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <mat-paginator
            class="mt-4 bg-transparent"
            [length]="data.subscribers.totalItems"
            [pageIndex]="page() - 1"
            [pageSize]="pageSize()"
            [pageSizeOptions]="pageSizes"
            (page)="pageChanged($event)"
          />
        }
      } @else {
        <ui-loading-state />
      }
    </div>
  `,
})
export class NewsletterPage {
  private readonly api = inject(NewsletterApi);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly statuses = SUBSCRIBER_STATUSES;
  protected readonly labels = SUBSCRIBER_STATUS_LABELS;
  protected readonly single = SINGLE;
  protected readonly tones = TONES;
  protected readonly pageSizes = [...PAGE_SIZE_OPTIONS];
  readonly status = signal<NewsletterSubscriberStatus | ''>('');
  readonly q = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly exporting = signal(false);

  private readonly query = computed(() => ({
    status: this.status() || undefined,
    q: this.q() || undefined,
    page: this.page(),
    pageSize: this.pageSize(),
  }));
  protected readonly listData = new RemoteData(toObservable(this.query), (query) =>
    this.api.subscribers(query),
  );
  protected readonly list = this.listData.value;

  protected count(status: NewsletterSubscriberStatus): number {
    return this.list().data?.counts[status] ?? 0;
  }

  setStatus(status: NewsletterSubscriberStatus | ''): void {
    this.status.set(status);
    this.page.set(1);
  }

  setQuery(value: string): void {
    this.q.set(value.trim());
    this.page.set(1);
  }

  protected pageChanged(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.pageSize.set(event.pageSize);
  }

  exportCsv(): void {
    this.exporting.set(true);
    this.api.exportConfirmed(`pretplatnici-${belgradeDate()}.csv`).subscribe({
      next: (name) => {
        this.exporting.set(false);
        this.snackBar.open(`Datoteka „${name}“ je preuzeta.`, 'U redu', { duration: 5000 });
      },
      error: (error: unknown) => {
        this.exporting.set(false);
        this.snackBar.open(`Preuzimanje nije uspelo. ${asApiError(error).detail}`, 'U redu', {
          duration: 8000,
        });
      },
    });
  }
}
