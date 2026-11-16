import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicBlogPostListItem } from '@zladovce/models';
import { SrDatePipe } from '@zladovce/utilities';
import { ProductImage } from './product-image';

/**
 * Blog post card (blog list, homepage previews, "Još iz bloga"): cover image, category, title,
 * Serbian publication date and excerpt. The title is the link; the whole card is clickable
 * through a stretched link, so it is one tab stop.
 */
@Component({
  selector: 'sf-blog-card',
  imports: [RouterLink, ProductImage, SrDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let p = post();
    <article
      class="group relative flex h-full flex-col overflow-hidden rounded-lg border border-cream-200 bg-white shadow-soft transition-shadow duration-200 ease-gentle hover:shadow-card"
      data-testid="blog-card"
    >
      <sf-product-image
        class="aspect-[3/2] transition-transform duration-500 ease-gentle group-hover:scale-[1.02]"
        [image]="p.coverImage"
        alt=""
        [sizes]="sizes()"
        [priority]="priority()"
      />
      <div class="flex flex-1 flex-col gap-2 p-5">
        <p class="flex flex-wrap items-center gap-x-2 text-sm text-ink-700">
          @if (p.category) {
            <span class="eyebrow">{{ p.category.name }}</span>
            <span aria-hidden="true">·</span>
          }
          <time [attr.datetime]="p.publishedAt">{{ p.publishedAt | srDate: 'long' }}</time>
        </p>
        <h3 class="font-serif text-2xl font-semibold leading-snug text-olive-900">
          <a
            [routerLink]="['/blog', p.slug]"
            class="underline-offset-4 after:absolute after:inset-0 group-hover:underline"
            data-testid="blog-card-link"
            >{{ p.title }}</a
          >
        </h3>
        <p class="text-ink-700">{{ p.excerpt }}</p>
      </div>
    </article>
  `,
})
export class BlogCard {
  readonly post = input.required<PublicBlogPostListItem>();
  readonly sizes = input('(min-width: 1024px) 24rem, (min-width: 640px) 45vw, 92vw');
  readonly priority = input(false, { transform: booleanAttribute });
}
