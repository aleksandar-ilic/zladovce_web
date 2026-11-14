import { ImageRenditions } from '@zladovce/models';

/** URL of one WebP rendition: `{baseUrl}/{width}.webp`. */
export function renditionUrl(image: ImageRenditions, width: number): string {
  return `${image.baseUrl}/${width}.webp`;
}

/** `srcset` from the renditions the API reports: `…/400.webp 400w, …/800.webp 800w`. */
export function imageSrcset(image: ImageRenditions): string {
  return [...image.widths]
    .sort((a, b) => a - b)
    .map((width) => `${renditionUrl(image, width)} ${width}w`)
    .join(', ');
}

/** The smallest rendition at least `minWidth` wide (or the largest available) for `src`. */
export function imageSrc(image: ImageRenditions, minWidth = 400): string {
  const widths = [...image.widths].sort((a, b) => a - b);
  const width = widths.find((w) => w >= minWidth) ?? widths[widths.length - 1];
  return width === undefined ? '' : renditionUrl(image, width);
}
