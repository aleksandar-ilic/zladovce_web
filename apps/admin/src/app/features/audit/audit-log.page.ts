import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';
import { AuditLogItem } from '@zladovce/models';
import { UiEmptyState, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { SrDatePipe } from '@zladovce/utilities';
import { catchError, map, of } from 'rxjs';
import { AdminUsersApi, AuditLogApi } from '../../data/people-api';
import { PAGE_SIZE_OPTIONS } from '../../shared/list-query';
import { SERBIAN_PAGINATOR } from '../../shared/paginator-intl';
import { RemoteData } from '../../shared/remote-data';
import { fromIsoDate, SERBIAN_DATES, toIsoDate } from '../../shared/serbian-dates';
import {
  actionLabel,
  auditQueryParams,
  AuditFilters,
  changeRows,
  parseAuditFilters,
  toAuditApiQuery,
} from './audit-log';

/**
 * Dnevnik izmena (owner only): who changed what and when, newest first. Filters (administrator,
 * kind of data, action, dates) live in the URL; each entry can be opened to see the changed fields.
 */
@Component({
  selector: 'adm-audit-log-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    SrDatePipe,
    UiEmptyState,
    UiErrorState,
    UiLoadingState,
  ],
  providers: [SERBIAN_PAGINATOR, SERBIAN_DATES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-3xl">Dnevnik izmena</h1>
    <p class="mt-2 max-w-2xl text-ink-700">
      Svaka izmena u administraciji: ko je, kada i šta promenio. Kliknite na stavku da vidite
      detalje.
    </p>

    <div class="mt-6 flex max-w-5xl flex-wrap items-start gap-3" data-testid="audit-filters">
      <mat-form-field appearance="outline" class="w-full sm:w-56" subscriptSizing="dynamic">
        <mat-label>Administrator</mat-label>
        <mat-select
          [value]="filters().adminUserId"
          (valueChange)="update({ adminUserId: $event })"
          data-testid="filter-admin"
        >
          <mat-option value="">Svi</mat-option>
          @for (user of admins(); track user.id) {
            <mat-option [value]="user.id">{{ user.fullName }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" class="w-full sm:w-56" subscriptSizing="dynamic">
        <mat-label>Vrsta podatka</mat-label>
        <mat-select
          [value]="filters().entityType"
          (valueChange)="update({ entityType: $event, action: '' })"
          data-testid="filter-type"
        >
          <mat-option value="">Sve</mat-option>
          @for (type of entityTypes(); track type.value) {
            <mat-option [value]="type.value">{{ type.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" class="w-full sm:w-64" subscriptSizing="dynamic">
        <mat-label>Radnja</mat-label>
        <mat-select
          [value]="filters().action"
          (valueChange)="update({ action: $event })"
          data-testid="filter-action"
        >
          <mat-option value="">Sve</mat-option>
          @for (action of actions(); track action.value) {
            <mat-option [value]="action.value">{{ action.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" class="w-full sm:w-72" subscriptSizing="dynamic">
        <mat-label>Period</mat-label>
        <mat-date-range-input [formGroup]="range" [rangePicker]="picker">
          <input matStartDate formControlName="from" placeholder="Od" data-testid="filter-from" />
          <input
            matEndDate
            formControlName="to"
            placeholder="Do"
            data-testid="filter-to"
            (dateChange)="applyRange()"
          />
        </mat-date-range-input>
        <mat-datepicker-toggle matIconSuffix [for]="picker" />
        <mat-date-range-picker #picker (closed)="applyRange()" />
      </mat-form-field>
      @if (filtered()) {
        <button matButton type="button" class="mt-2" data-testid="clear-filters" (click)="clear()">
          Poništi filtere
        </button>
      }
    </div>

    <div class="mt-4 max-w-5xl">
      @if (list().error; as e) {
        <ui-error-state
          title="Dnevnik nije učitan"
          [message]="e.detail"
          (retry)="listData.reload()"
        />
      } @else if (list().data; as page) {
        @if (page.items.length === 0) {
          <ui-empty-state title="Nema izmena za ovaj filter" />
        } @else {
          <ul class="flex flex-col gap-2" aria-label="Izmene" [class.opacity-60]="list().busy">
            @for (entry of page.items; track entry.id) {
              <li class="rounded-lg border border-cream-200 bg-white" data-testid="audit-row">
                <details>
                  <summary class="flex cursor-pointer flex-wrap items-baseline gap-x-4 gap-y-1 p-3">
                    <span class="min-w-0 flex-1 basis-64 font-semibold">{{ entry.summary }}</span>
                    <span class="text-sm text-ink-700">{{
                      entry.adminName ?? entry.adminEmail ?? 'Sistem'
                    }}</span>
                    <span class="text-sm text-ink-500">{{
                      entry.createdAt | srDate: 'dateTime'
                    }}</span>
                  </summary>
                  <div class="border-t border-cream-200 p-3 text-sm">
                    <dl class="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                      <dt class="text-ink-500">Radnja</dt>
                      <dd>{{ label(entry.action) }}</dd>
                      @if (entry.adminEmail) {
                        <dt class="text-ink-500">E-adresa</dt>
                        <dd class="break-all">{{ entry.adminEmail }}</dd>
                      }
                      @if (entry.ipAddress) {
                        <dt class="text-ink-500">IP adresa</dt>
                        <dd>{{ entry.ipAddress }}</dd>
                      }
                    </dl>
                    @if (rows(entry); as changes) {
                      @if (changes.length > 0) {
                        <div class="mt-3 overflow-x-auto">
                          <table class="w-full min-w-[28rem] text-left" data-testid="audit-changes">
                            <caption class="sr-only">
                              Promenjena polja
                            </caption>
                            <thead>
                              <tr class="border-b border-cream-200 text-ink-700">
                                <th scope="col" class="py-1.5 pr-3 font-semibold">Polje</th>
                                <th scope="col" class="py-1.5 pr-3 font-semibold">Pre</th>
                                <th scope="col" class="py-1.5 font-semibold">Posle</th>
                              </tr>
                            </thead>
                            <tbody>
                              @for (row of changes; track $index) {
                                <tr class="border-b border-cream-100 align-top">
                                  <th scope="row" class="py-1.5 pr-3 font-normal text-ink-700">
                                    {{ row.field }}
                                  </th>
                                  <td class="py-1.5 pr-3 break-all">{{ row.before }}</td>
                                  <td class="py-1.5 break-all">{{ row.after }}</td>
                                </tr>
                              }
                            </tbody>
                          </table>
                        </div>
                      } @else {
                        <p class="mt-2 text-ink-500">Nema zabeleženih detalja.</p>
                      }
                    }
                  </div>
                </details>
              </li>
            }
          </ul>
          <mat-paginator
            class="mt-4 bg-transparent"
            [length]="page.totalItems"
            [pageIndex]="filters().page - 1"
            [pageSize]="filters().pageSize"
            [pageSizeOptions]="pageSizes"
            (page)="pageChanged($event)"
          />
        }
      } @else {
        <ui-loading-state label="Učitavanje dnevnika…" />
      }
    </div>
  `,
})
export class AuditLogPage {
  private readonly api = inject(AuditLogApi);
  private readonly users = inject(AdminUsersApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly pageSizes = [...PAGE_SIZE_OPTIONS];
  readonly filters = toSignal(this.route.queryParams.pipe(map(parseAuditFilters)), {
    initialValue: parseAuditFilters(this.route.snapshot.queryParams),
  });
  protected readonly range = new FormGroup({
    from: new FormControl<Date | null>(fromIsoDate(this.filters().from)),
    to: new FormControl<Date | null>(fromIsoDate(this.filters().to)),
  });
  private readonly options = toSignal(
    this.api.filters().pipe(catchError(() => of({ entityTypes: [], actions: [] }))),
    { initialValue: { entityTypes: [], actions: [] } },
  );
  protected readonly admins = toSignal(
    this.users.list().pipe(
      map((list) => list.items),
      catchError(() => of([])),
    ),
    { initialValue: [] },
  );
  protected readonly entityTypes = computed(() => this.options().entityTypes);
  protected readonly actions = computed(() => {
    const type = this.filters().entityType;
    return this.options()
      .actions.filter((action) => !type || action.startsWith(`${type}.`))
      .map((action) => ({ value: action, label: actionLabel(action, this.entityTypes()) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'sr-Latn'));
  });
  protected readonly filtered = computed(() => {
    const f = this.filters();
    return !!(f.adminUserId || f.entityType || f.action || f.from || f.to);
  });
  protected readonly listData = new RemoteData(
    this.route.queryParams.pipe(map(parseAuditFilters)),
    (filters) => this.api.list(toAuditApiQuery(filters)),
  );
  protected readonly list = this.listData.value;

  protected label(action: string): string {
    return actionLabel(action, this.entityTypes());
  }

  protected rows(entry: AuditLogItem) {
    return changeRows(entry.changes);
  }

  update(changes: Partial<AuditFilters>): void {
    const next: AuditFilters = { ...this.filters(), page: 1, ...changes };
    void this.router.navigate([], { relativeTo: this.route, queryParams: auditQueryParams(next) });
  }

  protected applyRange(): void {
    const from = toIsoDate(this.range.controls.from.value);
    const to = toIsoDate(this.range.controls.to.value);
    if ((from && to) || (!from && !to)) {
      if (from !== this.filters().from || to !== this.filters().to) {
        this.update({ from, to });
      }
    }
  }

  protected clear(): void {
    this.range.reset({ from: null, to: null });
    this.update({ adminUserId: '', entityType: '', action: '', from: '', to: '' });
  }

  protected pageChanged(event: PageEvent): void {
    this.update({ page: event.pageIndex + 1, pageSize: event.pageSize });
  }
}
