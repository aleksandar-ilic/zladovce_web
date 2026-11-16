import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { asApiError } from '@zladovce/api';
import { AdminTestimonial, SaveTestimonialRequest } from '@zladovce/models';
import { notBlank } from '@zladovce/shared';
import {
  UiBadge,
  UiEmptyState,
  UiErrorState,
  UiLoadingState,
  validationMessage,
} from '@zladovce/ui';
import { filter } from 'rxjs';
import { ContentApi } from '../../data/content-api';
import { ConfirmService } from '../../shared/confirm-dialog';
import { applyServerErrors } from '../../shared/server-errors';
import { ContentTabs } from './content-tabs';

export function testimonialRequest(v: {
  authorName: string;
  place: string;
  text: string;
  isPublished: boolean;
  sortOrder: number | null;
}): SaveTestimonialRequest {
  return {
    authorName: v.authorName.trim(),
    place: v.place.trim() === '' ? null : v.place.trim(),
    text: v.text.trim(),
    isPublished: v.isPublished,
    sortOrder: Number(v.sortOrder) || 0,
  };
}

/**
 * Utisci kupaca: real words of real customers (name, place, text). Only testimonials the customer
 * actually gave may be entered; nothing is invented or prefilled. The homepage section appears
 * only while at least one is shown.
 */
