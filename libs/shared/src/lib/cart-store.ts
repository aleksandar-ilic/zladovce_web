import { isPlatformBrowser } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

/**
 * One cart line. Prices are never trusted from here: the backend prices the cart through the
 * quote endpoint. `knownUnitPrice` is the `unitPrice` of the last quote (or of the product page
 * when the line was added); the next quote sends it back so the API can report a price change.
 * `label` ("Džem od šljiva, 370 g") only lets the cart name a product that has disappeared.
 */
export interface CartLine {
  variantId: string;
  quantity: number;
  knownUnitPrice?: number;
  label?: string;
}

interface StoredCart {
  version: number;
  lines: CartLine[];
}

export const CART_STORAGE_VERSION = 2;
/** Versioned key: a breaking change of the stored shape gets a new key (and a migration). */
export const CART_STORAGE_KEY = `zladovce.cart.v${CART_STORAGE_VERSION}`;
/** Phase 2 shape `{ version: 1, lines: [{ variantId, quantity }] }`; migrated once, then removed. */
export const CART_LEGACY_STORAGE_KEY = 'zladovce.cart.v1';
/** Same limits as `POST /cart/quote`: 1–99 per line, at most 50 lines. */
export const CART_MAX_LINE_QUANTITY = 99;
export const CART_MAX_LINES = 50;
const MAX_LABEL_LENGTH = 200;

/** What `add` did. `added` is the quantity actually added (0 when nothing could be added). */
export interface CartAddResult {
  added: number;
  /** Why less than requested was added: the line limit, or the per-line / per-variant maximum. */
  limitedBy?: 'lines' | 'quantity';
}

export interface CartLineDetails {
  knownUnitPrice?: number | null;
  label?: string | null;
  /** Upper bound for the line, e.g. `maxOrderQuantity` of the variant (never above 99). */
  maxQuantity?: number;
}

function normaliseQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(Math.trunc(value), 0), CART_MAX_LINE_QUANTITY);
}

function normalisePrice(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normaliseLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim().slice(0, MAX_LABEL_LENGTH);
  return trimmed === '' ? undefined : trimmed;
}

function line(
  variantId: string,
  quantity: number,
  knownUnitPrice: number | undefined,
  label: string | undefined,
): CartLine {
  const result: CartLine = { variantId, quantity };
  if (knownUnitPrice !== undefined) {
    result.knownUnitPrice = knownUnitPrice;
  }
  if (label !== undefined) {
    result.label = label;
  }
  return result;
}

/**
 * Accepts only well-formed lines; merges duplicates (first price and label win); keeps at most
 * CART_MAX_LINES lines; never throws on foreign or corrupted data.
 */
export function sanitiseCartLines(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const byVariant = new Map<string, CartLine>();
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const { variantId, quantity, knownUnitPrice, label } = item as Record<string, unknown>;
    const amount = normaliseQuantity(quantity);
    if (typeof variantId !== 'string' || variantId === '' || amount === 0) {
      continue;
    }
    const existing = byVariant.get(variantId);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + amount, CART_MAX_LINE_QUANTITY);
      continue;
    }
    if (byVariant.size >= CART_MAX_LINES) {
      continue;
    }
    byVariant.set(
      variantId,
      line(variantId, amount, normalisePrice(knownUnitPrice), normaliseLabel(label)),
    );
  }
  return [...byVariant.values()];
}

function parseStored(json: string | null, version: number): CartLine[] | null {
  if (!json) {
    return null;
  }
  try {
    const stored = JSON.parse(json) as Partial<StoredCart> | null;
    return stored?.version === version ? sanitiseCartLines(stored.lines) : [];
  } catch {
    return [];
  }
}

/**
 * Guest cart (ARCHITECTURE.md A2 #6, A5): lines kept in `localStorage` under a versioned key
 * and synchronised between tabs through the `storage` event. A Phase 2 cart (`…cart.v1`) is
 * migrated on first read.
 *
 * Limits: 1–99 per line and at most 50 lines (the quote endpoint's limits).
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
  readonly isFull = computed(() => this.state().length >= CART_MAX_LINES);

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

  /**
   * Adds `quantity` (default 1) of a variant, increasing an existing line. The line never goes
   * above `details.maxQuantity` (when given) or 99, and a new line is refused when the cart
   * already has 50 lines. The result says how much was actually added.
   */
  add(variantId: string, quantity = 1, details: CartLineDetails = {}): CartAddResult {
    const amount = normaliseQuantity(quantity);
    if (!variantId || amount === 0) {
      return { added: 0 };
    }
    const current = this.quantityOf(variantId);
    if (current === 0 && this.isFull()) {
      return { added: 0, limitedBy: 'lines' };
    }
    const max = Math.min(
      CART_MAX_LINE_QUANTITY,
      details.maxQuantity === undefined
        ? CART_MAX_LINE_QUANTITY
        : normaliseQuantity(details.maxQuantity),
    );
    const target = Math.min(current + amount, max);
    const added = Math.max(target - current, 0);
    if (added > 0) {
      this.upsert(variantId, target, details);
    }
    return added < Math.trunc(quantity) ? { added, limitedBy: 'quantity' } : { added };
  }

  /**
   * Sets the quantity of a variant; 0 or less removes the line. Capped at 99. A new line is
   * not created when the cart already has 50 lines.
   */
  setQuantity(variantId: string, quantity: number): void {
    if (!variantId) {
      return;
    }
    const amount = normaliseQuantity(quantity);
    if (amount === 0) {
      this.remove(variantId);
      return;
    }
    if (this.quantityOf(variantId) === 0 && this.isFull()) {
      return;
    }
    this.upsert(variantId, amount, {});
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

  /**
   * Replaces every line at once – used after a quote, whose lines are the truth (ids,
   * quantities, current prices). Lines are sanitised; nothing is written when nothing changed.
   */
  replaceAll(lines: readonly CartLine[]): void {
    const next = sanitiseCartLines(lines);
    if (JSON.stringify(next) !== JSON.stringify(this.state())) {
      this.commit(next);
    }
  }

  private upsert(variantId: string, quantity: number, details: CartLineDetails): void {
    const lines = this.state();
    const existing = lines.find((l) => l.variantId === variantId);
    const price = normalisePrice(details.knownUnitPrice) ?? existing?.knownUnitPrice;
    const label = normaliseLabel(details.label) ?? existing?.label;
    const next = line(variantId, quantity, price, label);
    this.commit(
      existing ? lines.map((l) => (l.variantId === variantId ? next : l)) : [...lines, next],
    );
  }

  private commit(lines: CartLine[]): void {
    this.state.set(lines);
    this.write(lines);
  }

  private write(lines: CartLine[]): void {
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
      const current = parseStored(
        this.storage?.getItem(CART_STORAGE_KEY) ?? null,
        CART_STORAGE_VERSION,
      );
      if (current !== null) {
        return current;
      }
      return this.migrateLegacy();
    } catch {
      return [];
    }
  }

  /** Moves a Phase 2 cart (`zladovce.cart.v1`) to the current key, once. */
  private migrateLegacy(): CartLine[] {
    const legacy = parseStored(this.storage?.getItem(CART_LEGACY_STORAGE_KEY) ?? null, 1);
    if (legacy === null) {
      return [];
    }
    const lines = legacy.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
    this.write(lines);
    try {
      this.storage?.removeItem(CART_LEGACY_STORAGE_KEY);
    } catch {
      // ignore
    }
    return lines;
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
