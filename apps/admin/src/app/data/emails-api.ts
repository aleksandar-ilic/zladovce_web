import { inject, Injectable } from '@angular/core';
import { ApiClient } from '@zladovce/api';
import {
  AdminEmailDetail,
  AdminEmailItem,
  EmailOutboxStatus,
  Paged,
  RevokeTrackingResponse,
} from '@zladovce/models';
import { Observable } from 'rxjs';

export interface EmailListQuery {
  /** Any of these statuses; empty or missing = every status. */
  status?: readonly EmailOutboxStatus[];
  orderId?: string;
  page?: number;
  pageSize?: number;
}

/** `/admin/emails` (outbox) and the order actions around the customer emails. AdminAny. */
@Injectable({ providedIn: 'root' })
export class EmailsApi {
  private readonly api = inject(ApiClient);

  list(query: EmailListQuery): Observable<Paged<AdminEmailItem>> {
    return this.api.get<Paged<AdminEmailItem>>('/admin/emails', {
      params: {
        status: query.status && query.status.length > 0 ? query.status.join(',') : undefined,
        orderId: query.orderId,
        page: query.page,
        pageSize: query.pageSize,
      },
    });
  }

  get(id: string): Observable<AdminEmailDetail> {
    return this.api.get<AdminEmailDetail>(`/admin/emails/${id}`);
  }

  /** Dead → Pending, due now. 409 EMAIL_NOT_RETRYABLE for any other status. */
  retry(id: string): Observable<AdminEmailItem> {
    return this.api.post<AdminEmailItem>(`/admin/emails/${id}/retry`);
  }

  /** Queues the confirmation again with a new tracking code; earlier codes keep working. */
  resendConfirmation(orderId: string): Observable<AdminEmailItem> {
    return this.api.post<AdminEmailItem>(`/admin/orders/${orderId}/emails/resend-confirmation`);
  }

  /** Revokes every tracking code of the order issued so far. */
  revokeTracking(orderId: string): Observable<RevokeTrackingResponse> {
    return this.api.post<RevokeTrackingResponse>(`/admin/orders/${orderId}/tracking/revoke`);
  }
}
