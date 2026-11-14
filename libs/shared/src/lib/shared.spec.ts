import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { CART_MAX_LINE_QUANTITY, CART_STORAGE_KEY, CartStore } from './cart-store';
import {
  ADMIN_PRODUCT_SORTS,
  formatUnitAmount,
  MEASUREMENT_UNIT_LABELS,
  MEASUREMENT_UNITS,
  MOVEMENT_TYPE_LABELS,
  STOCK_STATUS_LABELS,
} from './catalog-labels';
import { adminRoleLabel } from './labels';
import { matchingValues, notBlank } from './validators';

const stored = (): unknown => JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? 'null');
const seed = (value: unknown): void =>
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(value));

function createStore(platform: 'browser' | 'server' = 'browser'): CartStore {
  TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platform }] });
  return TestBed.inject(CartStore);
}

/** Simulates a change made by another tab: storage is modified and the event is delivered. */
function fromOtherTab(value: unknown, key: string | null = CART_STORAGE_KEY): void {
  if (value === null) {
    localStorage.removeItem(CART_STORAGE_KEY);
  } else {
    seed(value);
  }
  window.dispatchEvent(new StorageEvent('storage', { key }));
}

describe('CartStore', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('starts empty', () => {
    const cart = createStore();
    expect(cart.lines()).toEqual([]);
    expect(cart.totalQuantity()).toBe(0);
    expect(cart.lineCount()).toBe(0);
    expect(cart.isEmpty()).toBe(true);
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it('uses a versioned storage key', () => {
    expect(CART_STORAGE_KEY).toBe('zladovce.cart.v1');
  });

  it('adds lines and persists only variant id and quantity', () => {
    const cart = createStore();
    cart.add('v1');
    cart.add('v2', 3);
    expect(cart.lines()).toEqual([
      { variantId: 'v1', quantity: 1 },
      { variantId: 'v2', quantity: 3 },
    ]);
    expect(cart.totalQuantity()).toBe(4);
    expect(cart.lineCount()).toBe(2);
    expect(cart.isEmpty()).toBe(false);
    expect(stored()).toEqual({
      version: 1,
      lines: [
        { variantId: 'v1', quantity: 1 },
        { variantId: 'v2', quantity: 3 },
      ],
    });
  });

  it('increases the quantity when the variant is already in the cart', () => {
    const cart = createStore();
    cart.add('v1', 2);
    cart.add('v1', 3);
    expect(cart.lines()).toEqual([{ variantId: 'v1', quantity: 5 }]);
    expect(cart.quantityOf('v1')).toBe(5);
    expect(cart.quantityOf('missing')).toBe(0);
  });

  it('ignores invalid additions', () => {
    const cart = createStore();
    cart.add('', 1);
    cart.add('v1', 0);
    cart.add('v1', -2);
    cart.add('v1', Number.NaN);
    expect(cart.isEmpty()).toBe(true);
  });

  it('updates quantity, truncates fractions and caps at the maximum', () => {
    const cart = createStore();
    cart.add('v1');
    cart.setQuantity('v1', 4.9);
    expect(cart.quantityOf('v1')).toBe(4);
    cart.setQuantity('v1', 5000);
    expect(cart.quantityOf('v1')).toBe(CART_MAX_LINE_QUANTITY);
    cart.add('v1', 5);
    expect(cart.quantityOf('v1')).toBe(CART_MAX_LINE_QUANTITY);
  });

  it('setQuantity adds a missing line and keeps the order of existing ones', () => {
    const cart = createStore();
    cart.add('v1');
    cart.add('v2');
    cart.setQuantity('v3', 2);
    cart.setQuantity('v1', 7);
    expect(cart.lines().map((l) => l.variantId)).toEqual(['v1', 'v2', 'v3']);
    expect(cart.quantityOf('v1')).toBe(7);
  });

  it('removes a line when the quantity is set to zero or less', () => {
    const cart = createStore();
    cart.add('v1', 2);
    cart.add('v2', 1);
    cart.setQuantity('v1', 0);
    expect(cart.lines()).toEqual([{ variantId: 'v2', quantity: 1 }]);
    cart.setQuantity('v2', -1);
    expect(cart.isEmpty()).toBe(true);
  });

  it('removes lines and clears storage when the cart becomes empty', () => {
    const cart = createStore();
    cart.add('v1');
    cart.add('v2');
    cart.remove('v1');
    cart.remove('missing');
    expect(cart.lines()).toEqual([{ variantId: 'v2', quantity: 1 }]);
    cart.remove('v2');
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it('clears everything', () => {
    const cart = createStore();
    cart.add('v1', 2);
    cart.add('v2', 2);
    cart.clear();
    expect(cart.isEmpty()).toBe(true);
    expect(cart.totalQuantity()).toBe(0);
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it('restores the cart from storage', () => {
    seed({ version: 1, lines: [{ variantId: 'v1', quantity: 2 }] });
    const cart = createStore();
    expect(cart.lines()).toEqual([{ variantId: 'v1', quantity: 2 }]);
  });

  it('sanitises stored data: drops malformed lines, merges duplicates, caps quantities', () => {
    seed({
      version: 1,
      lines: [
        { variantId: 'v1', quantity: 2 },
        { variantId: 'v1', quantity: 3 },
        { variantId: 'v2', quantity: 0 },
        { variantId: 'v3', quantity: '4' },
        { variantId: 5, quantity: 1 },
        { variantId: 'v4', quantity: 1000 },
        null,
        'x',
      ],
    });
    const cart = createStore();
    expect(cart.lines()).toEqual([
      { variantId: 'v1', quantity: 5 },
      { variantId: 'v4', quantity: CART_MAX_LINE_QUANTITY },
    ]);
  });

  it.each([
    ['another version', JSON.stringify({ version: 2, lines: [{ variantId: 'v1', quantity: 1 }] })],
    ['invalid JSON', '{not json'],
    ['a non-object', '"text"'],
    ['lines that are not an array', JSON.stringify({ version: 1, lines: 'x' })],
  ])('ignores %s in storage', (_name, raw) => {
    localStorage.setItem(CART_STORAGE_KEY, raw);
    expect(createStore().isEmpty()).toBe(true);
  });

  it('follows changes made in another tab', () => {
    const cart = createStore();
    cart.add('v1');
    fromOtherTab({ version: 1, lines: [{ variantId: 'v9', quantity: 4 }] });
    expect(cart.lines()).toEqual([{ variantId: 'v9', quantity: 4 }]);
    expect(cart.totalQuantity()).toBe(4);
  });

  it('empties when another tab clears the cart or the whole storage', () => {
    const cart = createStore();
    cart.add('v1');
    fromOtherTab(null);
    expect(cart.isEmpty()).toBe(true);

    cart.add('v2');
    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(cart.isEmpty()).toBe(true);
  });

  it('ignores storage events of other keys', () => {
    const cart = createStore();
    cart.add('v1');
    localStorage.setItem('other', '1');
    window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));
    expect(cart.lines()).toEqual([{ variantId: 'v1', quantity: 1 }]);
  });

  it('stops listening when destroyed', () => {
    const cart = createStore();
    cart.add('v1');
    TestBed.resetTestingModule();
    fromOtherTab({ version: 1, lines: [{ variantId: 'v9', quantity: 4 }] });
    expect(cart.lines()).toEqual([{ variantId: 'v1', quantity: 1 }]);
  });

  it('keeps working in memory when storage writes fail', () => {
    const cart = createStore();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    try {
      cart.add('v1', 2);
      expect(cart.totalQuantity()).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('is empty and never touches storage on the server', () => {
    seed({ version: 1, lines: [{ variantId: 'v1', quantity: 2 }] });
    const cart = createStore('server');
    expect(cart.isEmpty()).toBe(true);
    cart.add('v2', 1);
    expect(cart.totalQuantity()).toBe(1);
    expect(stored()).toEqual({ version: 1, lines: [{ variantId: 'v1', quantity: 2 }] });
  });
});

describe('labels', () => {
  it('translates admin roles', () => {
    expect(adminRoleLabel('Owner')).toBe('Vlasnik');
    expect(adminRoleLabel('Staff')).toBe('Urednik');
    expect(adminRoleLabel(null)).toBe('');
  });
});

describe('validators', () => {
  it('matchingValues flags different values on the group', () => {
    const group = new FormGroup(
      { a: new FormControl('lozinka'), b: new FormControl('') },
      { validators: matchingValues('a', 'b') },
    );
    expect(group.errors).toBeNull();
    group.controls.b.setValue('drugo');
    expect(group.errors).toEqual({ mismatch: true });
    group.controls.b.setValue('lozinka');
    expect(group.errors).toBeNull();
  });

  it('notBlank rejects whitespace-only text', () => {
    expect(notBlank(new FormControl('   '))).toEqual({ required: true });
    expect(notBlank(new FormControl(' a '))).toBeNull();
  });
});

describe('catalog labels', () => {
  it('formats package sizes the Serbian way', () => {
    expect(formatUnitAmount(370, 'g')).toBe('370 g');
    expect(formatUnitAmount(0.5, 'l')).toBe('0,5 l');
    expect(formatUnitAmount(1500, 'ml')).toBe('1.500 ml');
    expect(formatUnitAmount(null, 'g')).toBe('');
    expect(formatUnitAmount(3, null)).toBe('');
  });

  it('has Serbian labels for units, stock states, movements and sorts', () => {
    expect(MEASUREMENT_UNITS.map((unit) => MEASUREMENT_UNIT_LABELS[unit])).toEqual([
      'gram (g)',
      'kilogram (kg)',
      'mililitar (ml)',
      'litar (l)',
      'komad (kom)',
    ]);
    expect(STOCK_STATUS_LABELS).toEqual({
      ok: 'Na stanju',
      low: 'Malo na stanju',
      out: 'Nema na stanju',
    });
    expect(MOVEMENT_TYPE_LABELS.ManualAdjustment).toBe('Ručna korekcija');
    expect(MOVEMENT_TYPE_LABELS.ReturnRestock).toBe('Povrat na stanje');
    expect(ADMIN_PRODUCT_SORTS.map((s) => s.label)).toEqual([
      'Najnovije',
      'Najstarije',
      'Naziv A–Ž',
      'Naziv Ž–A',
      'Poslednje izmenjeno',
    ]);
  });
});
