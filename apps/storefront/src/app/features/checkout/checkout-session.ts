import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { PlacedOrder } from '@zladovce/models';

/** Keys in `sessionStorage` (this tab only; gone when the tab is closed). Nothing goes to localStorage. */
export const CHECKOUT_KEY_STORAGE = 'zladovce.checkout.key';
export const CHECKOUT_DRAFT_STORAGE = 'zladovce.checkout.draft.v1';
export const CONFIRMATION_STORAGE = 'zladovce.order.confirmation.v1';

/** What the customer typed, kept so going back to the cart (or a reload) does not lose it. */
export interface CheckoutDraft {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  street: string;
  postalCode: string;
  deliveryNote: string;
}

const DRAFT_FIELDS: readonly (keyof CheckoutDraft)[] = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'city',
  'street',
  'postalCode',
  'deliveryNote',
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 4122 version 4 UUID; `crypto.randomUUID` where available, else built from random bytes. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Accepts only a well-formed stored confirmation (never throws on foreign data). */
export function readPlacedOrder(raw: unknown): PlacedOrder | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const order = raw as Partial<PlacedOrder>;
  return typeof order.orderNumber === 'string' &&
    typeof order.placedAt === 'string' &&
    Array.isArray(order.items) &&
    typeof order.total === 'number' &&
    typeof order.subtotal === 'number' &&
    typeof order.shippingPrice === 'number'
    ? {
        ...(order as PlacedOrder),
        trackingCode: typeof order.trackingCode === 'string' ? order.trackingCode : null,
      }
    : null;
}

/**
 * Per-tab checkout state in `sessionStorage`:
 *
 * - **Idempotency key.** One UUID per checkout submission. It is created when the checkout opens
 *   (or taken from storage, so a reload after a lost response repeats the same submission and the
 *   API answers with the order already placed instead of creating a second one). The same key is
 *   sent on every retry, also after a 400/409/429; a new key is made only after a successful order
 *   (or when the API reports the key as used for different content).
 * - **Draft** of the contact form, so going back to the cart does not lose what was typed;
 *   removed after a successful order.
 * - **Confirmation** of the last order with its tracking code, so the confirmation page survives a
 *   reload in the same tab. The code is never written to localStorage: it would outlive the tab
 *   and stay readable for anyone using the same browser later.
 *
 * On the server (and when storage is blocked) everything is kept in memory only.
 */
@Injectable({ providedIn: 'root' })
export class CheckoutSession {
  private readonly storage = this.resolveStorage();
  private memoryKey: string | null = null;

  /** The key of the current submission (created on first use). */
  idempotencyKey(): string {
    const stored = this.read(CHECKOUT_KEY_STORAGE);
    if (stored && UUID.test(stored)) {
      this.memoryKey = stored;
      return stored;
    }
    if (this.memoryKey && UUID.test(this.memoryKey)) {
      return this.memoryKey;
    }
    return this.renewKey();
  }

  /** Starts a new submission (after a successful order). */
  renewKey(): string {
    this.memoryKey = newIdempotencyKey();
    this.write(CHECKOUT_KEY_STORAGE, this.memoryKey);
    return this.memoryKey;
  }

  readDraft(): Partial<CheckoutDraft> {
    const parsed = this.readJson(CHECKOUT_DRAFT_STORAGE);
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    const draft: Partial<CheckoutDraft> = {};
    for (const field of DRAFT_FIELDS) {
      const value: unknown = (parsed as Record<string, unknown>)[field];
      if (typeof value === 'string') {
        draft[field] = value.slice(0, 600);
      }
    }
    return draft;
  }

  saveDraft(draft: CheckoutDraft): void {
    const values = DRAFT_FIELDS.map((field) => draft[field] ?? '');
    if (values.every((value) => value.trim() === '')) {
      this.remove(CHECKOUT_DRAFT_STORAGE);
      return;
    }
    this.write(CHECKOUT_DRAFT_STORAGE, JSON.stringify(draft));
  }

  clearDraft(): void {
    this.remove(CHECKOUT_DRAFT_STORAGE);
  }

  /**
   * Keeps the confirmation, including the tracking code, in this tab's sessionStorage only. A
   * repeated submission answers 200 with `trackingCode: null` (the code is shown once); the
   * code already stored for the same order is then kept.
   */
  saveConfirmation(order: PlacedOrder): void {
    const previous = this.readConfirmation();
    const trackingCode =
      order.trackingCode ??
      (previous?.orderNumber === order.orderNumber ? previous.trackingCode : null) ??
      null;
    this.write(CONFIRMATION_STORAGE, JSON.stringify({ ...order, trackingCode }));
  }

  readConfirmation(): PlacedOrder | null {
    return readPlacedOrder(this.readJson(CONFIRMATION_STORAGE));
  }

  private readJson(key: string): unknown {
    const raw = this.read(key);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      // Storage full or blocked: the checkout keeps working with the in-memory key.
    }
  }

  private remove(key: string): void {
    try {
      this.storage?.removeItem(key);
    } catch {
      // ignore
    }
  }

  private resolveStorage(): Storage | null {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return null;
    }
    try {
      return globalThis.sessionStorage ?? null;
    } catch {
      return null;
    }
  }
}
