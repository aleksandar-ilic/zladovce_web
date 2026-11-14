import { isPlatformBrowser } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

/** One cart line. Prices are never stored: the backend prices the cart through the quote endpoint. */
export interface CartLine {
  variantId: string;
  quantity: number;
}

interface StoredCart {
  version: number;
  lines: CartLine[];
}

export const CART_STORAGE_VERSION = 1;
/** Versioned key: a breaking change of the stored shape gets a new key and old data is ignored. */
export const CART_STORAGE_KEY = `zladovce.cart.v${CART_STORAGE_VERSION}`;
export const CART_MAX_LINE_QUANTITY = 99;

function normaliseQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(Math.trunc(value), 0), CART_MAX_LINE_QUANTITY);
}

/** Accepts only well-formed lines; merges duplicates; never throws on foreign or corrupted data. */
function sanitiseLines(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const byVariant = new Map<string, number>();
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const { variantId, quantity } = item as Record<string, unknown>;
    const normalised = normaliseQuantity(quantity);
    if (typeof variantId !== 'string' || variantId === '' || normalised === 0) {
      continue;
    }
    byVariant.set(
      variantId,
      Math.min((byVariant.get(variantId) ?? 0) + normalised, CART_MAX_LINE_QUANTITY),
    );
  }
  return [...byVariant].map(([variantId, quantity]) => ({ variantId, quantity }));
}

function parseStored(json: string | null): CartLine[] {
  if (!json) {
    return [];
  }
  try {
    const stored = JSON.parse(json) as Partial<StoredCart> | null;
    return stored?.version === CART_STORAGE_VERSION ? sanitiseLines(stored.lines) : [];
  } catch {
    return [];
  }
}

/**
 * Guest cart (ARCHITECTURE.md A2 #6, A5): `{variantId, quantity}` lines kept in `localStorage`
 * and synchronised between tabs through the `storage` event.
 *
 * On the server (prerender) and when storage is unavailable (private mode, blocked cookies)
 * the store works in memory and starts empty.
 */
@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly storage = this.resolveStorage();
  private readonly state = signal<readonly CartLine[]>([]);

  /** Lines in the order they were added. */
  readonly lines = this.state.asReadonly();
  /** Number of distinct variants. */
  readonly lineCount = computed(() => this.state().length);
  /** Sum of all quantities – the number shown next to the cart icon. */
  readonly totalQuantity = computed(() => this.state().reduce((sum, l) => sum + l.quantity, 0));
  readonly isEmpty = computed(() => this.state().length === 0);

  constructor() {
    if (!this.storage) {
      return;
    }
    this.state.set(this.read());

    const view = typeof window !== 'undefined' ? window : null;
    if (view) {
      const onStorage = (event: StorageEvent): void => {
        // key === null means the whole storage was cleared in another tab.
        if (event.key === CART_STORAGE_KEY || event.key === null) {
          this.state.set(this.read());
        }
      };
      view.addEventListener('storage', onStorage);
      inject(DestroyRef).onDestroy(() => view.removeEventListener('storage', onStorage));
    }
  }

  /** Quantity of a variant in the cart (0 when absent). */
  quantityOf(variantId: string): number {
    return this.state().find((l) => l.variantId === variantId)?.quantity ?? 0;
  }

  /** Adds `quantity` (default 1) of a variant, increasing an existing line. */
  add(variantId: string, quantity = 1): void {
    const amount = normaliseQuantity(quantity);
    if (!variantId || amount === 0) {
      return;
    }
    this.setQuantity(variantId, this.quantityOf(variantId) + amount);
  }

  /** Sets the quantity of a variant; 0 or less removes the line. Capped at CART_MAX_LINE_QUANTITY. */
  setQuantity(variantId: string, quantity: number): void {
    if (!variantId) {
      return;
    }
    const amount = normaliseQuantity(quantity);
    if (amount === 0) {
      this.remove(variantId);
      return;
    }
    const lines = this.state();
    const exists = lines.some((l) => l.variantId === variantId);
    this.commit(
      exists
        ? lines.map((l) => (l.variantId === variantId ? { variantId, quantity: amount } : l))
        : [...lines, { variantId, quantity: amount }],
    );
  }

  remove(variantId: string): void {
    const lines = this.state();
    if (lines.some((l) => l.variantId === variantId)) {
      this.commit(lines.filter((l) => l.variantId !== variantId));
    }
  }

  clear(): void {
    if (this.state().length > 0) {
      this.commit([]);
    }
  }

  private commit(lines: CartLine[]): void {
    this.state.set(lines);
    if (!this.storage) {
      return;
    }
    try {
      if (lines.length === 0) {
        this.storage.removeItem(CART_STORAGE_KEY);
      } else {
        const stored: StoredCart = { version: CART_STORAGE_VERSION, lines };
        this.storage.setItem(CART_STORAGE_KEY, JSON.stringify(stored));
      }
    } catch {
      // Quota exceeded or storage disabled mid-session: the cart keeps working in memory.
    }
  }

  private read(): CartLine[] {
    try {
      return parseStored(this.storage?.getItem(CART_STORAGE_KEY) ?? null);
    } catch {
      return [];
    }
  }

  private resolveStorage(): Storage | null {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return null;
    }
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }
}
