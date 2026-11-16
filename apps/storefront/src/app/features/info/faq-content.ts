import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ApiError } from '@zladovce/api';
import { PublicFaqItem } from '@zladovce/models';
import { UiErrorState, UiLoadingState } from '@zladovce/ui';
import { concat, map, of, Subject, switchMap } from 'rxjs';
import { ContentApi } from '../../core/data/content-api';
import { PageState, pageStateWithRefresh } from '../../core/data/page-state';
import { CONTACT_PATH, InfoPageDef } from '../../core/navigation';
import { SeoService } from '../../core/seo';
import { faqJsonLd } from '../../core/structured-data';
import { paragraphs } from '../home/home-content';
import { NotFoundPage } from '../not-found/not-found.page';
import { setInfoSeo, setMissingSeo } from './info-seo';

/**
 * Česta pitanja: published FAQ items as an accordion (a button per question with
 * `aria-expanded`/`aria-controls`; answers stay in the HTML, hidden, so they are prerendered
 * and indexable) and `FAQPage` JSON-LD. Without items the page is a 404.
 */
@Component({
  selector: 'sf-faq-content',
  imports: [NotFoundPage, RouterLink, UiErrorState, UiLoadingState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state().status) {
      @case ('missing') {
        <sf-not-found-page />
      }
      @case ('loaded') {
        <div class="mx-auto max-w-3xl px-gutter pb-section pt-10 md:pt-14">
          <p class="eyebrow">Pomoć</p>
          <h1 class="mt-3 text-4xl md:text-5xl" data-testid="page-title">{{ def().label }}</h1>
          @if (items().length > 1) {
            <div class="mt-8 flex flex-wrap gap-x-5 gap-y-2">
              <button
                type="button"
                class="cursor-pointer rounded-sm text-sm font-semibold text-olive-800 underline underline-offset-4"
                (click)="setAll(true)"
                data-testid="faq-open-all"
              >
                Otvori sve odgovore
              </button>
              <button
                type="button"
                class="cursor-pointer rounded-sm text-sm font-semibold text-olive-800 underline underline-offset-4"
                (click)="setAll(false)"
                data-testid="faq-close-all"
              >
                Zatvori sve
              </button>
            </div>
          }
          <ul class="mt-4 divide-y divide-cream-200 border-y border-cream-200" data-testid="faq">
            @for (item of items(); track item.id) {
              <li>
                <h2 class="font-sans text-lg font-semibold">
                  <button
                    type="button"
                    class="flex w-full cursor-pointer items-start justify-between gap-4 py-5 text-left text-ink-900 hover:text-olive-800"
                    [id]="'sf-faq-q-' + item.id"
                    [attr.aria-expanded]="isOpen(item.id)"
                    [attr.aria-controls]="'sf-faq-a-' + item.id"
                    (click)="toggle(item.id)"
                    data-testid="faq-question"
                  >
                    <span>{{ item.question }}</span>
                    <svg
                      class="mt-1 size-5 shrink-0 text-olive-700 transition-transform duration-150"
                      [class.rotate-180]="isOpen(item.id)"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m4 6 4 4 4-4" />
                    </svg>
                  </button>
                </h2>
                <div
                  role="region"
                  [id]="'sf-faq-a-' + item.id"
                  [attr.aria-labelledby]="'sf-faq-q-' + item.id"
                  [hidden]="!isOpen(item.id)"
                  class="pb-6 text-ink-700"
                  data-testid="faq-answer"
                >
                  @for (paragraph of answer(item); track $index; let first = $first) {
                    <p class="whitespace-pre-line" [class.mt-3]="!first">{{ paragraph }}</p>
                  }
                </div>
              </li>
            }
          </ul>
          <p class="mt-10 text-ink-700">
            Niste pronašli odgovor?
            <a
              [routerLink]="contactPath"
              class="font-semibold text-olive-800 underline underline-offset-4"
              >Pišite nam</a
            >.
          </p>
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-page px-gutter py-section">
          <ui-error-state
            title="Pitanja nisu učitana"
            [message]="errorMessage()"
            (retry)="retries.next()"
          />
        </div>
      }
      @default {
        <div class="mx-auto max-w-page px-gutter py-section">
          <ui-loading-state label="Učitavanje pitanja…" />
        </div>
      }
    }
  `,
})
export class FaqContent implements OnInit {
  readonly def = input.required<InfoPageDef>();

  private readonly api = inject(ContentApi);
  private readonly seo = inject(SeoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly hydrating = this.browser && !inject(Router).navigated;
  protected readonly retries = new Subject<void>();
  protected readonly contactPath = CONTACT_PATH;

  readonly state = signal<PageState<PublicFaqItem[]>>({ status: 'loading' });
  private readonly open = signal<ReadonlySet<string>>(new Set());
  protected readonly items = computed(() => {
    const state = this.state();
    return state.status === 'loaded' ? state.data : [];
  });
  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.error.detail : '';
  });

  constructor() {
    effect(() => {
      const state = this.state();
      const path = `/${this.def().slug}`;
      if (state.status === 'missing') {
        setMissingSeo(this.seo, path);
      } else if (state.status === 'loaded') {
        setInfoSeo(this.seo, {
          path,
          title: this.def().label,
          text: `Odgovori na česta pitanja kupaca: ${state.data.map((item) => item.question).join(' ')}`,
          jsonLd: [faqJsonLd(state.data)],
        });
      }
    });
  }

  ngOnInit(): void {
    concat(of(0), this.retries)
      .pipe(
        switchMap((_, attempt) =>
          pageStateWithRefresh(
            (options) =>
              this.api.faq(options).pipe(
                map((items) => {
                  if (items.length === 0) {
                    // No published items: the page is empty, like a CMS page answering 404.
                    throw new ApiError({ status: 404, code: 'NOT_FOUND', title: '', detail: '' });
                  }
                  return items;
                }),
              ),
            attempt === 0 && this.hydrating,
            this.browser,
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => this.state.set(state));
  }

  protected isOpen(id: string): boolean {
    return this.open().has(id);
  }

  protected toggle(id: string): void {
    this.open.update((open) => {
      const next = new Set(open);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  protected setAll(value: boolean): void {
    this.open.set(value ? new Set(this.items().map((item) => item.id)) : new Set());
  }

  protected answer(item: PublicFaqItem): string[] {
    return paragraphs(item.answer);
  }
}
