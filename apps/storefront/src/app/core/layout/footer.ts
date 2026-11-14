import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FOOTER_NAV } from '../navigation';

/**
 * Site footer. Contact details are intentionally absent: they come from Store Settings
 * (Phase 7) and are never invented.
 */
@Component({
  selector: 'sf-footer',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block border-t border-olive-800 bg-olive-900 text-cream-100' },
  template: `
    <div
      class="mx-auto flex max-w-page flex-col gap-10 px-gutter py-12 md:flex-row md:items-start md:justify-between md:py-16"
    >
      <div class="max-w-sm">
        <p class="font-serif text-3xl font-semibold text-cream-50">Zladovce</p>
        <p class="mt-3 text-sm text-cream-200">
          Porodični posao sa juga Srbije. Domaći džemovi, voćni sokovi, sirće i kompoti.
        </p>
      </div>

      <nav aria-label="Navigacija u podnožju">
        <ul class="flex flex-col gap-2">
          @for (item of nav; track item.path) {
            <li>
              <a
                [routerLink]="item.path"
                class="rounded-sm text-base text-cream-100 underline-offset-4 hover:underline focus-visible:outline-cream-100"
              >
                {{ item.label }}
              </a>
            </li>
          }
        </ul>
      </nav>
    </div>

    <div class="border-t border-olive-800">
      <p class="mx-auto max-w-page px-gutter py-5 text-sm text-cream-200">
        © {{ year }} Zladovce. Sva prava zadržana.
      </p>
    </div>
  `,
})
export class Footer {
  protected readonly nav = FOOTER_NAV;
  protected readonly year = new Date().getFullYear();
}
