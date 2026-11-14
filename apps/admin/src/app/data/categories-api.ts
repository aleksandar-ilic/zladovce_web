import { inject, Injectable } from '@angular/core';
import { ApiClient } from '@zladovce/api';
import { AdminCategory, AdminCategoryList, SaveCategoryRequest } from '@zladovce/models';
import { map, Observable } from 'rxjs';

/** `/admin/categories` – categories that are not archived, with product counts. */
@Injectable({ providedIn: 'root' })
export class CategoriesApi {
  private readonly api = inject(ApiClient);

  list(): Observable<AdminCategory[]> {
    return this.api
      .get<AdminCategoryList>('/admin/categories')
      .pipe(map((response) => [...response.items].sort((a, b) => a.sortOrder - b.sortOrder)));
  }

  get(id: string): Observable<AdminCategory> {
    return this.api.get<AdminCategory>(`/admin/categories/${id}`);
  }

  create(body: SaveCategoryRequest): Observable<AdminCategory> {
    return this.api.post<AdminCategory>('/admin/categories', body);
  }

  update(id: string, body: SaveCategoryRequest): Observable<AdminCategory> {
    return this.api.put<AdminCategory>(`/admin/categories/${id}`, body);
  }

  /** Archives the category (409 CATEGORY_HAS_PRODUCTS while it still has products). */
  archive(id: string): Observable<void> {
    return this.api.delete<void>(`/admin/categories/${id}`);
  }

  /** Saves the display order; `ids` must contain every category that is not archived, once. */
  reorder(ids: string[]): Observable<AdminCategory[]> {
    return this.api
      .put<AdminCategoryList>('/admin/categories/order', { ids })
      .pipe(map((response) => [...response.items].sort((a, b) => a.sortOrder - b.sortOrder)));
  }
}
