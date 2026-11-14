import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiButton } from '@zladovce/ui';

@Component({
  selector: 'sf-not-found-page',
  imports: [RouterLink, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto flex max-w-page flex-col items-center px-gutter py-section text-center">
      <p class="font-serif text-display font-semibold text-olive-300" aria-hidden="true">404</p>
      <h1 class="mt-2 text-3xl md:text-4xl">Stranica nije pronađena</h1>
      <p class="mt-5 max-w-prose text-lg text-ink-700">
        Stranica koju tražite ne postoji ili je premeštena. Proverite adresu ili se vratite na
        početnu stranu.
      </p>
      <a uiButton size="lg" routerLink="/" class="mt-9">Nazad na početnu</a>
    </section>
  `,
})
export class NotFoundPage {}
