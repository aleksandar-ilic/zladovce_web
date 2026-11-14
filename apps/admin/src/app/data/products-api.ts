import { inject, Injectable } from '@angular/core';
import { ApiClient } from '@zladovce/api';
import {
  AdminProduct,
  AdminProductListItem,
  CreateProductRequest,
  CreateVariantRequest,
  Paged,
  UpdateProductRequest,
  VariantRequest,
} from '@zladovce/models';
import { AdminProductSort } from '@zladovce/shared';
import { Observable } from 'rxjs';

export interface AdminProductQuery {
  q?: string;
  /** Category id. */
  category?: string;
  status?: 'active' | 'inactive';
  archived?: boolean;
  sort?: AdminProductSort;
  page?: number;
  pageSize?: number;
}

/**
 * `/admin/products` and its variants and images. Every call that changes a product returns the
 * whole product, including the new `version` that the next update must send.
 */
@Injectable({ providedIn: 'root' })
export class ProductsApi {
  private readonly api = inject(ApiClient);

  list(query: AdminProductQuery): Observable<Paged<AdminProductListItem>> {
    return this.api.get<Paged<AdminProductListItem>>('/admin/products', {
      params: {
        q: query.q,
        category: query.category,
        status: query.status,
        archived: query.archived ? true : undefined,
        sort: query.sort,
        page: query.page,
        pageSize: query.pageSize,
      },
    });
  }

  get(id: string): Observable<AdminProduct> {
    return this.api.get<AdminProduct>(`/admin/products/${id}`);
  }

  create(body: CreateProductRequest): Observable<AdminProduct> {
    return this.api.post<AdminProduct>('/admin/products', body);
  }

  /** Needs every field and the `version` last read; a stale version gives 409 CONCURRENT_EDIT. */
  update(id: string, body: UpdateProductRequest & { version: number }): Observable<AdminProduct> {
    return this.api.put<AdminProduct>(`/admin/products/${id}`, body);
  }

  archive(id: string): Observable<AdminProduct> {
    return this.api.post<AdminProduct>(`/admin/products/${id}/archive`);
  }

  restore(id: string): Observable<AdminProduct> {
    return this.api.post<AdminProduct>(`/admin/products/${id}/restore`);
  }

  addVariant(id: string, body: CreateVariantRequest): Observable<AdminProduct> {
    return this.api.post<AdminProduct>(`/admin/products/${id}/variants`, body);
  }

  updateVariant(id: string, variantId: string, body: VariantRequest): Observable<AdminProduct> {
    return this.api.put<AdminProduct>(`/admin/products/${id}/variants/${variantId}`, body);
  }

  archiveVariant(id: string, variantId: string): Observable<AdminProduct> {
    return this.api.delete<AdminProduct>(`/admin/products/${id}/variants/${variantId}`);
  }

  attachImage(id: string, uploadKey: string, altText: string | null): Observable<AdminProduct> {
    return this.api.post<AdminProduct>(`/admin/products/${id}/images`, { uploadKey, altText });
  }

  reorderImages(
    id: string,
    imageIds: string[],
    mainImageId: string | null,
  ): Observable<AdminProduct> {
    return this.api.put<AdminProduct>(`/admin/products/${id}/images/order`, {
      imageIds,
      mainImageId,
    });
  }

  updateImage(id: string, imageId: string, altText: string | null): Observable<AdminProduct> {
    return this.api.put<AdminProduct>(`/admin/products/${id}/images/${imageId}`, { altText });
  }

  deleteImage(id: string, imageId: string): Observable<AdminProduct> {
    return this.api.delete<AdminProduct>(`/admin/products/${id}/images/${imageId}`);
  }
}
