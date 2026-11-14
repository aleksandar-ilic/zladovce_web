import { PublicAvailabilityItem, PublicProduct, PublicVariant } from '@zladovce/models';
import { CART_MAX_LINE_QUANTITY, formatUnitAmount } from '@zladovce/shared';

/** The package preselected on the product page: the first one on stock, else the first. */
export function defaultVariant(variants: readonly PublicVariant[]): PublicVariant | null {
  return variants.find((v) => v.inStock) ?? variants[0] ?? null;
}

/** Chip label of a package: its size (`370 g`, `1 l`), or its name when the size is missing. */
export function variantLabel(
  variant: Pick<PublicVariant, 'unitAmount' | 'measurementUnit' | 'name'>,
): string {
  return formatUnitAmount(variant.unitAmount, variant.measurementUnit) || variant.name;
}

/**
 * How many more pieces of a package may go into the cart: its `maxOrderQuantity` (and the
 * cart's 99 per line) minus what is already in the cart. 0 when it is not on stock.
 */
export function remainingQuantity(variant: PublicVariant | null, inCart: number): number {
  if (!variant || !variant.inStock) {
    return 0;
  }
  return Math.max(0, Math.min(variant.maxOrderQuantity, CART_MAX_LINE_QUANTITY) - inCart);
}

export type AddBlockReason = 'unavailable' | 'limitReached' | 'cartFull' | null;

/** Why "Dodaj u korpu" is disabled, or null when it is enabled. */
export function addBlockReason(
  variant: PublicVariant | null,
  inCart: number,
  cartFull: boolean,
): AddBlockReason {
  if (!variant || !variant.inStock || variant.maxOrderQuantity < 1) {
    return 'unavailable';
  }
  if (inCart === 0 && cartFull) {
    return 'cartFull';
  }
  return remainingQuantity(variant, inCart) === 0 ? 'limitReached' : null;
}

/**
 * Applies `GET /catalog/availability` to a product rendered at build time: current prices and
 * stock per package. A package missing from the answer is no longer on sale.
 */
export function applyAvailability(
  product: PublicProduct,
  items: readonly PublicAvailabilityItem[],
): PublicProduct {
  const byId = new Map(items.map((item) => [item.variantId, item]));
  const variants = product.variants.map((variant): PublicVariant => {
    const current = byId.get(variant.id);
    return current
      ? {
          ...variant,
          price: current.price,
          regularPrice: current.regularPrice,
          discountPrice: current.discountPrice,
          inStock: current.inStock,
          maxOrderQuantity: current.maxOrderQuantity,
        }
      : { ...variant, inStock: false, maxOrderQuantity: 0 };
  });
  const onSale = variants.filter((v) => byId.has(v.id));
  const cheapest = onSale.reduce<PublicVariant | null>(
    (min, v) => (min === null || v.price < min.price ? v : min),
    null,
  );
  const prices = new Set(onSale.map((v) => v.price));
  return {
    ...product,
    variants,
    inStock: variants.some((v) => v.inStock),
    price: cheapest?.price ?? product.price,
    originalPrice: cheapest
      ? cheapest.discountPrice !== null
        ? cheapest.regularPrice
        : null
      : product.originalPrice,
    hasPriceRange: prices.size > 1,
  };
}
