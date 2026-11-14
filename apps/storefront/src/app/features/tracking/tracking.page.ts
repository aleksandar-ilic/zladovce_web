import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError, asApiError } from '@zladovce/api';
import { TrackingLookup } from '@zladovce/models';
import { UiButton, UiCard } from '@zladovce/ui';
import { SrDatePipe } from '@zladovce/utilities';
import { TrackingApi } from '../../core/data/tracking-api';
import { waitText } from '../checkout/checkout-form';
import {
  caretAfterFormat,
  codeCharacters,
  codeFromFragment,
  formatTrackingCode,
  isCompleteCode,
  TRACKING_CODE_LENGTH,
} from './tracking-code';

/** What went wrong with a lookup, in words for the customer. */
export interface TrackingProblem {
  kind: 'incomplete' | 'notFound' | 'rateLimited' | 'network' | 'other';
  title: string;
  message: string;
}

export const NOT_FOUND_MESSAGE =
  'Nismo pronašli porudžbinu sa ovim kodom. Proverite kod iz e-poruke i pokušajte ponovo.';

/** One message for every refused lookup: an unknown, revoked or mistyped code all look the same. */
export function trackingProblem(error: ApiError): TrackingProblem {
  if (error.status === 404) {
    return { kind: 'notFound', title: 'Porudžbina nije pronađena', message: NOT_FOUND_MESSAGE };
  }
  if (error.status === 429) {
    return {
      kind: 'rateLimited',
      title: 'Previše pokušaja u kratkom roku',
      message: `Radi zaštite porudžbina, broj provera sa jednog uređaja je ograničen. Sačekajte oko ${waitText(error.retryAfterSeconds)} i pokušajte ponovo.`,
    };
  }
  if (error.status === 0) {
    return {
      kind: 'network',
      title: 'Nema veze sa serverom',
      message: 'Provera trenutno nije moguća. Proverite internet vezu i pokušajte ponovo.',
    };
  }
  return { kind: 'other', title: 'Provera nije uspela', message: error.detail };
}

const INPUT =
  'block w-full rounded-md border bg-white px-3.5 py-3 font-mono text-lg tracking-wider text-ink-900 uppercase ' +
  'placeholder:text-ink-500 placeholder:normal-case placeholder:tracking-normal transition-colors duration-150 ' +
  'focus:outline-2 focus:outline-offset-0';

/**
 * Praćenje porudžbine (`/track-order`, alias `/pracenje-porudzbine`; client only, noindex).
 *
 * The code comes from the customer (typed or pasted) or from the email link `#kod=…`. A code in
 * the fragment is read once, removed from the address bar at once (replaceUrl, so it stays neither
 * in the history nor in a screenshot) and sent in the POST body. It never goes into a query
 * string, a log line or analytics. The result shows only what the API returns: status, the real
 * timeline and the courier's data.
 */
