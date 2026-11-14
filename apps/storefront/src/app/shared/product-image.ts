import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { PublicImage } from '@zladovce/models';
import { imageSrc, imageSrcset } from './images';

/**
 * Responsive product or category image (WebP renditions through `srcset`/`sizes`). The host
 * decides the shape (e.g. `class="aspect-[4/5]"`); the image covers it. Images are lazy unless
 * `priority` is set (the main image above the fold).
 *
 * Without an image a quiet branded placeholder is shown – never a stock photo.
 */
@Component({
  selector: 'sf-product-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block overflow-hidden bg-cream-100' },
  template: `
    @if (image(); as image) {
      <img
        class="absolute inset-0 size-full object-cover"
        [attr.src]="src()"
        [attr.srcset]="srcset()"
        [attr.sizes]="sizes()"
        [attr.width]="image.width"
        [attr.height]="image.height"
        [attr.alt]="alt()"
        [attr.loading]="priority() ? 'eager' : 'lazy'"
        [attr.fetchpriority]="priority() ? 'high' : null"
        decoding="async"
      />
    } @else {
      <div
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_50%_40%,var(--color-cream-50),var(--color-cream-200))] text-sage-400"
        [attr.role]="alt() ? 'img' : null"
        [attr.aria-label]="alt() || null"
        data-testid="image-placeholder"
      >
        <svg
          class="w-1/4 max-w-24 min-w-10"
          viewBox="0 0 48 64"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="11" y="6" width="26" height="7" rx="2" />
          <path d="M13 13c-4 3-6 7-6 12v27a6 6 0 0 0 6 6h22a6 6 0 0 0 6-6V25c0-5-2-9-6-12" />
          <path d="M7 31h34M7 47h34" />
          <path d="M24 36c-3 0-5 2-5 4.5S21 45 24 45s5-2 5-4.5" />
          <path d="M24 36c1-2 3-3 5-3" />
        </svg>
        <span
          class="font-serif text-base font-semibold tracking-wide text-sage-500"
          aria-hidden="true"
          >Zladovce</span
        >
      </div>
    }
  `,
})
export class ProductImage {
  readonly image = input<PublicImage | null>(null);
  readonly alt = input('');
  /** `sizes` attribute; describe the rendered width at each breakpoint. */
  readonly sizes = input('(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw');
  readonly priority = input(false, { transform: booleanAttribute });

  protected readonly src = computed(() => {
    const image = this.image();
    return image ? imageSrc(image, 800) : null;
  });
  protected readonly srcset = computed(() => {
    const image = this.image();
    return image ? imageSrcset(image) : null;
  });
}
