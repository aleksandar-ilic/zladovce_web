import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  forwardRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { normalizeHref, sanitizeRichText } from './rich-text';

interface ToolbarAction {
  id: string;
  label: string;
  /** Short text shown on the button. */
  text: string;
  run: (editor: RichTextEditor) => void;
  /** Command whose state marks the button as pressed. */
  state?: string;
  block?: string;
  classes?: string;
}

const ACTIONS: readonly ToolbarAction[] = [
  {
    id: 'bold',
    label: 'Podebljano',
    text: 'B',
    classes: 'font-bold',
    state: 'bold',
    run: (e) => e.exec('bold'),
  },
  {
    id: 'italic',
    label: 'Kurziv',
    text: 'I',
    classes: 'italic',
    state: 'italic',
    run: (e) => e.exec('italic'),
  },
  {
    id: 'h2',
    label: 'Naslov',
    text: 'Naslov',
    block: 'h2',
    run: (e) => e.exec('formatBlock', '<h2>'),
  },
  {
    id: 'h3',
    label: 'Podnaslov',
    text: 'Podnaslov',
    block: 'h3',
    run: (e) => e.exec('formatBlock', '<h3>'),
  },
  {
    id: 'p',
    label: 'Običan tekst',
    text: 'Tekst',
    block: 'p',
    run: (e) => e.exec('formatBlock', '<p>'),
  },
  {
    id: 'ul',
    label: 'Lista sa tačkama',
    text: '• Lista',
    state: 'insertUnorderedList',
    run: (e) => e.exec('insertUnorderedList'),
  },
  {
    id: 'ol',
    label: 'Numerisana lista',
    text: '1. Lista',
    state: 'insertOrderedList',
    run: (e) => e.exec('insertOrderedList'),
  },
  { id: 'link', label: 'Dodaj vezu (link)', text: 'Veza', run: (e) => e.openLink() },
  { id: 'unlink', label: 'Ukloni vezu', text: 'Ukloni vezu', run: (e) => e.exec('unlink') },
];

/**
 * Small rich-text editor for product descriptions: bold, italic, headings, lists and links.
 * Built on `contenteditable`; every change is cleaned by `sanitizeRichText`, so the value is always
 * the HTML subset the API keeps. Works as a form control (`formControlName`).
 */
