import { inject, Injectable } from '@angular/core';
import { ApiClient } from '@zladovce/api';
import { Courier, CourierList, SaveCourierRequest } from '@zladovce/models';
import { map, Observable } from 'rxjs';

/** `/admin/couriers`: everyone reads, only the owner creates and changes. Never deleted. */
@Injectable({ providedIn: 'root' })
export class CouriersApi {
  private readonly api = inject(ApiClient);

  list(activeOnly = false): Observable<Courier[]> {
    return this.api
      .get<CourierList>('/admin/couriers', { params: { activeOnly: activeOnly || undefined } })
      .pipe(map((response) => response.items));
  }

  create(body: SaveCourierRequest): Observable<Courier> {
    return this.api.post<Courier>('/admin/couriers', body);
  }

  update(id: string, body: SaveCourierRequest): Observable<Courier> {
    return this.api.put<Courier>(`/admin/couriers/${id}`, body);
  }
}
