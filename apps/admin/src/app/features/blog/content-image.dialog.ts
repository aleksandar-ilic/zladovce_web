import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ContentImage } from '@zladovce/models';
import { BlogApi } from '../../data/blog-api';
import { retryWhileImageNotReady } from '../../data/media-upload';
import { ImageUpload, UploadedImage } from '../../shared/image-upload';
import { InsertedImage } from '../../shared/rich-text-editor';
import { imageSrc } from '../../shared/images';

/** Width of the rendition placed in the text (the API makes 400, 800 and 1600). */
export const CONTENT_IMAGE_WIDTH = 800;

/** `<img>` data for a processed blog image: the 800 px rendition (or the nearest) and its size. */
export function contentImageToInsert(image: ContentImage, alt: string): InsertedImage {
  const src = imageSrc(image, CONTENT_IMAGE_WIDTH);
  const shown = Number(/\/(\d+)\.webp$/.exec(src)?.[1] ?? image.width);
  const width = Math.min(shown, image.width);
  return {
    src,
    alt: alt.trim(),
    width,
    height: image.width > 0 ? Math.round((image.height * width) / image.width) : image.height,
  };
}

/**
 * "Dodaj fotografiju" in a blog post: upload one photo (purpose `blog`), describe it (alt text
 * for people who cannot see it), then it is placed into the text where the cursor was.
 */
@Component({
  selector: 'adm-content-image-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    ImageUpload,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Fotografija u tekstu</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="w-full">
        <mat-label>Šta je na fotografiji</mat-label>
        <input matInput [formControl]="alt" maxlength="200" data-testid="image-alt" />
        <mat-hint
          >Kratak opis za one koji ne vide sliku, na primer „Tegle džema od šljiva na
          stolu“.</mat-hint
        >
      </mat-form-field>
      @if (ready(); as image) {
        <img
          [src]="image.src"
          alt=""
          class="mt-3 max-h-48 rounded-md"
          data-testid="image-preview"
        />
      } @else {
        <adm-image-upload
          class="mt-3"
          purpose="blog"
          [attach]="attach"
          (uploaded)="uploaded($event)"
        />
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Odustani</button>
      <button
        matButton="filled"
        type="button"
        data-testid="image-insert"
        [disabled]="!ready()"
        (click)="insert()"
      >
        Ubaci u tekst
      </button>
    </mat-dialog-actions>
  `,
})
export class ContentImageDialog {
  private readonly api = inject(BlogApi);
  private readonly ref = inject<MatDialogRef<ContentImageDialog, InsertedImage>>(MatDialogRef);

  readonly alt = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(200)],
  });
  readonly ready = signal<InsertedImage | null>(null);
  private image: ContentImage | null = null;

  /** After the storage upload: ask the API for the renditions (retried while processing). */
  protected readonly attach = (key: string) =>
    this.api.contentImage(key).pipe(retryWhileImageNotReady());

  uploaded(upload: UploadedImage): void {
    this.image = upload.result as ContentImage;
    this.ready.set(contentImageToInsert(this.image, this.alt.value));
  }

  insert(): void {
    if (this.image) {
      this.ref.close(contentImageToInsert(this.image, this.alt.value));
    }
  }
}
