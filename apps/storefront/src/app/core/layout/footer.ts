import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SiteContent } from '../data/site-content';
import { StoreSettings } from '../data/store-settings';
import { FOOTER_INFO_NAV, FOOTER_NAV, visibleNav } from '../navigation';

export interface SocialLink {
  label: string;
  url: string;
}

/** `+381 64 123 4567` → `tel:+381641234567`. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/**
 * Site footer: navigation, the informational pages that have content, and the contact details
 * and social links from the store settings – each only when it is set, nothing invented.
 */
@Component({
  selector: 'sf-footer',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block border-t border-olive-800 bg-olive-900 text-cream-100' },
  template: `
    <div
      class="mx-auto grid max-w-page gap-10 px-gutter py-12 sm:grid-cols-2 md:py-16 lg:grid-cols-[1.4fr_1fr_1fr_1fr]"
    >
      <div class="max-w-sm">
        <p class="font-serif text-3xl font-semibold text-cream-50">Zladovce</p>
        <p class="mt-3 text-sm text-cream-200">
          Porodični posao sa juga Srbije. Domaći džemovi, voćni sokovi, sirće i kompoti.
        </p>
      </div>

      <nav aria-label="Navigacija u podnožju">
        <p class="text-sm font-semibold uppercase tracking-wider text-cream-200">Kupovina</p>
        <ul class="mt-3 flex flex-col gap-2">
          @for (item of nav(); track item.path) {
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

      @if (infoNav().length > 0) {
        <nav aria-label="Informacije" data-testid="footer-info">
          <p class="text-sm font-semibold uppercase tracking-wider text-cream-200">Informacije</p>
          <ul class="mt-3 flex flex-col gap-2">
            @for (item of infoNav(); track item.path) {
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
      }

      @if (hasContact()) {
        <div data-testid="footer-contact">
          <p class="text-sm font-semibold uppercase tracking-wider text-cream-200">Kontakt</p>
          <address class="mt-3 flex flex-col gap-2 not-italic">
            @if (contact()?.phone; as phone) {
              <a
                [href]="tel(phone)"
                class="rounded-sm text-cream-100 underline-offset-4 hover:underline focus-visible:outline-cream-100"
                >{{ phone }}</a
              >
            }
            @if (contact()?.email; as email) {
              <a
                [href]="'mailto:' + email"
                class="rounded-sm break-all text-cream-100 underline-offset-4 hover:underline focus-visible:outline-cream-100"
                >{{ email }}</a
              >
            }
            @if (contact()?.address; as address) {
              <span class="whitespace-pre-line text-cream-200">{{ address }}</span>
            }
          </address>
          @if (social().length > 0) {
            <ul class="mt-4 flex flex-wrap gap-x-4 gap-y-2" aria-label="Društvene mreže">
              @for (link of social(); track link.url) {
                <li>
                  <a
                    [href]="link.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="rounded-sm text-sm font-semibold text-cream-100 underline underline-offset-4 focus-visible:outline-cream-100"
                    >{{ link.label }}<span class="sr-only"> (otvara se u novom prozoru)</span></a
                  >
                </li>
              }
            </ul>
          }
        </div>
      }
    </div>

    <div class="border-t border-olive-800">
      <p class="mx-auto max-w-page px-gutter py-5 text-sm text-cream-200">
        © {{ year }} Zladovce. Sva prava zadržana.
      </p>
    </div>
  `,
})
export class Footer {
  private readonly store = inject(StoreSettings);
  private readonly siteContent = inject(SiteContent);

  protected readonly nav = computed(() => visibleNav(FOOTER_NAV, this.siteContent.available()));
  protected readonly infoNav = computed(() =>
    visibleNav(FOOTER_INFO_NAV, this.siteContent.available()),
  );
  protected readonly contact = computed(() => this.store.settings()?.contact ?? null);
  protected readonly social = computed<SocialLink[]>(() => {
    const social = this.store.settings()?.social;
    if (!social) {
      return [];
    }
    return [
      ...(social.facebookUrl ? [{ label: 'Facebook', url: social.facebookUrl }] : []),
      ...(social.instagramUrl ? [{ label: 'Instagram', url: social.instagramUrl }] : []),
      ...social.otherLinks.map((link) => ({ label: link.label, url: link.url })),
    ];
  });
  protected readonly hasContact = computed(() => {
    const contact = this.contact();
    return !!(contact?.phone || contact?.email || contact?.address || this.social().length > 0);
  });
  protected readonly year = new Date().getFullYear();

  constructor() {
    this.siteContent.ensureLoaded();
  }

  protected tel(phone: string): string {
    return telHref(phone);
  }
}
