import { CartQuoteAdjustment, CartQuoteLine } from '@zladovce/models';
import { formatRsd } from '@zladovce/utilities';

/** "Džem od šljiva, 370 g" – how a cart line is named in messages and stored as its label. */
export function lineLabel(line: Pick<CartQuoteLine, 'productName' | 'variantName'>): string {
  return line.variantName ? `${line.productName}, ${line.variantName}` : line.productName;
}

/**
 * Plain Serbian explanation of one quote adjustment. `name` is the product label when known
 * (a removed product is no longer in the quote, so the label stored with the cart line is used).
 */
export function adjustmentMessage(adjustment: CartQuoteAdjustment, name: string | null): string {
  const product = name ? `„${name}“` : null;
  switch (adjustment.reason) {
    case 'unavailable':
      return product
        ? `Proizvod ${product} više nije dostupan i uklonjen je iz korpe.`
        : 'Jedan proizvod više nije dostupan i uklonjen je iz korpe.';
    case 'quantityReduced': {
      const subject = product ? `Količina proizvoda ${product}` : 'Količina jednog proizvoda';
      const amount = adjustment.availableQuantity;
      return adjustment.limitReason === 'orderLimit'
        ? `${subject} je smanjena na ${amount} jer je najveća količina po porudžbini ${amount}.`
        : `${subject} je smanjena na ${amount} jer više nema na stanju.`;
    }
    case 'priceChanged': {
      const from = formatRsd(adjustment.previousUnitPrice);
      const to = formatRsd(adjustment.unitPrice);
      return product
        ? `Cena proizvoda ${product} je promenjena sa ${from} na ${to}.`
        : `Cena jednog proizvoda je promenjena sa ${from} na ${to}.`;
    }
    default:
      return 'Korpa je ažurirana prema trenutnoj ponudi.';
  }
}
