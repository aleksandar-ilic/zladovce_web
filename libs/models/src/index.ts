/**
 * API contract types.
 *
 * Phase 2 types (below) are written by hand. From Phase 3 on, endpoint DTOs are aliases of the
 * generated contract (`npm run generate:models` → ./generated/zladovce-v1.ts), re-exported here.
 */

/** RFC 9457 Problem Details as returned by the Zladovce API. `detail` is a Serbian, user-facing message. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  /** Stable machine-readable code, e.g. `INSUFFICIENT_STOCK`. */
  code: string;
  detail: string;
  /** Field-level validation messages keyed by field path. */
  errors?: Record<string, string[]>;
  traceId: string;
}

/** Envelope of every paged list response. `page` starts at 1. */
export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** Query parameters accepted by paged list endpoints. */
export interface PageQuery {
  page?: number;
  pageSize?: number;
  sort?: string;
}

/** Administrator roles; values match the Cognito group names. */
export const AdminRole = {
  Owner: 'Owner',
  Staff: 'Staff',
} as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

export const ADMIN_ROLES: readonly AdminRole[] = [AdminRole.Owner, AdminRole.Staff];

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && (ADMIN_ROLES as readonly string[]).includes(value);
}

/** Response of `GET /api/v1/admin/me`. */
export interface AdminMe {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
}

// ---------------------------------------------------------------------------------------------
// Phase 3 – catalog, media and inventory (generated from the OpenAPI document).
// ---------------------------------------------------------------------------------------------
import type { components } from './generated/zladovce-v1';

type Schemas = components['schemas'];

export type MeasurementUnit = Schemas['MeasurementUnit'];
export type StockStatus = Schemas['StockStatus'];
export type InventoryMovementType = Schemas['InventoryMovementType'];

export type AdminCategory = Schemas['AdminCategoryResponse'];
export type AdminCategoryList = Schemas['AdminCategoryListResponse'];
export type CategoryImage = Schemas['CategoryImageResponse'];
export type SaveCategoryRequest = Schemas['SaveCategoryRequest'];
export type ReorderCategoriesRequest = Schemas['ReorderCategoriesRequest'];

export type AdminProduct = Schemas['AdminProductResponse'];
export type AdminProductListItem = Schemas['AdminProductListItem'];
export type AdminProductCategory = Schemas['AdminProductCategory'];
export type AdminVariant = Schemas['AdminVariantResponse'];
export type ProductImage = Schemas['ProductImageResponse'];
export type CreateProductRequest = Schemas['CreateProductRequest'];
export type UpdateProductRequest = Schemas['UpdateProductRequest'];
export type CreateVariantRequest = Schemas['CreateVariantRequest'];
export type VariantRequest = Schemas['VariantRequest'];
export type AttachProductImageRequest = Schemas['AttachProductImageRequest'];
export type ReorderProductImagesRequest = Schemas['ReorderProductImagesRequest'];
export type UpdateProductImageRequest = Schemas['UpdateProductImageRequest'];

export type UploadPurpose = 'product' | 'category';
export type CreateUploadUrlRequest = Omit<Schemas['CreateUploadUrlRequest'], 'purpose'> & {
  purpose: UploadPurpose;
};
export type UploadUrlResponse = Schemas['UploadUrlResponse'];

export type InventoryItem = Schemas['InventoryItemResponse'];
export type InventoryMovement = Schemas['InventoryMovementResponse'];
export type AdjustStockRequest = Schemas['AdjustStockRequest'];
export type SetLowStockThresholdRequest = Schemas['SetLowStockThresholdRequest'];
export type LowStockResponse = Schemas['LowStockResponse'];

/** Any image the API returns: renditions live at `{baseUrl}/{width}.webp`. */
export interface ImageRenditions {
  baseUrl: string;
  widths: number[];
}

// ---------------------------------------------------------------------------------------------
// Phase 4 – public catalog, store settings, cart quote and SEO routes (generated).
// ---------------------------------------------------------------------------------------------
export type PublicImage = Schemas['PublicImageResponse'];
export type PublicCategory = Schemas['PublicCategoryResponse'];
export type PublicCategoryDetail = Schemas['PublicCategoryDetailResponse'];
export type PublicCategoryList = Schemas['PublicCategoryListResponse'];
export type PublicProductListItem = Schemas['PublicProductListItem'];
export type PublicProduct = Schemas['PublicProductResponse'];
export type PublicProductList = Schemas['PublicProductListResponse'];
export type PublicVariant = Schemas['PublicVariantResponse'];
export type PublicSeo = Schemas['PublicSeo'];
export type PublicAvailabilityItem = Schemas['PublicAvailabilityItem'];
export type PublicAvailability = Schemas['PublicAvailabilityResponse'];

