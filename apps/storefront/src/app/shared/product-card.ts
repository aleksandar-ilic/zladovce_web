import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicProductListItem } from '@zladovce/models';
import { Availability } from './availability';
import { discountPercent, Price } from './price';
import { ProductImage } from './product-image';

/**
 * Product card of the shop grid, the homepage and related products: image (4:5), category,
 * name, price ("od …" for several packages, discount struck through), badges, availability.
 * The whole card is one link, so it is one tab stop.
 */
@Component({
  selector: 'sf-product-card',
  imports: [RouterLink, ProductImage, Price, Availability],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let p = product();
    <a
      [routerLink]="['/proizvod', p.slug]"
      class="group flex h-full flex-col overflow-hidden rounded-lg border border-cream-200 bg-white shadow-soft transition-shadow duration-200 ease-gentle hover:shadow-card"
      data-testid="product-card"
    >
      <div class="relative">
        <sf-product-image
          class="aspect-[4/5] transition-transform duration-500 ease-gentle group-hover:scale-[1.02]"
          [image]="p.image"
          [alt]="p.image?.altText || p.name"
          [sizes]="sizes()"
          [priority]="priority()"
        />
        <div class="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          @if (discount(); as discount) {
            <span
              class="rounded-full bg-earth-700 px-2.5 py-0.5 text-xs font-semibold text-white"
              data-testid="discount-badge"
              >Akcija −{{ discount }}&nbsp;%</span
            >
          }
          @if (p.isFeatured) {
            <span
              class="rounded-full bg-cream-50/95 px-2.5 py-0.5 text-xs font-semibold text-olive-800"
              data-testid="featured-badge"
              >Izdvajamo</span
            >
          }
        </div>
      </div>
      <div class="flex flex-1 flex-col gap-1.5 p-4 md:p-5">
        <p class="eyebrow">{{ p.category.name }}</p>
        <h3
          class="font-serif text-xl font-semibold leading-snug text-olive-900 underline-offset-4 group-hover:underline"
        >
          {{ p.name }}
        </h3>
        <div class="mt-auto flex flex-wrap items-end justify-between gap-x-3 gap-y-1 pt-2">
          <sf-price [price]="p.price" [original]="p.originalPrice" [from]="p.hasPriceRange" />
          <sf-availability [inStock]="p.inStock" />
        </div>
      </div>
    </a>
  `,
})
export class ProductCard {
  readonly product = input.required<PublicProductListItem>();
  readonly sizes = input(
    '(min-width: 1280px) 22rem, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw',
  );
  readonly priority = input(false, { transform: booleanAttribute });

  protected readonly discount = computed(() =>
    discountPercent(this.product().price, this.product().originalPrice),
  );
}
