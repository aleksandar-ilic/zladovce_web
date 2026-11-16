import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { validationMessage } from '@zladovce/ui';
import { ImageUpload, UploadedImage } from '../../shared/image-upload';
import { CmsImageGroup } from './cms-form';

/**
 * One photo of a CMS page: preview, "what is in the photo" text, replace (upload with purpose
 * `page`) and remove. The key in the group follows the API rule: the current key keeps the
 * photo, an upload key adds the new one, an empty key removes it.
 */
@Component({
  selector: 'adm-cms-image-field',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, ImageUpload],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div [formGroup]="group()" class="flex flex-col gap-3">
      @if (group().controls.key.value) {
        <div class="flex flex-wrap items-end gap-4">
          @if (group().controls.preview.value) {
            <img
              [src]="group().controls.preview.value"
              alt=""
              class="h-32 w-48 rounded-md bg-cream-100 object-cover"
              data-testid="cms-image-preview"
            />
          }
          <button
            matButton
            type="button"
            class="danger-button"
            data-testid="cms-image-remove"
            (click)="remove()"
          >
            {{ removeLabel() }}
          </button>
        </div>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Šta je na fotografiji</mat-label>
          <input matInput formControlName="alt" maxlength="200" />
          <mat-hint>Kratak opis za one koji ne vide sliku.</mat-hint>
          @if (group().controls.alt.errors; as e) {
            <mat-error>{{ message(e) }}</mat-error>
          }
        </mat-form-field>
        @if (group().controls.key.errors?.['server']; as serverError) {
          <p class="text-sm font-medium text-danger-700" role="alert">{{ serverError }}</p>
        }
      }
      @if (replaceable()) {
        <adm-image-upload
          purpose="page"
          (uploaded)="uploaded($event)"
          (busyChange)="busyChange.emit($event)"
        />
      }
    </div>
  `,
})
export class CmsImageField {
  readonly group = input.required<CmsImageGroup>();
  /** False in a gallery: there each photo is removed and new ones are added separately. */
  readonly replaceable = input(true);
  readonly removeLabel = input('Ukloni fotografiju');
  readonly busyChange = output<boolean>();
  readonly removed = output<void>();

  protected readonly message = validationMessage;
  private localPreview: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revoke());
  }

  uploaded(upload: UploadedImage): void {
    this.revoke();
    this.localPreview =
      typeof URL.createObjectURL === 'function' ? URL.createObjectURL(upload.file) : null;
    this.group().patchValue({ key: upload.key, preview: this.localPreview ?? '' });
    this.group().markAsDirty();
  }

  remove(): void {
    this.revoke();
    this.group().patchValue({ key: null, alt: '', preview: '' });
    this.group().markAsDirty();
    this.removed.emit();
  }

  private revoke(): void {
    if (this.localPreview && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(this.localPreview);
    }
    this.localPreview = null;
  }
}
