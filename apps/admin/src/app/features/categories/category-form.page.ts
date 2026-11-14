import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { ApiError, asApiError } from '@zladovce/api';
import { AdminCategory, SaveCategoryRequest } from '@zladovce/models';
import { notBlank } from '@zladovce/shared';
import { UiErrorState, UiLoadingState, validationMessage } from '@zladovce/ui';
import { slugify } from '@zladovce/utilities';
import { map, Observable, startWith } from 'rxjs';
import { CategoriesApi } from '../../data/categories-api';
import { retryWhileImageNotReady, uploadErrorMessage } from '../../data/media-upload';
import { ImageUpload, UploadedImage } from '../../shared/image-upload';
import { imageSrc } from '../../shared/images';
import { SLUG_MESSAGES, SLUG_PATTERN } from '../../shared/patterns';
import { applyServerErrors } from '../../shared/server-errors';
import { HasUnsavedChanges, warnBeforeUnload } from '../../shared/unsaved-changes';

type LoadState = { status: 'loading' } | { status: 'error'; error: ApiError } | { status: 'ready' };

/**
 * Nova kategorija / Izmena kategorije: name, shop address (generated from the name, can be
 * changed), description, one image, visibility and the optional SEO texts.
 */
@Component({
  selector: 'adm-category-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatExpansionModule,
    UiLoadingState,
    UiErrorState,
    ImageUpload,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
  template: `
    <a
      routerLink="/kategorije"
      class="text-sm font-semibold text-olive-700 underline underline-offset-4"
      >← Nazad na kategorije</a
    >
    <h1 class="mt-3 text-3xl">{{ isNew() ? 'Nova kategorija' : 'Izmena kategorije' }}</h1>

    @switch (load().status) {
      @case ('loading') {
        <ui-loading-state label="Učitavanje kategorije…" />
      }
      @case ('error') {
        <ui-error-state
          title="Kategorija nije učitana"
          [message]="loadError()"
          [retryable]="!notFound()"
          (retry)="fetch()"
        />
      }
      @default {
        <form
          class="mt-6 flex max-w-3xl flex-col gap-6"
          [formGroup]="form"
          (ngSubmit)="save()"
          novalidate
        >
          @if (formError(); as message) {
            <p
              class="rounded-md bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
              role="alert"
            >
              {{ message }}
            </p>
          }

          <section class="rounded-lg border border-cream-200 bg-white p-5">
            <h2 class="text-xl">Osnovno</h2>
            <mat-form-field appearance="outline" class="mt-4 w-full">
              <mat-label>Naziv kategorije</mat-label>
              <input matInput formControlName="name" maxlength="120" />
              <mat-hint>Na primer: Džemovi</mat-hint>
              @if (form.controls.name.errors; as errors) {
                <mat-error>{{ message(errors) }}</mat-error>
              }
            </mat-form-field>

            <div class="mt-2 text-sm text-ink-700">
              @if (!editSlug()) {
                <p>
                  Adresa u prodavnici:
                  <span class="font-semibold break-all" data-testid="slug-preview"
                    >/prodavnica/{{ slugPreview() || '…' }}</span
                  >
                  <button
                    type="button"
                    class="ml-2 cursor-pointer font-semibold text-olive-700 underline underline-offset-4"
                    (click)="startSlugEdit()"
                  >
                    Promeni adresu
                  </button>
                </p>
              } @else {
                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Adresa (slug)</mat-label>
                  <span matTextPrefix>/prodavnica/</span>
                  <input matInput formControlName="slug" maxlength="120" />
                  <mat-hint>{{
                    isNew()
                      ? 'Ostavite prazno da se adresa napravi od naziva.'
                      : 'Ostavite prazno da adresa ostane ista.'
                  }}</mat-hint>
                  @if (form.controls.slug.errors; as errors) {
                    <mat-error>{{ message(errors, slugMessages) }}</mat-error>
                  }
                </mat-form-field>
              }
            </div>

            <mat-form-field appearance="outline" class="mt-4 w-full">
              <mat-label>Opis (nije obavezno)</mat-label>
              <textarea matInput formControlName="description" rows="4" maxlength="2000"></textarea>
              <mat-hint align="end">{{ form.controls.description.value.length }} / 2000</mat-hint>
              @if (form.controls.description.errors; as errors) {
                <mat-error>{{ message(errors) }}</mat-error>
              }
            </mat-form-field>

            <mat-slide-toggle class="mt-2" formControlName="isActive">
              Prikaži kategoriju u prodavnici
            </mat-slide-toggle>
          </section>

          <section class="rounded-lg border border-cream-200 bg-white p-5">
            <h2 class="text-xl">Slika</h2>
            @if (imagePreview(); as preview) {
              <div class="mt-4 flex flex-wrap items-end gap-4">
                <img
                  [src]="preview"
                  alt="Slika kategorije"
                  class="h-40 w-56 rounded-md bg-cream-100 object-cover"
                  data-testid="category-image"
                />
                <button matButton type="button" class="danger-button" (click)="removeImage()">
                  Ukloni sliku
                </button>
              </div>
              <p class="mt-4 text-sm text-ink-700">Nova fotografija zamenjuje postojeću.</p>
            } @else {
              <p class="mt-2 text-sm text-ink-700">Kategorija još nema sliku.</p>
            }
            @if (form.controls.imageKey.errors?.['server']; as serverError) {
              <p class="mt-2 text-sm font-medium text-danger-700" role="alert">{{ serverError }}</p>
            }
            <adm-image-upload
              class="mt-4"
              purpose="category"
              (uploaded)="imageUploaded($event)"
              (busyChange)="uploading.set($event)"
            />
          </section>

          <mat-accordion>
            <mat-expansion-panel [expanded]="seoHasErrors()">
              <mat-expansion-panel-header>
                <mat-panel-title>Napredno / SEO</mat-panel-title>
                <mat-panel-description class="hidden sm:flex"
                  >Naslov i opis za Google (nije obavezno)</mat-panel-description
                >
              </mat-expansion-panel-header>
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>SEO naslov</mat-label>
                <input matInput formControlName="seoTitle" maxlength="120" />
                <mat-hint>Ako ostane prazno, koristi se naziv kategorije.</mat-hint>
                @if (form.controls.seoTitle.errors; as errors) {
                  <mat-error>{{ message(errors) }}</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline" class="mt-2 w-full">
                <mat-label>SEO opis</mat-label>
                <textarea
                  matInput
                  formControlName="seoDescription"
                  rows="3"
                  maxlength="320"
                ></textarea>
                <mat-hint align="end"
                  >{{ form.controls.seoDescription.value.length }} / 320</mat-hint
                >
                @if (form.controls.seoDescription.errors; as errors) {
                  <mat-error>{{ message(errors) }}</mat-error>
                }
              </mat-form-field>
            </mat-expansion-panel>
          </mat-accordion>

          <div class="flex flex-wrap gap-3">
            <button
              matButton="filled"
              type="submit"
              [disabled]="saving() || uploading()"
              data-testid="save"
            >
              {{ saving() ? 'Čuvanje…' : 'Sačuvaj kategoriju' }}
            </button>
            <a matButton routerLink="/kategorije">Odustani</a>
            @if (uploading()) {
              <span class="self-center text-sm text-ink-500"
                >Sačekajte da se fotografija pošalje.</span
              >
            }
          </div>
        </form>
      }
    }
  `,
})
export class CategoryFormPage implements OnInit, HasUnsavedChanges {
  private readonly api = inject(CategoriesApi);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;

