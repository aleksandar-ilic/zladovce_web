import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { ApiError, asApiError } from '@zladovce/api';
import { AdminBlogPost } from '@zladovce/models';
import { UiBadge, UiErrorState, UiLoadingState, validationMessage } from '@zladovce/ui';
import { formatDateTime, SrDatePipe } from '@zladovce/utilities';
import { catchError, filter, map, Observable, of, switchMap } from 'rxjs';
import { BlogApi } from '../../data/blog-api';
import { retryWhileImageNotReady, uploadErrorMessage } from '../../data/media-upload';
import { ConfirmService } from '../../shared/confirm-dialog';
import { ImageUpload, UploadedImage } from '../../shared/image-upload';
import { imageSrc } from '../../shared/images';
import { SLUG_MESSAGES } from '../../shared/patterns';
import { InsertedImage, RichTextEditor } from '../../shared/rich-text-editor';
import { applyServerErrors } from '../../shared/server-errors';
import { HasUnsavedChanges, warnBeforeUnload } from '../../shared/unsaved-changes';
import {
  BLOG_LIMITS,
  BLOG_STATE_LABELS,
  BLOG_STATE_TONES,
  blogRequest,
  blogStateText,
  createBlogForm,
  fillBlogForm,
  missingForPublish,
} from './blog-form';
import { ContentImageDialog } from './content-image.dialog';
import { PublishDialog, PublishDialogData, PublishDialogResult } from './publish.dialog';

type LoadState =
  { status: 'loading' } | { status: 'error'; error: ApiError } | { status: 'loaded' };

/**
 * New or existing blog post: title, address, short intro, cover photo, text with photos,
 * category and SEO. A new post is saved as a draft; "Objavi" publishes it now or at a chosen time,
 * "Povuci sa sajta" makes it a draft again, "Arhiviraj" removes it from the site for good.
 * Every save sends the latest `version`; a change made meanwhile by someone else is reported.
 */
