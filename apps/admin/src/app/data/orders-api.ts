import { inject, Injectable } from '@angular/core';
import { ApiClient } from '@zladovce/api';
import {
  AdminOrderDetail,
  AdminOrderListItem,
  AdminOrderSort,
  ChangeOrderStatusRequest,
  OrderStatus,
  OrderSummary,
  Paged,
  SetOrderPaymentRequest,
  UpdateShipmentRequest,
} from '@zladovce/models';
import { Observable } from 'rxjs';

export interface OrderListQuery {
  q?: string;
  /** Any of these statuses; empty or missing = every status. */
  status?: readonly OrderStatus[];
  /** Serbian local dates `yyyy-MM-dd`, inclusive. */
  from?: string;
  to?: string;
  sort?: AdminOrderSort;
  page?: number;
  pageSize?: number;
}

/**
 * `/admin/orders`. Every change answers with the whole detail; its `version` must be sent with
 * the next status or payment change (a stale one gives `409 CONCURRENT_EDIT`).
 */
@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private readonly api = inject(ApiClient);

  list(query: OrderListQuery): Observable<Paged<AdminOrderListItem>> {
    return this.api.get<Paged<AdminOrderListItem>>('/admin/orders', {
      params: {
        q: query.q,
        status: query.status && query.status.length > 0 ? query.status.join(',') : undefined,
        from: query.from,
        to: query.to,
        sort: query.sort,
        page: query.page,
        pageSize: query.pageSize,
      },
    });
  }

  summary(): Observable<OrderSummary> {
    return this.api.get<OrderSummary>('/admin/orders/summary');
  }

  get(id: string): Observable<AdminOrderDetail> {
    return this.api.get<AdminOrderDetail>(`/admin/orders/${id}`);
  }

  changeStatus(id: string, body: ChangeOrderStatusRequest): Observable<AdminOrderDetail> {
    return this.api.post<AdminOrderDetail>(`/admin/orders/${id}/status`, body);
  }

  addNote(id: string, note: string): Observable<AdminOrderDetail> {
    return this.api.post<AdminOrderDetail>(`/admin/orders/${id}/notes`, { note });
  }

  updateShipment(
    id: string,
    shipmentId: string,
    body: UpdateShipmentRequest,
  ): Observable<AdminOrderDetail> {
    return this.api.put<AdminOrderDetail>(`/admin/orders/${id}/shipments/${shipmentId}`, body);
  }

  setPayment(id: string, body: SetOrderPaymentRequest): Observable<AdminOrderDetail> {
    return this.api.put<AdminOrderDetail>(`/admin/orders/${id}/payment`, body);
  }
}