  /** Route parameter (`/kategorije/:id`); absent on `/kategorije/nova`. */
  readonly id = input<string>();

  protected readonly message = validationMessage;
  protected readonly slugMessages = SLUG_MESSAGES;
  protected readonly isNew = computed(() => !this.id());
  protected readonly load = signal<LoadState>({ status: 'loading' });
  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly editSlug = signal(false);
  protected readonly imagePreview = signal<string | null>(null);

  readonly form = this.fb.group({
    name: ['', [Validators.required, notBlank, Validators.maxLength(120)]],
    slug: ['', [Validators.pattern(SLUG_PATTERN), Validators.maxLength(120)]],
    description: ['', [Validators.maxLength(2000)]],
    imageKey: this.fb.control<string | null>(null),
    isActive: [true],
    seoTitle: ['', [Validators.maxLength(120)]],
    seoDescription: ['', [Validators.maxLength(320)]],
  });

  private category: AdminCategory | null = null;
  private nextSortOrder = 0;
  private localPreview: string | null = null;

  private readonly name = toSignal(
    this.form.controls.name.valueChanges.pipe(startWith(this.form.controls.name.value)),
    { initialValue: '' },
  );
  protected readonly slugPreview = computed(() =>
    this.isNew() ? slugify(this.name()) : (this.category?.slug ?? slugify(this.name())),
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.revokePreview());
  }

  ngOnInit(): void {
    this.fetch();
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  protected beforeUnload(event: BeforeUnloadEvent): void {
    warnBeforeUnload(event, this.hasUnsavedChanges() || this.uploading());
  }

  protected loadError(): string {
    const state = this.load();
    return state.status === 'error' ? state.error.detail : '';
  }

  protected notFound(): boolean {
    const state = this.load();
    return state.status === 'error' && state.error.isNotFound;
  }

  protected seoHasErrors(): boolean {
    return this.form.controls.seoTitle.invalid || this.form.controls.seoDescription.invalid;
  }

  fetch(): void {
    this.load.set({ status: 'loading' });
    const id = this.id();
    // A new category goes to the end of the list; an existing one is loaded.
    const source: Observable<{ category: AdminCategory | null; last: number }> = id
      ? this.api.get(id).pipe(map((category) => ({ category, last: 0 })))
      : this.api.list().pipe(
          map((items) => ({
            category: null,
            last: items.reduce((max, item) => Math.max(max, item.sortOrder + 1), 0),
          })),
        );
    source.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ category, last }) => {
        this.category = category;
        this.nextSortOrder = last;
        if (category) {
          this.form.reset({
            name: category.name,
            slug: category.slug,
            description: category.description ?? '',
            imageKey: category.image?.key ?? null,
            isActive: category.isActive,
            seoTitle: category.seoTitle ?? '',
            seoDescription: category.seoDescription ?? '',
          });
          this.imagePreview.set(category.image ? imageSrc(category.image, 800) : null);
        }
        this.load.set({ status: 'ready' });
      },
      error: (error: unknown) => {
        const apiError = asApiError(error);
        if (!id) {
          // The list only decides the position; the form still works without it.
          this.load.set({ status: 'ready' });
          return;
        }
        this.load.set({ status: 'error', error: apiError });
      },
    });
  }

  protected startSlugEdit(): void {
    if (this.isNew() && !this.form.controls.slug.value) {
      this.form.controls.slug.setValue(slugify(this.form.controls.name.value));
    }
    this.editSlug.set(true);
  }

  protected imageUploaded(upload: UploadedImage): void {
    this.revokePreview();
    this.localPreview =
      typeof URL.createObjectURL === 'function' ? URL.createObjectURL(upload.file) : null;
    this.imagePreview.set(this.localPreview);
    this.form.controls.imageKey.setValue(upload.key);
    this.form.controls.imageKey.markAsDirty();
  }

  protected removeImage(): void {
    this.revokePreview();
    this.imagePreview.set(null);
    this.form.controls.imageKey.setValue(null);
    this.form.controls.imageKey.markAsDirty();
  }

  save(): void {
    if (this.saving()) {
      return;
    }
    this.formError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formError.set('Proverite označena polja.');
      return;
    }
    const value = this.form.getRawValue();
    const body: SaveCategoryRequest = {
      name: value.name.trim(),
      slug: this.editSlug() && value.slug.trim() !== '' ? value.slug.trim() : null,
      description: value.description.trim() || null,
      imageKey: value.imageKey,
      sortOrder: this.category?.sortOrder ?? this.nextSortOrder,
      isActive: value.isActive,
      seoTitle: value.seoTitle.trim() || null,
      seoDescription: value.seoDescription.trim() || null,
    };
    const id = this.id();
    const request = id ? this.api.update(id, body) : this.api.create(body);
    this.saving.set(true);
    request.pipe(retryWhileImageNotReady(), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.form.markAsPristine();
        this.saving.set(false);
        this.snackBar.open(`Kategorija „${saved.name}“ je sačuvana.`, 'U redu', {
          duration: 4000,
        });
        void this.router.navigateByUrl('/kategorije');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        const apiError = asApiError(error);
        // 409 SLUG_TAKEN carries `errors.slug`, applied like a validation error.
        if (apiError.code === 'SLUG_TAKEN') {
          this.editSlug.set(true);
        }
        const unmatched = applyServerErrors(this.form, apiError);
        if (
          [
            'INVALID_IMAGE',
            'UPLOAD_NOT_FOUND',
            'IMAGE_NOT_READY',
            'IMAGE_ALREADY_ATTACHED',
          ].includes(apiError.code)
        ) {
          this.form.controls.imageKey.setErrors({ server: uploadErrorMessage(apiError) });
        }
        this.formError.set(
          unmatched.length > 0
            ? unmatched.join(' ')
            : apiError.isValidation
              ? 'Proverite označena polja.'
              : apiError.detail,
        );
      },
    });
  }

  private revokePreview(): void {
    if (this.localPreview && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(this.localPreview);
    }
    this.localPreview = null;
  }
}
