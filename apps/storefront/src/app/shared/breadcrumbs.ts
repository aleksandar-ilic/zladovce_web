import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Crumb } from '../core/structured-data';

/** Breadcrumb trail; the last crumb is the current page (`aria-current="page"`). */
@Component({
  selector: 'sf-breadcrumbs',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <nav aria-label="Putanja">
      <ol class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-700">
        @for (crumb of crumbs(); track $index; let last = $last) {
          <li class="flex items-center gap-2">
            @if (!last && crumb.path) {
              <a
                [routerLink]="crumb.path"
                class="rounded-sm underline-offset-4 hover:text-olive-800 hover:underline"
                >{{ crumb.name }}</a
              >
              <span class="text-sage-400" aria-hidden="true">/</span>
            } @else {
              <span aria-current="page" class="font-semibold text-ink-900">{{ crumb.name }}</span>
            }
          </li>
        }
      </ol>
    </nav>
  `,
})
export class Breadcrumbs {
  readonly crumbs = input.required<readonly Crumb[]>();
}
