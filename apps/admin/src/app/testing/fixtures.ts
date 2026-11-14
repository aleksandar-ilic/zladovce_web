import { AdminCategory, AdminProduct, InventoryItem } from '@zladovce/models';

/** Test data shared by the admin specs (shaped like real API responses). */
export const PRODUCT: AdminProduct = {
  id: '11111111-1111-4111-8111-111111111111',
  category: { id: '22222222-2222-4222-8222-222222222222', name: 'Džemovi' },
  name: 'Džem od šljiva',
  slug: 'dzem-od-sljiva',
  shortDescription: 'Domaći džem.',
  description: '<p>Kuvan polako.</p>',
  sku: 'DZEM-SLJIVA',
  isActive: true,
  isFeatured: false,
  isArchived: false,
  seoTitle: null,
  seoDescription: null,
  variants: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: '370 g',
      sku: 'DZEM-SLJIVA-370G',
      unitAmount: 370,
      measurementUnit: 'g',
      regularPrice: 650,
      discountPrice: null,
      effectivePrice: 650,
      isActive: true,
      sortOrder: 0,
      quantityOnHand: 12,
      lowStockThreshold: 3,
      stockStatus: 'ok',
      createdAt: '2026-11-14T10:00:00Z',
      updatedAt: '2026-11-14T10:00:00Z',
    },
  ],
  images: [],
  version: 101,
  createdAt: '2026-11-14T10:00:00Z',
  updatedAt: '2026-11-14T10:00:00Z',
  archivedAt: null,
};

export const CATEGORY: AdminCategory = {
  id: PRODUCT.category.id,
  name: 'Džemovi',
  slug: 'dzemovi',
  description: null,
  image: null,
  sortOrder: 0,
  isActive: true,
  seoTitle: null,
  seoDescription: null,
  productCount: 1,
  createdAt: '2026-11-14T10:00:00Z',
  updatedAt: '2026-11-14T10:00:00Z',
};

export const INVENTORY_ITEM: InventoryItem = {
  variantId: PRODUCT.variants[0]!.id,
  productId: PRODUCT.id,
  productName: PRODUCT.name,
  variantName: '370 g',
  sku: 'DZEM-SLJIVA-370G',
  quantityOnHand: 12,
  lowStockThreshold: 3,
  status: 'ok',
  isActive: true,
  updatedAt: '2026-11-14T10:00:00Z',
};
