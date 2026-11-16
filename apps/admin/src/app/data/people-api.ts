import { inject, Injectable } from '@angular/core';
import { ApiClient } from '@zladovce/api';
import {
  AdminContactMessage,
  AdminContactMessageList,
  AdminSubscriberList,
  AdminUser,
  AdminUserList,
  AuditLogFilters,
  AuditLogItem,
  InviteAdminRequest,
  NewsletterSubscriberStatus,
  Paged,
  UpdateAdminRequest,
} from '@zladovce/models';
import { Observable } from 'rxjs';
import { FileDownloadService } from './file-download';

export interface SubscriberListQuery {
  status?: NewsletterSubscriberStatus;
  q?: string;
  page: number;
  pageSize: number;
}

export interface AuditLogQuery {
  adminUserId?: string;
  entityType?: string;
  action?: string;
  /** `yyyy-MM-dd` (Serbian calendar days). */
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

/** Contact messages (every administrator). */
@Injectable({ providedIn: 'root' })
export class ContactMessagesApi {
  private readonly api = inject(ApiClient);

  list(query: { unreadOnly: boolean; page: number; pageSize: number }) {
    return this.api.get<AdminContactMessageList>('/admin/contact-messages', {
      params: {
        unreadOnly: query.unreadOnly || undefined,
        page: query.page,
        pageSize: query.pageSize,
      },
    });
  }

  markRead(id: string): Observable<AdminContactMessage> {
    return this.api.post<AdminContactMessage>(`/admin/contact-messages/${id}/read`);
  }

  markUnread(id: string): Observable<AdminContactMessage> {
    return this.api.post<AdminContactMessage>(`/admin/contact-messages/${id}/unread`);
  }
}

/** Newsletter subscribers (owner only). */
@Injectable({ providedIn: 'root' })
export class NewsletterApi {
  private readonly api = inject(ApiClient);
  private readonly files = inject(FileDownloadService);

  subscribers(query: SubscriberListQuery): Observable<AdminSubscriberList> {
    return this.api.get<AdminSubscriberList>('/admin/newsletter/subscribers', {
      params: { status: query.status, q: query.q, page: query.page, pageSize: query.pageSize },
    });
  }

  /** CSV of confirmed subscribers; completes with the saved file name. */
  exportConfirmed(fallbackName: string): Observable<string> {
    return this.files.download('/admin/newsletter/subscribers/export', {}, fallbackName);
  }
}

/** Administrators (owner only). */
@Injectable({ providedIn: 'root' })
export class AdminUsersApi {
  private readonly api = inject(ApiClient);

  list(): Observable<AdminUserList> {
    return this.api.get<AdminUserList>('/admin/users');
  }

  invite(body: InviteAdminRequest): Observable<AdminUser> {
    return this.api.post<AdminUser>('/admin/users', body);
  }

  update(id: string, body: UpdateAdminRequest): Observable<AdminUser> {
    return this.api.put<AdminUser>(`/admin/users/${id}`, body);
  }
}

/** Audit log (owner only). */
@Injectable({ providedIn: 'root' })
export class AuditLogApi {
  private readonly api = inject(ApiClient);

  filters(): Observable<AuditLogFilters> {
    return this.api.get<AuditLogFilters>('/admin/audit-logs/filters');
  }

  list(query: AuditLogQuery): Observable<Paged<AuditLogItem>> {
    return this.api.get<Paged<AuditLogItem>>('/admin/audit-logs', {
      params: { ...query },
    });
  }
}
