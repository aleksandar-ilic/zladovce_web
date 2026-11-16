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
import { AboutPage } from '@zladovce/models';
import { UiErrorState, UiLoadingState } from '@zladovce/ui';
import { concat, of, Subject, switchMap } from 'rxjs';
import { ContentApi } from '../../core/data/content-api';
import { PageState, pageStateWithRefresh } from '../../core/data/page-state';
import { InfoPageDef } from '../../core/navigation';
import { SeoService } from '../../core/seo';
import { shareImageUrl } from '../../core/structured-data';
import { ProductImage } from '../../shared/product-image';
import { NotFoundPage } from '../not-found/not-found.page';
import { setInfoSeo, setMissingSeo } from './info-seo';

/** O nama: the owner's story (`bodyHtml`) and up to six photos from the CMS. */
@Component({
  selector: 'sf-about-content',
  imports: [NotFoundPage, ProductImage, UiErrorState, UiLoadingState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state().status) {
      @case ('missing') {
        <sf-not-found-page />
      }
      @case ('loaded') {
        @let p = page()!;
        <article class="pb-section">
          <header class="bg-cream-100">
            <div class="mx-auto max-w-3xl px-gutter py-12 md:py-16">
              <p class="eyebrow">Zladovce</p>
              <h1 class="mt-3 text-4xl md:text-5xl" data-testid="page-title">{{ title() }}</h1>
            </div>
          </header>
          <div class="mx-auto max-w-3xl px-gutter pt-10 md:pt-14">
            <div
              class="rich-text"
              [innerHTML]="p.content.bodyHtml"
              data-testid="page-body"
            ></div>
          </div>
          @if (p.content.images.length > 0) {
            <section class="mx-auto mt-14 max-w-page px-gutter" aria-label="Fotografije">
              <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="about-gallery">
                @for (image of p.content.images; track image.key; let first = $first) {
                  <li>
                    <figure>
                      <sf-product-image
                        class="aspect-[4/3] rounded-lg shadow-soft"
                        [image]="image"
                        [alt]="image.alt || ''"
                        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
                        [priority]="first"
                      />
                      @if (image.alt) {
                        <figcaption class="mt-2 text-sm text-ink-700">{{ image.alt }}</figcaption>
                      }
                    </figure>
                  </li>
                }
              </ul>
            </section>
          }
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
export class AboutContent implements OnInit {
  readonly def = input.required<InfoPageDef>();

  private readonly api = inject(ContentApi);
  private readonly seo = inject(SeoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly hydrating = this.browser && !inject(Router).navigated;
  protected readonly retries = new Subject<void>();

  readonly state = signal<PageState<AboutPage>>({ status: 'loading' });
  protected readonly page = computed(() => {
    const state = this.state();
    return state.status === 'loaded' ? state.data : null;
  });
  protected readonly title = computed(() => this.page()?.title?.trim() || this.def().label);
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
          title: this.title(),
          seoTitle: state.data.seoTitle,
          seoDescription: state.data.seoDescription,
          html: state.data.content.bodyHtml,
          image: shareImageUrl(state.data.content.images[0]),
        });
      }
    });
  }

  ngOnInit(): void {
    concat(of(0), this.retries)
      .pipe(
        switchMap((_, attempt) =>
          pageStateWithRefresh(
            (options) => this.api.aboutPage(options),
            attempt === 0 && this.hydrating,
            this.browser,
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => this.state.set(state));
  }
}
