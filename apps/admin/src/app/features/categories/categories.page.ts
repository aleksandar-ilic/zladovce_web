import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { ApiError, asApiError } from '@zladovce/api';
import { AdminCategory, CategoryImage } from '@zladovce/models';
import { UiBadge, UiEmptyState, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { filter, switchMap } from 'rxjs';
import { CategoriesApi } from '../../data/categories-api';
import { ConfirmService } from '../../shared/confirm-dialog';
import { imageSrc } from '../../shared/images';

type State =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; items: AdminCategory[] };

/** Plural of "proizvod" for a count: 1 proizvod, 2 proizvoda, 5 proizvoda, 21 proizvod. */
export function productCountLabel(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) {
    return `${count} proizvod`;
  }
  return `${count} proizvoda`;
}

/**
 * Kategorije: the categories in shop order. The order is changed by dragging a row (or with the
 * arrow buttons, also on a phone) and saved at once. Archiving asks first and explains why it can
 * be refused.
 */
@Component({
  selector: 'adm-categories-page',
  imports: [
    RouterLink,
    MatButtonModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    UiBadge,
    UiLoadingState,
    UiErrorState,
    UiEmptyState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-3xl">Kategorije</h1>
      <a matButton="filled" routerLink="/kategorije/nova">Nova kategorija</a>
    </div>
    <p class="mt-2 max-w-2xl text-ink-700">
      Redosled na ovoj stranici je redosled u prodavnici. Prevucite red (ili koristite strelice) da
      promenite redosled – čuva se odmah.
    </p>

    <div class="mt-6 max-w-4xl">
      @switch (state().status) {
        @case ('loading') {
          <ui-loading-state label="Učitavanje kategorija…" />
        }
        @case ('error') {
          <ui-error-state
            title="Kategorije nisu učitane"
            [message]="errorMessage()"
            (retry)="load()"
          />
        }
        @default {
          @if (items().length === 0) {
            <ui-empty-state
              title="Još nema kategorija"
              description="Kategorije grupišu proizvode u prodavnici (na primer Džemovi, Sokovi, Sirće). Napravite prvu kategoriju."
            >
              <a matButton="filled" routerLink="/kategorije/nova">Nova kategorija</a>
            </ui-empty-state>
          } @else {
            @if (savingOrder()) {
              <p class="mb-2 text-sm text-ink-500" role="status">Čuvanje redosleda…</p>
            }
            <ol
              cdkDropList
              class="flex flex-col gap-2"
              aria-label="Kategorije po redosledu u prodavnici"
              [cdkDropListDisabled]="savingOrder()"
              (cdkDropListDropped)="drop($event)"
            >
              @for (
                category of items();
                track category.id;
                let i = $index, first = $first, last = $last
              ) {
                <li
                  cdkDrag
                  class="flex flex-wrap items-center gap-3 rounded-lg border border-cream-200 bg-white p-3 sm:flex-nowrap"
                  data-testid="category-row"
                >
                  <button
                    cdkDragHandle
                    type="button"
                    class="hidden cursor-grab touch-none rounded-sm p-1 text-ink-500 sm:block"
                    [attr.aria-label]="'Prevucite da pomerite: ' + category.name"
                  >
                    <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="9" cy="6" r="1.5" />
                      <circle cx="15" cy="6" r="1.5" />
                      <circle cx="9" cy="12" r="1.5" />
                      <circle cx="15" cy="12" r="1.5" />
                      <circle cx="9" cy="18" r="1.5" />
                      <circle cx="15" cy="18" r="1.5" />
                    </svg>
                  </button>
                  @if (category.image; as image) {
                    <img
                      [src]="thumb(image)"
                      alt=""
                      class="size-14 shrink-0 rounded-md bg-cream-100 object-cover"
                    />
                  } @else {
                    <div
                      class="flex size-14 shrink-0 items-center justify-center rounded-md bg-cream-100 text-xs text-ink-500"
                    >
                      Bez slike
                    </div>
                  }
                  <div class="min-w-0 flex-1">
                    <a
                      class="font-semibold text-ink-900 underline-offset-4 hover:underline"
                      [routerLink]="['/kategorije', category.id]"
                      >{{ category.name }}</a
                    >
                    <div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-500">
                      <span>{{ countLabel(category.productCount) }}</span>
                      @if (category.isActive) {
                        <ui-badge tone="success">Aktivna</ui-badge>
                      } @else {
                        <ui-badge>Skrivena</ui-badge>
                      }
                    </div>
                  </div>
                  <div class="flex items-center gap-1">
                    <button
                      matIconButton
                      type="button"
                      [disabled]="first || savingOrder()"
                      [attr.aria-label]="'Pomeri gore: ' + category.name"
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
                        <path d="M6 15l6-6 6 6" />
                      </svg>
                    </button>
                    <button
                      matIconButton
                      type="button"
                      [disabled]="last || savingOrder()"
                      [attr.aria-label]="'Pomeri dole: ' + category.name"
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
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    <a matButton [routerLink]="['/kategorije', category.id]">Izmeni</a>
                    <button
                      matButton
                      type="button"
                      class="danger-button"
                      (click)="archive(category)"
                    >
                      Arhiviraj
                    </button>
                  </div>
                </li>
              }
            </ol>
          }
        }
      }
    </div>
  `,
})
export class CategoriesPage {
  private readonly api = inject(CategoriesApi);
  private readonly confirm = inject(ConfirmService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<State>({ status: 'loading' });
  protected readonly items = signal<AdminCategory[]>([]);
  protected readonly savingOrder = signal(false);
  protected readonly countLabel = productCountLabel;

  constructor() {
    this.load();
  }

  protected errorMessage(): string {
    const state = this.state();
    return state.status === 'error' ? state.error.detail : '';
  }

  protected thumb(image: CategoryImage): string {
    return imageSrc(image, 160);
  }

  load(): void {
    this.state.set({ status: 'loading' });
    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.state.set({ status: 'loaded', items });
        },
        error: (error: unknown) => this.state.set({ status: 'error', error: asApiError(error) }),
      });
  }

  protected drop(event: CdkDragDrop<unknown>): void {
    this.move(event.previousIndex, event.currentIndex);
  }

  protected move(from: number, to: number): void {
    if (from === to || to < 0 || to >= this.items().length || this.savingOrder()) {
      return;
    }
    const previous = this.items();
    const next = [...previous];
    moveItemInArray(next, from, to);
    this.items.set(next);
    this.savingOrder.set(true);
    this.api
      .reorder(next.map((category) => category.id))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.items.set(saved);
          this.savingOrder.set(false);
          this.snackBar.open('Redosled je sačuvan.', 'U redu', { duration: 3000 });
        },
        error: (error: unknown) => {
          this.items.set(previous);
          this.savingOrder.set(false);
          this.snackBar.open(`Redosled nije sačuvan. ${asApiError(error).detail}`, 'U redu', {
            duration: 8000,
          });
        },
      });
  }

  protected archive(category: AdminCategory): void {
    this.confirm
      .ask({
        title: `Arhivirati kategoriju „${category.name}“?`,
        message: [
          'Kategorija više neće biti prikazana u prodavnici ni na ovom spisku.',
          'Kategorija može da se arhivira samo kada u njoj nema proizvoda. Ako ima proizvoda, prvo ih premestite u drugu kategoriju ili ih arhivirajte.',
        ],
        confirmLabel: 'Arhiviraj',
        tone: 'danger',
      })
      .pipe(
        filter(Boolean),
        switchMap(() => this.api.archive(category.id)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.items.update((items) => items.filter((c) => c.id !== category.id));
          this.snackBar.open(`Kategorija „${category.name}“ je arhivirana.`, 'U redu', {
            duration: 4000,
          });
        },
        error: (error: unknown) => {
          const apiError = asApiError(error);
          const message =
            apiError.code === 'CATEGORY_HAS_PRODUCTS'
              ? `Kategorija „${category.name}“ nije arhivirana jer u njoj još ima proizvoda. Prvo te proizvode premestite u drugu kategoriju ili ih arhivirajte, pa pokušajte ponovo.`
              : apiError.detail;
          this.snackBar.open(message, 'U redu', { duration: 10000 });
        },
      });
  }
}
