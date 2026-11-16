import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { ApiError, asApiError } from '@zladovce/api';
import { CmsPageKey } from '@zladovce/models';
import { UiBadge, UiErrorState, UiLoadingState, validationMessage } from '@zladovce/ui';
import { SrDatePipe } from '@zladovce/utilities';
import { filter } from 'rxjs';
import { AdminCmsPage, ContentApi } from '../../data/content-api';
import { retryWhileImageNotReady, uploadErrorMessage } from '../../data/media-upload';
import { ConfirmService } from '../../shared/confirm-dialog';
import { ImageUpload, UploadedImage } from '../../shared/image-upload';
import { RichTextEditor } from '../../shared/rich-text-editor';
import { applyServerErrors } from '../../shared/server-errors';
import { HasUnsavedChanges, warnBeforeUnload } from '../../shared/unsaved-changes';
import {
  AboutForm,
  addAboutImage,
  CMS_LIMITS,
  CMS_PAGES,
  CmsForm,
  cmsRequest,
  createCmsForm,
  fillCmsForm,
  HomeForm,
  isCmsPageKey,
  RichTextForm,
  whyUsItem,
} from './cms-form';
import { CmsImageField } from './cms-image-field';

type LoadState =
  { status: 'loading' } | { status: 'error'; error: ApiError } | { status: 'loaded' };

/**
 * Editor of one CMS page. The form depends on the page: the home page has fixed sections (plain
 * text, two photos, up to six "why us" items), "O nama" has a text and up to six photos, the
 * legal pages have one text. Saving with every field empty – or "Isprazni stranicu" – takes the
 * page off the site.
 */
