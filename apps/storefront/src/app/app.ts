import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from './core/layout/footer';
import { Header } from './core/layout/header';
import { SeoService } from './core/seo';

/** Application shell: skip link, header, main landmark with the routed page, footer. */
@Component({
  selector: 'sf-root',
  imports: [RouterOutlet, Header, Footer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-dvh flex-col' },
  template: `
    <a class="skip-link" href="#sadrzaj" (click)="skipToContent($event, content)"
      >Preskoči na sadržaj</a
    >
    <sf-header />
    <main #content id="sadrzaj" tabindex="-1" class="flex-1 outline-none">
      <router-outlet />
    </main>
    <sf-footer />
  `,
})
export class App {
  constructor() {
    inject(SeoService).start();
  }

  /** Moves focus without touching the URL (a plain "#sadrzaj" link would resolve against <base href>). */
  protected skipToContent(event: Event, content: HTMLElement): void {
    event.preventDefault();
    content.focus();
  }
}
