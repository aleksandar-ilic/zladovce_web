import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import { PublicImage } from '@zladovce/models';
import { ProductImage } from '../../shared/product-image';

/**
 * Product photos: one large image and a row of thumbnails. Thumbnails are buttons; arrow keys,
 * Home and End move between them (roving focus), and the main image has previous/next buttons.
 * The large image always loads eagerly (it is above the fold); thumbnails load lazily.
 */
@Component({
  selector: 'sf-product-gallery',
  imports: [ProductImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="relative overflow-hidden rounded-xl border border-cream-200 bg-white">
      <sf-product-image
        class="aspect-square"
        [image]="current()"
        [alt]="altOf(current(), index())"
        sizes="(min-width: 1280px) 38rem, (min-width: 768px) 50vw, 100vw"
        priority
        data-testid="main-image"
      />
      @if (images().length > 1) {
        <button
          type="button"
          class="absolute left-3 top-1/2 inline-flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-cream-50/90 text-olive-800 shadow-soft hover:bg-white"
          aria-label="Prethodna slika"
          (click)="select(index() - 1)"
        >
          <svg
            class="size-5"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12.5 4.5 7 10l5.5 5.5" />
          </svg>
        </button>
        <button
          type="button"
          class="absolute right-3 top-1/2 inline-flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-cream-50/90 text-olive-800 shadow-soft hover:bg-white"
          aria-label="Sledeća slika"
          (click)="select(index() + 1)"
        >
          <svg
            class="size-5"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M7.5 4.5 13 10l-5.5 5.5" />
          </svg>
        </button>
        <p class="sr-only" aria-live="polite">Slika {{ index() + 1 }} od {{ images().length }}</p>
      }
    </div>

    @if (images().length > 1) {
      <ul class="mt-4 grid grid-cols-5 gap-3" aria-label="Slike proizvoda">
        @for (image of images(); track $index; let i = $index) {
          <li>
            <button
              #thumb
              type="button"
              class="block w-full cursor-pointer overflow-hidden rounded-md border-2 transition-colors"
              [class]="
                i === index() ? 'border-olive-700' : 'border-transparent hover:border-sage-300'
              "
              [attr.aria-label]="'Prikaži sliku ' + (i + 1) + ' od ' + images().length"
              [attr.aria-current]="i === index() ? 'true' : null"
              [tabindex]="i === index() ? 0 : -1"
              (click)="select(i)"
              (keydown)="onKeydown($event)"
              data-testid="thumbnail"
            >
              <sf-product-image class="aspect-square" [image]="image" alt="" sizes="6rem" />
            </button>
          </li>
        }
      </ul>
    }
  `,
})
export class ProductGallery {
  readonly images = input.required<readonly PublicImage[]>();
  readonly name = input.required<string>();

  private readonly thumbs = viewChildren<ElementRef<HTMLButtonElement>>('thumb');
  readonly index = signal(0);
  protected readonly current = computed(() => this.images()[this.index()] ?? null);

  constructor() {
    // A different product (or new photos) starts at the first image.
    effect(() => {
      this.images();
      untracked(() => this.index.set(0));
    });
  }

  select(index: number, focus = false): void {
    const count = this.images().length;
    if (count === 0) {
      return;
    }
    const next = ((index % count) + count) % count;
    this.index.set(next);
    if (focus) {
      this.thumbs()[next]?.nativeElement.focus();
    }
  }

  protected altOf(image: PublicImage | null, index: number): string {
    if (image?.altText) {
      return image.altText;
    }
    return this.images().length > 1 ? `${this.name()} – slika ${index + 1}` : this.name();
  }

  protected onKeydown(event: KeyboardEvent): void {
    const keys: Record<string, number> = {
      ArrowRight: this.index() + 1,
      ArrowDown: this.index() + 1,
      ArrowLeft: this.index() - 1,
      ArrowUp: this.index() - 1,
      Home: 0,
      End: this.images().length - 1,
    };
    const target = keys[event.key];
    if (target === undefined) {
      return;
    }
    event.preventDefault();
    this.select(target, true);
  }
}
