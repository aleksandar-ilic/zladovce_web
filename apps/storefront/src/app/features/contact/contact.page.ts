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
import { UiButton, UiCard, UiFormField, UiInput } from '@zladovce/ui';
import { ContentApi } from '../../core/data/content-api';
import { SiteContent } from '../../core/data/site-content';
import { StoreSettings } from '../../core/data/store-settings';
import { telHref } from '../../core/layout/footer';
import { infoPath } from '../../core/navigation';
import { FormProblem, formProblem, HONEYPOT_CLASS, SubmitBlock } from '../../shared/public-form';

export const CONTACT_LIMITS = { name: 100, message: 5000 } as const;

export const CONTACT_MESSAGES = {
  name: {
    required: 'Ime je obavezno.',
    maxlength: `Ime može imati najviše ${CONTACT_LIMITS.name} znakova.`,
  },
  email: { required: 'Adresa e-pošte je obavezna.' },
  message: {
    required: 'Poruka je obavezna.',
    maxlength: `Poruka može imati najviše ${CONTACT_LIMITS.message} znakova.`,
  },
} as const;

/** 409 CONTACT_NOT_CONFIGURED: the store has no contact email yet. */
export const NOT_CONFIGURED = 'CONTACT_NOT_CONFIGURED';

/**
 * Kontakt (`/kontakt`, prerendered): the store's contact details from `GET /store` – only the
 * ones that are set – and the contact form (`POST /contact`). The message is emailed to the
 * store address with the sender as Reply-To. Without a store address the API answers 409
 * `CONTACT_NOT_CONFIGURED`; its text is shown with the phone number when there is one.
 */
