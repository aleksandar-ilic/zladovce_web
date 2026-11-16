import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { asApiError } from '@zladovce/api';
import { Expense, SaveExpenseRequest } from '@zladovce/models';
import { notBlank } from '@zladovce/shared';
import { validationMessage } from '@zladovce/ui';
import { ExpensesApi } from '../../data/expenses-api';
import { applyServerErrors } from '../../shared/server-errors';
import { belgradeDate, fromIsoDate, SERBIAN_DATES, toIsoDate } from '../../shared/serbian-dates';
import { amountValidator } from '../settings/settings-form';

export const MAX_EXPENSE_DESCRIPTION = 500;

export function createExpenseForm(fb: FormBuilder) {
  return fb.group({
    expenseDate: fb.control<Date | null>(fromIsoDate(belgradeDate()), Validators.required),
    category: fb.nonNullable.control('', Validators.required),
    description: fb.nonNullable.control('', [
      Validators.required,
      notBlank,
      Validators.maxLength(MAX_EXPENSE_DESCRIPTION),
    ]),
    amount: fb.control<number | null>(null, [Validators.required, amountValidator(true)]),
  });
}

export type ExpenseForm = ReturnType<typeof createExpenseForm>;

export function fillExpenseForm(form: ExpenseForm, expense: Expense): void {
  form.reset({
    expenseDate: fromIsoDate(expense.expenseDate),
    category: expense.category,
    description: expense.description,
    amount: expense.amount,
  });
}

/** All four members are required by the API. */
export function expenseRequest(form: ExpenseForm): SaveExpenseRequest {
  const v = form.getRawValue();
  return {
    expenseDate: toIsoDate(v.expenseDate),
    category: v.category,
    description: v.description.trim(),
    amount: Number(v.amount),
  };
}

export interface ExpenseDialogData {
  expense: Expense | null;
}

/** Add or change one expense: date, category, description and amount in dinars. */
@Component({
  selector: 'adm-expense-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  providers: [SERBIAN_DATES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.expense ? 'Izmena troška' : 'Novi trošak' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="flex flex-col gap-1">
        <mat-form-field appearance="outline">
          <mat-label>Datum</mat-label>
          <input
            matInput
            [matDatepicker]="picker"
            formControlName="expenseDate"
            data-testid="expense-date"
          />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
          <mat-hint>Dan kada je trošak nastao, na primer 14.11.2026.</mat-hint>
          @if (form.controls.expenseDate.errors; as e) {
            <mat-error>{{ message(e, { required: 'Izaberite datum.' }) }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Vrsta troška</mat-label>
          <mat-select formControlName="category" data-testid="expense-category">
            @for (option of categories() ?? []; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
          @if (form.controls.category.errors; as e) {
            <mat-error>{{ message(e, { required: 'Izaberite vrstu troška.' }) }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Opis</mat-label>
          <input
            matInput
            formControlName="description"
            maxlength="500"
            data-testid="expense-description"
          />
          <mat-hint>Na primer „Tegle 370 g, 200 komada“.</mat-hint>
          @if (form.controls.description.errors; as e) {
            <mat-error>{{ message(e, { required: 'Upišite kratak opis.' }) }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Iznos</mat-label>
          <input
            matInput
            type="number"
            inputmode="decimal"
            min="0.01"
            step="0.01"
            formControlName="amount"
            data-testid="expense-amount"
          />
          <span matTextSuffix>RSD</span>
          @if (form.controls.amount.errors; as e) {
            <mat-error>{{ message(e, { required: 'Upišite iznos.' }) }}</mat-error>
          }
        </mat-form-field>
        @if (error()) {
          <p
            class="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700"
            role="alert"
            data-testid="expense-error"
          >
            {{ error() }}
          </p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Odustani</button>
        <button matButton="filled" type="submit" data-testid="expense-save" [disabled]="saving()">
          {{ saving() ? 'Čuvanje…' : 'Sačuvaj' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class ExpenseDialog {
  protected readonly data = inject<ExpenseDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ExpenseDialog, Expense>>(MatDialogRef);
  private readonly api = inject(ExpensesApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly message = validationMessage;
  readonly form = createExpenseForm(inject(FormBuilder));
  protected readonly categories = toSignal(this.api.categories());
  readonly saving = signal(false);
  readonly error = signal('');

  constructor() {
    if (this.data.expense) {
      fillExpenseForm(this.form, this.data.expense);
    }
  }

  save(): void {
    if (this.saving()) {
      return;
    }
    this.error.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const body = expenseRequest(this.form);
    const request = this.data.expense
      ? this.api.update(this.data.expense.id, body)
      : this.api.create(body);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (expense) => this.ref.close(expense),
      error: (error: unknown) => {
        this.saving.set(false);
        const apiError = asApiError(error);
        const unmatched = applyServerErrors(this.form, apiError);
        this.error.set(
          unmatched.length > 0 ? unmatched.join(' ') : apiError.isValidation ? '' : apiError.detail,
        );
      },
    });
  }
}
