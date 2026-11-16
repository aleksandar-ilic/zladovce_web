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
import { Router } from '@angular/router';
import { RichTextPage } from '@zladovce/models';
import { UiErrorState, UiLoadingState } from '@zladovce/ui';
import { SrDatePipe } from '@zladovce/utilities';
import { concat, of, Subject, switchMap } from 'rxjs';
import { ContentApi, RichTextPageKey } from '../../core/data/content-api';
import { PageState, pageStateWithRefresh } from '../../core/data/page-state';
import { InfoPageDef } from '../../core/navigation';
import { SeoService } from '../../core/seo';
import { NotFoundPage } from '../not-found/not-found.page';
import { setInfoSeo, setMissingSeo } from './info-seo';

/**
 * Politika privatnosti, Uslovi korišćenja: the owner's text from the CMS (`bodyHtml`, sanitised
 * by the API and again by Angular's `[innerHTML]` sanitizer). Empty page → 404 view.
 */
@Component({
  selector: 'sf-rich-text-content',
  imports: [NotFoundPage, SrDatePipe, UiErrorState, UiLoadingState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state().status) {
      @case ('missing') {
        <sf-not-found-page />
      }
      @case ('loaded') {
        @let p = page()!;
        <article class="mx-auto max-w-3xl px-gutter pb-section pt-10 md:pt-14">
          <p class="eyebrow">Informacije</p>
          <h1 class="mt-3 text-4xl md:text-5xl" data-testid="page-title">{{ title() }}</h1>
          <p class="mt-3 text-sm text-ink-700">
            Poslednja izmena:
            <time [attr.datetime]="p.updatedAt">{{ p.updatedAt | srDate: 'long' }}</time>
          </p>
          <div
            class="rich-text mt-8"
            [innerHTML]="p.content.bodyHtml"
            data-testid="page-body"
          ></div>
        </article>
      }
      @case ('error') {
        <div class="mx-auto max-w-page px-gutter py-section">
          <ui-error-state
            title="Stranica nije učitana"
            [message]="errorMessage()"
            (retry)="retries.next()"
          />
        </div>
      }
      @default {
        <div class="mx-auto max-w-page px-gutter py-section">
          <ui-loading-state />
        </div>
      }
    }
  `,
})
export class RichTextContent implements OnInit {
  /** Fixed for the life of the component (InfoPage renders one instance per page). */
  readonly def = input.required<InfoPageDef>();
  private readonly destroyRef = inject(DestroyRef);

  private readonly api = inject(ContentApi);
  private readonly seo = inject(SeoService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly hydrating = this.browser && !inject(Router).navigated;
  protected readonly retries = new Subject<void>();

  readonly state = signal<PageState<RichTextPage>>({ status: 'loading' });
  protected readonly page = computed(() => {
    const state = this.state();
    return state.status === 'loaded' ? state.data : null;
  });
  protected readonly title = computed(() => this.page()?.title?.trim() || this.def().label);
  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.error.detail : '';
  });

  ngOnInit(): void {
    // Started here (inputs are set, the view is not rendered yet), so a hydrating page gets the
    // build-time answer before its first render.
    const key = this.def().cmsKey as RichTextPageKey;
    concat(of(0), this.retries)
      .pipe(
        switchMap((_, attempt) =>
          pageStateWithRefresh(
            (options) => this.api.richTextPage(key, options),
            attempt === 0 && this.hydrating,
            this.browser,
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => this.state.set(state));
  }

  constructor() {
    effect(() => {
      const state = this.state();
      const path = `/${this.def().slug}`;
      if (state.status === 'missing') {
        setMissingSeo(this.seo, path);
      } else if (state.status === 'loaded') {
        setInfoSeo(this.seo, {
          path,
          title: this.title(),
          seoTitle: state.data.seoTitle,
          seoDescription: state.data.seoDescription,
          html: state.data.content.bodyHtml,
        });
      }
    });
  }
}