@Component({
  selector: 'adm-blog-post-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    SrDatePipe,
    UiBadge,
    UiErrorState,
    UiLoadingState,
    ImageUpload,
    RichTextEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
  template: `
    <a routerLink="/blog" class="text-sm font-semibold text-olive-700 underline underline-offset-4"
      >← Nazad na blog</a
    >
    <h1 class="mt-3 text-3xl">{{ isNew() ? 'Nova objava' : 'Izmena objave' }}</h1>

    @switch (load().status) {
      @case ('loading') {
        <ui-loading-state label="Učitavanje objave…" />
      }
      @case ('error') {
        <ui-error-state title="Objava nije učitana" [message]="loadError()" (retry)="fetch()" />
      }
      @default {
        @if (post(); as p) {
          <div
            class="mt-3 flex max-w-4xl flex-wrap items-center gap-3 rounded-lg border border-cream-200 bg-white p-4"
            data-testid="post-state"
          >
            <ui-badge [tone]="tones[p.state]">{{ labels[p.state] }}</ui-badge>
            <span class="text-sm text-ink-700">{{ stateText() }}</span>
            <span class="flex-1"></span>
            @if (p.state === 'Draft') {
              <button
                matButton="filled"
                type="button"
                data-testid="publish"
                [disabled]="busy()"
                (click)="publish()"
              >
                Objavi…
              </button>
            } @else {
              @if (p.state === 'Scheduled') {
                <button
                  matButton="outlined"
                  type="button"
                  data-testid="reschedule"
                  [disabled]="busy()"
                  (click)="publish()"
                >
                  Promeni vreme objave
                </button>
              }
              <button
                matButton="outlined"
                type="button"
                data-testid="unpublish"
                [disabled]="busy()"
                (click)="unpublish()"
              >
                Povuci sa sajta
              </button>
            }
            <button
              matButton
              type="button"
              class="danger-button"
              data-testid="archive"
              [disabled]="busy()"
              (click)="archive()"
            >
              Arhiviraj
            </button>
          </div>
        }

        @if (conflict()) {
          <div
            class="mt-4 max-w-4xl rounded-lg border border-warning-700/25 bg-warning-50 p-4"
            role="alert"
            data-testid="conflict"
          >
            <p class="font-semibold">Ovu objavu je u međuvremenu promenio neko drugi.</p>
            <p class="mt-1">
              Vaše izmene nisu sačuvane. Učitajte najnoviju verziju (izmene sa ove strane će se
              izgubiti), pa ih unesite ponovo.
            </p>
            <button
              matButton="filled"
              type="button"
              class="mt-3"
              data-testid="reload-latest"
              (click)="fetch()"
            >
              Učitaj najnoviju verziju
            </button>
          </div>
        }

        <form
          class="mt-6 flex max-w-4xl flex-col gap-6"
          [formGroup]="form"
          (ngSubmit)="save()"
          novalidate
        >
          @if (formError(); as message) {
            <p
              class="rounded-md bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
              role="alert"
              data-testid="form-error"
            >
              {{ message }}
            </p>
          }

          <section class="rounded-lg border border-cream-200 bg-white p-5">
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Naslov</mat-label>
              <input
                matInput
                formControlName="title"
                [maxlength]="limits.title"
                data-testid="title"
              />
              @if (form.controls.title.errors; as e) {
                <mat-error>{{ message(e, { required: 'Upišite naslov objave.' }) }}</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline" class="mt-2 w-full">
              <mat-label>Adresa (nije obavezno)</mat-label>
              <span matTextPrefix>/blog/</span>
              <input matInput formControlName="slug" [maxlength]="limits.slug" data-testid="slug" />
              <mat-hint>{{
                isNew()
                  ? 'Ostavite prazno da se adresa napravi od naslova.'
                  : 'Promena adrese menja link do objave.'
              }}</mat-hint>
              @if (form.controls.slug.errors; as e) {
                <mat-error>{{ message(e, slugMessages) }}</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline" class="mt-2 w-full">
              <mat-label>Kratak uvod</mat-label>
              <textarea
                matInput
                rows="3"
                formControlName="excerpt"
                [maxlength]="limits.excerpt"
                data-testid="excerpt"
              ></textarea>
              <mat-hint>Prikazuje se u listi objava. Potreban je za objavu.</mat-hint>
              <mat-hint align="end"
                >{{ form.controls.excerpt.value.length }} / {{ limits.excerpt }}</mat-hint
              >
              @if (form.controls.excerpt.errors; as e) {
                <mat-error>{{ message(e) }}</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline" class="mt-2 w-full sm:w-80">
              <mat-label>Kategorija bloga</mat-label>
              <mat-select formControlName="categoryId" data-testid="category">
                <mat-option [value]="null">Bez kategorije</mat-option>
                @for (c of categories(); track c.id) {
                  <mat-option [value]="c.id">{{ c.name }}</mat-option>
                }
              </mat-select>
              @if (form.controls.categoryId.errors; as e) {
                <mat-error>{{ message(e) }}</mat-error>
              }
            </mat-form-field>
          </section>

          <section class="rounded-lg border border-cream-200 bg-white p-5" data-testid="cover">
            <h2 class="text-xl">Naslovna fotografija</h2>
            @if (coverPreview(); as preview) {
              <div class="mt-4 flex flex-wrap items-end gap-4">
                <img
                  [src]="preview"
                  alt="Naslovna fotografija objave"
                  class="h-40 w-64 rounded-md bg-cream-100 object-cover"
                  data-testid="cover-image"
                />
                <button
                  matButton
                  type="button"
                  class="danger-button"
                  data-testid="remove-cover"
                  (click)="removeCover()"
                >
                  Ukloni fotografiju
                </button>
              </div>
              <p class="mt-3 text-sm text-ink-700">Nova fotografija zamenjuje postojeću.</p>
            } @else {
              <p class="mt-2 text-sm text-ink-700">
                Objava još nema naslovnu fotografiju (nije obavezna).
              </p>
            }
            @if (form.controls.coverImageKey.errors?.['server']; as serverError) {
              <p class="mt-2 text-sm font-medium text-danger-700" role="alert">{{ serverError }}</p>
            }
            <adm-image-upload
              class="mt-4"
              purpose="blog"
              (uploaded)="coverUploaded($event)"
              (busyChange)="uploading.set($event)"
            />
          </section>

          <section class="rounded-lg border border-cream-200 bg-white p-5">
            <h2 class="text-xl" id="post-text">Tekst objave</h2>
            <p class="mt-1 mb-3 text-sm text-ink-700">
              Naslove, liste, citate, veze i fotografije dodajete dugmićima iznad teksta.
              Fotografija se ubacuje ispod pasusa u kom je kursor.
            </p>
            <adm-rich-text-editor
              #editor
              formControlName="contentHtml"
              label="Tekst objave"
              [images]="true"
              [invalid]="form.controls.contentHtml.touched && !!form.controls.contentHtml.errors"
              (imageRequested)="addImage()"
            />
            @if (form.controls.contentHtml.errors; as e) {
              <p class="mt-1 text-sm text-danger-700" role="alert">{{ message(e) }}</p>
            }
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
                <input matInput formControlName="seoTitle" [maxlength]="limits.seoTitle" />
                <mat-hint>Ako ostane prazno, koristi se naslov objave.</mat-hint>
                @if (form.controls.seoTitle.errors; as e) {
                  <mat-error>{{ message(e) }}</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline" class="mt-2 w-full">
                <mat-label>SEO opis</mat-label>
                <textarea
                  matInput
                  rows="3"
                  formControlName="seoDescription"
                  [maxlength]="limits.seoDescription"
                ></textarea>
                <mat-hint>Ako ostane prazno, koristi se kratak uvod.</mat-hint>
                @if (form.controls.seoDescription.errors; as e) {
                  <mat-error>{{ message(e) }}</mat-error>
                }
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
              [disabled]="busy() || uploading() || conflict()"
            >
              {{ saving() ? 'Čuvanje…' : isNew() ? 'Sačuvaj kao nacrt' : 'Sačuvaj izmene' }}
            </button>
            <a matButton routerLink="/blog">Odustani</a>
            @if (uploading()) {
              <span class="text-sm text-ink-500">Sačekajte da se fotografija pošalje.</span>
            } @else if (post(); as p) {
              <span class="text-sm text-ink-500"
                >Poslednja izmena: {{ p.updatedAt | srDate: 'dateTime' }}</span
              >
            }
          </div>
        </form>
      }
    }
  `,
})
export class BlogPostFormPage implements OnInit, HasUnsavedChanges {
  private readonly api = inject(BlogApi);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  /** Route parameter (`/blog/:id`); absent on `/blog/nova`. */
  readonly id = input<string>();