@Component({
  selector: 'sf-tracking-page',
  imports: [RouterLink, SrDatePipe, UiButton, UiCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-3xl px-gutter pb-section pt-10 md:pt-14">
      <p class="eyebrow">Vaša porudžbina</p>
      <h1 class="mt-3 text-4xl md:text-5xl">Praćenje porudžbine</h1>

      <div aria-live="polite" data-testid="tracking-live">
        @if (result(); as r) {
          <section class="mt-8" aria-labelledby="sf-tracking-result" data-testid="tracking-result">
            <div class="rounded-xl border border-sage-200 bg-sage-50 p-6 md:p-8">
              <h2
                #resultHeading
                id="sf-tracking-result"
                tabindex="-1"
                class="font-sans text-lg font-semibold text-ink-700 outline-none"
              >
                Porudžbina
                <span class="whitespace-nowrap text-ink-900" data-testid="tracking-order-number">{{
                  r.orderNumber
                }}</span>
              </h2>
              <p class="mt-3 text-sm text-ink-700">Trenutni status</p>
              <p
                class="mt-1 font-serif text-3xl font-semibold text-olive-900 md:text-4xl"
                data-testid="tracking-status"
              >
                {{ r.statusLabel }}
              </p>
              <p class="mt-3 text-sm text-ink-700">
                Poručeno
                <span data-testid="tracking-placed">{{ r.placedAt | srDate: 'dateTime' }}</span>
              </p>
            </div>

            @if (r.shipment; as s) {
              <ui-card class="mt-6" data-testid="tracking-shipment">
                <h3 class="text-2xl">Pošiljka</h3>
                <dl class="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
                  <dt class="text-sm text-ink-500">Kurirska služba</dt>
                  <dd class="font-semibold" data-testid="tracking-courier">{{ s.courierName }}</dd>
                  @if (s.trackingNumber) {
                    <dt class="text-sm text-ink-500">Broj pošiljke</dt>
                    <dd class="font-semibold break-all" data-testid="tracking-number">
                      {{ s.trackingNumber }}
                    </dd>
                  }
                  <dt class="text-sm text-ink-500">Predato kuriru</dt>
                  <dd data-testid="tracking-shipped">{{ s.shippedAt | srDate: 'dateTime' }}</dd>
                </dl>
                @if (s.trackingUrl) {
                  <a
                    uiButton
                    variant="secondary"
                    class="mt-5"
                    [href]="s.trackingUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="tracking-courier-link"
                  >
                    Prati pošiljku kod kurira<span class="sr-only">
                      (otvara se u novom prozoru)</span
                    >
                    <svg
                      class="size-4"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.6"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M9 3h4v4M13 3 7 9M11 9.5V13H3V5h3.5" />
                    </svg>
                  </a>
                }
              </ui-card>
            }

            <section class="mt-10" aria-labelledby="sf-tracking-timeline">
              <h3 id="sf-tracking-timeline" class="text-2xl">Tok porudžbine</h3>
              <ol class="mt-5" data-testid="tracking-timeline">
                @for (entry of timeline(); track $index; let last = $last) {
                  <li class="relative flex gap-4 pb-6 last:pb-0" data-testid="tracking-entry">
                    @if (!last) {
                      <span
                        class="absolute top-5 left-[0.6875rem] h-full w-0.5 bg-cream-200"
                        aria-hidden="true"
                      ></span>
                    }
                    <span
                      class="relative mt-1 size-6 shrink-0 rounded-full border-4 border-cream-50"
                      [class]="entry.current ? 'bg-olive-700' : 'bg-sage-400'"
                      aria-hidden="true"
                    ></span>
                    <div class="min-w-0">
                      <p class="font-semibold text-ink-900">
                        {{ entry.label }}
                        @if (entry.current) {
                          <span class="sr-only"> (trenutni status)</span>
                        }
                      </p>
                      <p class="text-sm text-ink-700">
                        <time [attr.datetime]="entry.at" data-testid="tracking-entry-at">{{
                          entry.at | srDate: 'dateTime'
                        }}</time>
                      </p>
                      @if (entry.customerMessage) {
                        <p
                          class="mt-2 rounded-md bg-cream-100 px-3 py-2 text-ink-900 whitespace-pre-line"
                          data-testid="tracking-message"
                        >
                          {{ entry.customerMessage }}
                        </p>
                      }
                    </div>
                  </li>
                }
              </ol>
            </section>

            <div class="mt-10 flex flex-wrap gap-3">
              <button
                uiButton
                variant="secondary"
                type="button"
                data-testid="tracking-again"
                (click)="checkAnother()"
              >
                Proveri drugi kod
              </button>
              <a uiButton variant="ghost" routerLink="/prodavnica">Nazad u prodavnicu</a>
            </div>
          </section>
        }
      </div>

      @if (!result()) {
        <p class="mt-4 max-w-2xl text-lg text-ink-700">
          Upišite kod za praćenje da vidite gde je vaša porudžbina i šta se sa njom dešavalo.
        </p>

        <ui-card class="mt-8" padding="lg">
          <form novalidate (submit)="$event.preventDefault(); submit()" data-testid="tracking-form">
            <label for="sf-tracking-code" class="block text-sm font-semibold text-ink-900">
              Kod za praćenje
            </label>
            <input
              #codeInput
              id="sf-tracking-code"
              name="kod"
              type="text"
              inputmode="text"
              autocomplete="off"
              autocapitalize="characters"
              autocorrect="off"
              spellcheck="false"
              maxlength="40"
              placeholder="npr. ABCDE-12345-…"
              class="mt-1.5"
              [class]="inputClasses()"
              [value]="code()"
              [attr.aria-invalid]="problem() ? 'true' : null"
              aria-describedby="sf-tracking-help"
              (input)="onInput($event)"
              data-testid="tracking-code"
            />
            <p id="sf-tracking-help" class="mt-2 text-sm text-ink-700">
              Kod ima 26 znakova (slova i brojevi). Nalazi se u e-poruci kojom smo potvrdili
              porudžbinu i na stranici potvrde koja se otvorila posle poručivanja. Crtice i razmake
              ne morate da kucate.
            </p>

            @if (problem(); as p) {
              <div
                class="mt-5 rounded-lg border p-4"
                [class]="
                  p.kind === 'notFound' || p.kind === 'incomplete'
                    ? 'border-warning-700/25 bg-warning-50 text-ink-900'
                    : 'border-danger-600/30 bg-danger-50 text-danger-700'
                "
                role="alert"
                data-testid="tracking-problem"
                [attr.data-kind]="p.kind"
              >
                <p class="font-semibold">{{ p.title }}</p>
                <p class="mt-1">{{ p.message }}</p>
              </div>
            }

            <button
              uiButton
              type="submit"
              size="lg"
              class="mt-6 w-full sm:w-auto"
              [loading]="loading()"
              [disabled]="blocked()"
              data-testid="tracking-submit"
            >
              {{ loading() ? 'Proveravamo…' : 'Prikaži status' }}
            </button>
          </form>
        </ui-card>
      }
    </div>
  `,
})
export class TrackingPage {
  private readonly api = inject(TrackingApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');
  private readonly resultHeading = viewChild<ElementRef<HTMLElement>>('resultHeading');

  protected readonly code = signal('');
  protected readonly loading = signal(false);
  protected readonly result = signal<TrackingLookup | null>(null);
  protected readonly problem = signal<TrackingProblem | null>(null);
  private readonly blockedUntil = signal<number | null>(null);
  protected readonly blocked = computed(() => this.blockedUntil() !== null);

  protected readonly inputClasses = computed(
    () =>
      `${INPUT} ${
        this.problem()
          ? 'border-danger-600 focus:border-danger-600 focus:outline-danger-600'
          : 'border-sage-400 hover:border-sage-600 focus:border-olive-700 focus:outline-olive-700'
      }`,
  );

  /** Timeline oldest first, as the API sends it; the last entry is the current status. */
  protected readonly timeline = computed(() => {
    const entries = this.result()?.timeline ?? [];
    return entries.map((entry, index) => ({ ...entry, current: index === entries.length - 1 }));
  });

  constructor() {
    // Email links open `/track-order#kod=…`; the confirmation page links the same way.
    this.route.fragment.pipe(takeUntilDestroyed()).subscribe((fragment) => {
      const code = codeFromFragment(fragment);
      if (code !== null || /(^|&)kod=/.test(fragment ?? '')) {
        this.clearFragment();
      }
      if (code) {
        this.result.set(null);
        this.code.set(code);
        this.submit();
      }
    });
  }

  protected onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    const formatted = formatTrackingCode(raw);
    this.code.set(formatted);
    if (this.problem()?.kind === 'incomplete' || this.problem()?.kind === 'notFound') {
      this.problem.set(null);
    }
    if (input.value !== formatted) {
      input.value = formatted;
      const position = caretAfterFormat(raw, caret, formatted);
      input.setSelectionRange(position, position);
    }
  }

  submit(): void {
    if (this.loading() || this.blocked()) {
      return;
    }
    const code = this.code();
    if (!isCompleteCode(code)) {
      const count = codeCharacters(code).length;
      this.problem.set({
        kind: 'incomplete',
        title: count === 0 ? 'Upišite kod za praćenje' : 'Kod nije potpun',
        message:
          count === 0
            ? 'Kod se nalazi u e-poruci kojom smo potvrdili porudžbinu.'
            : `Upisali ste ${count} od ${TRACKING_CODE_LENGTH} znakova. Proverite kod iz e-poruke.`,
      });
      this.codeInput()?.nativeElement.focus();
      return;
    }
    this.problem.set(null);
    this.loading.set(true);
    this.api
      .lookup(code)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.loading.set(false);
          this.result.set(result);
          afterNextRender(() => this.resultHeading()?.nativeElement.focus(), {
            injector: this.injector,
          });
        },
        error: (error: unknown) => {
          this.loading.set(false);
          const apiError = asApiError(error);
          if (apiError.status === 429) {
            this.block(apiError.retryAfterSeconds);
          }
          this.problem.set(trackingProblem(apiError));
        },
      });
  }

  protected checkAnother(): void {
    this.result.set(null);
    this.problem.set(null);
    this.code.set('');
    afterNextRender(() => this.codeInput()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Removes the fragment from the address bar and the history entry (no new entry). */
  private clearFragment(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParamsHandling: 'preserve',
      replaceUrl: true,
    });
  }

  private block(seconds: number | null): void {
    const wait = Math.min(Math.max(seconds ?? 60, 1), 3600);
    this.blockedUntil.set(Date.now() + wait * 1000);
    const timer = setTimeout(() => this.blockedUntil.set(null), wait * 1000);
    this.destroyRef.onDestroy(() => clearTimeout(timer));
  }
}
