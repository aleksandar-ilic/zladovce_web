import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { asApiError } from '@zladovce/api';
import { Expense } from '@zladovce/models';
import { UiCard, UiEmptyState, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { RsdPipe } from '@zladovce/utilities';
import { combineLatest, filter, map, skip } from 'rxjs';
import { ExpensesApi } from '../../data/expenses-api';
import { ConfirmService } from '../../shared/confirm-dialog';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../shared/list-query';
import { SERBIAN_PAGINATOR } from '../../shared/paginator-intl';
import { formatIsoDay } from '../../shared/period';
import { PeriodSelector } from '../../shared/period-selector';
import { periodFromRoute } from '../../shared/period-route';
import { RemoteData } from '../../shared/remote-data';
import { ExpenseDialog, ExpenseDialogData } from './expense.dialog';

/**
 * Troškovi (owner only): what the shop spent (packaging, ingredients, delivery …) in a period,
 * totals per category, add / change / delete. The dashboard's "Procenjena dobit" subtracts these.
 */
@Component({
  selector: 'adm-expenses-page',
  imports: [
    MatButtonModule,
    MatPaginatorModule,
    RsdPipe,
    UiCard,
    UiEmptyState,
    UiErrorState,
    UiLoadingState,
    PeriodSelector,
  ],
  providers: [SERBIAN_PAGINATOR],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex max-w-5xl flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-3xl">Troškovi</h1>
        <p class="mt-2 max-w-2xl text-ink-700">
          Upišite šta ste platili (ambalaža, sirovine, dostava, reklame…). Kontrolna tabla od
          vrednosti isporučenih oduzima ove troškove i tako procenjuje dobit – zato je dobro upisati
          sve.
        </p>
      </div>
      <button
        matButton="filled"
        type="button"
        class="min-h-12"
        data-testid="add-expense"
        (click)="open(null)"
      >
        Dodaj trošak
      </button>
    </div>

    <adm-period-selector
      class="mt-6 block max-w-5xl"
      [value]="period.value()"
      [current]="list().data?.period?.current ?? null"
      (changed)="period.set($event)"
    />

    <div class="mt-4 max-w-5xl">
      @if (list().error; as error) {
        <ui-error-state
          title="Troškovi nisu učitani"
          [message]="error.detail"
          (retry)="listData.reload()"
        />
      } @else if (list().data; as data) {
        <ui-card padding="sm" [class.opacity-60]="list().busy" data-testid="expense-totals">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-lg font-semibold">Ukupno u periodu</h2>
            <p class="text-2xl font-semibold" data-testid="expense-total">{{ data.total | rsd }}</p>
          </div>
          @if (data.totals.length > 0) {
            <ul class="mt-3 flex flex-wrap gap-2" aria-label="Po vrsti troška">
              @for (t of data.totals; track t.category) {
                <li>
                  <button
                    type="button"
                    class="cursor-pointer rounded-full border px-3 py-1 text-sm"
                    [class]="
                      category() === t.category
                        ? 'border-olive-700 bg-olive-700 text-white'
                        : 'border-sage-400 bg-white text-ink-900 hover:bg-sage-50'
                    "
                    [attr.aria-pressed]="category() === t.category"
                    (click)="toggleCategory(t.category)"
                  >
                    {{ t.categoryLabel }}: <strong>{{ t.amount | rsd }}</strong> ({{ t.count }})
                  </button>
                </li>
              }
            </ul>
          }
          @if (category()) {
            <p class="mt-2 text-sm text-ink-700">
              Prikazana je samo jedna vrsta troška.
              <button
                type="button"
                class="cursor-pointer font-semibold text-olive-700 underline"
                (click)="toggleCategory(category())"
              >
                Prikaži sve
              </button>
            </p>
          }
        </ui-card>

        @if (data.expenses.items.length === 0) {
          <ui-empty-state
            title="U ovom periodu nema upisanih troškova"
            description="Kada nešto platite za prodavnicu, dodajte trošak ovde."
          />
        } @else {
          <ul
            class="mt-4 flex flex-col gap-2"
            aria-label="Troškovi"
            [class.opacity-60]="list().busy"
          >
            @for (expense of data.expenses.items; track expense.id) {
              <li
                class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-cream-200 bg-white p-3"
                data-testid="expense-row"
              >
                <div class="min-w-0 flex-1 basis-56">
                  <p class="font-semibold">{{ expense.description }}</p>
                  <p class="text-sm text-ink-700">
                    {{ day(expense.expenseDate) }} · {{ expense.categoryLabel }}
                    @if (expense.createdByAdminName) {
                      · upisao/la {{ expense.createdByAdminName }}
                    }
                  </p>
                </div>
                <p class="text-lg font-semibold tabular-nums">{{ expense.amount | rsd }}</p>
                <div class="flex gap-1">
                  <button
                    matButton
                    type="button"
                    (click)="open(expense)"
                    [attr.aria-label]="'Izmeni: ' + expense.description"
                  >
                    Izmeni
                  </button>
                  <button
                    matButton
                    type="button"
                    class="danger-button"
                    data-testid="delete-expense"
                    (click)="remove(expense)"
                    [attr.aria-label]="'Obriši: ' + expense.description"
                  >
                    Obriši
                  </button>
                </div>
              </li>
            }
          </ul>
          <mat-paginator
            class="mt-4 bg-transparent"
            [length]="data.expenses.totalItems"
            [pageIndex]="page() - 1"
            [pageSize]="pageSize()"
            [pageSizeOptions]="pageSizes"
            (page)="pageChanged($event)"
          />
        }
      } @else {
        <ui-loading-state label="Učitavanje troškova…" />
      }
    </div>
  `,
})
export class ExpensesPage {
  private readonly api = inject(ExpensesApi);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly period = periodFromRoute();
  protected readonly pageSizes = [...PAGE_SIZE_OPTIONS];
  protected readonly category = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);

  private readonly filters = computed(() => ({
    category: this.category(),
    page: this.page(),
    pageSize: this.pageSize(),
  }));

  protected readonly listData = new RemoteData(
    combineLatest([this.period.changes, toObservable(this.filters)]).pipe(
      map(([period, filters]) => ({ period, ...filters })),
    ),
    (query) =>
      this.api.list({
        period: query.period,
        category: query.category || undefined,
        page: query.page,
        pageSize: query.pageSize,
      }),
  );
  protected readonly list = this.listData.value;

  constructor() {
    // A new period starts at the first page.
    this.period.changes.pipe(skip(1), takeUntilDestroyed()).subscribe(() => this.page.set(1));
  }

  protected day(value: string): string {
    return formatIsoDay(value);
  }

  protected toggleCategory(category: string): void {
    this.category.set(this.category() === category ? '' : category);
    this.page.set(1);
  }

  protected pageChanged(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.pageSize.set(event.pageSize);
  }

  open(expense: Expense | null): void {
    this.dialog
      .open<ExpenseDialog, ExpenseDialogData, Expense>(ExpenseDialog, {
        data: { expense },
        width: '30rem',
        maxWidth: 'calc(100vw - 2rem)',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .pipe(filter((saved): saved is Expense => !!saved))
      .subscribe(() => {
        this.snackBar.open(expense ? 'Trošak je izmenjen.' : 'Trošak je dodat.', 'U redu', {
          duration: 4000,
        });
        this.listData.reload();
      });
  }

  remove(expense: Expense): void {
    this.confirm
      .ask({
        title: 'Obrisati trošak?',
        message: `„${expense.description}“ (${formatIsoDay(expense.expenseDate)}) biće obrisan i neće se više računati u dobit.`,
        confirmLabel: 'Obriši',
        tone: 'danger',
      })
      .pipe(filter(Boolean))
      .subscribe(() =>
        this.api.delete(expense.id).subscribe({
          next: () => {
            this.snackBar.open('Trošak je obrisan.', 'U redu', { duration: 4000 });
            this.listData.reload();
          },
          error: (error: unknown) =>
            this.snackBar.open(asApiError(error).detail, 'U redu', { duration: 6000 }),
        }),
      );
  }
}
