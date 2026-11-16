import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiBadge, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { SrDatePipe } from '@zladovce/utilities';
import { of } from 'rxjs';
import { ContentApi } from '../../data/content-api';
import { RemoteData } from '../../shared/remote-data';
import { CMS_PAGE_KEYS, CMS_PAGES, isCmsPageKey } from './cms-form';
import { ContentTabs } from './content-tabs';

/**
 * Stranice sajta: the five pages with their state. An empty page is not shown on the site at all,
 * so it is marked clearly; legal pages carry a reminder that the text must come from the business.
 */
@Component({
  selector: 'adm-cms-pages-page',
  imports: [RouterLink, SrDatePipe, UiBadge, UiErrorState, UiLoadingState, ContentTabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <adm-content-tabs />
    <p class="mt-4 max-w-3xl text-ink-700">
      Tekstovi i fotografije stalnih stranica sajta. Stranica koja je
      <strong>prazna ne prikazuje se na sajtu</strong> (kupci je ne vide dok je ne popunite).
    </p>

    <div class="mt-6 max-w-4xl">
      @if (list().error; as e) {
        <ui-error-state
          title="Stranice nisu učitane"
          [message]="e.detail"
          (retry)="listData.reload()"
        />
      } @else if (list().data) {
        <ul class="flex flex-col gap-3" aria-label="Stranice">
          @for (page of pages(); track page.key) {
            <li
              class="relative flex flex-wrap items-center gap-3 rounded-lg border border-cream-200 bg-white p-4 hover:border-olive-400"
              [attr.data-page]="page.key"
              data-testid="cms-page-row"
            >
              <div class="min-w-0 flex-1 basis-64">
                <a
                  [routerLink]="['/sadrzaj/stranice', page.key]"
                  class="text-lg font-semibold text-ink-900 after:absolute after:inset-0 after:content-['']"
                  >{{ page.info.label }}</a
                >
                <p class="text-sm text-ink-700">{{ page.info.description }}</p>
                @if (page.info.legal) {
                  <p class="mt-1 text-xs text-warning-700">
                    Pravni tekst – piše ga ili odobrava vlasnik radnje.
                  </p>
                }
              </div>
              @if (page.hasContent) {
                <ui-badge tone="success">Prikazuje se na sajtu</ui-badge>
                <span class="text-sm text-ink-500"
                  >Izmena {{ page.updatedAt | srDate: 'date' }}</span
                >
              } @else {
                <ui-badge tone="warning" data-testid="page-empty"
                  >Prazna – ne prikazuje se</ui-badge
                >
              }
            </li>
          }
        </ul>
      } @else {
        <ui-loading-state label="Učitavanje stranica…" />
      }
    </div>
  `,
})
export class CmsPagesPage {
  private readonly api = inject(ContentApi);
  protected readonly listData = new RemoteData(of(true), () => this.api.pages());
  protected readonly list = this.listData.value;
  protected readonly pages = computed(() => {
    const items = this.list().data?.items ?? [];
    return CMS_PAGE_KEYS.map((key) => {
      const summary = items.find((item) => isCmsPageKey(item.key) && item.key === key);
      return {
        key,
        info: CMS_PAGES[key],
        hasContent: summary?.hasContent ?? false,
        updatedAt: summary?.updatedAt ?? null,
      };
    });
  });
}
