import { inject, Injectable } from '@angular/core';
import { ApiClient } from '@zladovce/api';
import {
  Paged,
  PublicAvailability,
  PublicCategory,
  PublicCategoryDetail,
  PublicCategoryList,
  PublicProduct,
  PublicProductList,
  PublicProductListItem,
  PublicProductSort,
} from '@zladovce/models';
import { map, Observable } from 'rxjs';

export interface CatalogProductQuery {
  /** Category slug. */
  category?: string;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  featured?: boolean;
  sort?: PublicProductSort;
  page?: number;
  pageSize?: number;
}

export interface FetchOptions {
  /**
   * Skip the prerender transfer cache. Used in the browser right after hydration so a page
   * that was rendered at build time shows the current price and availability.
   */
  fresh?: boolean;
}

const cacheOption = (options: FetchOptions) => (options.fresh ? { transferCache: false } : {});

/** Public catalog (`/catalog/*`). No authentication; exact stock is never part of a response. */
@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly api = inject(ApiClient);

  categories(options: FetchOptions = {}): Observable<PublicCategory[]> {
    return this.api
      .get<PublicCategoryList>('/catalog/categories', cacheOption(options))
      .pipe(map((response) => response.items));
  }

  category(slug: string, options: FetchOptions = {}): Observable<PublicCategoryDetail> {
    return this.api.get<PublicCategoryDetail>(
      `/catalog/categories/${encodeURIComponent(slug)}`,
      cacheOption(options),
    );
  }

  products(
    query: CatalogProductQuery,
    options: FetchOptions = {},
  ): Observable<Paged<PublicProductListItem>> {
    return this.api.get<Paged<PublicProductListItem>>('/catalog/products', {
      ...cacheOption(options),
      params: {
        category: query.category,
        q: query.q,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
        inStock: query.inStock ? true : undefined,
        featured: query.featured ? true : undefined,
        sort: query.sort,
        page: query.page,
        pageSize: query.pageSize,
      },
    });
  }

  product(slug: string, options: FetchOptions = {}): Observable<PublicProduct> {
    return this.api.get<PublicProduct>(
      `/catalog/products/${encodeURIComponent(slug)}`,
      cacheOption(options),
    );
  }

  related(
    slug: string,
    limit = 4,
    options: FetchOptions = {},
  ): Observable<PublicProductListItem[]> {
    return this.api
      .get<PublicProductList>(`/catalog/products/${encodeURIComponent(slug)}/related`, {
        ...cacheOption(options),
        params: { limit },
      })
      .pipe(map((response) => response.items));
  }

  /**
   * Best sellers (pieces sold in delivered orders of the last 90 days). Empty until orders have
   * been delivered – the page then shows nothing instead of invented "best sellers".
   */
  bestsellers(limit = 4, options: FetchOptions = {}): Observable<PublicProductListItem[]> {
    return this.api
      .get<PublicProductList>('/catalog/bestsellers', {
        ...cacheOption(options),
        params: { limit },
      })
      .pipe(map((response) => response.items));
  }

  /** Current price and availability of up to 100 variants; variants not on sale are missing. */
  availability(variantIds: readonly string[]): Observable<PublicAvailability> {
    return this.api.get<PublicAvailability>('/catalog/availability', {
      transferCache: false,
      params: { variantIds: variantIds.slice(0, 100).join(',') },
    });
  }
}
