import { CartQuote } from '@zladovce/models';
import { formatRsd } from '@zladovce/utilities';

/** Shipping row of the summary. */
export function shippingText(quote: CartQuote): string {
  if (!quote.shipping.enabled) {
    return 'Trenutno nije dostupna';
  }
  return quote.shipping.isFree || quote.shipping.price === 0
    ? 'Besplatna dostava'
    : formatRsd(quote.shipping.price);
}

/** "Još 1.200 RSD do besplatne dostave." – only while the threshold is not reached. */
export function freeShippingText(quote: CartQuote): string | null {
  const missing = quote.shipping.amountUntilFreeShipping;
  return missing !== null && missing > 0 ? `Još ${formatRsd(missing)} do besplatne dostave.` : null;
}

/** Minimum order message, only while the subtotal is below the minimum. */
export function minimumOrderText(quote: CartQuote): string | null {
  if (quote.meetsMinimumOrder || quote.minOrderAmount === null || quote.lines.length === 0) {
    return null;
  }
  const missing = quote.amountUntilMinimumOrder ?? quote.minOrderAmount - quote.subtotal;
  return `Najmanji iznos porudžbine je ${formatRsd(quote.minOrderAmount)}. Dodajte proizvode u vrednosti od još ${formatRsd(missing)}.`;
}

/**
 * Why the cart cannot be ordered right now, or null when it can. Shown next to the disabled
 * "Nastavi na poručivanje" button and on the checkout page.
 */
export function checkoutBlockedReason(quote: CartQuote): string | null {
  if (quote.canCheckout) {
    return null;
  }
  if (quote.lines.length === 0) {
    return 'U korpi nema proizvoda koji se trenutno mogu poručiti.';
  }
  if (!quote.shipping.enabled) {
    return 'Dostava je trenutno isključena, pa poručivanje privremeno nije moguće. Pokušajte ponovo kasnije.';
  }
  return minimumOrderText(quote) ?? 'Poručivanje trenutno nije moguće.';
}
