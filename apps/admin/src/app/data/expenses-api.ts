import { inject, Injectable } from '@angular/core';
import { ApiClient } from '@zladovce/api';
import { Expense, ExpenseCategoryOption, ExpenseList, SaveExpenseRequest } from '@zladovce/models';
import { Observable, shareReplay } from 'rxjs';
import { periodApiParams, PeriodQuery } from '../shared/period';

export interface ExpenseListQuery {
  /** null = every expense ever entered. */
  period: PeriodQuery | null;
  category?: string;
  page: number;
  pageSize: number;
}

/** `/admin/expenses` (owner only). */
@Injectable({ providedIn: 'root' })
export class ExpensesApi {
  private readonly api = inject(ApiClient);
  private categories$: Observable<ExpenseCategoryOption[]> | null = null;

  /** The fixed category list (Ambalaža, Sirovine, …), loaded once. */
  categories(): Observable<ExpenseCategoryOption[]> {
    this.categories$ ??= this.api
      .get<ExpenseCategoryOption[]>('/admin/expenses/categories')
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.categories$;
  }

  list(query: ExpenseListQuery): Observable<ExpenseList> {
    return this.api.get<ExpenseList>('/admin/expenses', {
      params: {
        ...(query.period ? periodApiParams(query.period) : {}),
        category: query.category,
        page: query.page,
        pageSize: query.pageSize,
      },
    });
  }

  create(body: SaveExpenseRequest): Observable<Expense> {
    return this.api.post<Expense>('/admin/expenses', body);
  }

  update(id: string, body: SaveExpenseRequest): Observable<Expense> {
    return this.api.put<Expense>(`/admin/expenses/${id}`, body);
  }

  delete(id: string): Observable<void> {
    return this.api.delete(`/admin/expenses/${id}`);
  }
}
