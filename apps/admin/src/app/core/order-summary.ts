import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { OrderStatus, OrderSummary } from '@zladovce/models';
import { OPEN_ORDER_STATUSES } from '@zladovce/shared';
import { OrdersApi } from '../data/orders-api';
import { BADGE_REFRESH_MS, Poller } from './polling';

/** How often the menu badge asks for new orders. */
export const SUMMARY_REFRESH_MS = BADGE_REFRESH_MS;

/** Count of one status in a summary (0 when missing). */
export function countOf(summary: OrderSummary | null, status: OrderStatus): number {
  return summary?.counts.find((c) => c.status === status)?.count ?? 0;
}

/** Received + Accepted + Preparing: orders the shop still has to work on. */
export function openCount(summary: OrderSummary | null): number {
  return OPEN_ORDER_STATUSES.reduce((sum, status) => sum + countOf(summary, status), 0);
}

/**
 * Number of orders per status (`GET /admin/orders/summary`), shared by the menu badge
 * ("Porudžbine" shows the new, Received ones), the dashboard card and the list tabs.
 * Refreshed by the shared `Poller` (every minute and after every navigation, never two requests
 * at once); pages that change an order call `refresh(true)`.
 */
@Injectable({ providedIn: 'root' })
export class OrderSummaryStore {
  private readonly api = inject(OrdersApi);
  private readonly state = signal<OrderSummary | null>(null);
  private readonly poller = new Poller(
    () => this.api.summary(),
    (summary) => this.state.set(summary),
    SUMMARY_REFRESH_MS,
  );

  readonly summary = this.state.asReadonly();
  readonly received = computed(() => countOf(this.state(), 'Received'));
  readonly open = computed(() => openCount(this.state()));

  /** Periodic refresh and refresh on navigation, for as long as `destroyRef` lives. */
  start(destroyRef: DestroyRef): void {
    this.poller.start(destroyRef);
  }

  /** Loads the numbers again (see `Poller.refresh`). */
  refresh(force = false): void {
    this.poller.refresh(force);
  }
}
