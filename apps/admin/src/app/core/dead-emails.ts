import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { map } from 'rxjs';
import { EmailsApi } from '../data/emails-api';
import { BADGE_REFRESH_MS, Poller } from './polling';

/**
 * Number of customer emails that could not be sent (status Dead) for the "E-poruke" badge and
 * the dashboard warning: `GET /admin/emails?status=Dead&pageSize=1` → `totalItems`. Uses the same
 * `Poller` as the orders badge (every minute, after navigation, requests never overlap).
 */
@Injectable({ providedIn: 'root' })
export class DeadEmailsStore {
  private readonly api = inject(EmailsApi);
  private readonly state = signal<number | null>(null);
  private readonly poller = new Poller(
    () =>
      this.api
        .list({ status: ['Dead'], page: 1, pageSize: 1 })
        .pipe(map((page) => page.totalItems)),
    (count) => this.state.set(count),
    BADGE_REFRESH_MS,
  );

  /** null until the first answer. */
  readonly count = this.state.asReadonly();
  readonly hasDead = computed(() => (this.state() ?? 0) > 0);

  start(destroyRef: DestroyRef): void {
    this.poller.start(destroyRef);
  }

  refresh(force = false): void {
    this.poller.refresh(force);
  }
}
