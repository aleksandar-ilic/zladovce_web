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
import { asApiError } from '@zladovce/api';
import { NewsletterStatus } from '@zladovce/models';
import { UiButton, UiLoadingState } from '@zladovce/ui';
import { Observable } from 'rxjs';
import { ContentApi } from '../../core/data/content-api';
import { waitText } from '../checkout/checkout-form';

export type NewsletterAction = 'confirm' | 'unsubscribe';

export const TOKEN_INVALID = 'NEWSLETTER_TOKEN_INVALID';

/** `token=abc` (the fragment of the email links) → `abc`; anything else → null. */
export function tokenFromFragment(fragment: string | null | undefined): string | null {
  if (!fragment) {
    return null;
  }
  const token = new URLSearchParams(fragment).get('token')?.trim();
  return token ? token : null;
}

type ResultState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; result: NewsletterStatus }
  | { kind: 'missing' }
  | { kind: 'problem'; title: string; message: string; invalid: boolean };

const TEXT: Record<NewsletterAction, { title: string; sending: string; done: string }> = {
  confirm: {
    title: 'Potvrda prijave na novosti',
    sending: 'Potvrđujemo prijavu…',
    done: 'Prijava je potvrđena',
  },
  unsubscribe: {
    title: 'Odjava sa novosti',
    sending: 'Odjavljujemo adresu…',
    done: 'Odjavljeni ste',
  },
};

/**
 * `/newsletter/potvrda` and `/newsletter/odjava` (client only, noindex, disallowed in robots):
 * the pages of the links in the newsletter email, `#token=…`. The token is read from the
 * fragment once, removed from the address bar at once (history entry replaced, so it stays
 * neither in the history nor in a screenshot) and sent in the POST body. It is never put in a
 * query string and never logged.
 */
@Component({
  selector: 'sf-newsletter-token-page',
  imports: [RouterLink, UiButton, UiLoadingState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-2xl px-gutter pb-section pt-10 md:pt-14">
      <p class="eyebrow">Novosti</p>
      <h1 class="mt-3 text-4xl md:text-5xl">{{ text().title }}</h1>

      <div class="mt-8" aria-live="polite" data-testid="newsletter-result">
        @switch (state().kind) {
          @case ('sending') {
            <ui-loading-state [label]="text().sending" />
          }
          @case ('done') {
            <div class="rounded-xl border border-sage-200 bg-sage-50 p-6 md:p-8" data-testid="newsletter-done">
              <h2 #resultHeading tabindex="-1" class="text-3xl outline-none">
                {{ text().done }}
              </h2>
              <p class="mt-3 text-lg text-ink-700">{{ doneMessage() }}</p>
              <a uiButton class="mt-6" routerLink="/prodavnica">Pogledajte ponudu</a>
            </div>
          }
          @case ('missing') {
            <div
              class="rounded-lg border border-warning-700/25 bg-warning-50 p-5 text-ink-900"
              role="alert"
              data-testid="newsletter-missing"
            >
              <p class="font-semibold">Link nije potpun</p>
              <p class="mt-1">
                Otvorite link iz e-poruke još jednom. Ako ga kopirate, kopirajte ga celog.
              </p>
            </div>
          }
          @case ('problem') {
            @let p = problem()!;
            <div
              class="rounded-lg border p-5"
              [class]="
                p.invalid
                  ? 'border-warning-700/25 bg-warning-50 text-ink-900'
                  : 'border-danger-600/30 bg-danger-50 text-danger-700'
              "
              role="alert"
              data-testid="newsletter-problem"
              [attr.data-invalid]="p.invalid"
            >
              <p class="font-semibold">{{ p.title }}</p>
              <p class="mt-1">{{ p.message }}</p>
              @if (p.invalid && action() === 'confirm') {
                <p class="mt-3">
                  <a
                    routerLink="/"
                    fragment="novosti"
                    class="font-semibold text-olive-800 underline underline-offset-4"
                    >Prijavite se ponovo</a
                  >
                  i stići će vam nov link.
                </p>
              }
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class NewsletterTokenPage {
  private readonly api = inject(ContentApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly resultHeading = viewChild<ElementRef<HTMLElement>>('resultHeading');

  protected readonly action = signal<NewsletterAction>(
    this.route.snapshot.data['newsletterAction'] === 'unsubscribe' ? 'unsubscribe' : 'confirm',
  );
  protected readonly text = computed(() => TEXT[this.action()]);
  readonly state = signal<ResultState>({ kind: 'idle' });
  protected readonly problem = computed(() => {
    const state = this.state();
    return state.kind === 'problem' ? state : null;
  });
  protected readonly doneMessage = computed(() => {
    const state = this.state();
    return state.kind === 'done' ? state.result.message : '';
  });

  constructor() {
    this.route.fragment.pipe(takeUntilDestroyed()).subscribe((fragment) => {
      const token = tokenFromFragment(fragment);
      if (token) {
        this.clearFragment();
        this.send(token);
      } else if (this.state().kind === 'idle') {
        // Opened without a token (or the fragment was cut off when the link was copied).
        this.state.set({ kind: 'missing' });
      }
    });
  }

  private send(token: string): void {
    this.state.set({ kind: 'sending' });
    const request: Observable<NewsletterStatus> =
      this.action() === 'confirm'
        ? this.api.confirmSubscription(token)
        : this.api.unsubscribe(token);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.state.set({ kind: 'done', result });
        afterNextRender(() => this.resultHeading()?.nativeElement.focus(), {
          injector: this.injector,
        });
      },
      error: (error: unknown) => {
        const apiError = asApiError(error);
        if (apiError.code === TOKEN_INVALID || apiError.status === 400) {
          this.state.set({
            kind: 'problem',
            invalid: true,
            title: 'Link nije važeći',
            message: apiError.detail,
          });
        } else if (apiError.status === 429) {
          this.state.set({
            kind: 'problem',
            invalid: false,
            title: 'Previše pokušaja u kratkom roku',
            message: `Sačekajte oko ${waitText(apiError.retryAfterSeconds)} i otvorite link iz e-poruke ponovo.`,
          });
        } else {
          this.state.set({
            kind: 'problem',
            invalid: false,
            title: apiError.status === 0 ? 'Nema veze sa serverom' : 'Zahtev nije uspeo',
            message:
              apiError.status === 0
                ? 'Proverite internet vezu i otvorite link iz e-poruke ponovo.'
                : apiError.detail,
          });
        }
      },
    });
  }

  /** Removes the fragment from the address bar and the history entry (no new entry). */
  private clearFragment(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParamsHandling: 'preserve',
      replaceUrl: true,
    });
  }
}
