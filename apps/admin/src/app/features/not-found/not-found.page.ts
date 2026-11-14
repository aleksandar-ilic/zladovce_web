import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiButton, UiCard, UiEmptyState } from '@zladovce/ui';

@Component({
  selector: 'adm-not-found-page',
  imports: [RouterLink, UiButton, UiCard, UiEmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-3xl">Stranica nije pronađena</h1>
    <ui-card class="mt-6 max-w-2xl">
      <ui-empty-state
        title="Ova stranica ne postoji"
        description="Adresa je pogrešna ili stranica još nije dostupna."
      >
        <a uiButton variant="secondary" routerLink="/">Nazad na kontrolnu tablu</a>
      </ui-empty-state>
    </ui-card>
  `,
})
export class NotFoundPage {}