export type PublicStore = Schemas['PublicStoreResponse'];
export type PublicStoreShipping = Schemas['PublicStoreShipping'];

export type CartQuoteItem = Schemas['CartQuoteItemRequest'];
export type CartQuoteRequest = Schemas['CartQuoteRequest'];
export type CartQuote = Schemas['CartQuoteResponse'];
export type CartQuoteLine = Schemas['CartQuoteLine'];
export type CartQuoteAdjustment = Schemas['CartQuoteAdjustment'];
export type CartAdjustmentReason = Schemas['CartAdjustmentReason'];
export type CartQuoteShipping = Schemas['CartQuoteShipping'];
/** Why a `quantityReduced` adjustment capped the line: `stock` or the per-order cap `orderLimit`. */
export type QuantityLimitReason = NonNullable<Schemas['QuantityLimitReason']>;

export type SeoRoute = Schemas['SeoRoute'];
export type SeoRoutes = Schemas['SeoRoutesResponse'];

/** Sort values of `GET /catalog/products`. `bestselling`: pieces sold in delivered orders, then newest. */
export type PublicProductSort = 'newest' | 'priceAsc' | 'priceDesc' | 'name' | 'bestselling';

// ---------------------------------------------------------------------------------------------
// Phase 5 – checkout, orders, couriers and store settings (generated).
// ---------------------------------------------------------------------------------------------
export type CreateOrderRequest = Schemas['CreateOrderRequest'];
export type CreateOrderItemRequest = Schemas['CreateOrderItemRequest'];
export type CheckoutCustomerRequest = Schemas['CheckoutCustomerRequest'];
export type CheckoutAddressRequest = Schemas['CheckoutAddressRequest'];
export type PlacedOrder = Schemas['PlacedOrderResponse'];
export type PlacedOrderItem = Schemas['PlacedOrderItem'];
export type PaymentMethod = Schemas['PaymentMethod'];

export type OrderStatus = Schemas['OrderStatus'];
export type StockReturnPolicy = Schemas['StockReturnPolicy'];
export type AllowedStatusTransition = Schemas['AllowedStatusTransition'];
export type AdminOrderListItem = Schemas['AdminOrderListItem'];
export type AdminOrderDetail = Schemas['AdminOrderDetail'];
export type AdminOrderItem = Schemas['AdminOrderItem'];
export type AdminOrderContact = Schemas['AdminOrderContact'];
export type AdminOrderAddress = Schemas['AdminOrderAddress'];
export type AdminOrderPayment = Schemas['AdminOrderPayment'];
export type AdminOrderShipment = Schemas['AdminOrderShipment'];
export type AdminOrderTimelineEntry = Schemas['AdminOrderTimelineEntry'];
export type AdminOrderNote = Schemas['AdminOrderNote'];
export type OrderStatusCount = Schemas['OrderStatusCount'];
export type OrderSummary = Schemas['OrderSummaryResponse'];
export type ChangeOrderStatusRequest = Schemas['ChangeOrderStatusRequest'];
export type NewShipmentRequest = Schemas['NewShipmentRequest'];
export type UpdateShipmentRequest = Schemas['UpdateShipmentRequest'];
export type SetOrderPaymentRequest = Schemas['SetOrderPaymentRequest'];
export type AddOrderNoteRequest = Schemas['AddOrderNoteRequest'];

/** Sort values of `GET /admin/orders`. */
export type AdminOrderSort = 'newest' | 'oldest' | 'totalDesc' | 'totalAsc';

export type Courier = Schemas['CourierResponse'];
export type CourierList = Schemas['CourierListResponse'];
export type SaveCourierRequest = Schemas['SaveCourierRequest'];

export type AdminStoreSettings = Schemas['AdminStoreSettingsResponse'];
export type UpdateStoreSettingsRequest = Schemas['UpdateStoreSettingsRequest'];
export type StoreLink = Schemas['StoreLinkDto'];
