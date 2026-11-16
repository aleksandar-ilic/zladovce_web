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

/** Upload folders: product and category photos, blog images, CMS page images and the store logo. */
export type UploadPurpose = 'product' | 'category' | 'blog' | 'page' | 'logo';
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

// ---------------------------------------------------------------------------------------------
// Phase 6 – order tracking and transactional emails (generated).
// ---------------------------------------------------------------------------------------------
export type TrackingLookupRequest = Schemas['TrackingLookupRequest'];
export type TrackingLookup = Schemas['TrackingLookupResponse'];
export type TrackingTimelineEntry = Schemas['TrackingTimelineEntry'];
export type TrackingShipment = Schemas['TrackingShipment'];

export type EmailTemplate = Schemas['EmailTemplate'];
export type EmailOutboxStatus = Schemas['EmailOutboxStatus'];
export type AdminEmailItem = Schemas['AdminEmailItem'];
export type AdminEmailDetail = Schemas['AdminEmailDetail'];
export type AdminEmailAttempt = Schemas['AdminEmailAttempt'];
export type RevokeTrackingResponse = Schemas['RevokeTrackingResponse'];

// ---------------------------------------------------------------------------------------------
// Phase 7 – analytics, reports, expenses, blog, CMS, newsletter, contact, admins, audit (generated).
// ---------------------------------------------------------------------------------------------
/** `period` query of dashboard, report and expense endpoints (`custom` needs `from`/`to`). */
export type DashboardPeriodKey =
  'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';
export type SeriesGranularity = Schemas['SeriesGranularity'];
export type PeriodInfo = Schemas['PeriodInfo'];
export type PeriodRange = Schemas['PeriodRange'];
export type PeriodMetrics = Schemas['PeriodMetrics'];
export type OrderQueues = Schemas['OrderQueues'];
export type DashboardSummary = Schemas['DashboardSummaryResponse'];
export type RevenuePoint = Schemas['RevenuePoint'];
export type RevenueSeries = Schemas['RevenueSeriesResponse'];
export type OrderCountPoint = Schemas['OrderCountPoint'];
export type OrderSeries = Schemas['OrderSeriesResponse'];
export type TopProductItem = Schemas['TopProductItem'];
export type TopProducts = Schemas['TopProductsResponse'];
export type CategorySalesItem = Schemas['CategorySalesItem'];
export type SalesByCategory = Schemas['SalesByCategoryResponse'];
export type StatusCountItem = Schemas['StatusCountItem'];
export type StatusDistribution = Schemas['StatusDistributionResponse'];

export type SalesByVariantRow = Schemas['SalesByVariantRow'];
export type SalesReport = Schemas['SalesReportResponse'];
export type InventoryReportRow = Schemas['InventoryReportRow'];
export type InventoryReport = Schemas['InventoryReportResponse'];

export type ExpenseCategoryOption = Schemas['ExpenseCategoryOption'];
export type ExpenseCategoryTotal = Schemas['ExpenseCategoryTotal'];
export type Expense = Schemas['ExpenseResponse'];
export type ExpenseList = Schemas['ExpenseListResponse'];
export type SaveExpenseRequest = Schemas['SaveExpenseRequest'];

export type ContentImage = Schemas['ContentImage'];
export type BlogPostStatus = Schemas['BlogPostStatus'];
export type BlogPostState = Schemas['BlogPostState'];
export type BlogCategoryRef = Schemas['BlogCategoryRef'];
export type BlogAuthorRef = Schemas['BlogAuthorRef'];
export type AdminBlogCategory = Schemas['AdminBlogCategoryResponse'];
export type AdminBlogCategoryList = Schemas['AdminBlogCategoryListResponse'];
export type SaveBlogCategoryRequest = Schemas['SaveBlogCategoryRequest'];
export type AdminBlogPostListItem = Schemas['AdminBlogPostListItem'];
export type AdminBlogPost = Schemas['AdminBlogPostResponse'];
export type SaveBlogPostRequest = Schemas['SaveBlogPostRequest'];
export type PublishBlogPostRequest = Schemas['PublishBlogPostRequest'];
export type UnpublishBlogPostRequest = Schemas['UnpublishBlogPostRequest'];
export type BlogImageRequest = Schemas['BlogImageRequest'];