@Component({
  selector: 'sf-contact-page',
  imports: [ReactiveFormsModule, RouterLink, UiButton, UiCard, UiFormField, UiInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-page px-gutter pb-section pt-10 md:pt-14">
      <p class="eyebrow">Zladovce</p>
      <h1 class="mt-3 text-4xl md:text-5xl">Kontakt</h1>

      <div class="mt-8 grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
        <div>
          <p class="max-w-prose text-lg text-ink-700">
            Imate pitanje o proizvodima, porudžbini ili dostavi? Pošaljite nam poruku – odgovor
            stiže na adresu e-pošte koju navedete.
          </p>

          @if (hasDetails()) {
            <dl class="mt-8 flex flex-col gap-5" data-testid="contact-details">
              @if (contact()?.phone; as phone) {
                <div>
                  <dt class="text-sm font-semibold text-ink-900">Telefon</dt>
                  <dd class="mt-1 text-lg">
                    <a
                      [href]="tel(phone)"
                      class="font-semibold text-olive-800 underline underline-offset-4"
                      data-testid="contact-phone"
                      >{{ phone }}</a
                    >
                  </dd>
                </div>
              }
              @if (contact()?.email; as email) {
                <div>
                  <dt class="text-sm font-semibold text-ink-900">E-pošta</dt>
                  <dd class="mt-1 break-all text-lg">
                    <a
                      [href]="'mailto:' + email"
                      class="font-semibold text-olive-800 underline underline-offset-4"
                      data-testid="contact-email"
                      >{{ email }}</a
                    >
                  </dd>
                </div>
              }
              @if (contact()?.address; as address) {
                <div>
                  <dt class="text-sm font-semibold text-ink-900">Adresa</dt>
                  <dd class="mt-1 whitespace-pre-line text-lg text-ink-700" data-testid="contact-address">
                    {{ address }}
                  </dd>
                </div>
              }
            </dl>
          }

          @if (faqLinked()) {
            <p class="mt-8 text-ink-700">
              Odgovore na pitanja o poručivanju i dostavi možete naći i na stranici
              <a
                [routerLink]="faqPath"
                class="font-semibold text-olive-800 underline underline-offset-4"
                >Česta pitanja</a
              >.
            </p>
          }
        </div>

        <ui-card padding="lg">
          <div aria-live="polite" data-testid="contact-live">
            @if (accepted(); as message) {
              <div data-testid="contact-success">
                <h2
                  #successHeading
                  tabindex="-1"
                  class="text-3xl outline-none"
                >
                  Poruka je poslata
                </h2>
                <p class="mt-3 text-lg text-ink-700">{{ message }}</p>
                <button
                  uiButton
                  type="button"
                  variant="secondary"
                  class="mt-6"
                  (click)="another()"
                  data-testid="contact-another"
                >
                  Pošalji novu poruku
                </button>
              </div>
            }
          </div>

          @if (!accepted()) {
            <form
              [formGroup]="form"
              novalidate
              (ngSubmit)="submit()"
              class="relative flex flex-col gap-5"
              data-testid="contact-form"
            >
              <h2 class="text-2xl">Pišite nam</h2>
              <ui-form-field label="Ime i prezime" [messages]="messages.name">
                <input
                  #nameInput
                  uiInput
                  type="text"
                  formControlName="name"
                  autocomplete="name"
                  [attr.maxlength]="limits.name"
                  data-testid="contact-name"
                />
              </ui-form-field>
              <ui-form-field
                label="Adresa e-pošte"
                hint="Na nju vam šaljemo odgovor."
                [messages]="messages.email"
              >
                <input
                  uiInput
                  type="email"
                  formControlName="email"
                  autocomplete="email"
                  inputmode="email"
                  data-testid="contact-email-input"
                />
              </ui-form-field>
              <ui-form-field
                label="Poruka"
                [hint]="messageHint()"
                [messages]="messages.message"
              >
                <textarea
                  uiInput
                  rows="6"
                  formControlName="message"
                  class="min-h-36"
                  data-testid="contact-message"
                ></textarea>
              </ui-form-field>

              <div [class]="honeypotClass" aria-hidden="true">
                <label for="sf-contact-website">Ne popunjavajte ovo polje</label>
                <input
                  id="sf-contact-website"
                  type="text"
                  formControlName="website"
                  tabindex="-1"
                  autocomplete="off"
                  data-testid="contact-website"
                />
              </div>

              @if (problem(); as p) {
                <div
                  #problemBox
                  tabindex="-1"
                  class="rounded-lg border p-4 outline-none"
                  [class]="
                    p.kind === 'rateLimited' || p.kind === 'notConfigured'
                      ? 'border-warning-700/25 bg-warning-50 text-ink-900'
                      : 'border-danger-600/30 bg-danger-50 text-danger-700'
                  "
                  role="alert"
                  data-testid="contact-problem"
                  [attr.data-kind]="p.kind"
                >
                  <p class="font-semibold">{{ p.title }}</p>
                  <p class="mt-1">{{ p.message }}</p>
                  @if (p.kind === 'notConfigured' && contact()?.phone; as phone) {
                    <p class="mt-2" data-testid="contact-phone-fallback">
                      Pozovite nas na
                      <a
                        [href]="tel(phone)"
                        class="font-semibold text-olive-800 underline underline-offset-4"
                        >{{ phone }}</a
                      >.
                    </p>
                  }
                </div>
              }

              <div>
                <button
                  uiButton
                  type="submit"
                  size="lg"
                  [loading]="sending()"
                  [disabled]="submitBlock.blocked()"
                  data-testid="contact-submit"
                >
                  {{ sending() ? 'Šaljemo…' : 'Pošalji poruku' }}
                </button>
              </div>
            </form>
          }
        </ui-card>
      </div>
    </div>
  `,
})
export class ContactPage {
  private readonly api = inject(ContentApi);
  private readonly store = inject(StoreSettings);
  private readonly siteContent = inject(SiteContent);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly successHeading = viewChild<ElementRef<HTMLElement>>('successHeading');
  private readonly problemBox = viewChild<ElementRef<HTMLElement>>('problemBox');

  protected readonly limits = CONTACT_LIMITS;
  protected readonly messages = CONTACT_MESSAGES;
  protected readonly honeypotClass = HONEYPOT_CLASS;
  protected readonly faqPath = infoPath('faq');
  protected readonly faqLinked = computed(() => this.siteContent.has('faq'));
  protected readonly submitBlock = new SubmitBlock(this.destroyRef);

  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, notBlank, Validators.maxLength(CONTACT_LIMITS.name)]],
    email: ['', [Validators.required, notBlank, emailAddressValidator]],
    message: ['', [Validators.required, notBlank, Validators.maxLength(CONTACT_LIMITS.message)]],
    website: [''],
  });

  protected readonly contact = computed(() => this.store.settings()?.contact ?? null);
  protected readonly hasDetails = computed(() => {
    const contact = this.contact();
    return !!(contact?.phone || contact?.email || contact?.address);
  });
  protected readonly sending = signal(false);
  protected readonly accepted = signal<string | null>(null);
  protected readonly problem = signal<FormProblem | null>(null);
  private readonly messageLength = signal(0);
  protected readonly messageHint = computed(
    () => `${this.messageLength()} / ${CONTACT_LIMITS.message} znakova`,
  );

  constructor() {
    this.store.ensureLoaded();
    this.form.controls.message.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.messageLength.set(value.length));
  }

  submit(): void {
    if (this.sending() || this.submitBlock.blocked()) {
      return;
    }
    this.problem.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }
    const value = this.form.getRawValue();
    this.sending.set(true);
    this.api
      .contact({
        name: value.name.trim(),
        email: value.email.trim(),
        message: value.message.trim(),
        website: value.website,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.sending.set(false);
          this.accepted.set(response.message);
          this.form.reset();
          afterNextRender(() => this.successHeading()?.nativeElement.focus(), {
            injector: this.injector,
          });
        },
        error: (error: unknown) => {
          this.sending.set(false);
          const apiError = asApiError(error);
          if (apiError.status === 429) {
            this.submitBlock.block(apiError.retryAfterSeconds);
          }
          if (apiError.status === 400 && applyServerErrors(this.form, apiError).length === 0) {
            this.problem.set(formProblem(apiError));
            this.focusFirstInvalid();
            return;
          }
          if (apiError.status === 409 && apiError.code === NOT_CONFIGURED) {
            this.store.ensureLoaded();
            this.problem.set({
              kind: 'notConfigured',
              title: 'Poruka nije poslata',
              message: apiError.detail,
            });
          } else {
            this.problem.set(formProblem(apiError));
          }
          afterNextRender(() => this.problemBox()?.nativeElement.focus(), {
            injector: this.injector,
          });
        },
      });
  }

  protected another(): void {
    this.accepted.set(null);
    afterNextRender(() => this.nameInput()?.nativeElement.focus(), { injector: this.injector });
  }

  protected tel(phone: string): string {
    return telHref(phone);
  }

  private focusFirstInvalid(): void {
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>('[data-testid="contact-form"] [aria-invalid="true"]')
          ?.focus(),
      { injector: this.injector },
    );
  }
}
