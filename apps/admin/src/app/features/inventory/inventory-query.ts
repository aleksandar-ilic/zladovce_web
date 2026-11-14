import { Params } from '@angular/router';
import { StockStatus } from '@zladovce/models';
import { INVENTORY_SORTS, InventorySort } from '@zladovce/shared';
import { InventoryQuery } from '../../data/inventory-api';
import {
  compactParams,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  readEnum,
  readPositiveInt,
  readString,
} from '../../shared/list-query';

/**
 * Stock filter of the list. `low,out` ("Malo ili nema") is the dashboard's low-stock set; the API
 * accepts several comma-separated statuses and returns rows in any of them.
 */
export type InventoryStatusFilter = StockStatus | 'low,out';

export interface InventoryListQuery {
  q: string;
  status?: InventoryStatusFilter;
  sort: InventorySort;
  page: number;
  pageSize: number;
}

export const DEFAULT_INVENTORY_SORT: InventorySort = 'product';
const SORTS = INVENTORY_SORTS.map((s) => s.value);
export const LOW_OR_OUT: InventoryStatusFilter = 'low,out';
const STATUSES: readonly InventoryStatusFilter[] = ['ok', 'low', 'out', LOW_OR_OUT];

/** `status=low,out`, `status=out,low` and `status=low&status=out` all mean the same filter. */
function readStatus(params: Params): InventoryStatusFilter | undefined {
  const raw: unknown = params['status'];
  const values = (Array.isArray(raw) ? raw : [raw])
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value !== '');
  const unique = [...new Set(values)].sort();
  if (unique.length === 1) {
    return readEnum({ status: unique[0] }, 'status', STATUSES);
  }
  return unique.length === 2 && unique[0] === 'low' && unique[1] === 'out' ? LOW_OR_OUT : undefined;
}

export function parseInventoryQuery(params: Params): InventoryListQuery {
  const pageSize = readPositiveInt(params, 'pageSize', DEFAULT_PAGE_SIZE, 100);
  return {
    q: readString(params, 'q').trim(),
    status: readStatus(params),
    sort: readEnum(params, 'sort', SORTS) ?? DEFAULT_INVENTORY_SORT,
    page: readPositiveInt(params, 'page', 1),
    pageSize: (PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSize)
      ? pageSize
      : DEFAULT_PAGE_SIZE,
  };
}

export function inventoryQueryParams(query: InventoryListQuery): Params {
  return compactParams(
    {
      q: query.q,
      status: query.status,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    },
    { sort: DEFAULT_INVENTORY_SORT, page: 1, pageSize: DEFAULT_PAGE_SIZE },
  );
}

export function toInventoryApiQuery(query: InventoryListQuery): InventoryQuery {
  return {
    q: query.q || undefined,
    status: query.status,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  };
}