@Component({
  selector: 'adm-testimonials-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    UiBadge,
    UiEmptyState,
    UiErrorState,
    UiLoadingState,
    ContentTabs,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <adm-content-tabs />
    <div
      class="mt-4 max-w-3xl rounded-lg border border-warning-700/25 bg-warning-50 p-4 text-sm"
      data-testid="real-only-note"
    >
      <p class="font-semibold text-warning-700">Samo stvarni utisci</p>
      <p class="mt-1 text-ink-900">
        Upišite samo ono što je kupac zaista rekao ili napisao, uz njegovu saglasnost da se objavi.
        Izmišljeni ili izmenjeni utisci obmanjuju kupce i nisu dozvoljeni. Dok nema nijednog
        uključenog utiska, odeljak se ne prikazuje na sajtu.
      </p>
    </div>

    <form
      class="mt-6 max-w-3xl rounded-lg border border-cream-200 bg-white p-5"
      [formGroup]="form"
      (ngSubmit)="save()"
      novalidate
      data-testid="testimonial-form"
    >
      <h2 class="text-xl">{{ editing() ? 'Izmena utiska' : 'Novi utisak' }}</h2>
      <div class="mt-3 grid gap-x-3 sm:grid-cols-[1fr_1fr_7rem]">
        <mat-form-field appearance="outline">
          <mat-label>Ime kupca</mat-label>
          <input
            matInput
            formControlName="authorName"
            maxlength="100"
            data-testid="testimonial-author"
          />
          <mat-hint>Na primer „Marija P.“</mat-hint>
          @if (form.controls.authorName.errors; as e) {
            <mat-error>{{ message(e, { required: 'Upišite ime.' }) }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Mesto (nije obavezno)</mat-label>
          <input matInput formControlName="place" maxlength="100" />
          @if (form.controls.place.errors; as e) {
            <mat-error>{{ message(e) }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Redosled</mat-label>
          <input matInput type="number" min="0" formControlName="sortOrder" />
        </mat-form-field>
      </div>
      <mat-form-field appearance="outline" class="mt-2 w-full">
        <mat-label>Utisak</mat-label>
        <textarea
          matInput
          rows="3"
          formControlName="text"
          maxlength="1000"
          data-testid="testimonial-text"
        ></textarea>
        <mat-hint align="end">{{ form.controls.text.value.length }} / 1000</mat-hint>
        @if (form.controls.text.errors; as e) {
          <mat-error>{{ message(e, { required: 'Upišite utisak.' }) }}</mat-error>
        }
      </mat-form-field>
      <mat-slide-toggle class="mt-2" formControlName="isPublished"
        >Prikaži na sajtu</mat-slide-toggle
      >
      @if (!editing()) {
        <mat-checkbox
          class="mt-2 block"
          formControlName="confirmReal"
          data-testid="testimonial-real"
        >
          Potvrđujem da je ovo stvarni utisak kupca i da se kupac slaže sa objavom.
        </mat-checkbox>
        @if (form.controls.confirmReal.touched && form.controls.confirmReal.errors) {
          <p class="text-sm text-danger-700" role="alert">Potvrdite da je utisak stvaran.</p>
        }
      }
      @if (error()) {
        <p class="mt-2 text-sm font-medium text-danger-700" role="alert">{{ error() }}</p>
      }
      <div class="mt-3 flex gap-2">
        <button
          matButton="filled"
          type="submit"
          [disabled]="saving()"
          data-testid="testimonial-save"
        >
          {{ editing() ? 'Sačuvaj izmene' : 'Dodaj utisak' }}
        </button>
        @if (editing()) {
          <button matButton type="button" (click)="cancel()">Odustani</button>
        }
      </div>
    </form>

    <div class="mt-6 max-w-3xl">
      @if (loadError()) {
        <ui-error-state title="Utisci nisu učitani" [message]="loadError()" (retry)="load()" />
      } @else if (items(); as list) {
        @if (list.length === 0) {
          <ui-empty-state
            title="Još nema utisaka"
            description="Kada vam kupac pošalje lepe reči, uz njegovu dozvolu ih možete dodati ovde."
          />
        } @else {
          <ul class="flex flex-col gap-2" aria-label="Utisci kupaca">
            @for (item of list; track item.id) {
              <li
                class="flex flex-wrap items-start gap-3 rounded-lg border border-cream-200 bg-white p-3"
                data-testid="testimonial-row"
              >
                <div class="min-w-0 flex-1 basis-56">
                  <p class="text-ink-900">„{{ item.text }}“</p>
                  <p class="mt-1 text-sm font-semibold text-ink-700">
                    {{ item.authorName }}{{ item.place ? ', ' + item.place : '' }}
                  </p>
                  @if (!item.isPublished) {
                    <ui-badge class="mt-1" tone="neutral">Ne prikazuje se</ui-badge>
                  }
                </div>
                <div class="flex gap-1">
                  <button matButton type="button" (click)="edit(item)">Izmeni</button>
                  <button
                    matButton
                    type="button"
                    class="danger-button"
                    data-testid="testimonial-delete"
                    (click)="remove(item)"
                  >
                    Obriši
                  </button>
                </div>
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
export class TestimonialsPage {
  private readonly api = inject(ContentApi);
  private readonly confirm = inject(ConfirmService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly message = validationMessage;
  readonly items = signal<AdminTestimonial[] | null>(null);
  readonly loadError = signal('');
  readonly editing = signal<AdminTestimonial | null>(null);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly form = this.fb.group({
    authorName: ['', [Validators.required, notBlank, Validators.maxLength(100)]],
    place: ['', [Validators.maxLength(100)]],
    text: ['', [Validators.required, notBlank, Validators.maxLength(1000)]],
    isPublished: [true],
    sortOrder: this.fb.control<number | null>(0),
    confirmReal: [false, [Validators.requiredTrue]],
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loadError.set('');
    this.api.testimonials().subscribe({
      next: (list) => this.items.set(list.items),
      error: (error: unknown) => this.loadError.set(asApiError(error).detail),
    });
  }

  edit(item: AdminTestimonial): void {
    this.editing.set(item);
    this.error.set('');
    this.form.reset({
      authorName: item.authorName,
      place: item.place ?? '',
      text: item.text,
      isPublished: item.isPublished,
      sortOrder: item.sortOrder,
      confirmReal: true,
    });
  }

  cancel(): void {
    this.editing.set(null);
    this.error.set('');
    this.form.reset({
      authorName: '',
      place: '',
      text: '',
      isPublished: true,
      sortOrder: 0,
      confirmReal: false,
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const body = testimonialRequest(this.form.getRawValue());
    const current = this.editing();
    this.saving.set(true);
    (current
      ? this.api.updateTestimonial(current.id, body)
      : this.api.createTestimonial(body)
    ).subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open(current ? 'Utisak je izmenjen.' : 'Utisak je dodat.', 'U redu', {
          duration: 4000,
        });
        this.cancel();
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        const apiError = asApiError(error);
        const unmatched = applyServerErrors(this.form, apiError);
        this.error.set(
          unmatched.length > 0 ? unmatched.join(' ') : apiError.isValidation ? '' : apiError.detail,
        );
      },
    });
  }

  remove(item: AdminTestimonial): void {
    this.confirm
      .ask({
        title: 'Obrisati utisak?',
        message: `Utisak kupca ${item.authorName} biće obrisan sa sajta.`,
        confirmLabel: 'Obriši',
        tone: 'danger',
      })
      .pipe(filter(Boolean))
      .subscribe(() =>
        this.api.deleteTestimonial(item.id).subscribe({
          next: () => {
            this.snackBar.open('Utisak je obrisan.', 'U redu', { duration: 4000 });
            if (this.editing()?.id === item.id) {
              this.cancel();
            }
            this.load();
          },
          error: (error: unknown) =>
            this.snackBar.open(asApiError(error).detail, 'U redu', { duration: 6000 }),
        }),
      );
  }
}
