import { InventoryMovementType, MeasurementUnit, StockStatus } from '@zladovce/models';
import { formatSerbianNumber } from '@zladovce/utilities';

/** Measurement units in the order they are offered in forms. */
export const MEASUREMENT_UNITS: readonly MeasurementUnit[] = ['g', 'kg', 'ml', 'l', 'kom'];

/** Full Serbian name of each unit (for selects). */
export const MEASUREMENT_UNIT_LABELS: Record<MeasurementUnit, string> = {
  g: 'gram (g)',
  kg: 'kilogram (kg)',
  ml: 'mililitar (ml)',
  l: 'litar (l)',
  kom: 'komad (kom)',
};

/** `370 g`, `0,5 l`, `6 kom`. */
export function formatUnitAmount(
  amount: number | null | undefined,
  unit: MeasurementUnit | null | undefined,
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount) || !unit) {
    return '';
  }
  const value = Math.round(amount * 1000) / 1000;
  const [whole = '0', fraction] = String(Math.abs(value)).split('.');
  const formatted = `${value < 0 ? '-' : ''}${formatSerbianNumber(Number(whole))}${fraction ? `,${fraction}` : ''}`;
  return `${formatted} ${unit}`;
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  ok: 'Na stanju',
  low: 'Malo na stanju',
  out: 'Nema na stanju',
};

export type StockStatusTone = 'success' | 'warning' | 'danger';

export const STOCK_STATUS_TONES: Record<StockStatus, StockStatusTone> = {
  ok: 'success',
  low: 'warning',
  out: 'danger',
};

export const MOVEMENT_TYPE_LABELS: Record<InventoryMovementType, string> = {
  InitialStock: 'Početno stanje',
  ManualAdjustment: 'Ručna korekcija',
  OrderPlaced: 'Porudžbina',
  OrderCancelled: 'Otkazana porudžbina',
  ReturnRestock: 'Povrat na stanje',
};

export type AdminProductSort = 'newest' | 'oldest' | 'name' | 'nameDesc' | 'updated';

export const ADMIN_PRODUCT_SORTS: readonly { value: AdminProductSort; label: string }[] = [
  { value: 'newest', label: 'Najnovije' },
  { value: 'oldest', label: 'Najstarije' },
  { value: 'name', label: 'Naziv A–Ž' },
  { value: 'nameDesc', label: 'Naziv Ž–A' },
  { value: 'updated', label: 'Poslednje izmenjeno' },
];

export type InventorySort = 'product' | 'stockAsc' | 'stockDesc';

export const INVENTORY_SORTS: readonly { value: InventorySort; label: string }[] = [
  { value: 'product', label: 'Po proizvodu' },
  { value: 'stockAsc', label: 'Najmanje na stanju prvo' },
  { value: 'stockDesc', label: 'Najviše na stanju prvo' },
];
