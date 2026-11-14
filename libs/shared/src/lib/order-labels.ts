import { OrderStatus, StockReturnPolicy } from '@zladovce/models';

/** Serbian status names (PROJECT_SPECIFICATION.md §8). */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  Received: 'Primljena',
  Accepted: 'Prihvaćena',
  Preparing: 'U pripremi',
  Shipped: 'Poslata',
  Delivered: 'Isporučena',
  Cancelled: 'Otkazana',
  Rejected: 'Odbijena',
  DeliveryFailed: 'Neuspešna isporuka',
};

/** Every status in the order of the order's life (filters, summaries). */
export const ORDER_STATUSES: readonly OrderStatus[] = [
  'Received',
  'Accepted',
  'Preparing',
  'Shipped',
  'DeliveryFailed',
  'Delivered',
  'Cancelled',
  'Rejected',
];

/** Statuses that still need work from the shop ("Za obradu"). */
export const OPEN_ORDER_STATUSES: readonly OrderStatus[] = ['Received', 'Accepted', 'Preparing'];

/** Final statuses: nothing can follow them. */
export const FINAL_ORDER_STATUSES: readonly OrderStatus[] = ['Delivered', 'Cancelled', 'Rejected'];

export function orderStatusLabel(status: OrderStatus | null | undefined): string {
  return status ? (ORDER_STATUS_LABELS[status] ?? status) : '';
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** What happens to the stock when an order moves to a status, in plain words. */
export const STOCK_RETURN_TEXT: Record<StockReturnPolicy, string> = {
  None: 'Stanje zaliha se ne menja.',
  Automatic: 'Proizvodi iz porudžbine se automatski vraćaju na stanje.',
  AdminChoice: 'Vi birate da li se proizvodi vraćaju na stanje.',
};

/** "Plaćanje pouzećem" – the only payment method. */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CashOnDelivery: 'Plaćanje pouzećem',
};

export function paymentMethodLabel(method: string | null | undefined): string {
  return method ? (PAYMENT_METHOD_LABELS[method] ?? method) : '';
}
