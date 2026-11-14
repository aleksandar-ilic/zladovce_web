import { DestroyRef, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Observable, Subscription, timer } from 'rxjs';

/** How often the menu badges ask for new numbers. */
export const BADGE_REFRESH_MS = 60_000;

/**
 * One periodically refreshed value (menu badges, dashboard cards). `start()` (the shell)
 * refreshes every minute and after every navigation; pages that change the data call
 * `refresh(true)`. Requests never overlap: a refresh asked for while one is running follows right
 * after it. Without `force` (navigation) a refresh within 2 s of the last one is skipped. A failed
 * refresh keeps the last value; the next tick tries again.
 *
 * Create it in an injection context (it registers its own cleanup).
 */
export class Poller<T> {
  private readonly router = inject(Router);
  private request: Subscription | null = null;
  private inFlight = false;
  private again = false;
  private lastRequestAt = 0;
  private started = false;

  constructor(
    private readonly load: () => Observable<T>,
    private readonly onValue: (value: T) => void,
    private readonly intervalMs = BADGE_REFRESH_MS,
  ) {
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
  }

  start(destroyRef: DestroyRef): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.refresh(true);
    const ticks = timer(this.intervalMs, this.intervalMs).subscribe(() => this.refresh(true));
    const navigations = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.refresh());
    destroyRef.onDestroy(() => {
      ticks.unsubscribe();
      navigations.unsubscribe();
      this.started = false;
    });
  }

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
    this.request = this.load().subscribe({
      next: (value) => {
        this.onValue(value);
        done();
      },
      error: () => done(),
    });
  }
}
