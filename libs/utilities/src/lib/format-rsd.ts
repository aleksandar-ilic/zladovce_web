const NBSP = ' ';

/**
 * Formats a number the Serbian way: `.` between thousands, `,` before decimals.
 * Decimals are shown only when the amount (rounded to two places) has a fractional part.
 *
 *   formatSerbianNumber(1200)    -> "1.200"
 *   formatSerbianNumber(1200.5)  -> "1.200,50"
 */
export function formatSerbianNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }
  const cents = Math.round(Math.abs(value) * 100);
  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;
  const sign = value < 0 && cents !== 0 ? '-' : '';
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return fraction === 0
    ? `${sign}${grouped}`
    : `${sign}${grouped},${String(fraction).padStart(2, '0')}`;
}

/**
 * Formats an amount in Serbian dinars: `1.200 RSD`, `649,50 RSD`.
 * A non-breaking space keeps the currency on the same line as the amount.
 * Returns an empty string for null, undefined and non-finite values.
 */
export function formatRsd(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '';
  }
  return `${formatSerbianNumber(amount)}${NBSP}RSD`;
}
