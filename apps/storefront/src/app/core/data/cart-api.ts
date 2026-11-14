import { inject, Injectable } from '@angular/core';
import { ApiClient } from '@zladovce/api';
import { CartQuote, CartQuoteRequest } from '@zladovce/models';
import { Observable } from 'rxjs';

/** `POST /cart/quote` – prices the browser cart from the database. */
@Injectable({ providedIn: 'root' })
export class CartApi {
  private readonly api = inject(ApiClient);

  quote(body: CartQuoteRequest): Observable<CartQuote> {
    return this.api.post<CartQuote>('/cart/quote', body);
  }
}
