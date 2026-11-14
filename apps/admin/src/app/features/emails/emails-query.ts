import { Params } from '@angular/router';
import { EmailOutboxStatus } from '@zladovce/models';
import { EmailListQuery } from '../../data/emails-api';
import { EMAIL_STATUSES, isEmailStatus } from '../../shared/email-labels';
import {
  compactParams,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  readPositiveInt,
  readUuid,
} from '../../shared/list-query';

/** What the E-poruke list shows: the chosen statuses (empty = every status), optionally one order. */
export interface EmailsListQuery {
  statuses: readonly EmailOutboxStatus[];
  orderId: string;
  page: number;
  pageSize: number;
}

/** Default view: emails that need attention (could not be sent, or still waiting). */
export const DEFAULT_EMAIL_STATUSES: readonly EmailOutboxStatus[] = ['Pending', 'Dead'];

/** Statuses in a fixed order without duplicates, so equal selections give equal URLs. */
export function sortStatuses(statuses: readonly EmailOutboxStatus[]): EmailOutboxStatus[] {
  return EMAIL_STATUSES.filter((status) => statuses.includes(status));
}

function sameStatuses(a: readonly EmailOutboxStatus[], b: readonly EmailOutboxStatus[]): boolean {
  const left = sortStatuses(a);
  const right = sortStatuses(b);
  return left.length === right.length && left.every((status, i) => status === right[i]);
}

export function isDefaultStatuses(statuses: readonly EmailOutboxStatus[]): boolean {
  return sameStatuses(statuses, DEFAULT_EMAIL_STATUSES);
}

/**
 * `?status=Dead,Sent` (comma separated; `all` = every status; missing or unreadable = the
 * default), `orderId`, `page`, `pageSize`.
 */
export function parseEmailsQuery(params: Params): EmailsListQuery {
  const raw: unknown = params['status'];
  let statuses: readonly EmailOutboxStatus[] = DEFAULT_EMAIL_STATUSES;
  if (raw === 'all') {
    statuses = [];
  } else if (typeof raw === 'string') {
    const chosen = sortStatuses(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(isEmailStatus),
    );
    if (chosen.length > 0) {
      statuses = chosen;
    }
  }
  const pageSize = readPositiveInt(params, 'pageSize', DEFAULT_PAGE_SIZE, 100);
  return {
    statuses: sortStatuses(statuses),
    orderId: readUuid(params, 'orderId') ?? '',
    page: readPositiveInt(params, 'page', 1),
    pageSize: (PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSize)
      ? pageSize
      : DEFAULT_PAGE_SIZE,
  };
}

/** URL query: the default statuses, page and page size are left out. */
export function emailsQueryParams(query: EmailsListQuery): Params {
  const status =
    query.statuses.length === 0
      ? 'all'
      : isDefaultStatuses(query.statuses)
        ? null
        : sortStatuses(query.statuses).join(',');
  return compactParams(
    { status, orderId: query.orderId, page: query.page, pageSize: query.pageSize },
    { page: 1, pageSize: DEFAULT_PAGE_SIZE },
  );
}

export function toEmailsApiQuery(query: EmailsListQuery): EmailListQuery {
  return {
    status: query.statuses,
    orderId: query.orderId || undefined,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** The selection after pressing one status filter. */
export function toggleStatus(
  statuses: readonly EmailOutboxStatus[],
  status: EmailOutboxStatus,
): EmailOutboxStatus[] {
  return statuses.includes(status)
    ? statuses.filter((s) => s !== status)
    : sortStatuses([...statuses, status]);
}
