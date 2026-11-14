import { Params } from '@angular/router';
import { AdminOrderSort, OrderStatus } from '@zladovce/models';
import { isOrderStatus, OPEN_ORDER_STATUSES, ORDER_STATUSES } from '@zladovce/shared';
import { OrderListQuery } from '../../data/orders-api';
import {
  compactParams,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  readEnum,
  readPositiveInt,
  readString,
} from '../../shared/list-query';

/**
 * Which orders the list shows: `open` ("Za obradu" = Received, Accepted, Preparing – the default),
 * `all`, or one status.
 */
export type OrderView = 'open' | 'all' | OrderStatus;

export interface OrdersListQuery {
  view: OrderView;
  q: string;
  /** `yyyy-MM-dd` (Serbian calendar days), inclusive; empty = no bound. */
  from: string;
  to: string;
  sort: AdminOrderSort;
  page: number;
  pageSize: number;
}

export const DEFAULT_ORDER_VIEW: OrderView = 'open';
export const DEFAULT_ORDER_SORT: AdminOrderSort = 'newest';

export const ORDER_SORTS: readonly { value: AdminOrderSort; label: string }[] = [
  { value: 'newest', label: 'Najnovije prvo' },
  { value: 'oldest', label: 'Najstarije prvo' },
  { value: 'totalDesc', label: 'Najveći iznos prvo' },
  { value: 'totalAsc', label: 'Najmanji iznos prvo' },
];

const SORTS = ORDER_SORTS.map((s) => s.value);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date `yyyy-MM-dd`, else ''. */
export function readDate(params: Params, key: string): string {
  const value = readString(params, key, 10);
  if (!DATE.test(value)) {
    return '';
  }
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? value
    : '';
}

function readView(params: Params): OrderView {
  const value: unknown = params['status'];
  if (value === 'all') {
    return 'all';
  }
  return isOrderStatus(value) ? value : DEFAULT_ORDER_VIEW;
}

export function parseOrdersQuery(params: Params): OrdersListQuery {
  const pageSize = readPositiveInt(params, 'pageSize', DEFAULT_PAGE_SIZE, 100);
  let from = readDate(params, 'from');
  let to = readDate(params, 'to');
  if (from && to && from > to) {
    [from, to] = [to, from];
  }
  return {
    view: readView(params),
    q: readString(params, 'q').trim(),
    from,
    to,
    sort: readEnum(params, 'sort', SORTS) ?? DEFAULT_ORDER_SORT,
    page: readPositiveInt(params, 'page', 1),
    pageSize: (PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSize)
      ? pageSize
      : DEFAULT_PAGE_SIZE,
  };
}

/** URL query: the default view, sort, page and page size are left out. */
export function ordersQueryParams(query: OrdersListQuery): Params {
  return compactParams(
    {
      status: query.view,
      q: query.q,
      from: query.from,
      to: query.to,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    },
    { status: DEFAULT_ORDER_VIEW, sort: DEFAULT_ORDER_SORT, page: 1, pageSize: DEFAULT_PAGE_SIZE },
  );
}

export function viewStatuses(view: OrderView): readonly OrderStatus[] {
  if (view === 'open') {
    return OPEN_ORDER_STATUSES;
  }
  return view === 'all' ? [] : [view];
}

export function toOrdersApiQuery(query: OrdersListQuery): OrderListQuery {
  return {
    q: query.q || undefined,
    status: viewStatuses(query.view),
    from: query.from || undefined,
    to: query.to || undefined,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Tabs of the list, in the order of an order's life. */
export const ORDER_VIEWS: readonly OrderView[] = ['open', ...ORDER_STATUSES, 'all'];
