import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { OrderStatus, OrderSummary } from '@zladovce/models';
import { OPEN_ORDER_STATUSES } from '@zladovce/shared';
import { filter, Subscription, timer } from 'rxjs';
import { OrdersApi } from '../data/orders-api';

/** How often the menu badge asks for new orders. */
export const SUMMARY_REFRESH_MS = 60_000;

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
 * `start()` (the shell) refreshes it every minute and after every navigation; pages that
 * change an order call `refresh()`. A failed refresh keeps the last known numbers.
 */
@Injectable({ providedIn: 'root' })
export class OrderSummaryStore {
  private readonly api = inject(OrdersApi);
  private readonly router = inject(Router);
  private readonly state = signal<OrderSummary | null>(null);
  private request: Subscription | null = null;
  private inFlight = false;
  private again = false;
  private lastRequestAt = 0;
  private started = false;

  readonly summary = this.state.asReadonly();
  readonly received = computed(() => countOf(this.state(), 'Received'));
  readonly open = computed(() => openCount(this.state()));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
  }

  /** Periodic refresh and refresh on navigation, for as long as `destroyRef` lives. */
  start(destroyRef: DestroyRef): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.refresh(true);
    const ticks = timer(SUMMARY_REFRESH_MS, SUMMARY_REFRESH_MS).subscribe(() => this.refresh(true));
    const navigations = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.refresh());
    destroyRef.onDestroy(() => {
      ticks.unsubscribe();
      navigations.unsubscribe();
      this.started = false;
    });
  }

  /**
   * Loads the numbers again. Requests never overlap: a refresh asked for while one is running
   * follows right after it. Without `force` (navigation) a refresh within 2 s of the last is skipped.
   */
  refresh(force = false): void {
    if (this.inFlight) {
      this.again = this.again || force;
      return;
    }
    if (!force && Date.now() - this.lastRequestAt < 2000) {
      return;
    }
    this.inFlight = true;
    this.lastRequestAt = Date.now();
    const done = () => {
      this.inFlight = false;
      if (this.again) {
        this.again = false;
        this.refresh(true);
      }
    };
    this.request = this.api.summary().subscribe({
      next: (summary) => {
        this.state.set(summary);
        done();
      },
      // Keep the last numbers; the next tick tries again.
      error: () => done(),
    });
  }
}
