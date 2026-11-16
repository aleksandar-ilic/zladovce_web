import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { asApiError } from '@zladovce/api';
import { AdminFaqItem, SaveFaqItemRequest } from '@zladovce/models';
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

/** A copy of `items` with the item at `index` moved by `delta` (−1 up, +1 down); same list at the ends. */
export function moveItem<T>(items: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  const copy = [...items];
  if (index < 0 || index >= copy.length || target < 0 || target >= copy.length) {
    return copy;
  }
  const [item] = copy.splice(index, 1);
  copy.splice(target, 0, item as T);
  return copy;
}

/**
 * Česta pitanja: question, answer (plain text) and whether it is shown on the site. The order on
 * the site is the order here; "Gore"/"Dole" moves an item and saves the new order right away.
 */
@Component({
  selector: 'adm-faq-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
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
    <p class="mt-4 max-w-3xl text-ink-700">
      Pitanja koja kupci često postavljaju, sa odgovorima. Na sajtu se prikazuju samo uključena
      pitanja, ovim redosledom.
    </p>

    <form
      class="mt-6 max-w-3xl rounded-lg border border-cream-200 bg-white p-5"
      [formGroup]="form"
      (ngSubmit)="save()"
      novalidate
      data-testid="faq-form"
    >
      <h2 class="text-xl">{{ editing() ? 'Izmena pitanja' : 'Novo pitanje' }}</h2>
      <mat-form-field appearance="outline" class="mt-3 w-full">
        <mat-label>Pitanje</mat-label>
        <input matInput formControlName="question" maxlength="300" data-testid="faq-question" />
        @if (form.controls.question.errors; as e) {
          <mat-error>{{ message(e, { required: 'Upišite pitanje.' }) }}</mat-error>
        }
      </mat-form-field>
      <mat-form-field appearance="outline" class="mt-2 w-full">
        <mat-label>Odgovor</mat-label>
        <textarea
          matInput
          rows="4"
          formControlName="answer"
          maxlength="4000"
          data-testid="faq-answer"
        ></textarea>
        <mat-hint align="end">{{ form.controls.answer.value.length }} / 4000</mat-hint>
        @if (form.controls.answer.errors; as e) {
          <mat-error>{{ message(e, { required: 'Upišite odgovor.' }) }}</mat-error>
        }
      </mat-form-field>
      <mat-slide-toggle class="mt-2" formControlName="isPublished"
        >Prikaži na sajtu</mat-slide-toggle
      >
      @if (error()) {
        <p class="mt-2 text-sm font-medium text-danger-700" role="alert">{{ error() }}</p>
      }
      <div class="mt-3 flex gap-2">
        <button matButton="filled" type="submit" [disabled]="saving()" data-testid="faq-save">
          {{ editing() ? 'Sačuvaj izmene' : 'Dodaj pitanje' }}
        </button>
        @if (editing()) {
          <button matButton type="button" (click)="cancel()">Odustani</button>
        }
      </div>
    </form>

    <div class="mt-6 max-w-3xl">
      @if (loadError()) {
        <ui-error-state title="Pitanja nisu učitana" [message]="loadError()" (retry)="load()" />
      } @else if (items(); as list) {
        @if (list.length === 0) {
          <ui-empty-state
            title="Još nema pitanja"
            description="Dok nema uključenih pitanja, stranica sa čestim pitanjima se ne prikazuje."
          />
        } @else {
          <ol class="flex flex-col gap-2" aria-label="Česta pitanja">
            @for (
              item of list;
              track item.id;
              let i = $index;
              let first = $first;
              let last = $last
            ) {
              <li
                class="flex flex-wrap items-start gap-3 rounded-lg border border-cream-200 bg-white p-3"
                data-testid="faq-row"
              >
                <span class="mt-0.5 w-6 shrink-0 text-right font-semibold text-ink-500"
                  >{{ i + 1 }}.</span
                >
                <div class="min-w-0 flex-1 basis-56">
                  <p class="font-semibold">{{ item.question }}</p>
                  <p class="mt-1 line-clamp-2 text-sm text-ink-700">{{ item.answer }}</p>
                  @if (!item.isPublished) {
                    <ui-badge class="mt-1" tone="neutral">Ne prikazuje se</ui-badge>
                  }
                </div>
                <div class="flex flex-wrap gap-1">
                  <button
                    matButton
                    type="button"
                    [disabled]="first || reordering()"
                    (click)="move(i, -1)"
                    [attr.aria-label]="'Pomeri gore: ' + item.question"
                    data-testid="faq-up"
                  >
                    ↑ Gore
                  </button>
                  <button
                    matButton
                    type="button"
                    [disabled]="last || reordering()"
                    (click)="move(i, 1)"
                    [attr.aria-label]="'Pomeri dole: ' + item.question"
                    data-testid="faq-down"
                  >
                    ↓ Dole
                  </button>
                  <button matButton type="button" (click)="edit(item)">Izmeni</button>
                  <button
                    matButton
                    type="button"
                    class="danger-button"
                    data-testid="faq-delete"
                    (click)="remove(item)"
                  >
                    Obriši
                  </button>
                </div>
              </li>
            }
          </ol>
        }
      } @else {
        <ui-loading-state />
      }
    </div>
  `,
})
export class FaqPage {
  private readonly api = inject(ContentApi);
  private readonly confirm = inject(ConfirmService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly message = validationMessage;
  readonly items = signal<AdminFaqItem[] | null>(null);
  readonly loadError = signal('');
  readonly editing = signal<AdminFaqItem | null>(null);
  readonly saving = signal(false);
  readonly reordering = signal(false);
  readonly error = signal('');
  readonly form = this.fb.group({
    question: ['', [Validators.required, notBlank, Validators.maxLength(300)]],
    answer: ['', [Validators.required, notBlank, Validators.maxLength(4000)]],
    isPublished: [true],
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loadError.set('');
    this.api.faq().subscribe({
      next: (list) => this.items.set(list.items),
      error: (error: unknown) => this.loadError.set(asApiError(error).detail),
    });
  }

  edit(item: AdminFaqItem): void {
    this.editing.set(item);
    this.error.set('');
    this.form.reset({
      question: item.question,
      answer: item.answer,
      isPublished: item.isPublished,
    });
  }

  cancel(): void {
    this.editing.set(null);
    this.error.set('');
    this.form.reset({ question: '', answer: '', isPublished: true });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const body: SaveFaqItemRequest = {
      question: v.question.trim(),
      answer: v.answer.trim(),
      isPublished: v.isPublished,
    };
    const current = this.editing();
    this.saving.set(true);
    (current ? this.api.updateFaq(current.id, body) : this.api.createFaq(body)).subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open(
          current ? 'Pitanje je izmenjeno.' : 'Pitanje je dodato na kraj liste.',
          'U redu',
          {
            duration: 4000,
          },
        );
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

  /** Moves one item and saves the whole order (the API wants every id once). */
  move(index: number, delta: number): void {
    const list = this.items();
    if (!list || this.reordering()) {
      return;
    }
    const next = moveItem(list, index, delta);
    const previous = list;
    this.items.set(next);
    this.reordering.set(true);
    this.api.reorderFaq(next.map((item) => item.id)).subscribe({
      next: (saved) => {
        this.reordering.set(false);
        this.items.set(saved.items);
      },
      error: (error: unknown) => {
        this.reordering.set(false);
        this.items.set(previous);
        this.snackBar.open(`Redosled nije sačuvan. ${asApiError(error).detail}`, 'U redu', {
          duration: 6000,
        });
      },
    });
  }

  remove(item: AdminFaqItem): void {
    this.confirm
      .ask({
        title: 'Obrisati pitanje?',
        message: `„${item.question}“ biće obrisano sa sajta.`,
        confirmLabel: 'Obriši',
        tone: 'danger',
      })
      .pipe(filter(Boolean))
      .subscribe(() =>
        this.api.deleteFaq(item.id).subscribe({
          next: () => {
            this.snackBar.open('Pitanje je obrisano.', 'U redu', { duration: 4000 });
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