  protected readonly message = validationMessage;
  protected readonly slugMessages = SLUG_MESSAGES;
  protected readonly limits = BLOG_LIMITS;
  protected readonly labels = BLOG_STATE_LABELS;
  protected readonly tones = BLOG_STATE_TONES;
  readonly form = createBlogForm(inject(FormBuilder));
  protected readonly isNew = computed(() => !this.id());
  protected readonly load = signal<LoadState>({ status: 'loading' });
  readonly post = signal<AdminBlogPost | null>(null);
  readonly saving = signal(false);
  readonly acting = signal(false);
  protected readonly busy = computed(() => this.saving() || this.acting());
  protected readonly uploading = signal(false);
  readonly conflict = signal(false);
  readonly formError = signal<string | null>(null);
  protected readonly coverPreview = signal<string | null>(null);
  protected readonly categories = toSignal(
    this.api.categories().pipe(
      map((list) => list.items),
      catchError(() => of([])),
    ),
    { initialValue: [] },
  );
  protected readonly stateText = computed(() => {
    const post = this.post();
    return post ? blogStateText(post.state, post.publishedAt) : '';
  });

  private readonly editor = viewChild<RichTextEditor>('editor');
  private localPreview: string | null = null;

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
    warnBeforeUnload(event, this.hasUnsavedChanges());
  }

  protected loadError(): string {
    const state = this.load();
    if (state.status !== 'error') {
      return '';
    }
    return state.error.isNotFound ? 'Objava ne postoji ili je arhivirana.' : state.error.detail;
  }

  protected seoHasErrors(): boolean {
    return !!this.form.controls.seoTitle.errors || !!this.form.controls.seoDescription.errors;
  }

  fetch(): void {
    const id = this.id();
    this.conflict.set(false);
    this.formError.set(null);
    if (!id) {
      this.load.set({ status: 'loaded' });
      return;
    }
    this.load.set({ status: 'loading' });
    this.api
      .post(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (post) => {
          this.apply(post);
          this.load.set({ status: 'loaded' });
        },
        error: (error: unknown) => this.load.set({ status: 'error', error: asApiError(error) }),
      });
  }

  protected coverUploaded(upload: UploadedImage): void {
    this.revokePreview();
    this.localPreview =
      typeof URL.createObjectURL === 'function' ? URL.createObjectURL(upload.file) : null;
    this.coverPreview.set(this.localPreview);
    this.form.controls.coverImageKey.setValue(upload.key);
    this.form.controls.coverImageKey.markAsDirty();
  }

  removeCover(): void {
    this.revokePreview();
    this.coverPreview.set(null);
    this.form.controls.coverImageKey.setValue(null);
    this.form.controls.coverImageKey.markAsDirty();
  }

  protected addImage(): void {
    this.dialog
      .open<ContentImageDialog, unknown, InsertedImage>(ContentImageDialog, {
        width: '32rem',
        maxWidth: 'calc(100vw - 2rem)',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .pipe(filter((image): image is InsertedImage => !!image))
      .subscribe((image) => this.editor()?.insertImage(image));
  }

  /** Saves the form; a new post is created as a draft and the address changes to its id. */
  save(): void {
    this.saveChanges().subscribe((post) => {
      if (post) {
        this.snackBar.open(this.isNew() ? 'Nacrt je sačuvan.' : 'Izmene su sačuvane.', 'U redu', {
          duration: 4000,
        });
        this.afterSave(post);
      }
    });
  }

  /** Saves when needed; emits the saved post, or null when the form could not be saved. */
  private saveChanges(): Observable<AdminBlogPost | null> {
    if (this.busy() || this.conflict()) {
      return of(null);
    }
    this.formError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formError.set('Proverite označena polja.');
      return of(null);
    }
    const current = this.post();
    if (current && !this.form.dirty) {
      return of(current);
    }
    this.saving.set(true);
    const body = blogRequest(this.form, current?.version ?? null);
    const request = current ? this.api.update(current.id, body) : this.api.create(body);
    return request.pipe(
      retryWhileImageNotReady(),
      map((post) => {
        this.saving.set(false);
        this.apply(post);
        return post;
      }),
      catchError((error: unknown) => {
        this.saving.set(false);
        this.handleError(asApiError(error));
        return of(null);
      }),
      takeUntilDestroyed(this.destroyRef),
    );
  }

  private afterSave(post: AdminBlogPost): void {
    if (!this.id()) {
      void this.router.navigate(['/blog', post.id], { replaceUrl: true });
    }
  }

  /** Saves unsaved changes first, then asks when to publish. */
  publish(): void {
    const missing = missingForPublish(this.form);
    if (missing.length > 0) {
      this.formError.set(`Pre objave upišite: ${missing.join(', ')}.`);
      return;
    }
    this.saveChanges()
      .pipe(
        filter((post): post is AdminBlogPost => !!post),
        switchMap((post) =>
          this.dialog
            .open<PublishDialog, PublishDialogData, PublishDialogResult>(PublishDialog, {
              data: { publishedAt: post.state === 'Scheduled' ? post.publishedAt : null },
              width: '28rem',
              maxWidth: 'calc(100vw - 2rem)',
            })
            .afterClosed()
            .pipe(
              filter((result): result is PublishDialogResult => !!result),
              map((result) => ({ post, result })),
            ),
        ),
      )
      .subscribe(({ post, result }) => {
        this.act(this.api.publish(post.id, post.version, result.publishedAt), (updated) =>
          updated.state === 'Scheduled'
            ? `Objava je zakazana za ${formatDateTime(updated.publishedAt)}.`
            : 'Objava je objavljena na sajtu.',
        );
      });
  }

  unpublish(): void {
    const post = this.post();
    if (!post) {
      return;
    }
    this.confirm
      .ask({
        title: 'Povući objavu sa sajta?',
        message:
          'Objava postaje nacrt i više se ne vidi na sajtu. Možete je kasnije ponovo objaviti.',
        confirmLabel: 'Povuci sa sajta',
      })
      .pipe(filter(Boolean))
      .subscribe(() =>
        this.act(this.api.unpublish(post.id, post.version), () => 'Objava je povučena sa sajta.'),
      );
  }

  archive(): void {
    const post = this.post();
    if (!post) {
      return;
    }
    this.confirm
      .ask({
        title: 'Arhivirati objavu?',
        message: [
          `„${post.title}“ biće uklonjena sa sajta i iz liste objava.`,
          'Arhiviranu objavu nije moguće vratiti.',
        ],
        confirmLabel: 'Arhiviraj',
        tone: 'danger',
      })
      .pipe(filter(Boolean))
      .subscribe(() => {
        this.acting.set(true);
        this.api.archive(post.id).subscribe({
          next: () => {
            this.acting.set(false);
            this.form.markAsPristine();
            this.snackBar.open('Objava je arhivirana.', 'U redu', { duration: 4000 });
            void this.router.navigateByUrl('/blog');
          },
          error: (error: unknown) => {
            this.acting.set(false);
            this.handleError(asApiError(error));
          },
        });
      });
  }

  private act(request: Observable<AdminBlogPost>, done: (post: AdminBlogPost) => string): void {
    this.acting.set(true);
    this.formError.set(null);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (post) => {
        this.acting.set(false);
        this.apply(post);
        this.snackBar.open(done(post), 'U redu', { duration: 5000 });
        this.afterSave(post);
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.handleError(asApiError(error));
      },
    });
  }

  private handleError(error: ApiError): void {
    if (error.code === 'CONCURRENT_EDIT') {
      this.conflict.set(true);
      return;
    }
    if (
      error.code === 'IMAGE_NOT_READY' ||
      error.code.startsWith('UPLOAD') ||
      error.code === 'INVALID_IMAGE'
    ) {
      this.form.controls.coverImageKey.setErrors({ server: uploadErrorMessage(error) });
    }
    const unmatched = applyServerErrors(this.form, error);
    this.formError.set(
      unmatched.length > 0
        ? unmatched.join(' ')
        : error.isValidation
          ? 'Proverite označena polja.'
          : error.detail,
    );
  }

  private apply(post: AdminBlogPost): void {
    this.post.set(post);
    fillBlogForm(this.form, post);
    this.revokePreview();
    this.coverPreview.set(post.coverImage ? imageSrc(post.coverImage, 800) : null);
  }

  private revokePreview(): void {
    if (this.localPreview && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(this.localPreview);
    }
    this.localPreview = null;
  }
}
