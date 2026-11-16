import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError, asApiError } from '@zladovce/api';
import { CartQuote, PlacedOrder } from '@zladovce/models';
import { applyServerErrors, CartStore, PHONE_EXAMPLE } from '@zladovce/shared';
import {
  UiButton,
  UiCard,
  UiEmptyState,
  UiErrorState,
  UiFormField,
  UiInput,
  UiLoadingState,
} from '@zladovce/ui';
import { RsdPipe } from '@zladovce/utilities';
import { CartQuoteService } from '../../core/cart/cart-quote.service';
import { checkoutBlockedReason, shippingText } from '../../core/cart/cart-summary';
import { OrdersApi } from '../../core/data/orders-api';
import { SiteContent } from '../../core/data/site-content';
import { CART_PATH, ORDER_CONFIRMATION_PATH, TERMS_PAGE } from '../../core/navigation';
import {
  buildOrderRequest,
  CHECKOUT_MESSAGES,
  CheckoutProblem,
  createCheckoutForm,
  draftOf,
  failureProblem,
  QUOTE_CONFLICTS,
  quoteConflictProblem,
  rateLimitProblem,
} from './checkout-form';
import { CheckoutSession } from './checkout-session';

/**
 * Poručivanje (`/porucivanje`, client only, noindex): contact and delivery form, cash on
 * delivery, the order summary from a fresh quote and one "Poruči" button.
 *
 * - The order is sent with the lines and prices of the quote on screen (`knownUnitPrice`,
 *   `expectedTotal`). When the API refuses with a fresh quote (prices, stock, minimum order,
 *   shipping), the quote is applied to the cart, the changes are listed and the customer confirms again.
 * - One idempotency key per submission (CheckoutSession): the same key on every retry, a new one
 *   only after a successful order. While a request runs the button is disabled and a second
 *   submit is ignored.
 * - The cart is cleared only after the API confirmed the order; the confirmation is kept in
 *   sessionStorage for `/porudzbina-primljena`.
 */
