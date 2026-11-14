import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { OrderStatus } from '@zladovce/models';
import { ORDER_STATUS_LABELS } from '@zladovce/shared';

/** One colour per status, so the list can be read at a glance. */
export const ORDER_STATUS_CLASSES: Record<OrderStatus, string> = {
  Received: 'bg-warning-50 text-warning-700 ring-1 ring-warning-700/30',
  Accepted: 'bg-sage-100 text-sage-700',
  Preparing: 'bg-olive-100 text-olive-800',
  Shipped: 'bg-earth-100 text-earth-700',
  Delivered: 'bg-olive-700 text-white',
  DeliveryFailed: 'bg-danger-50 text-danger-700 ring-1 ring-danger-600/30',
  Cancelled: 'bg-cream-200 text-ink-700',
  Rejected: 'bg-ink-700 text-white',
};

/** `<adm-order-status-badge status="Received" />` → "Primljena" in its own colour. */
@Component({
  selector: 'adm-order-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()', '[attr.data-status]': 'status()' },
  template: `{{ label() }}`,
})
export class OrderStatusBadge {
  readonly status = input.required<OrderStatus>();
  protected readonly label = computed(() => ORDER_STATUS_LABELS[this.status()] ?? this.status());
  protected readonly classes = computed(
    () =>
      `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${ORDER_STATUS_CLASSES[this.status()] ?? ''}`,
  );
}
