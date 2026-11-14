import {
  AdminCategory,
  AdminOrderDetail,
  AdminProduct,
  Courier,
  InventoryItem,
} from '@zladovce/models';

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

export const ORDER_ID = '33333333-3333-4333-8333-333333333333';
export const COURIER: Courier = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Brza pošta',
  trackingUrlTemplate: 'https://brza.example/pracenje?broj={trackingNumber}',
  isActive: true,
  sortOrder: 0,
  createdAt: '2026-11-14T10:00:00Z',
  updatedAt: '2026-11-14T10:00:00Z',
};

/** A new order (Received) as `GET /admin/orders/{id}` returns it. */
export function orderDetail(overrides: Partial<AdminOrderDetail> = {}): AdminOrderDetail {
  return {
    id: ORDER_ID,
    orderNumber: 'ZLD-2026-000042',
    status: 'Received',
    placedAt: '2026-11-10T09:30:00Z',
    updatedAt: '2026-11-10T09:30:00Z',
    version: 5,
    customer: {
      customerId: '55555555-5555-4555-8555-555555555555',
      firstName: 'Milica',
      lastName: 'Petrović',
      email: 'milica@primer.rs',
      phone: '+381641234567',
    },
    shippingAddress: { city: 'Niš', street: 'Kralja Petra 12', postalCode: '18000' },
    deliveryNote: 'Interfon 4',
    paymentMethod: 'CashOnDelivery',
    items: [
      {
        id: '66666666-6666-4666-8666-666666666666',
        variantId: PRODUCT.variants[0]!.id,
        productName: 'Džem od šljiva',
        variantName: '370 g',
        sku: 'DZEM-SLJIVA-370G',
        unitPrice: 650,
        quantity: 2,
        lineTotal: 1300,
      },
    ],
    subtotal: 1300,
    shippingPrice: 350,
    total: 1650,
    currency: 'RSD',
    payment: { collectedAmount: null, collectedAt: null, isCollected: false, canRecord: false },
    timeline: [
      {
        id: '77777777-7777-4777-8777-777777777777',
        previousStatus: null,
        newStatus: 'Received',
        changedByAdminId: null,
        changedByAdminName: null,
        internalNote: null,
        customerMessage: null,
        createdAt: '2026-11-10T09:30:00Z',
      },
    ],
    notes: [],
    shipments: [],
    allowedNextStatuses: [
      {
        status: 'Accepted',
        requiresShipment: false,
        stockReturn: 'None',
        requiresRestockChoice: false,
      },
      {
        status: 'Rejected',
        requiresShipment: false,
        stockReturn: 'Automatic',
        requiresRestockChoice: false,
      },
      {
        status: 'Cancelled',
        requiresShipment: false,
        stockReturn: 'Automatic',
        requiresRestockChoice: false,
      },
    ],
    ...overrides,
  };
}