@Component({
  selector: 'sf-checkout-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    RsdPipe,
    UiButton,
    UiCard,
    UiEmptyState,
    UiErrorState,
    UiFormField,
    UiInput,
    UiLoadingState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-page px-gutter pb-section pt-10 md:pt-14">
      <h1 class="text-4xl md:text-5xl">Poručivanje</h1>

      @if (placing()) {
        <ui-loading-state label="Porudžbina je primljena, otvaramo potvrdu…" />
      } @else if (cart.isEmpty()) {
        <ui-card padding="lg" class="mt-8">
          <ui-empty-state
            title="Vaša korpa je prazna"
            description="Da biste poručili, prvo dodajte proizvode u korpu."
          >
            <a uiButton routerLink="/prodavnica">Pogledajte ponudu</a>
          </ui-empty-state>
        </ui-card>
      } @else if (!quote()) {
        @if (quotes.error(); as error) {
          <ui-card class="mt-8">
            <ui-error-state
              title="Porudžbina trenutno ne može da se pripremi"
              [message]="error.detail"
              (retry)="quotes.refresh()"
            />
          </ui-card>
        } @else {
          <ui-loading-state label="Proveravamo cene i dostupnost…" />
        }
      } @else {
        @let q = quote()!;
        @if (quotes.notices().length > 0) {
          <div
            class="mt-8 rounded-lg border border-warning-700/25 bg-warning-50 p-5 text-ink-900"
            role="status"
            data-testid="checkout-notices"
          >
            <p class="font-semibold">Korpa je usklađena sa trenutnom ponudom:</p>
            <ul class="mt-2 list-disc space-y-1 pl-5">
              @for (notice of quotes.notices(); track $index) {
                <li>{{ notice }}</li>
              }
            </ul>
          </div>
        }

        @if (problem(); as p) {
          <div
            #problemBox
            tabindex="-1"
            class="mt-6 rounded-lg border p-5 outline-none"
            [class]="
              p.tone === 'danger'
                ? 'border-danger-600/30 bg-danger-50 text-danger-700'
                : 'border-warning-700/25 bg-warning-50 text-ink-900'
            "
            role="alert"
            data-testid="checkout-problem"
          >
            <p class="font-semibold">{{ p.title }}</p>
            @for (message of p.messages; track $index) {
              <p class="mt-1.5">{{ message }}</p>
            }
          </div>
        }

        @if (blockedReason(); as reason) {
          <ui-card class="mt-8" data-testid="checkout-blocked">
            <p class="font-serif text-xl font-semibold text-olive-900">
              Porudžbina još ne može da se pošalje
            </p>
            <p class="mt-2 text-ink-700">{{ reason }}</p>
            <a uiButton class="mt-5" [routerLink]="cartPath">Nazad u korpu</a>
          </ui-card>
        } @else {
          <form
            class="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_24rem] lg:gap-12"
            [formGroup]="form"
            (ngSubmit)="submit()"
            novalidate
            data-testid="checkout-form"
          >
            <div class="flex flex-col gap-8">
              <fieldset class="rounded-lg border border-cream-200 bg-white p-5 md:p-6">
                <legend class="px-1 font-serif text-2xl font-semibold text-olive-900">
                  Vaši podaci
                </legend>
                <div class="mt-3 grid gap-5 sm:grid-cols-2" formGroupName="customer">
                  <ui-form-field label="Ime" [messages]="messages.firstName">
                    <input
                      uiInput
                      formControlName="firstName"
                      autocomplete="given-name"
                      maxlength="100"
                      data-testid="firstName"
                    />
                  </ui-form-field>
                  <ui-form-field label="Prezime" [messages]="messages.lastName">
                    <input
                      uiInput
                      formControlName="lastName"
                      autocomplete="family-name"
                      maxlength="100"
                      data-testid="lastName"
                    />
                  </ui-form-field>
                  <ui-form-field
                    label="E-pošta"
                    hint="Na ovu adresu vam pišemo u vezi sa porudžbinom."
                    [messages]="messages.email"
                  >
                    <input
                      uiInput
                      type="email"
                      formControlName="email"
                      autocomplete="email"
                      inputmode="email"
                      maxlength="254"
                      data-testid="email"
                    />
                  </ui-form-field>
                  <ui-form-field
                    label="Telefon"
                    [hint]="'Kurir vas zove na ovaj broj. Na primer: ' + phoneExample"
                    [messages]="messages.phone"
                  >
                    <input
                      uiInput
                      type="tel"
                      formControlName="phone"
                      autocomplete="tel"
                      inputmode="tel"
                      maxlength="30"
                      data-testid="phone"
                    />
                  </ui-form-field>
                </div>
              </fieldset>

              <fieldset class="rounded-lg border border-cream-200 bg-white p-5 md:p-6">
                <legend class="px-1 font-serif text-2xl font-semibold text-olive-900">
                  Adresa za dostavu
                </legend>
                <p class="mt-1 text-sm text-ink-700">Dostavljamo na adrese širom Srbije.</p>
                <div class="mt-4 grid gap-5 sm:grid-cols-[1fr_10rem]" formGroupName="address">
                  <ui-form-field
                    label="Ulica i broj"
                    class="sm:col-span-2"
                    [messages]="messages.street"
                  >
                    <input
                      uiInput
                      formControlName="street"
                      autocomplete="street-address"
                      maxlength="200"
                      data-testid="street"
                    />
                  </ui-form-field>
                  <ui-form-field label="Grad" [messages]="messages.city">
                    <input
                      uiInput
                      formControlName="city"
                      autocomplete="address-level2"
                      maxlength="100"
                      data-testid="city"
                    />
                  </ui-form-field>
                  <ui-form-field label="Poštanski broj" [messages]="messages.postalCode">
                    <input
                      uiInput
                      formControlName="postalCode"
                      autocomplete="postal-code"
                      inputmode="numeric"
                      maxlength="5"
                      data-testid="postalCode"
                    />
                  </ui-form-field>
                </div>
                <ui-form-field
                  label="Napomena za dostavu"
                  class="mt-5"
                  hint="Nije obavezno. Na primer: sprat, interfon ili kada ste kod kuće."
                  [messages]="messages.deliveryNote"
                >
                  <textarea
                    uiInput
                    rows="3"
                    formControlName="deliveryNote"
                    maxlength="500"
                    data-testid="deliveryNote"
                  ></textarea>
                </ui-form-field>
              </fieldset>

              <section
                class="rounded-lg border border-cream-200 bg-white p-5 md:p-6"
                aria-labelledby="sf-payment"
              >
                <h2 id="sf-payment" class="font-serif text-2xl font-semibold text-olive-900">
                  Plaćanje
                </h2>
                <div
                  class="mt-4 flex gap-3 rounded-md border-2 border-olive-700 bg-olive-50 p-4"
                  data-testid="payment"
                >
                  <span
                    class="mt-1 inline-block size-4 shrink-0 rounded-full border-4 border-olive-700 bg-white"
                    aria-hidden="true"
                  ></span>
                  <div>
                    <p class="font-semibold text-ink-900">Plaćanje pouzećem</p>
                    <p class="mt-1 text-sm text-ink-700">
                      Ništa ne plaćate unapred. Porudžbinu plaćate kuriru kada vam preda paket.
                      Kartica i korisnički nalog nisu potrebni.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <aside
              class="rounded-lg border border-cream-200 bg-white p-6 shadow-card lg:sticky lg:top-28"
              aria-labelledby="sf-checkout-summary"
              [attr.aria-busy]="busy()"
              data-testid="checkout-summary"
            >
              <h2 id="sf-checkout-summary" class="text-2xl">Pregled porudžbine</h2>
              <ul class="mt-4 divide-y divide-cream-200 border-y border-cream-200">
                @for (line of q.lines; track line.variantId) {
                  <li class="flex justify-between gap-4 py-3 text-sm" data-testid="summary-line">
                    <div class="min-w-0">
                      <p class="font-semibold text-ink-900">{{ line.productName }}</p>
                      <p class="text-ink-700">{{ line.variantName }}</p>
                      <p class="text-ink-700">{{ line.quantity }} × {{ line.unitPrice | rsd }}</p>
                    </div>
                    <p class="shrink-0 font-semibold text-ink-900">{{ line.lineTotal | rsd }}</p>
                  </li>
                }
              </ul>
              <dl class="mt-4 space-y-2 text-base">
                <div class="flex justify-between gap-4">
                  <dt class="text-ink-700">Međuzbir</dt>
                  <dd class="font-semibold" data-testid="subtotal">{{ q.subtotal | rsd }}</dd>
                </div>
                <div class="flex justify-between gap-4">
                  <dt class="text-ink-700">Dostava</dt>
                  <dd class="text-right font-semibold" data-testid="shipping">{{ shipping() }}</dd>
                </div>
                <div class="flex justify-between gap-4 border-t border-cream-200 pt-3 text-lg">
                  <dt class="font-semibold">Ukupno za plaćanje</dt>
                  <dd class="font-semibold" data-testid="total">{{ q.total | rsd }}</dd>
                </div>
              </dl>
              @if (busy()) {
                <p class="mt-2 text-xs text-ink-500" role="status">Iznosi se ažuriraju…</p>
              }
              <a
                [routerLink]="cartPath"
                class="mt-3 inline-block text-sm font-semibold text-olive-800 underline underline-offset-4"
                >Izmeni korpu</a
              >

              <div class="mt-5">
                <label class="flex cursor-pointer items-start gap-3 text-base text-ink-900">
                  <input
                    type="checkbox"
                    class="mt-1 size-5 shrink-0 accent-olive-700"
                    formControlName="acceptedTerms"
                    [attr.aria-invalid]="termsError() ? 'true' : null"
                    [attr.aria-describedby]="termsError() ? 'sf-terms-error' : null"
                    data-testid="acceptedTerms"
                  />
                  <span>
                    @if (termsPage(); as terms) {
                      Prihvatam
                      <a
                        [routerLink]="terms.path"
                        target="_blank"
                        class="font-semibold text-olive-800 underline underline-offset-4"
                        >uslove kupovine</a
                      >
                    } @else {
                      Prihvatam uslove kupovine
                    }
                  </span>
                </label>
                @if (termsError(); as message) {
                  <p
                    id="sf-terms-error"
                    class="mt-1.5 text-sm font-medium text-danger-700"
                    role="alert"
                    data-testid="terms-error"
                  >
                    {{ message }}
                  </p>
                }
              </div>

              <button
                uiButton
                type="submit"
                block
                size="lg"
                class="mt-5"
                [loading]="submitting()"
                [disabled]="busy() || blocked()"
                data-testid="submit"
              >
                {{ submitting() ? 'Šaljemo porudžbinu…' : 'Poruči' }}
              </button>
              <p class="mt-2 text-center text-sm text-ink-700">
                Plaćate pouzećem, {{ q.total | rsd }} kuriru pri preuzimanju.
              </p>
            </aside>
          </form>
        }
      }
    </div>
  `,
})
export class CheckoutPage {
  protected readonly cart = inject(CartStore);
  protected readonly quotes = inject(CartQuoteService);
  private readonly api = inject(OrdersApi);
  private readonly session = inject(CheckoutSession);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly problemBox = viewChild<ElementRef<HTMLElement>>('problemBox');

  protected readonly messages = CHECKOUT_MESSAGES;
  protected readonly phoneExample = PHONE_EXAMPLE;
  protected readonly cartPath = CART_PATH;
  private readonly siteContent = inject(SiteContent);
  /** The terms link only while the terms page has content (never a dead link). */
  protected readonly termsPage = computed(() =>
    TERMS_PAGE.requires && !this.siteContent.has(TERMS_PAGE.requires) ? null : TERMS_PAGE,
  );

  readonly form = createCheckoutForm(inject(FormBuilder), this.session.readDraft());
  /** The key sent with this submission and every retry of it. */
  readonly idempotencyKey = signal(this.session.idempotencyKey());

  protected readonly quote = this.quotes.quote;
  readonly submitting = signal(false);
  protected readonly placing = signal(false);
  readonly problem = signal<CheckoutProblem | null>(null);
  /** Until when the API asked us to wait (429), as epoch milliseconds. */
  private readonly blockedUntil = signal<number | null>(null);
  private readonly termsTouched = signal(false);
  private readonly termsAccepted = signal(this.form.controls.acceptedTerms.value);

  protected readonly busy = computed(() => this.quotes.loading() || this.quotes.stale());
  protected readonly blocked = computed(() => this.blockedUntil() !== null);
  protected readonly shipping = computed(() => {
    const quote = this.quote();
    return quote ? shippingText(quote) : '';
  });
  protected readonly blockedReason = computed(() => {
    const quote = this.quote();
    return quote && !this.busy() ? checkoutBlockedReason(quote) : null;
  });
  protected readonly termsError = computed(() =>
    this.termsTouched() && !this.termsAccepted() ? CHECKOUT_MESSAGES.acceptedTerms : null,
  );

  constructor() {
    this.siteContent.ensureLoaded();
    this.quotes.watch();
    // A fresh quote every time the checkout opens, even when the cart page priced it a moment ago.
    // (Without a quote yet, watch() requests the first one itself.)
    if (!this.cart.isEmpty() && this.quote() !== null) {
      this.quotes.refresh();
    }
    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.session.saveDraft(draftOf(this.form.getRawValue())));
    this.form.controls.acceptedTerms.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((accepted) => {
        this.termsAccepted.set(accepted);
        this.termsTouched.set(true);
      });
  }

  submit(): void {
    if (this.submitting() || this.blocked()) {
      return;
    }
    const quote = this.quote();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.termsTouched.set(true);
      this.problem.set({
        title: 'Proverite označena polja',
        messages: [
          'Neka polja nisu popunjena ili nisu ispravna. Objašnjenje je ispod svakog polja.',
        ],
        tone: 'warning',
      });
      this.focusFirstInvalid();
      return;
    }
    if (!quote || this.busy() || !quote.canCheckout) {
      return;
    }
    this.problem.set(null);
    this.submitting.set(true);
    this.api
      .place(buildOrderRequest(this.form.getRawValue(), quote), this.idempotencyKey())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (order) => this.placed(order),
        error: (error: unknown) => this.failed(asApiError(error), quote),
      });
  }

  private placed(order: PlacedOrder): void {
    this.placing.set(true);
    this.session.saveConfirmation(order);
    this.session.clearDraft();
    this.idempotencyKey.set(this.session.renewKey());
    this.quotes.dismissNotices();
    this.cart.clear();
    this.submitting.set(false);
    void this.router.navigateByUrl(ORDER_CONFIRMATION_PATH, { replaceUrl: true });
  }

  private failed(error: ApiError, sent: CartQuote): void {
    this.submitting.set(false);
    const fresh = error.extension<CartQuote>('quote');
    if (
      error.status === 409 &&
      fresh &&
      (QUOTE_CONFLICTS as readonly string[]).includes(error.code)
    ) {
      const notices = this.quotes.apply(fresh);
      this.problem.set(quoteConflictProblem(error.code, fresh, sent.total, notices));
    } else if (error.status === 429) {
      this.block(error.retryAfterSeconds);
      this.problem.set(rateLimitProblem(error.retryAfterSeconds));
    } else if (error.status === 400 && error.isValidation) {
      const keys = Object.keys(error.errors);
      const formErrors = Object.fromEntries(
        Object.entries(error.errors).filter(
          ([key]) =>
            !key.startsWith('items') && key !== 'idempotencyKey' && key !== 'expectedTotal',
        ),
      );
      const unmatched = applyServerErrors(
        this.form,
        new ApiError({
          status: error.status,
          code: error.code,
          title: error.title,
          detail: error.detail,
          errors: formErrors,
        }),
      );
      if (keys.some((key) => key.startsWith('items') || key === 'expectedTotal')) {
        this.quotes.refresh();
        unmatched.push('Korpa se u međuvremenu promenila. Proverite pregled porudžbine.');
      }
      if (error.errors['acceptedTerms']) {
        this.termsTouched.set(true);
      }
      if (error.errors['idempotencyKey']) {
        this.idempotencyKey.set(this.session.renewKey());
      }
      this.problem.set({
        title: 'Proverite označena polja',
        messages: unmatched.length > 0 ? unmatched : [error.detail],
        tone: 'warning',
      });
      this.focusFirstInvalid();
      return;
    } else {
      if (error.code === 'IDEMPOTENCY_KEY_REUSED') {
        this.idempotencyKey.set(this.session.renewKey());
      }
      this.problem.set(failureProblem(error));
    }
    this.focusProblem();
  }

  private block(seconds: number | null): void {
    const wait = Math.min(Math.max(seconds ?? 60, 1), 3600);
    this.blockedUntil.set(Date.now() + wait * 1000);
    const timer = setTimeout(() => this.blockedUntil.set(null), wait * 1000);
    this.destroyRef.onDestroy(() => clearTimeout(timer));
  }

  private focusProblem(): void {
    setTimeout(() => this.problemBox()?.nativeElement.focus());
  }

  private focusFirstInvalid(): void {
    setTimeout(() => {
      const invalid = this.document.querySelector<HTMLElement>(
        'sf-checkout-page [aria-invalid="true"]',
      );
      (invalid ?? this.problemBox()?.nativeElement)?.focus();
    });
  }
}
