import { inject, Injectable } from '@angular/core';
import { ApiClient } from '@zladovce/api';
import { CreateOrderRequest, PlacedOrder } from '@zladovce/models';
import { Observable } from 'rxjs';

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** `POST /orders` – guest checkout. Not retried automatically: the page decides (same key). */
@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private readonly api = inject(ApiClient);

  place(body: CreateOrderRequest, idempotencyKey: string): Observable<PlacedOrder> {
    return this.api.post<PlacedOrder>('/orders', body, {
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    });
  }
}
