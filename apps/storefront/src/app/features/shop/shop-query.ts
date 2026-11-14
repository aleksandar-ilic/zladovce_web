import { Params } from '@angular/router';
import { CatalogProductQuery } from '../../core/data/catalog-api';

/** Sorts offered in the shop. `bestselling` is left out until real sales data exists (Phase 5). */
export type ShopSort = 'newest' | 'priceAsc' | 'priceDesc' | 'name';

export const SHOP_SORTS: readonly { value: ShopSort; label: string }[] = [
  { value: 'newest', label: 'Najnovije' },
  { value: 'priceAsc', label: 'Cena: od najniže' },
  { value: 'priceDesc', label: 'Cena: od najviše' },
  { value: 'name', label: 'Naziv A–Ž' },
];

export const DEFAULT_SHOP_SORT: ShopSort = 'newest';
export const SHOP_PAGE_SIZE = 12;
const MAX_PRICE = 9_999_999;
const MAX_SEARCH = 100;

/**
 * Shop filters as they live in the URL query: `q`, `minPrice`, `maxPrice`, `inStock=true`,
 * `sort`, `page`. The category is part of the path (`/prodavnica/:categorySlug`).
 * Defaults are left out of the URL, so `/prodavnica` is the unfiltered first page.
 */
export interface ShopQuery {
  q: string;
  minPrice: number | null;
  maxPrice: number | null;
  inStock: boolean;
  sort: ShopSort;
  page: number;
}

export const EMPTY_SHOP_QUERY: ShopQuery = {
  q: '',
  minPrice: null,
  maxPrice: null,
  inStock: false,
  sort: DEFAULT_SHOP_SORT,
  page: 1,
};

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function readPrice(params: Params, key: string): number | null {
  const raw = first(params[key]);
  if (typeof raw !== 'string' || raw.trim() === '') {
    return null;
  }
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? Math.min(Math.round(value), MAX_PRICE) : null;
}

/** Reads the query; anything invalid falls back to its default (a bad link never breaks the page). */
export function parseShopQuery(params: Params): ShopQuery {
  const q = first(params['q']);
  const sort = first(params['sort']);
  const inStock = first(params['inStock']);
  const page = Number(first(params['page']));
  let minPrice = readPrice(params, 'minPrice');
  let maxPrice = readPrice(params, 'maxPrice');
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }
  return {
    q: typeof q === 'string' ? q.trim().slice(0, MAX_SEARCH) : '',
    minPrice: minPrice === 0 ? null : minPrice,
    maxPrice,
    inStock: inStock === 'true' || inStock === '1',
    sort: SHOP_SORTS.some((s) => s.value === sort) ? (sort as ShopSort) : DEFAULT_SHOP_SORT,
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}

/**
 * Query params for `router.navigate` (with `queryParamsHandling: ''`): defaults become null
 * (removed from the URL), everything else is a string.
 */
export function shopQueryParams(query: ShopQuery): Params {
  return {
    q: query.q.trim() === '' ? null : query.q.trim(),
    minPrice: query.minPrice === null ? null : String(query.minPrice),
    maxPrice: query.maxPrice === null ? null : String(query.maxPrice),
    inStock: query.inStock ? 'true' : null,
    sort: query.sort === DEFAULT_SHOP_SORT ? null : query.sort,
    page: query.page <= 1 ? null : String(query.page),
  };
}

/** Same as shopQueryParams, but only the parameters that are set (for links). */
export function shopLinkParams(query: ShopQuery): Params {
  return Object.fromEntries(
    Object.entries(shopQueryParams(query)).filter(([, value]) => value !== null),
  );
}

/** Changes a filter: every change except paging goes back to page 1. */
export function withChange(query: ShopQuery, change: Partial<ShopQuery>): ShopQuery {
  return { ...query, ...change, page: change.page ?? 1 };
}

/** Number of filters the visitor has set (shown on the mobile "Filteri" button). */
export function activeFilterCount(query: ShopQuery, categorySlug: string | null): number {
  return (
    (query.q ? 1 : 0) +
    (query.minPrice !== null || query.maxPrice !== null ? 1 : 0) +
    (query.inStock ? 1 : 0) +
    (categorySlug ? 1 : 0)
  );
}

export function toCatalogQuery(query: ShopQuery, categorySlug: string | null): CatalogProductQuery {
  return {
    category: categorySlug ?? undefined,
    q: query.q || undefined,
    minPrice: query.minPrice ?? undefined,
    maxPrice: query.maxPrice ?? undefined,
    inStock: query.inStock || undefined,
    sort: query.sort,
    page: query.page,
    pageSize: SHOP_PAGE_SIZE,
  };
}

/** "1 proizvod", "3 proizvoda", "11 proizvoda", "21 proizvod". */
export function productCountLabel(count: number): string {
  const one = count % 10 === 1 && count % 100 !== 11;
  return `${count} ${one ? 'proizvod' : 'proizvoda'}`;
}

/** Page numbers to show: first, last, and up to two around the current one; null = gap. */
export function pageWindow(current: number, total: number): (number | null)[] {
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result: (number | null)[] = [];
  for (const page of sorted) {
    const previous = result[result.length - 1];
    if (typeof previous === 'number' && page - previous > 1) {
      result.push(null);
    }
    result.push(page);
  }
  return result;
}
