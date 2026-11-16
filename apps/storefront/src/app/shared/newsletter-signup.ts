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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { asApiError } from '@zladovce/api';
import { applyServerErrors, emailAddressValidator, notBlank } from '@zladovce/shared';
import { UiButton, UiFormField, UiInput } from '@zladovce/ui';
import { ContentApi } from '../core/data/content-api';
import { SiteContent } from '../core/data/site-content';
import { infoPath } from '../core/navigation';
import { FormProblem, formProblem, HONEYPOT_CLASS, SubmitBlock } from './public-form';

export const CONSENT_MESSAGE = 'Za prijavu je potrebna vaša saglasnost.';

/**
 * Sign-up for occasional news by email (`POST /newsletter/subscriptions`). The address is
 * entered once and confirmed through the link in the email; the answer is always the same
 * message, whether the address was new, pending or already confirmed. `website` is a hidden
 * honeypot that is always sent empty by people.
 */
@Component({
  selector: 'sf-newsletter-signup',
  imports: [ReactiveFormsModule, RouterLink, UiButton, UiFormField, UiInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div aria-live="polite" data-testid="newsletter-live">
      @if (accepted(); as message) {
        <div
          class="rounded-lg border border-sage-300 bg-white p-6"
          data-testid="newsletter-success"
        >
          <p
            #successMessage
            tabindex="-1"
            class="font-serif text-2xl font-semibold text-olive-900 outline-none"
          >
            Proverite e-poštu
          </p>
          <p class="mt-2 text-ink-700">{{ message }}</p>
        </div>
      }
    </div>

    @if (!accepted()) {
      <form
        [formGroup]="form"
        novalidate
        (ngSubmit)="submit()"
        class="relative flex flex-col gap-4"
        data-testid="newsletter-form"
      >
        <ui-form-field
          label="Adresa e-pošte"
          [messages]="{ required: 'Upišite adresu e-pošte.' }"
        >
          <input
            #emailInput
            uiInput
            type="email"
            formControlName="email"
            autocomplete="email"
            inputmode="email"
            data-testid="newsletter-email"
          />
        </ui-form-field>

        <div [class]="honeypotClass" aria-hidden="true">
          <label for="sf-newsletter-website">Ne popunjavajte ovo polje</label>
          <input
            id="sf-newsletter-website"
            type="text"
            formControlName="website"
            tabindex="-1"
            autocomplete="off"
            data-testid="newsletter-website"
          />
        </div>

        <div>
          <label class="flex cursor-pointer items-start gap-3 text-base text-ink-900">
            <input
              type="checkbox"
              class="mt-1 size-5 shrink-0 accent-olive-700"
              formControlName="consent"
              [attr.aria-invalid]="consentError() ? 'true' : null"
              aria-describedby="sf-newsletter-consent-help"
              data-testid="newsletter-consent"
            />
            <span>Želim da povremeno primam novosti iz Zladovca na ovu adresu e-pošte.</span>
          </label>
          <p id="sf-newsletter-consent-help" class="mt-1.5 pl-8 text-sm text-ink-700">
            Adresu koristimo samo za te poruke i ne dajemo je drugima. Posle prijave stiže e-poruka
            sa linkom za potvrdu; u njoj je i link za odjavu, koju možete uraditi bilo kada.
            @if (privacyLinked()) {
              Više u
              <a
                [routerLink]="privacyPath"
                class="font-semibold text-olive-800 underline underline-offset-4"
                >politici privatnosti</a
              >.
            }
          </p>
          @if (consentError(); as message) {
            <p
              class="mt-1.5 pl-8 text-sm font-medium text-danger-700"
              role="alert"
              data-testid="newsletter-consent-error"
            >
              {{ message }}
            </p>
          }
        </div>

        @if (problem(); as p) {
          <div
            class="rounded-lg border p-4"
            [class]="
              p.kind === 'rateLimited'
                ? 'border-warning-700/25 bg-warning-50 text-ink-900'
                : 'border-danger-600/30 bg-danger-50 text-danger-700'
            "
            role="alert"
            data-testid="newsletter-problem"
            [attr.data-kind]="p.kind"
          >
            <p class="font-semibold">{{ p.title }}</p>
            <p class="mt-1">{{ p.message }}</p>
          </div>
        }

        <div>
          <button
            uiButton
            type="submit"
            [loading]="sending()"
            [disabled]="submitBlock.blocked()"
            data-testid="newsletter-submit"
          >
            {{ sending() ? 'Šaljemo…' : 'Prijavi me' }}
          </button>
        </div>
      </form>
    }
  `,
})
export class NewsletterSignup {
  private readonly api = inject(ContentApi);
  private readonly siteContent = inject(SiteContent);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('emailInput');
  private readonly successMessage = viewChild<ElementRef<HTMLElement>>('successMessage');

  protected readonly honeypotClass = HONEYPOT_CLASS;
  protected readonly privacyPath = infoPath('privacy');
  protected readonly privacyLinked = computed(() => this.siteContent.has('privacy'));
  protected readonly submitBlock = new SubmitBlock(this.destroyRef);

  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, notBlank, emailAddressValidator]],
    consent: [false, [Validators.requiredTrue]],
    website: [''],
  });

  protected readonly sending = signal(false);
  protected readonly accepted = signal<string | null>(null);
  protected readonly problem = signal<FormProblem | null>(null);
  private readonly consentTouched = signal(false);
  private readonly consentValue = signal(false);
  private readonly consentServerError = signal<string | null>(null);
  protected readonly consentError = computed(() =>
    this.consentServerError() ??
    (this.consentTouched() && !this.consentValue() ? CONSENT_MESSAGE : null),
  );

  constructor() {
    this.form.controls.consent.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.consentValue.set(value);
      this.consentTouched.set(true);
      this.consentServerError.set(null);
    });
  }

  submit(): void {
    if (this.sending() || this.submitBlock.blocked()) {
      return;
    }
    this.problem.set(null);
    this.consentTouched.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.form.controls.email.invalid) {
        this.emailInput()?.nativeElement.focus();
      }
      return;
    }
    const { email, website } = this.form.getRawValue();
    this.sending.set(true);
    this.api
      .subscribe(email.trim(), website)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.sending.set(false);
          this.accepted.set(response.message);
          afterNextRender(() => this.successMessage()?.nativeElement.focus(), {
            injector: this.injector,
          });
        },
        error: (error: unknown) => {
          this.sending.set(false);
          const apiError = asApiError(error);
          if (apiError.status === 429) {
            this.submitBlock.block(apiError.retryAfterSeconds);
          }
          if (apiError.status === 400) {
            const consent = apiError.fieldErrors('consent');
            if (consent.length > 0) {
              this.consentServerError.set(consent.join(' '));
            }
            applyServerErrors(this.form, apiError);
          }
          this.problem.set(formProblem(apiError));
        },
      });
  }
}
