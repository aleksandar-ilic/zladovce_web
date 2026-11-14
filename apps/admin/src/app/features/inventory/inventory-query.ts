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

export interface InventoryListQuery {
  q: string;
  status?: StockStatus;
  sort: InventorySort;
  page: number;
  pageSize: number;
}

export const DEFAULT_INVENTORY_SORT: InventorySort = 'product';
const SORTS = INVENTORY_SORTS.map((s) => s.value);
const STATUSES: readonly StockStatus[] = ['ok', 'low', 'out'];

export function parseInventoryQuery(params: Params): InventoryListQuery {
  const pageSize = readPositiveInt(params, 'pageSize', DEFAULT_PAGE_SIZE, 100);
  return {
    q: readString(params, 'q').trim(),
    status: readEnum(params, 'status', STATUSES),
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
