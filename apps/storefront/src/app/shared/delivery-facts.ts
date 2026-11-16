import { PublicStoreShipping } from '@zladovce/models';
import { formatRsd } from '@zladovce/utilities';

export interface TextItem {
  title: string;
  text: string;
}

/** Delivery facts from the store settings; only values that are actually configured. */
export function deliveryFacts(shipping: PublicStoreShipping | null): TextItem[] {
  if (!shipping || !shipping.enabled) {
    return [];
  }
  const facts: TextItem[] = [];
  if (shipping.price > 0) {
    facts.push({ title: 'Cena dostave', text: formatRsd(shipping.price) });
  }
  if (shipping.freeShippingThreshold !== null && shipping.freeShippingThreshold > 0) {
    facts.push({
      title: 'Besplatna dostava',
      text: `Za porudžbine od ${formatRsd(shipping.freeShippingThreshold)}`,
    });
  }
  if (shipping.minOrderAmount !== null && shipping.minOrderAmount > 0) {
    facts.push({ title: 'Najmanja porudžbina', text: formatRsd(shipping.minOrderAmount) });
  }
  if (shipping.estimatedDeliveryText?.trim()) {
    facts.push({ title: 'Rok isporuke', text: shipping.estimatedDeliveryText.trim() });
  }
  if (shipping.deliveryInfo?.trim()) {
    facts.push({ title: 'Napomena', text: shipping.deliveryInfo.trim() });
  }
  return facts;
}
