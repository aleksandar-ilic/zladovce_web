import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, Provider } from '@angular/core';
import { apiErrorInterceptor, provideAppConfig } from '@zladovce/api';
import {
  CartQuote,
  CartQuoteLine,
  Paged,
  PublicCategory,
  PublicCategoryDetail,
  PublicImage,
  PublicProduct,
  PublicProductListItem,
  PublicStore,
} from '@zladovce/models';
import { SITE_URL } from '../core/site-url';

export const API = 'http://localhost:5080/api/v1';
export const SITE = 'https://zladovce.test';

/** API config, HttpClient with the error interceptor and the testing backend, fixed site URL. */
export function testProviders(): (Provider | EnvironmentProviders)[] {
  return [
    provideAppConfig({ apiBaseUrl: API, healthUrl: 'http://localhost:5080/health' }),
    provideHttpClient(withInterceptors([apiErrorInterceptor])),
    provideHttpClientTesting(),
    { provide: SITE_URL, useValue: SITE },
  ];
}

export const IMAGE: PublicImage = {
  baseUrl: 'http://localhost:9000/media/products/img-1',
  widths: [400, 800, 1600],
  width: 1600,
  height: 2000,
  altText: 'Tegla džema od šljiva',
};

export const CATEGORY: PublicCategory = {
  id: 'c0000000-0000-4000-8000-000000000001',
  name: 'Džemovi',
  slug: 'dzemovi-proba',
  description: 'Domaći džemovi.',
  image: null,
  productCount: 2,
};

export const CATEGORY_DETAIL: PublicCategoryDetail = {
  ...CATEGORY,
  seo: { title: null, description: null },
};

export const VARIANT_370 = {
  id: 'v0000000-0000-4000-8000-000000000370',
  name: '370 g',
  sku: 'DZ-SLJ-370',
  unitAmount: 370,
  measurementUnit: 'g' as const,
  price: 590,
  regularPrice: 650,
  discountPrice: 590,
  inStock: true,
  maxOrderQuantity: 5,
};

export const VARIANT_720 = {
  id: 'v0000000-0000-4000-8000-000000000720',
  name: '720 g',
  sku: 'DZ-SLJ-720',
  unitAmount: 720,
  measurementUnit: 'g' as const,
  price: 1100,
  regularPrice: 1100,
  discountPrice: null,
  inStock: false,
  maxOrderQuantity: 0,
};

export const PRODUCT: PublicProduct = {
  id: 'p0000000-0000-4000-8000-000000000001',
  name: 'Džem od šljiva',
  slug: 'dzem-od-sljiva-proba',
  shortDescription: 'Gust domaći džem.',
  description: '<p>Kuvan polako.</p><script>alert(1)</script>',
  category: { name: 'Džemovi', slug: 'dzemovi-proba' },
  isFeatured: true,
  price: 590,
  originalPrice: 650,
  hasPriceRange: true,
  inStock: true,
  variants: [VARIANT_370, VARIANT_720],
  images: [
    IMAGE,
    { ...IMAGE, baseUrl: 'http://localhost:9000/media/products/img-2', altText: null },
  ],
  seo: { title: null, description: null },
  updatedAt: '2026-11-14T10:00:00Z',
};

export function listItem(overrides: Partial<PublicProductListItem> = {}): PublicProductListItem {
  return {
    id: PRODUCT.id,
    name: PRODUCT.name,
    slug: PRODUCT.slug,
    shortDescription: PRODUCT.shortDescription,
    category: PRODUCT.category,
    isFeatured: true,
    price: 590,
    originalPrice: 650,
    hasPriceRange: true,
    inStock: true,
    image: IMAGE,
    ...overrides,
  };
}

export function paged<T>(items: T[], page = 1, pageSize = 12, totalItems = items.length): Paged<T> {
  return { items, page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) };
}

export const STORE: PublicStore = {
  storeName: 'Zladovce',
  logoKey: null,
  logo: null,
  contact: { email: null, phone: null, address: null },
  social: { facebookUrl: null, instagramUrl: null, otherLinks: [] },
  shipping: {
    enabled: true,
    price: 0,
    freeShippingThreshold: null,
    minOrderAmount: null,
    estimatedDeliveryText: null,
    deliveryInfo: null,
  },
  seo: { defaultTitle: null, defaultDescription: null },
};

export function quoteLine(overrides: Partial<CartQuoteLine> = {}): CartQuoteLine {
  return {
    variantId: VARIANT_370.id,
    productId: PRODUCT.id,
    productName: 'Džem od šljiva',
    productSlug: PRODUCT.slug,
    variantName: '370 g',
    sku: 'DZ-SLJ-370',
    unitAmount: 370,
    measurementUnit: 'g',
    image: IMAGE,
    unitPrice: 590,
    regularPrice: 650,
    discountPrice: 590,
    requestedQuantity: 2,
    quantity: 2,
    lineTotal: 1180,
    maxOrderQuantity: 5,
    ...overrides,
  };
}

export function quote(lines: CartQuoteLine[], overrides: Partial<CartQuote> = {}): CartQuote {
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  return {
    lines,
    adjustments: [],
    subtotal,
    shipping: {
      enabled: true,
      price: 350,
      basePrice: 350,
      freeShippingThreshold: 5000,
      isFree: false,
      amountUntilFreeShipping: 5000 - subtotal,
    },
    minOrderAmount: null,
    meetsMinimumOrder: true,
    amountUntilMinimumOrder: null,
    total: subtotal + 350,
    canCheckout: true,
    currency: 'RSD',
    ...overrides,
  };
}

/** Replaces the non-breaking spaces of formatted amounts (`1.200 RSD`) with spaces. */
export const nb = (value: string | null | undefined): string =>
  (value ?? '').replace(/\u00a0/g, ' ');

export const text = (element: Element | null | undefined): string =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** Lets signals, effects, microtasks and change detection settle (zoneless). */
export async function settle(detect: () => void, rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    detect();
  }
}