export type CmsPageKey = 'home' | 'about' | 'privacy' | 'terms' | 'delivery';
export type CmsPageSummary = Schemas['CmsPageSummary'];
export type CmsPageList = Schemas['CmsPageListResponse'];
export type CmsImage = Schemas['CmsImage'];
export type CmsImageInput = Schemas['CmsImageInput'];
export type CmsTextSection = Schemas['CmsTextSection'];
export type CmsTextSectionInput = Schemas['CmsTextSectionInput'];
export type HomeHero = Schemas['HomeHero'];
export type HomeStory = Schemas['HomeStory'];
export type HomeWhyUs = Schemas['HomeWhyUs'];
export type HomeWhyUsItem = Schemas['HomeWhyUsItem'];
export type HomePageContent = Schemas['HomePageContent'];
export type HomePageContentInput = Schemas['HomePageContentInput'];
export type AboutPageContent = Schemas['AboutPageContent'];
export type AboutPageContentInput = Schemas['AboutPageContentInput'];
export type RichTextPageContent = Schemas['RichTextPageContent'];
export type RichTextPageContentInput = Schemas['RichTextPageContentInput'];
export type AdminHomePage = Schemas['AdminHomePageResponse'];
export type AdminAboutPage = Schemas['AdminAboutPageResponse'];
export type AdminRichTextPage = Schemas['AdminRichTextPageResponse'];
export type SaveHomePageRequest = Schemas['SaveHomePageRequest'];
export type SaveAboutPageRequest = Schemas['SaveAboutPageRequest'];
export type SaveRichTextPageRequest = Schemas['SaveRichTextPageRequest'];
/** Public CMS pages (`GET /content/pages/{key}`, 404 while the page is empty). */
export type HomePage = Schemas['HomePageResponse'];
export type AboutPage = Schemas['AboutPageResponse'];
export type RichTextPage = Schemas['RichTextPageResponse'];

export type AdminFaqItem = Schemas['AdminFaqItemResponse'];
export type AdminFaqList = Schemas['AdminFaqListResponse'];
export type SaveFaqItemRequest = Schemas['SaveFaqItemRequest'];
export type ReorderFaqRequest = Schemas['ReorderFaqRequest'];
export type AdminTestimonial = Schemas['AdminTestimonialResponse'];
export type AdminTestimonialList = Schemas['AdminTestimonialListResponse'];
export type SaveTestimonialRequest = Schemas['SaveTestimonialRequest'];

export type NewsletterSubscriberStatus = Schemas['NewsletterSubscriberStatus'];
export type AdminSubscriber = Schemas['AdminSubscriberItem'];
export type AdminSubscriberList = Schemas['AdminSubscriberListResponse'];

export type AdminContactMessage = Schemas['AdminContactMessageItem'];
export type AdminContactMessageList = Schemas['AdminContactMessageListResponse'];

export type StoreLogo = Schemas['StoreLogo'];

export type AdminUser = Schemas['AdminUserResponse'];
export type AdminUserList = Schemas['AdminUserListResponse'];
export type InviteAdminRequest = Schemas['InviteAdminRequest'];
export type UpdateAdminRequest = Schemas['UpdateAdminRequest'];

export type AuditLogItem = Schemas['AuditLogItem'];
export type AuditFilterOption = Schemas['AuditFilterOption'];
export type AuditLogFilters = Schemas['AuditLogFiltersResponse'];

/** Public content for the storefront (Phase 7). */
export type PublicBlogCategory = Schemas['PublicBlogCategory'];
export type PublicBlogCategoryList = Schemas['PublicBlogCategoryListResponse'];
export type PublicBlogCategoryRef = Schemas['PublicBlogCategoryRef'];
export type PublicBlogPostListItem = Schemas['PublicBlogPostListItem'];
export type PublicBlogPost = Schemas['PublicBlogPostResponse'];
export type LatestBlogPosts = Schemas['LatestBlogPostsResponse'];
export type PublicFaqItem = Schemas['PublicFaqItem'];
export type PublicFaq = Schemas['PublicFaqResponse'];
export type PublicTestimonial = Schemas['PublicTestimonial'];
export type PublicTestimonials = Schemas['PublicTestimonialsResponse'];
export type NewsletterSubscribeRequest = Schemas['NewsletterSubscribeRequest'];
export type NewsletterTokenRequest = Schemas['NewsletterTokenRequest'];
export type NewsletterStatus = Schemas['NewsletterStatusResponse'];
export type ContactRequest = Schemas['ContactRequest'];
export type FormAccepted = Schemas['FormAcceptedResponse'];