@Component({
  selector: 'adm-cms-page-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    SrDatePipe,
    UiBadge,
    UiErrorState,
    UiLoadingState,
    ImageUpload,
    RichTextEditor,
    CmsImageField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
  template: `
    <a
      routerLink="/sadrzaj"
      class="text-sm font-semibold text-olive-700 underline underline-offset-4"
      >← Nazad na stranice</a
    >
    @if (info(); as page) {
      <h1 class="mt-3 text-3xl">{{ page.label }}</h1>
      <p class="mt-1 text-ink-700">
        {{ page.description }} Adresa na sajtu: <span class="font-semibold">{{ page.path }}</span>
      </p>
      @if (page.legal) {
        <div
          class="mt-4 max-w-3xl rounded-lg border border-warning-700/25 bg-warning-50 p-4 text-sm"
          data-testid="legal-note"
        >
          <p class="font-semibold text-warning-700">Pravni tekst</p>
          <p class="mt-1 text-ink-900">
            Ovaj tekst mora napisati ili odobriti vlasnik radnje (po potrebi uz savet pravnika ili
            knjigovođe), u skladu sa propisima o zaštiti potrošača i podataka o ličnosti. Prodavnica
            ga ne popunjava sama i ne nudi gotov tekst.
          </p>
        </div>
      }
    } @else {
      <h1 class="mt-3 text-3xl">Stranica nije pronađena</h1>
    }

    @switch (load().status) {
      @case ('loading') {
        <ui-loading-state label="Učitavanje stranice…" />
      }
      @case ('error') {
        <ui-error-state
          title="Stranica nije učitana"
          [message]="loadErrorText()"
          (retry)="fetch()"
        />
      }
      @default {
        @if (page(); as p) {
          <p class="mt-3 flex flex-wrap items-center gap-2 text-sm" data-testid="page-state">
            @if (p.hasContent) {
              <ui-badge tone="success">Prikazuje se na sajtu</ui-badge>
            } @else {
              <ui-badge tone="warning">Prazna – ne prikazuje se na sajtu</ui-badge>
            }
            <span class="text-ink-500"
              >Poslednja izmena {{ p.updatedAt | srDate: 'dateTime'
              }}{{ p.updatedByAdminName ? ', ' + p.updatedByAdminName : '' }}</span
            >
          </p>
        }

        @if (conflict()) {
          <div
            class="mt-4 max-w-3xl rounded-lg border border-warning-700/25 bg-warning-50 p-4"
            role="alert"
            data-testid="conflict"
          >
            <p class="font-semibold">Ovu stranicu je u međuvremenu promenio neko drugi.</p>
            <p class="mt-1">
              Vaše izmene nisu sačuvane. Učitajte najnoviju verziju, pa ih unesite ponovo.
            </p>
            <button matButton="filled" type="button" class="mt-3" (click)="fetch()">
              Učitaj najnoviju verziju
            </button>
          </div>
        }

        @if (form(); as f) {
          <form
            class="mt-6 flex max-w-3xl flex-col gap-6"
            [formGroup]="f"
            (ngSubmit)="save()"
            novalidate
          >
            @if (formError(); as text) {
              <p
                class="rounded-md bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
                role="alert"
                data-testid="form-error"
              >
                {{ text }}
              </p>
            }

            <section class="rounded-lg border border-cream-200 bg-white p-5">
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Naslov stranice (nije obavezno)</mat-label>
                <input matInput formControlName="title" maxlength="200" data-testid="page-title" />
                <mat-hint>Ako ostane prazno, koristi se „{{ info()?.label }}“.</mat-hint>
                @if (f.controls.title.errors; as e) {
                  <mat-error>{{ message(e) }}</mat-error>
                }
              </mat-form-field>
            </section>

            @switch (key()) {
              @case ('home') {
                @if (homeForm(); as h) {
                  <div [formGroup]="h.controls.content" class="flex flex-col gap-6">
                    <section
                      class="rounded-lg border border-cream-200 bg-white p-5"
                      formGroupName="hero"
                      data-testid="home-hero"
                    >
                      <h2 class="text-xl">Veliki naslov (vrh strane)</h2>
                      <mat-form-field appearance="outline" class="mt-3 w-full">
                        <mat-label>Naslov</mat-label>
                        <input
                          matInput
                          formControlName="title"
                          [maxlength]="limits.heroTitle"
                          data-testid="hero-title"
                        />
                        @if (h.controls.content.controls.hero.controls.title.errors; as e) {
                          <mat-error>{{ message(e) }}</mat-error>
                        }
                      </mat-form-field>
                      <mat-form-field appearance="outline" class="mt-2 w-full">
                        <mat-label>Podnaslov</mat-label>
                        <textarea
                          matInput
                          rows="2"
                          formControlName="subtitle"
                          [maxlength]="limits.heroSubtitle"
                        ></textarea>
                        @if (h.controls.content.controls.hero.controls.subtitle.errors; as e) {
                          <mat-error>{{ message(e) }}</mat-error>
                        }
                      </mat-form-field>
                      <div class="mt-2 grid gap-x-3 sm:grid-cols-2">
                        <mat-form-field appearance="outline">
                          <mat-label>Tekst glavnog dugmeta</mat-label>
                          <input
                            matInput
                            formControlName="primaryCtaLabel"
                            [maxlength]="limits.cta"
                          />
                          <mat-hint>Vodi u prodavnicu, npr. „Pogledajte ponudu“.</mat-hint>
                        </mat-form-field>
                        <mat-form-field appearance="outline">
                          <mat-label>Tekst drugog dugmeta</mat-label>
                          <input
                            matInput
                            formControlName="secondaryCtaLabel"
                            [maxlength]="limits.cta"
                          />
                          <mat-hint>Vodi na „O nama“, npr. „Naša priča“.</mat-hint>
                        </mat-form-field>
                      </div>
                      <h3 class="mt-4 text-base font-semibold">Fotografija</h3>
                      <adm-cms-image-field
                        class="mt-2"
                        [group]="h.controls.content.controls.hero.controls.image"
                        (busyChange)="uploading.set($event)"
                      />
                    </section>

                    <section
                      class="rounded-lg border border-cream-200 bg-white p-5"
                      formGroupName="intro"
                    >
                      <h2 class="text-xl">Uvod</h2>
                      <mat-form-field appearance="outline" class="mt-3 w-full">
                        <mat-label>Naslov</mat-label>
                        <input matInput formControlName="title" [maxlength]="limits.sectionTitle" />
                      </mat-form-field>
                      <mat-form-field appearance="outline" class="mt-2 w-full">
                        <mat-label>Tekst</mat-label>
                        <textarea
                          matInput
                          rows="4"
                          formControlName="text"
                          [maxlength]="limits.sectionText"
                        ></textarea>
                        @if (h.controls.content.controls.intro.controls.text.errors; as e) {
                          <mat-error>{{ message(e) }}</mat-error>
                        }
                      </mat-form-field>
                    </section>

                    <section
                      class="rounded-lg border border-cream-200 bg-white p-5"
                      formGroupName="story"
                    >
                      <h2 class="text-xl">Naša priča</h2>
                      <mat-form-field appearance="outline" class="mt-3 w-full">
                        <mat-label>Naslov</mat-label>
                        <input matInput formControlName="title" [maxlength]="limits.sectionTitle" />
                      </mat-form-field>
                      <mat-form-field appearance="outline" class="mt-2 w-full">
                        <mat-label>Tekst</mat-label>
                        <textarea
                          matInput
                          rows="6"
                          formControlName="text"
                          [maxlength]="limits.storyText"
                        ></textarea>
                        @if (h.controls.content.controls.story.controls.text.errors; as e) {
                          <mat-error>{{ message(e) }}</mat-error>
                        }
                      </mat-form-field>
                      <h3 class="mt-2 text-base font-semibold">Fotografija</h3>
                      <adm-cms-image-field
                        class="mt-2"
                        [group]="h.controls.content.controls.story.controls.image"
                        (busyChange)="uploading.set($event)"
                      />
                    </section>

                    <section
                      class="rounded-lg border border-cream-200 bg-white p-5"
                      formGroupName="whyUs"
                      data-testid="home-why-us"
                    >
                      <h2 class="text-xl">Zašto mi</h2>
                      <mat-form-field appearance="outline" class="mt-3 w-full">
                        <mat-label>Naslov odeljka</mat-label>
                        <input matInput formControlName="title" [maxlength]="limits.sectionTitle" />
                      </mat-form-field>
                      <div formArrayName="items" class="flex flex-col gap-3">
                        @for (
                          item of h.controls.content.controls.whyUs.controls.items.controls;
                          track $index;
                          let i = $index
                        ) {
                          <fieldset
                            class="rounded-md border border-cream-200 p-3"
                            [formGroupName]="i"
                            data-testid="why-us-item"
                          >
                            <legend class="px-1 text-sm font-semibold">Stavka {{ i + 1 }}</legend>
                            <mat-form-field appearance="outline" class="w-full">
                              <mat-label>Naslov stavke</mat-label>
                              <input
                                matInput
                                formControlName="title"
                                [maxlength]="limits.itemTitle"
                                data-testid="why-us-title"
                              />
                              @if (item.controls.title.errors; as e) {
                                <mat-error>{{
                                  message(e, { required: 'Upišite naslov stavke ili je uklonite.' })
                                }}</mat-error>
                              }
                            </mat-form-field>
                            <mat-form-field appearance="outline" class="mt-2 w-full">
                              <mat-label>Kratak tekst</mat-label>
                              <textarea
                                matInput
                                rows="2"
                                formControlName="text"
                                [maxlength]="limits.itemText"
                              ></textarea>
                              @if (item.controls.text.errors; as e) {
                                <mat-error>{{ message(e) }}</mat-error>
                              }
                            </mat-form-field>
                            <button
                              matButton
                              type="button"
                              class="danger-button"
                              (click)="removeWhyUs(i)"
                            >
                              Ukloni stavku
                            </button>
                          </fieldset>
                        }
                      </div>
                      <button
                        matButton="outlined"
                        type="button"
                        class="mt-3"
                        data-testid="add-why-us"
                        [disabled]="
                          h.controls.content.controls.whyUs.controls.items.length >= limits.items
                        "
                        (click)="addWhyUs()"
                      >
                        Dodaj stavku
                      </button>
                      <p class="mt-1 text-sm text-ink-500">Najviše {{ limits.items }} stavki.</p>
                    </section>

                    <section
                      class="rounded-lg border border-cream-200 bg-white p-5"
                      formGroupName="quality"
                    >
                      <h2 class="text-xl">Kvalitet</h2>
                      <mat-form-field appearance="outline" class="mt-3 w-full">
                        <mat-label>Naslov</mat-label>
                        <input matInput formControlName="title" [maxlength]="limits.sectionTitle" />
                      </mat-form-field>
                      <mat-form-field appearance="outline" class="mt-2 w-full">
                        <mat-label>Tekst</mat-label>
                        <textarea
                          matInput
                          rows="4"
                          formControlName="text"
                          [maxlength]="limits.sectionText"
                        ></textarea>
                      </mat-form-field>
                    </section>
                  </div>
                }
              }
              @case ('about') {
                @if (aboutForm(); as a) {
                  <div [formGroup]="a.controls.content" class="flex flex-col gap-6">
                    <section class="rounded-lg border border-cream-200 bg-white p-5">
                      <h2 class="text-xl">Tekst</h2>
                      <adm-rich-text-editor
                        class="mt-3"
                        formControlName="bodyHtml"
                        label="Tekst stranice O nama"
                      />
                      @if (a.controls.content.controls.bodyHtml.errors; as e) {
                        <p class="mt-1 text-sm text-danger-700" role="alert">{{ message(e) }}</p>
                      }
                    </section>
                    <section
                      class="rounded-lg border border-cream-200 bg-white p-5"
                      data-testid="about-images"
                    >
                      <h2 class="text-xl">Fotografije</h2>
                      <p class="mt-1 text-sm text-ink-700">
                        Do {{ limits.images }} fotografija (imanje, proizvodnja, porodica).
                      </p>
                      <div class="mt-3 flex flex-col gap-4">
                        @for (
                          image of a.controls.content.controls.images.controls;
                          track $index;
                          let i = $index
                        ) {
                          <adm-cms-image-field
                            [group]="image"
                            [replaceable]="false"
                            (removed)="removeAboutImage(i)"
                          />
                        }
                      </div>
                      @if (a.controls.content.controls.images.length < limits.images) {
                        <adm-image-upload
                          class="mt-4"
                          purpose="page"
                          [multiple]="true"
                          (uploaded)="aboutImageUploaded($event)"
                          (busyChange)="uploading.set($event)"
                        />
                      }
                    </section>
                  </div>
                }
              }
              @default {
                @if (richForm(); as r) {
                  <section
                    class="rounded-lg border border-cream-200 bg-white p-5"
                    [formGroup]="r.controls.content"
                  >
                    <h2 class="text-xl">Tekst</h2>
                    <adm-rich-text-editor
                      class="mt-3"
                      formControlName="bodyHtml"
                      [label]="'Tekst stranice ' + (info()?.label ?? '')"
                    />
                    @if (r.controls.content.controls.bodyHtml.errors; as e) {
                      <p class="mt-1 text-sm text-danger-700" role="alert">{{ message(e) }}</p>
                    }
                  </section>
                }
              }
            }

            <mat-accordion>
              <mat-expansion-panel>
                <mat-expansion-panel-header>
                  <mat-panel-title>Napredno / SEO</mat-panel-title>
                  <mat-panel-description class="hidden sm:flex"
                    >Naslov i opis za Google (nije obavezno)</mat-panel-description
                  >
                </mat-expansion-panel-header>
                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>SEO naslov</mat-label>
                  <input matInput formControlName="seoTitle" maxlength="120" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="mt-2 w-full">
                  <mat-label>SEO opis</mat-label>
                  <textarea
                    matInput
                    rows="3"
                    formControlName="seoDescription"
                    maxlength="320"
                  ></textarea>
                </mat-form-field>
              </mat-expansion-panel>
            </mat-accordion>

            <div
              class="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-cream-200 bg-cream-50 py-3"
            >
              <button
                matButton="filled"
                type="submit"
                class="min-h-12"
                data-testid="save"
                [disabled]="saving() || uploading() || conflict()"
              >
                {{ saving() ? 'Čuvanje…' : 'Sačuvaj stranicu' }}
              </button>
              <a matButton routerLink="/sadrzaj">Odustani</a>
              @if (page()?.hasContent) {
                <button
                  matButton
                  type="button"
                  class="danger-button"
                  data-testid="clear-page"
                  [disabled]="saving() || conflict()"
                  (click)="clear()"
                >
                  Isprazni stranicu
                </button>
              }
              @if (uploading()) {
                <span class="text-sm text-ink-500">Sačekajte da se fotografija pošalje.</span>
              }
            </div>
          </form>
        }
      }
    }
  `,
})
export class CmsPageFormPage implements HasUnsavedChanges {
  private readonly api = inject(ContentApi);
  private readonly confirm = inject(ConfirmService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  /** Route parameter `/sadrzaj/stranice/:key`. */
  readonly key = input<string>('');

  protected readonly message = validationMessage;
  protected readonly limits = CMS_LIMITS;
  private readonly pageKey = computed((): CmsPageKey | null => {
    const key = this.key();
    return isCmsPageKey(key) ? key : null;
  });
  protected readonly info = computed(() => {
    const key = this.pageKey();
    return key ? CMS_PAGES[key] : null;
  });
  readonly form = signal<CmsForm | null>(null);
  protected readonly homeForm = computed(() =>
    this.pageKey() === 'home' ? (this.form() as HomeForm | null) : null,
  );
  protected readonly aboutForm = computed(() =>
    this.pageKey() === 'about' ? (this.form() as AboutForm | null) : null,
  );
  protected readonly richForm = computed(() => {
    const key = this.pageKey();
    return key && key !== 'home' && key !== 'about' ? (this.form() as RichTextForm | null) : null;
  });
  protected readonly load = signal<LoadState>({ status: 'loading' });
  readonly page = signal<AdminCmsPage | null>(null);
  readonly saving = signal(false);
  protected readonly uploading = signal(false);
  readonly conflict = signal(false);
  readonly formError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const key = this.pageKey();
      untracked(() => {
        this.form.set(key ? createCmsForm(key, this.fb) : null);
        this.fetch();
      });
    });
  }

  hasUnsavedChanges(): boolean {
    return !!this.form()?.dirty && !this.saving();
  }

  protected beforeUnload(event: BeforeUnloadEvent): void {
    warnBeforeUnload(event, this.hasUnsavedChanges());
  }

  protected loadErrorText(): string {
    const state = this.load();
    return state.status === 'error' ? state.error.detail : '';
  }

  fetch(): void {
    const key = this.pageKey();
    this.conflict.set(false);
    this.formError.set(null);
    if (!key) {
      this.load.set({
        status: 'error',
        error: new ApiError({
          status: 404,
          code: 'NOT_FOUND',
          title: 'Nije pronađeno',
          detail: 'Ova stranica ne postoji. Vratite se na listu stranica.',
        }),
      });
      return;
    }
    this.load.set({ status: 'loading' });
    this.api
      .page(key)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.apply(page);
          this.load.set({ status: 'loaded' });
        },
        error: (error: unknown) => this.load.set({ status: 'error', error: asApiError(error) }),
      });
  }

  addWhyUs(): void {
    const items = this.homeForm()?.controls.content.controls.whyUs.controls.items;
    if (items && items.length < CMS_LIMITS.items) {
      items.push(whyUsItem(this.fb));
      items.markAsDirty();
    }
  }

  removeWhyUs(index: number): void {
    const items = this.homeForm()?.controls.content.controls.whyUs.controls.items;
    items?.removeAt(index);
    items?.markAsDirty();
  }

  protected aboutImageUploaded(upload: UploadedImage): void {
    const form = this.aboutForm();
    if (form) {
      const preview =
        typeof URL.createObjectURL === 'function' ? URL.createObjectURL(upload.file) : '';
      addAboutImage(form, this.fb, upload.key, preview);
    }
  }

  removeAboutImage(index: number): void {
    const images = this.aboutForm()?.controls.content.controls.images;
    images?.removeAt(index);
    images?.markAsDirty();
  }

  save(options: { empty?: boolean } = {}): void {
    const key = this.pageKey();
    const form = this.form();
    const page = this.page();
    if (!key || !form || !page || this.saving() || this.conflict()) {
      return;
    }
    this.formError.set(null);
    if (!options.empty && form.invalid) {
      form.markAllAsTouched();
      this.formError.set('Proverite označena polja.');
      return;
    }
    this.saving.set(true);
    this.api
      .savePage(key, cmsRequest(key, form, page.version, options))
      .pipe(retryWhileImageNotReady(), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.apply(saved);
          this.snackBar.open(
            saved.hasContent
              ? 'Stranica je sačuvana i prikazuje se na sajtu.'
              : 'Stranica je sačuvana. Prazna je, pa se ne prikazuje na sajtu.',
            'U redu',
            { duration: 5000 },
          );
        },
        error: (error: unknown) => {
          this.saving.set(false);
          const apiError = asApiError(error);
          if (apiError.code === 'CONCURRENT_EDIT') {
            this.conflict.set(true);
            return;
          }
          const unmatched = applyServerErrors(form, apiError);
          const imageProblem = ['IMAGE_NOT_READY', 'INVALID_IMAGE', 'UPLOAD_NOT_FOUND'].includes(
            apiError.code,
          );
          this.formError.set(
            imageProblem
              ? uploadErrorMessage(apiError)
              : unmatched.length > 0
                ? unmatched.join(' ')
                : apiError.isValidation
                  ? 'Proverite označena polja.'
                  : apiError.detail,
          );
        },
      });
  }

  clear(): void {
    this.confirm
      .ask({
        title: 'Isprazniti stranicu?',
        message: [
          'Sav tekst i fotografije ove stranice biće obrisani, a stranica se više neće prikazivati na sajtu.',
          'Naslov i SEO podaci ostaju.',
        ],
        confirmLabel: 'Isprazni stranicu',
        tone: 'danger',
      })
      .pipe(filter(Boolean))
      .subscribe(() => this.save({ empty: true }));
  }

  private apply(page: AdminCmsPage): void {
    const key = this.pageKey();
    const form = this.form();
    this.page.set(page);
    if (key && form) {
      fillCmsForm(key, form, this.fb, page);
    }
  }
}
