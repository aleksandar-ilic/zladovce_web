import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { asApiError } from '@zladovce/api';
import { AdminProduct, ProductImage } from '@zladovce/models';
import { UiBadge } from '@zladovce/ui';
import { filter, Observable } from 'rxjs';
import { retryWhileImageNotReady } from '../../data/media-upload';
import { ProductsApi } from '../../data/products-api';
import { ConfirmService } from '../../shared/confirm-dialog';
import { AttachFn, ImageUpload, UploadedImage } from '../../shared/image-upload';
import { imageSrc, imageSrcset } from '../../shared/images';

export const MAX_PRODUCT_IMAGES = 20;

/**
 * Product photos: upload (several at once, drag and drop), order (drag or arrows), main photo,
 * description for screen readers and search engines (alt text), delete.
 * Every change is saved at once and returns the whole product, which goes to the parent through
 * `productChange` – the parent keeps the new `version` for its next save.
 */
@Component({
  selector: 'adm-product-images',
  imports: [MatButtonModule, CdkDropList, CdkDrag, UiBadge, ImageUpload],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (images().length === 0) {
      <p class="text-sm text-ink-700" data-testid="no-images">
        Proizvod još nema fotografija. Prva dodata fotografija postaje glavna (prikazuje se na
        spisku proizvoda u prodavnici).
      </p>
    } @else {
      <p class="text-sm text-ink-700">
        Prevucite fotografiju ili koristite strelice da promenite redosled. Glavna fotografija se
        prikazuje prva.
      </p>
      <ul
        cdkDropList
        cdkDropListOrientation="mixed"
        class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-label="Fotografije proizvoda"
        [cdkDropListDisabled]="busy() || disabled()"
        (cdkDropListDropped)="drop($event)"
      >
        @for (image of images(); track image.id; let i = $index, first = $first, last = $last) {
          <li
            cdkDrag
            class="flex flex-col overflow-hidden rounded-lg border bg-white"
            [class.border-olive-600]="image.isMain"
            [class.border-cream-200]="!image.isMain"
            data-testid="product-image"
          >
            <div class="relative aspect-[4/3] cursor-grab bg-cream-100">
              <img
                [src]="src(image)"
                [srcset]="srcset(image)"
                sizes="(min-width: 1280px) 20rem, (min-width: 640px) 40vw, 90vw"
                [alt]="image.altText || ''"
                class="size-full object-cover"
                loading="lazy"
              />
              @if (image.isMain) {
                <ui-badge tone="success" class="absolute top-2 left-2">Glavna fotografija</ui-badge>
              }
            </div>
            <div class="flex flex-col gap-2 p-3">
              <label class="text-sm font-semibold text-ink-900" [for]="'alt-' + image.id">
                Opis fotografije
              </label>
              <div class="flex gap-2">
                <input
                  #alt
                  [id]="'alt-' + image.id"
                  class="min-w-0 flex-1 rounded-md border border-sage-400 bg-white px-2.5 py-1.5 text-sm"
                  maxlength="200"
                  placeholder="npr. Tegla džema od šljiva"
                  [value]="image.altText ?? ''"
                  [disabled]="busy() || disabled()"
                  (input)="editAlt(image.id, alt.value)"
                  (keydown.enter)="$event.preventDefault(); saveAlt(image, alt.value)"
                />
                @if (altChanged(image)) {
                  <button
                    matButton="tonal"
                    type="button"
                    [disabled]="busy()"
                    (click)="saveAlt(image, alt.value)"
                  >
                    Sačuvaj
                  </button>
                }
              </div>
              <div class="flex flex-wrap items-center gap-1">
                <button
                  matIconButton
                  type="button"
                  [disabled]="first || busy() || disabled()"
                  [attr.aria-label]="'Pomeri fotografiju ' + (i + 1) + ' unazad'"
                  (click)="move(i, i - 1)"
                >
                  <svg
                    class="size-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-hidden="true"
                  >
                    <path d="M15 6l-6 6 6 6" />
                  </svg>
                </button>
                <button
                  matIconButton
                  type="button"
                  [disabled]="last || busy() || disabled()"
                  [attr.aria-label]="'Pomeri fotografiju ' + (i + 1) + ' unapred'"
                  (click)="move(i, i + 1)"
                >
                  <svg
                    class="size-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-hidden="true"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
                @if (!image.isMain) {
                  <button
                    matButton
                    type="button"
                    [disabled]="busy() || disabled()"
                    (click)="setMain(image)"
                  >
                    Postavi kao glavnu
                  </button>
                }
                <span class="flex-1"></span>
                <button
                  matButton
                  type="button"
                  class="danger-button"
                  [disabled]="busy() || disabled()"
                  (click)="remove(image)"
                >
                  Obriši
                </button>
              </div>
            </div>
          </li>
        }
      </ul>
    }

    @if (!disabled()) {
      @if (images().length < maxImages) {
        <adm-image-upload
          class="mt-5"
          purpose="product"
          multiple
          [attach]="attach"
          (uploaded)="uploaded($event)"
          (busyChange)="uploadingChange.emit($event)"
        />
      } @else {
        <p class="mt-5 text-sm text-ink-700">
          Dostignut je najveći broj fotografija ({{ maxImages }}). Obrišite neku da biste dodali
          novu.
        </p>
      }
    }
  `,
})
export class ProductImages {
  private readonly api = inject(ProductsApi);
  private readonly confirm = inject(ConfirmService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly product = input.required<AdminProduct>();
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly productChange = output<AdminProduct>();
  readonly uploadingChange = output<boolean>();

  protected readonly maxImages = MAX_PRODUCT_IMAGES;
  protected readonly busy = signal(false);
  /** Local order while a reorder is being saved (drag feedback without waiting for the API). */
  private readonly pendingOrder = signal<ProductImage[] | null>(null);
  protected readonly images = computed(
    () =>
      this.pendingOrder() ?? [...this.product().images].sort((a, b) => a.sortOrder - b.sortOrder),
  );

  protected readonly src = (image: ProductImage): string => imageSrc(image, 400);
  protected readonly srcset = imageSrcset;

  /** Attach step of the upload queue: retried automatically while the image is processed. */
  protected readonly attach: AttachFn = (key) =>
    this.api.attachImage(this.product().id, key, null).pipe(retryWhileImageNotReady());

  protected uploaded(upload: UploadedImage): void {
    this.productChange.emit(upload.result as AdminProduct);
  }

  protected drop(event: CdkDragDrop<unknown>): void {
    this.move(event.previousIndex, event.currentIndex);
  }

  protected move(from: number, to: number): void {
    const current = this.images();
    if (from === to || to < 0 || to >= current.length || this.busy()) {
      return;
    }
    const next = [...current];
    moveItemInArray(next, from, to);
    const main = current.find((image) => image.isMain)?.id ?? null;
    this.pendingOrder.set(next);
    this.run(
      this.api.reorderImages(
        this.product().id,
        next.map((image) => image.id),
        main,
      ),
      'Redosled fotografija je sačuvan.',
    );
  }

  protected setMain(image: ProductImage): void {
    this.run(
      this.api.reorderImages(
        this.product().id,
        this.images().map((i) => i.id),
        image.id,
      ),
      'Glavna fotografija je promenjena.',
    );
  }

  /** Alt texts typed but not saved yet, by image id. */
  private readonly altDrafts = signal<Record<string, string>>({});

  protected editAlt(id: string, value: string): void {
    this.altDrafts.update((drafts) => ({ ...drafts, [id]: value }));
  }

  protected altChanged(image: ProductImage): boolean {
    const draft = this.altDrafts()[image.id];
    return draft !== undefined && draft.trim() !== (image.altText ?? '');
  }

  protected saveAlt(image: ProductImage, value: string): void {
    const altText = value.trim() === '' ? null : value.trim();
    this.run(
      this.api.updateImage(this.product().id, image.id, altText),
      'Opis fotografije je sačuvan.',
    );
  }

  protected remove(image: ProductImage): void {
    this.confirm
      .ask({
        title: 'Obrisati fotografiju?',
        message: image.isMain
          ? 'Ovo je glavna fotografija. Posle brisanja, glavna postaje sledeća fotografija po redu. Brisanje ne može da se poništi.'
          : 'Fotografija će biti trajno obrisana. Brisanje ne može da se poništi.',
        confirmLabel: 'Obriši fotografiju',
        tone: 'danger',
      })
      .pipe(filter(Boolean), takeUntilDestroyed(this.destroyRef))
      .subscribe(() =>
        this.run(this.api.deleteImage(this.product().id, image.id), 'Fotografija je obrisana.'),
      );
  }

  private run(request: Observable<AdminProduct>, success: string): void {
    this.busy.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (product) => {
        this.pendingOrder.set(null);
        this.altDrafts.set({});
        this.busy.set(false);
        this.productChange.emit(product);
        this.snackBar.open(success, 'U redu', { duration: 3000 });
      },
      error: (error: unknown) => {
        this.pendingOrder.set(null);
        this.busy.set(false);
        this.snackBar.open(asApiError(error).detail, 'U redu', { duration: 8000 });
      },
    });
  }
}
