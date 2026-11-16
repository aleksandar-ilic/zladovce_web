import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** Sub-navigation of "Sadržaj sajta": pages, FAQ and testimonials. */
@Component({
  selector: 'adm-content-tabs',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <h1 class="text-3xl">Sadržaj sajta</h1>
    <nav
      class="mt-4 flex flex-wrap gap-2 border-b border-cream-200 pb-3"
      aria-label="Sadržaj sajta"
    >
      @for (tab of tabs; track tab.path) {
        <a
          [routerLink]="tab.path"
          routerLinkActive="!border-olive-700 !bg-olive-700 !text-white"
          [routerLinkActiveOptions]="{ exact: tab.exact }"
          ariaCurrentWhenActive="page"
          class="inline-flex min-h-10 items-center rounded-full border border-sage-400 bg-white px-4 text-sm font-semibold text-ink-900 no-underline hover:bg-sage-50"
          >{{ tab.label }}</a
        >
      }
    </nav>
  `,
})
export class ContentTabs {
  protected readonly tabs = [
    { label: 'Stranice', path: '/sadrzaj', exact: true },
    { label: 'Česta pitanja', path: '/sadrzaj/pitanja', exact: false },
    { label: 'Utisci kupaca', path: '/sadrzaj/utisci', exact: false },
  ];
}
