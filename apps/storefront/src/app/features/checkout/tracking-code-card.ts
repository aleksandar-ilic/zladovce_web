import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiButton } from '@zladovce/ui';
import { TRACKING_PATH } from '../../core/navigation';

/**
 * Copies text to the clipboard: the Clipboard API where available (secure contexts), otherwise a
 * hidden textarea and `execCommand('copy')`. Resolves false when neither worked.
 */
export async function copyText(text: string, doc: Document): Promise<boolean> {
  const clipboard = doc.defaultView?.navigator.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Permission refused or not focused: try the fallback.
    }
  }
  if (typeof doc.execCommand !== 'function') {
    return false;
  }
  const active = doc.activeElement as HTMLElement | null;
  const area = doc.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.opacity = '0';
  doc.body.appendChild(area);
  area.select();
  let copied: boolean;
  try {
    copied = doc.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  active?.focus();
  return copied;
}

/**
 * The tracking code on the confirmation page: shown large, with a copy button and the link
 * `/track-order#kod=…` (fragment, never a query string). When the API did not return a code
 * (a repeated submission), the customer is pointed to the confirmation email.
 */
@Component({
  selector: 'sf-tracking-code-card',
  imports: [RouterLink, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      class="rounded-xl border border-cream-200 bg-white p-6 shadow-soft md:p-8"
      aria-labelledby="sf-tracking-code-title"
      data-testid="tracking-code-card"
    >
      <h2 id="sf-tracking-code-title" class="text-2xl md:text-3xl">Kod za praćenje</h2>
      @if (code(); as c) {
        <p class="mt-2 text-ink-700">
          Sa ovim kodom u svakom trenutku možete da proverite status porudžbine. Poslali smo ga i u
          e-poruci potvrde. Kod je samo vaš – ne delite ga sa drugima.
        </p>
        <p
          #codeText
          class="mt-5 rounded-lg border border-dashed border-olive-400 bg-cream-50 px-4 py-4 text-center font-mono text-lg font-semibold tracking-wider break-all text-olive-900 select-all sm:text-xl"
          data-testid="tracking-code-value"
        >
          {{ c }}
        </p>
        <div class="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            uiButton
            variant="secondary"
            type="button"
            data-testid="copy-tracking-code"
            (click)="copy()"
          >
            {{ copyState() === 'copied' ? 'Kopirano' : 'Kopiraj kod' }}
          </button>
          <a
            uiButton
            [routerLink]="trackingPath"
            [fragment]="fragment()"
            data-testid="track-order-link"
            >Prati porudžbinu</a
          >
        </div>
        <p class="mt-3 min-h-6 text-sm" role="status" data-testid="copy-status">
          @switch (copyState()) {
            @case ('copied') {
              <span class="text-olive-800">Kod je kopiran.</span>
            }
            @case ('failed') {
              <span class="text-danger-700"
                >Kopiranje nije uspelo. Kod je označen – kopirajte ga ručno.</span
              >
            }
          }
        </p>
      } @else {
        <p class="mt-2 text-ink-700" data-testid="tracking-code-in-email">
          Kod za praćenje smo poslali u e-poruci kojom potvrđujemo porudžbinu. Sa njim na stranici
          <a
            class="font-semibold text-olive-800 underline underline-offset-4"
            [routerLink]="trackingPath"
            >Praćenje porudžbine</a
          >
          možete da proverite status.
        </p>
      }
    </section>
  `,
})
export class TrackingCodeCard {
  readonly code = input<string | null>(null);

  private readonly document = inject(DOCUMENT);
  private readonly codeText = viewChild<ElementRef<HTMLElement>>('codeText');

  protected readonly trackingPath = TRACKING_PATH;
  protected readonly copyState = signal<'idle' | 'copied' | 'failed'>('idle');
  protected readonly fragment = computed(() => `kod=${this.code() ?? ''}`);

  async copy(): Promise<void> {
    const code = this.code();
    if (!code) {
      return;
    }
    const copied = await copyText(code, this.document);
    this.copyState.set(copied ? 'copied' : 'failed');
    if (!copied) {
      this.selectCode();
    }
  }

  private selectCode(): void {
    const element = this.codeText()?.nativeElement;
    const selection = this.document.defaultView?.getSelection();
    if (!element || !selection) {
      return;
    }
    const range = this.document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}
