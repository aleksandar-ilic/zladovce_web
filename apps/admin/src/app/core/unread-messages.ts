import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { map } from 'rxjs';
import { ContactMessagesApi } from '../data/people-api';
import { BADGE_REFRESH_MS, Poller } from './polling';

/**
 * Unread contact-form messages for the "Poruke" badge:
 * `GET /admin/contact-messages?unreadOnly=true&pageSize=1` → `unreadCount`. Same `Poller` as the
 * other badges (every minute, after navigation, requests never overlap).
 */
@Injectable({ providedIn: 'root' })
export class UnreadMessagesStore {
  private readonly api = inject(ContactMessagesApi);
  private readonly state = signal<number | null>(null);
  private readonly poller = new Poller(
    () =>
      this.api
        .list({ unreadOnly: true, page: 1, pageSize: 1 })
        .pipe(map((response) => response.unreadCount)),
    (count) => this.state.set(count),
    BADGE_REFRESH_MS,
  );

  /** null until the first answer. */
  readonly count = this.state.asReadonly();

  start(destroyRef: DestroyRef): void {
    this.poller.start(destroyRef);
  }

  refresh(force = false): void {
    this.poller.refresh(force);
  }

  /** Sets the number right away (from a list response), without waiting for the next tick. */
  set(count: number): void {
    this.state.set(count);
  }
}