@Component({
  selector: 'adm-rich-text-editor',
  imports: [MatButtonModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => RichTextEditor), multi: true },
  ],
  host: { class: 'block' },
  template: `
    <div
      class="overflow-hidden rounded-md border bg-white"
      [class.border-danger-600]="invalid()"
      [class.border-sage-400]="!invalid()"
    >
      <div
        class="flex flex-wrap gap-1 border-b border-cream-200 bg-cream-50 p-1.5"
        role="toolbar"
        [attr.aria-label]="'Oblikovanje teksta: ' + label()"
      >
        @for (action of actions; track action.id) {
          <button
            type="button"
            class="min-h-9 min-w-9 cursor-pointer rounded-sm px-2.5 text-sm text-ink-900 hover:bg-cream-200 focus-visible:outline-2 focus-visible:outline-olive-700 disabled:cursor-not-allowed disabled:opacity-50"
            [class]="action.classes ?? ''"
            [class.bg-olive-100]="active().includes(action.id)"
            [attr.aria-pressed]="action.state || action.block ? active().includes(action.id) : null"
            [attr.aria-label]="action.label"
            [matTooltip]="action.label"
            [disabled]="disabled()"
            (mousedown)="$event.preventDefault()"
            (click)="action.run(this)"
          >
            {{ action.text }}
          </button>
        }
      </div>

      @if (linkOpen()) {
        <div class="flex flex-wrap items-center gap-2 border-b border-cream-200 bg-sage-50 p-2">
          <label class="text-sm font-semibold" [for]="linkInputId">Adresa veze</label>
          <input
            #linkInput
            [id]="linkInputId"
            type="url"
            inputmode="url"
            class="min-w-0 flex-1 rounded-sm border border-sage-400 bg-white px-2 py-1.5 text-sm"
            placeholder="https://…"
            (keydown.enter)="$event.preventDefault(); applyLink(linkInput.value)"
            (keydown.escape)="closeLink()"
          />
          <button matButton="filled" type="button" (click)="applyLink(linkInput.value)">
            Dodaj
          </button>
          <button matButton type="button" (click)="closeLink()">Odustani</button>
          @if (linkError()) {
            <p class="w-full text-sm text-danger-700" role="alert">{{ linkError() }}</p>
          }
        </div>
      }

      <div
        #area
        class="rich-text min-h-48 px-3.5 py-3 text-base text-ink-900 outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-olive-700"
        role="textbox"
        aria-multiline="true"
        [attr.aria-label]="label()"
        [attr.aria-invalid]="invalid() ? 'true' : null"
        [attr.aria-describedby]="describedBy() || null"
        [attr.contenteditable]="disabled() ? 'false' : 'true'"
        tabindex="0"
        (input)="onInput()"
        (blur)="onBlur()"
        (paste)="onPaste($event)"
        (keyup)="refreshState()"
        (mouseup)="refreshState()"
      ></div>
    </div>
  `,
})
export class RichTextEditor implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly invalid = input(false);
  readonly describedBy = input<string>('');

  protected readonly actions = ACTIONS;
  protected readonly disabled = signal(false);
  protected readonly active = signal<string[]>([]);
  protected readonly linkOpen = signal(false);
  protected readonly linkError = signal('');
  protected readonly linkInputId = `adm-rte-link-${Math.random().toString(36).slice(2, 8)}`;

  private readonly area = viewChild.required<ElementRef<HTMLDivElement>>('area');
  private viewReady = false;
  private readonly linkInput = viewChild<ElementRef<HTMLInputElement>>('linkInput');
  private value = '';
  private savedRange: Range | null = null;
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    afterNextRender(() => {
      this.viewReady = true;
      this.render();
    });
  }

  writeValue(value: string | null): void {
    this.value = sanitizeRichText(value);
    if (this.viewReady) {
      this.render();
    }
  }

  /** Shows the current value in the editable area (also normalises what the user pasted). */
  private render(): void {
    const element = this.area().nativeElement;
    if (element.innerHTML !== this.value) {
      element.innerHTML = this.value;
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  /** Runs an editing command on the current selection, then publishes the cleaned value. */
  exec(command: string, argument?: string): void {
    const element = this.area().nativeElement;
    element.focus();
    if (typeof document.execCommand === 'function') {
      document.execCommand('styleWithCSS', false, 'false');
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand(command, false, argument);
    }
    this.onInput();
  }

  openLink(): void {
    const selection = document.getSelection();
    this.savedRange =
      selection &&
      selection.rangeCount > 0 &&
      this.area().nativeElement.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : null;
    this.linkError.set('');
    this.linkOpen.set(true);
    setTimeout(() => this.linkInput()?.nativeElement.focus());
  }

  protected applyLink(raw: string): void {
    const href = normalizeHref(raw);
    if (!href) {
      this.linkError.set('Unesite ispravnu adresu, na primer https://zladovce.com.');
      return;
    }
    if (!this.savedRange || this.savedRange.collapsed) {
      this.linkError.set('Prvo označite (selektujte) tekst koji treba da postane veza.');
      return;
    }
    const element = this.area().nativeElement;
    element.focus();
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(this.savedRange);
    this.closeLink();
    this.exec('createLink', href);
  }

  protected closeLink(): void {
    this.linkOpen.set(false);
    this.linkError.set('');
  }

  protected onInput(): void {
    const element = this.area().nativeElement;
    const clean = sanitizeRichText(element.innerHTML);
    if (clean !== this.value) {
      this.value = clean;
      this.onChange(clean);
    }
    this.refreshState();
  }

  protected onBlur(): void {
    this.render();
    this.onTouched();
  }

  protected onPaste(event: ClipboardEvent): void {
    const data = event.clipboardData;
    if (!data || typeof document.execCommand !== 'function') {
      return;
    }
    event.preventDefault();
    const html = data.getData('text/html');
    if (html) {
      document.execCommand('insertHTML', false, sanitizeRichText(html));
    } else {
      document.execCommand('insertText', false, data.getData('text/plain'));
    }
    this.onInput();
  }

  protected refreshState(): void {
    if (typeof document.queryCommandState !== 'function') {
      return;
    }
    const active: string[] = [];
    for (const action of ACTIONS) {
      if (action.state && document.queryCommandState(action.state)) {
        active.push(action.id);
      }
    }
    const block = String(document.queryCommandValue?.('formatBlock') ?? '').toLowerCase();
    for (const action of ACTIONS) {
      if (action.block && action.block === block) {
        active.push(action.id);
      }
    }
    this.active.set(active);
  }
}
