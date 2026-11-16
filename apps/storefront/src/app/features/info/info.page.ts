import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { infoPage } from '../../core/navigation';
import { AboutContent } from './about-content';
import { DeliveryContent } from './delivery-content';
import { FaqContent } from './faq-content';
import { RichTextContent } from './rich-text-content';

/**
 * One route for the informational pages (`/o-nama`, `/cesta-pitanja`, `/dostava-i-placanje`,
 * `/politika-privatnosti`, `/uslovi-koriscenja`), so the prerender can render exactly the ones
 * with content (`getPrerenderParams` of `:page`). Each page is its own block, so moving between
 * them creates a fresh view.
 */
@Component({
  selector: 'sf-info-page',
  imports: [AboutContent, DeliveryContent, FaqContent, RichTextContent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (def(); as d) {
      @switch (d.kind) {
        @case ('about') {
          <sf-about-content [def]="d" />
        }
        @case ('faq') {
          <sf-faq-content [def]="d" />
        }
        @case ('delivery') {
          <sf-delivery-content [def]="d" />
        }
        @case ('privacy') {
          <sf-rich-text-content [def]="d" />
        }
        @case ('terms') {
          <sf-rich-text-content [def]="d" />
        }
      }
    }
  `,
})
export class InfoPage {
  private readonly route = inject(ActivatedRoute);
  protected readonly def = toSignal(
    this.route.paramMap.pipe(map((params) => infoPage(params.get('page')))),
    { initialValue: infoPage(this.route.snapshot.paramMap.get('page')) },
  );
}
