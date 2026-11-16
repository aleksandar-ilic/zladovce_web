import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { asApiError } from '@zladovce/api';
import { AdminBlogCategory, SaveBlogCategoryRequest } from '@zladovce/models';
import { notBlank } from '@zladovce/shared';
import { UiEmptyState, UiErrorState, UiLoadingState, validationMessage } from '@zladovce/ui';
import { filter, of } from 'rxjs';
import { BlogApi } from '../../data/blog-api';
import { ConfirmService } from '../../shared/confirm-dialog';
import { SLUG_MESSAGES, SLUG_PATTERN } from '../../shared/patterns';
import { RemoteData } from '../../shared/remote-data';
import { pluralSr } from '../../shared/email-labels';
import { applyServerErrors } from '../../shared/server-errors';

/** Message for a category that still has posts (409 BLOG_CATEGORY_HAS_POSTS). */
export const CATEGORY_HAS_POSTS_TEXT =
  'Kategoriju koriste objave (nacrti ili objavljene). Prvo im promenite kategoriju, pa je onda obrišite.';

/**
 * Kategorije bloga: name, address (slug) and order; add, rename, delete. A category with posts
 * cannot be deleted (the API says so with BLOG_CATEGORY_HAS_POSTS).
 */
@Component({
  selector: 'adm-blog-categories-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    UiEmptyState,
    UiErrorState,
    UiLoadingState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/blog" class="text-sm font-semibold text-olive-700 underline underline-offset-4"
      >← Nazad na blog</a
    >
    <h1 class="mt-3 text-3xl">Kategorije bloga</h1>
    <p class="mt-2 max-w-2xl text-ink-700">
      Teme po kojima kupci mogu da pregledaju objave (na primer „Recepti“). Na sajtu se prikazuje
      samo kategorija koja ima bar jednu objavljenu objavu.
    </p>

    <form
      class="mt-6 max-w-3xl rounded-lg border border-cream-200 bg-white p-5"
      [formGroup]="form"
      (ngSubmit)="save()"
      novalidate
      data-testid="category-form"
    >
      <h2 class="text-xl">{{ editing() ? 'Izmena kategorije' : 'Nova kategorija' }}</h2>
      <div class="mt-3 grid gap-x-3 sm:grid-cols-[1fr_1fr_7rem]">
        <mat-form-field appearance="outline">
          <mat-label>Naziv</mat-label>
          <input matInput formControlName="name" maxlength="120" data-testid="category-name" />
          @if (form.controls.name.errors; as e) {
            <mat-error>{{ message(e, { required: 'Upišite naziv.' }) }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Adresa (nije obavezno)</mat-label>
          <input matInput formControlName="slug" maxlength="120" data-testid="category-slug" />
          <mat-hint>Prazno = napravi se od naziva.</mat-hint>
          @if (form.controls.slug.errors; as e) {
            <mat-error>{{ message(e, slugMessages) }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Redosled</mat-label>
          <input matInput type="number" min="0" formControlName="sortOrder" />
        </mat-form-field>
      </div>
      @if (error()) {
        <p class="text-sm font-medium text-danger-700" role="alert">{{ error() }}</p>
      }
      <div class="mt-2 flex gap-2">
        <button matButton="filled" type="submit" [disabled]="saving()" data-testid="category-save">
          {{ editing() ? 'Sačuvaj izmene' : 'Dodaj kategoriju' }}
        </button>
        @if (editing()) {
          <button matButton type="button" (click)="cancel()">Odustani</button>
        }
      </div>
    </form>

    <div class="mt-6 max-w-3xl">
      @if (list().error; as e) {
        <ui-error-state
          title="Kategorije nisu učitane"
          [message]="e.detail"
          (retry)="listData.reload()"
        />
      } @else if (list().data; as data) {
        @if (data.items.length === 0) {
          <ui-empty-state
            title="Još nema kategorija bloga"
            description="Kategorije nisu obavezne – objava može biti i bez kategorije."
          />
        } @else {
          <ul class="flex flex-col gap-2" aria-label="Kategorije bloga">
            @for (c of data.items; track c.id) {
              <li
                class="flex flex-wrap items-center gap-3 rounded-lg border border-cream-200 bg-white p-3"
                data-testid="blog-category-row"
              >
                <div class="min-w-0 flex-1">
                  <p class="font-semibold">{{ c.name }}</p>
                  <p class="text-sm text-ink-700">
                    /blog/kategorija/{{ c.slug }} · {{ postsText(c.postCount) }}
                  </p>
                </div>
                <button matButton type="button" (click)="edit(c)">Izmeni</button>
                <button
                  matButton
                  type="button"
                  class="danger-button"
                  data-testid="delete-category"
                  (click)="remove(c)"
                >
                  Obriši
                </button>
              </li>
            }
          </ul>
        }
      } @else {
        <ui-loading-state />
      }
    </div>
  `,
})
export class BlogCategoriesPage {
  private readonly api = inject(BlogApi);
  private readonly confirm = inject(ConfirmService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly message = validationMessage;
  protected readonly slugMessages = SLUG_MESSAGES;
  protected readonly listData = new RemoteData(of(true), () => this.api.categories());
  protected readonly list = this.listData.value;
  readonly editing = signal<AdminBlogCategory | null>(null);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly form = this.fb.group({
    name: ['', [Validators.required, notBlank, Validators.maxLength(120)]],
    slug: ['', [Validators.maxLength(120), Validators.pattern(SLUG_PATTERN)]],
    sortOrder: [0],
  });

  protected postsText(count: number): string {
    return `${count} ${pluralSr(count, 'objava', 'objave', 'objava')}`;
  }

  edit(category: AdminBlogCategory): void {
    this.editing.set(category);
    this.error.set('');
    this.form.reset({ name: category.name, slug: category.slug, sortOrder: category.sortOrder });
  }

  cancel(): void {
    this.editing.set(null);
    this.error.set('');
    this.form.reset({ name: '', slug: '', sortOrder: 0 });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const body: SaveBlogCategoryRequest = {
      name: v.name.trim(),
      slug: v.slug.trim() || null,
      sortOrder: Number(v.sortOrder) || 0,
    };
    const current = this.editing();
    this.saving.set(true);
    (current ? this.api.updateCategory(current.id, body) : this.api.createCategory(body)).subscribe(
      {
        next: () => {
          this.saving.set(false);
          this.snackBar.open(
            current ? 'Kategorija je izmenjena.' : 'Kategorija je dodata.',
            'U redu',
            {
              duration: 4000,
            },
          );
          this.cancel();
          this.listData.reload();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          const apiError = asApiError(error);
          const unmatched = applyServerErrors(this.form, apiError);
          this.error.set(
            unmatched.length > 0
              ? unmatched.join(' ')
              : apiError.isValidation
                ? ''
                : apiError.detail,
          );
        },
      },
    );
  }

  remove(category: AdminBlogCategory): void {
    this.confirm
      .ask({
        title: 'Obrisati kategoriju?',
        message: `Kategorija „${category.name}“ biće obrisana.`,
        confirmLabel: 'Obriši',
        tone: 'danger',
      })
      .pipe(filter(Boolean))
      .subscribe(() =>
        this.api.deleteCategory(category.id).subscribe({
          next: () => {
            this.snackBar.open('Kategorija je obrisana.', 'U redu', { duration: 4000 });
            if (this.editing()?.id === category.id) {
              this.cancel();
            }
            this.listData.reload();
          },
          error: (error: unknown) => {
            const apiError = asApiError(error);
            this.snackBar.open(
              apiError.code === 'BLOG_CATEGORY_HAS_POSTS'
                ? CATEGORY_HAS_POSTS_TEXT
                : apiError.detail,
              'U redu',
              { duration: 8000 },
            );
          },
        }),
      );
  }
}
