import { Params } from '@angular/router';
import { ADMIN_PRODUCT_SORTS, AdminProductSort } from '@zladovce/shared';
import { AdminProductQuery } from '../../data/products-api';
import {
  compactParams,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  readEnum,
  readFlag,
  readPositiveInt,
  readString,
  readUuid,
} from '../../shared/list-query';

export interface ProductListQuery {
  q: string;
  category?: string;
  status?: 'active' | 'inactive';
  archived: boolean;
  sort: AdminProductSort;
  page: number;
  pageSize: number;
}

export const DEFAULT_PRODUCT_SORT: AdminProductSort = 'newest';
const SORTS = ADMIN_PRODUCT_SORTS.map((s) => s.value);

/** URL query → list filters. Unknown or invalid values fall back to the defaults. */
export function parseProductQuery(params: Params): ProductListQuery {
  const pageSize = readPositiveInt(params, 'pageSize', DEFAULT_PAGE_SIZE, 100);
  return {
    q: readString(params, 'q').trim(),
    category: readUuid(params, 'category'),
    status: readEnum(params, 'status', ['active', 'inactive'] as const),
    archived: readFlag(params, 'archived'),
    sort: readEnum(params, 'sort', SORTS) ?? DEFAULT_PRODUCT_SORT,
    page: readPositiveInt(params, 'page', 1),
    pageSize: (PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSize)
      ? pageSize
      : DEFAULT_PAGE_SIZE,
  };
}

/** List filters → URL query (defaults left out; `null` clears a parameter). */
export function productQueryParams(query: ProductListQuery): Params {
  return compactParams(
    {
      q: query.q,
      category: query.category,
      status: query.status,
      archived: query.archived,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    },
    { sort: DEFAULT_PRODUCT_SORT, page: 1, pageSize: DEFAULT_PAGE_SIZE },
  );
}

export function toApiQuery(query: ProductListQuery): AdminProductQuery {
  return {
    q: query.q || undefined,
    category: query.category,
    status: query.status,
    archived: query.archived,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export function hasProductFilters(query: ProductListQuery): boolean {
  return query.q !== '' || !!query.category || !!query.status || query.archived;
}
