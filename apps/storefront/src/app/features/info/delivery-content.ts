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
import { RichTextPage } from '@zladovce/models';
import { UiErrorState, UiLoadingState } from '@zladovce/ui';
import { SrDatePipe } from '@zladovce/utilities';
import { concat, of, Subject, switchMap } from 'rxjs';
import { ContentApi } from '../../core/data/content-api';
import { PageState, pageStateWithRefresh } from '../../core/data/page-state';
import { StoreSettings } from '../../core/data/store-settings';
import { CONTACT_PATH, InfoPageDef } from '../../core/navigation';
import { SeoService } from '../../core/seo';
import { deliveryFacts } from '../../shared/delivery-facts';
import { NotFoundPage } from '../not-found/not-found.page';
import { setInfoSeo, setMissingSeo } from './info-seo';

/** What the delivery page shows: the CMS page, the store's delivery facts, or nothing (404). */
export type DeliveryView =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'missing' }
  | { kind: 'cms'; page: RichTextPage }
  | { kind: 'facts' };

/**
 * Dostava i plaćanje: the CMS page `delivery` when the owner wrote it; otherwise the delivery
 * facts of the store settings (price, free-shipping threshold, minimum order, delivery time,
 * note) with cash on delivery; with neither, the 404 view.
 */
@Component({
  selector: 'sf-delivery-content',
  imports: [NotFoundPage, RouterLink, SrDatePipe, UiErrorState, UiLoadingState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let v = view();
    @switch (v.kind) {
      @case ('missing') {
        <sf-not-found-page />
      }
      @case ('error') {
        <div class="mx-auto max-w-page px-gutter py-section">
          <ui-error-state
            title="Stranica nije učitana"
            [message]="errorMessage()"
            (retry)="retry()"
          />
        </div>
      }
      @case ('loading') {
        <div class="mx-auto max-w-page px-gutter py-section">
          <ui-loading-state />
        </div>
      }
      @default {
        <article class="mx-auto max-w-3xl px-gutter pb-section pt-10 md:pt-14">
          <p class="eyebrow">Informacije</p>
          <h1 class="mt-3 text-4xl md:text-5xl" data-testid="page-title">{{ title() }}</h1>
          @if (cmsPage(); as p) {
            <p class="mt-3 text-sm text-ink-700">
              Poslednja izmena:
              <time [attr.datetime]="p.updatedAt">{{ p.updatedAt | srDate: 'long' }}</time>
            </p>
            <div
              class="rich-text mt-8"
              [innerHTML]="p.content.bodyHtml"
              data-testid="page-body"
            ></div>
          } @else {
            <div data-testid="delivery-facts">
              <dl class="mt-8 grid gap-5 sm:grid-cols-2">
                @for (fact of facts(); track fact.title) {
                  <div class="rounded-lg border border-cream-200 bg-white p-5">
                    <dt class="text-sm font-semibold text-ink-900">{{ fact.title }}</dt>
                    <dd class="mt-1 whitespace-pre-line text-lg text-ink-700">{{ fact.text }}</dd>
                  </div>
                }
              </dl>
              <h2 class="mt-10 text-2xl">Plaćanje</h2>
              <p class="mt-3 text-lg text-ink-700">
                Plaćanje je pouzećem: porudžbinu plaćate kuriru pri preuzimanju paketa. Plaćanje
                unapred i korisnički nalog nisu potrebni.
              </p>
              <p class="mt-6 text-ink-700">
                Imate pitanje o dostavi?
                <a
                  [routerLink]="contactPath"
                  class="font-semibold text-olive-800 underline underline-offset-4"
                  >Pišite nam</a
                >.
              </p>
            </div>
          }
        </article>
      }
    }
  `,
})
export class DeliveryContent implements OnInit {
  readonly def = input.required<InfoPageDef>();

  private readonly api = inject(ContentApi);
  private readonly store = inject(StoreSettings);
  private readonly seo = inject(SeoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly hydrating = this.browser && !inject(Router).navigated;
  private readonly retries = new Subject<void>();

  protected readonly contactPath = CONTACT_PATH;
  readonly cms = signal<PageState<RichTextPage>>({ status: 'loading' });
  protected readonly facts = computed(() => deliveryFacts(this.store.shipping()));

  readonly view = computed<DeliveryView>(() => {
    const cms = this.cms();
    if (cms.status === 'loaded') {
      return { kind: 'cms', page: cms.data };
    }
    if (cms.status === 'loading') {
      return { kind: 'loading' };
    }
    if (cms.status === 'error') {
      return { kind: 'error', message: cms.error.detail };
    }
    // The CMS page is empty: fall back to the store settings.
    if (this.facts().length > 0) {
      return { kind: 'facts' };
    }
    const status = this.store.status();
    if (status === 'loading') {
      return { kind: 'loading' };
    }
    return status === 'error'
      ? { kind: 'error', message: 'Podaci o dostavi trenutno ne mogu da se učitaju.' }
      : { kind: 'missing' };
  });
  protected readonly cmsPage = computed(() => {
    const view = this.view();
    return view.kind === 'cms' ? view.page : null;
  });
  protected readonly title = computed(() => this.cmsPage()?.title?.trim() || this.def().label);
  protected readonly errorMessage = computed(() => {
    const view = this.view();
    return view.kind === 'error' ? view.message : '';
  });

  constructor() {
    this.store.ensureLoaded();
    effect(() => {
      const view = this.view();
      const path = `/${this.def().slug}`;
      if (view.kind === 'missing') {
        setMissingSeo(this.seo, path);
      } else if (view.kind === 'cms') {
        setInfoSeo(this.seo, {
          path,
          title: this.title(),
          seoTitle: view.page.seoTitle,
          seoDescription: view.page.seoDescription,
          html: view.page.content.bodyHtml,
        });
      } else if (view.kind === 'facts') {
        setInfoSeo(this.seo, {
          path,
          title: this.title(),
          text: `Dostava širom Srbije i plaćanje pouzećem. ${this.facts()
            .map((fact) => `${fact.title}: ${fact.text}.`)
            .join(' ')}`,
        });
      }
    });
  }

  ngOnInit(): void {
    concat(of(0), this.retries)
      .pipe(
        switchMap((_, attempt) =>
          pageStateWithRefresh(
            (options) => this.api.richTextPage('delivery', options),
            attempt === 0 && this.hydrating,
            this.browser,
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => this.cms.set(state));
  }

  protected retry(): void {
    this.store.ensureLoaded();
    this.retries.next();
  }
}
