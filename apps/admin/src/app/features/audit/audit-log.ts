import { Params } from '@angular/router';
import { AuditFilterOption } from '@zladovce/models';
import { AuditLogQuery } from '../../data/people-api';
import {
  compactParams,
  DEFAULT_PAGE_SIZE,
  readPositiveInt,
  readString,
  readUuid,
} from '../../shared/list-query';
import { fromIsoDate } from '../../shared/serbian-dates';

export interface AuditFilters {
  adminUserId: string;
  entityType: string;
  action: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
}

const day = (params: Params, key: string): string => {
  const value = readString(params, key, 10);
  return fromIsoDate(value) ? value : '';
};

/** `?admin=…&tip=Product&radnja=Product.Updated&od=2026-11-01&do=2026-11-14&page=2`. */
export function parseAuditFilters(params: Params): AuditFilters {
  let from = day(params, 'od');
  let to = day(params, 'do');
  if (from && to && from > to) {
    [from, to] = [to, from];
  }
  return {
    adminUserId: readUuid(params, 'admin') ?? '',
    entityType: readString(params, 'tip', 60).replace(/[^A-Za-z]/g, ''),
    action: readString(params, 'radnja', 80).replace(/[^A-Za-z.]/g, ''),
    from,
    to,
    page: readPositiveInt(params, 'page', 1),
    pageSize: readPositiveInt(params, 'pageSize', DEFAULT_PAGE_SIZE, 100),
  };
}

export function auditQueryParams(filters: AuditFilters): Params {
  return compactParams(
    {
      admin: filters.adminUserId,
      tip: filters.entityType,
      radnja: filters.action,
      od: filters.from,
      do: filters.to,
      page: filters.page,
      pageSize: filters.pageSize,
    },
    { page: 1, pageSize: DEFAULT_PAGE_SIZE },
  );
}

export function toAuditApiQuery(filters: AuditFilters): AuditLogQuery {
  return {
    adminUserId: filters.adminUserId || undefined,
    entityType: filters.entityType || undefined,
    action: filters.action || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

const VERBS: Record<string, string> = {
  Created: 'dodavanje',
  Updated: 'izmena',
  Deleted: 'brisanje',
  Archived: 'arhiviranje',
  Restored: 'vraćanje',
  Adjusted: 'promena stanja',
  StatusChanged: 'promena statusa',
  NoteAdded: 'beleška',
  PaymentRecorded: 'upis naplate',
  ConfirmationResent: 'ponovno slanje potvrde',
  TrackingRevoked: 'novi kod za praćenje',
  Login: 'prijava',
  Invited: 'poziv',
  RoleChanged: 'promena uloge',
  Deactivated: 'deaktivacija',
  Activated: 'aktivacija',
  Published: 'objava',
  Unpublished: 'povlačenje sa sajta',
  Reordered: 'promena redosleda',
  Read: 'pročitano',
  Unread: 'nepročitano',
};

/** "Proizvod – izmena" for `Product.Updated`, using the entity labels from the filters endpoint. */
export function actionLabel(action: string, entityTypes: readonly AuditFilterOption[]): string {
  const [entity = '', verb = ''] = action.split('.');
  if (entity === 'Auth') {
    return `Prijava${verb && verb !== 'Login' ? ` – ${VERBS[verb] ?? verb}` : ''}`;
  }
  const entityText = entityTypes.find((option) => option.value === entity)?.label ?? entity;
  return verb ? `${entityText} – ${VERBS[verb] ?? verb}` : entityText;
}

export interface ChangeRow {
  field: string;
  before: string;
  after: string;
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'da' : 'ne';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Readable rows of the `changes` JSON: `{ field: { old, new } }` becomes "field: old → new";
 * any other shape is shown member by member as it is.
 */
export function changeRows(changes: unknown): ChangeRow[] {
  if (typeof changes !== 'object' || changes === null) {
    return changes === null || changes === undefined
      ? []
      : [{ field: '', before: '', after: show(changes) }];
  }
  if (Array.isArray(changes)) {
    return [{ field: '', before: '', after: show(changes) }];
  }
  return Object.entries(changes as Record<string, unknown>).map(([field, value]) => {
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      ('old' in value || 'new' in value)
    ) {
      const pair = value as { old?: unknown; new?: unknown };
      return { field, before: show(pair.old), after: show(pair.new) };
    }
    return { field, before: '', after: show(value) };
  });
}
