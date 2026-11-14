import { PublicImage, PublicProduct } from '@zladovce/models';
import { renditionUrl } from '../shared/images';

const SCHEMA = 'https://schema.org';

export interface Crumb {
  name: string;
  /** Site path; the last crumb (current page) may omit it. */
  path?: string;
}

/** Plain text of a small HTML fragment (product descriptions are sanitised server-side). */
export function htmlToText(html: string | null | undefined): string {
  return (html ?? '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/li|\/h\d)\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Short text for meta descriptions: whole words, at most `max` characters. */
export function truncate(text: string, max = 160): string {
  if (text.length <= max) {
    return text;
  }
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Largest rendition up to 1600 px – used where an absolute image URL is needed (OG, JSON-LD). */
export function shareImageUrl(image: PublicImage | null | undefined): string | null {
  if (!image || image.widths.length === 0) {
    return null;
  }
  const widths = [...image.widths].sort((a, b) => a - b);
  const width = [...widths].reverse().find((w) => w <= 1600) ?? widths[0]!;
  return renditionUrl(image, width);
}

/** `BreadcrumbList` with absolute URLs. */
export function breadcrumbJsonLd(crumbs: readonly Crumb[], siteUrl: string): object {
  return {
    '@context': SCHEMA,
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      ...(crumb.path ? { item: `${siteUrl}${crumb.path}` } : {}),
    })),
  };
}

/**
 * `Product` with one `Offer` per package (variant): price in RSD and availability. Only data the
 * API publishes is used – no ratings, reviews or invented attributes.
 */
export function productJsonLd(product: PublicProduct, siteUrl: string): object {
  const url = `${siteUrl}/proizvod/${product.slug}`;
  const images = product.images
    .map((image) => shareImageUrl(image))
    .filter((src): src is string => src !== null);
  const description = truncate(
    htmlToText(product.description) || product.shortDescription || product.name,
    5000,
  );
  const first = product.variants[0];
  return {
    '@context': SCHEMA,
    '@type': 'Product',
    name: product.name,
    description,
    ...(images.length > 0 ? { image: images } : {}),
    ...(first ? { sku: first.sku } : {}),
    brand: { '@type': 'Brand', name: 'Zladovce' },
    category: product.category.name,
    url,
    offers: product.variants.map((variant) => ({
      '@type': 'Offer',
      name: variant.name,
      sku: variant.sku,
      price: variant.price.toFixed(2),
      priceCurrency: 'RSD',
      availability: variant.inStock ? `${SCHEMA}/InStock` : `${SCHEMA}/OutOfStock`,
      itemCondition: `${SCHEMA}/NewCondition`,
      url,
    })),
  };
}
