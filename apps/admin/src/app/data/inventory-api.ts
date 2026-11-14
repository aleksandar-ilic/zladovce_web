import { inject, Injectable } from '@angular/core';
import { ApiClient } from '@zladovce/api';
import {
  InventoryItem,
  InventoryMovement,
  LowStockResponse,
  Paged,
  StockStatus,
} from '@zladovce/models';
import { InventorySort } from '@zladovce/shared';
import { Observable } from 'rxjs';

export interface InventoryQuery {
  q?: string;
  status?: StockStatus;
  sort?: InventorySort;
  page?: number;
  pageSize?: number;
}

/** `/admin/inventory` and the dashboard low-stock list. Stock changes only through here. */
@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private readonly api = inject(ApiClient);

  list(query: InventoryQuery): Observable<Paged<InventoryItem>> {
    return this.api.get<Paged<InventoryItem>>('/admin/inventory', {
      params: {
        q: query.q,
        status: query.status,
        sort: query.sort,
        page: query.page,
        pageSize: query.pageSize,
      },
    });
  }

  /** `quantityDelta` ≠ 0; the reason is mandatory. 409 INSUFFICIENT_STOCK when stock would go below 0. */
  adjust(variantId: string, quantityDelta: number, reason: string): Observable<InventoryItem> {
    return this.api.post<InventoryItem>(`/admin/inventory/${variantId}/adjustments`, {
      quantityDelta,
      reason,
    });
  }

  setThreshold(variantId: string, lowStockThreshold: number): Observable<InventoryItem> {
    return this.api.put<InventoryItem>(`/admin/inventory/${variantId}/threshold`, {
      lowStockThreshold,
    });
  }

  movements(
    variantId: string,
    page: number,
    pageSize: number,
  ): Observable<Paged<InventoryMovement>> {
    return this.api.get<Paged<InventoryMovement>>(`/admin/inventory/${variantId}/movements`, {
      params: { page, pageSize },
    });
  }

  lowStock(limit: number): Observable<LowStockResponse> {
    return this.api.get<LowStockResponse>('/admin/dashboard/low-stock', { params: { limit } });
  }
}
