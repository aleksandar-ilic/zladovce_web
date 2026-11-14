import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { paymentMethodLabel } from '@zladovce/shared';
import { UiButton, UiCard, UiEmptyState } from '@zladovce/ui';
import { RsdPipe, SrDatePipe } from '@zladovce/utilities';
import { CheckoutSession } from './checkout-session';
import { TrackingCodeCard } from './tracking-code-card';

/**
 * Porudžbina primljena (`/porudzbina-primljena`, client only, noindex): the order the API just
 * confirmed, read from sessionStorage so a reload in the same tab shows it again, together with
 * the tracking code (copy button, link `/track-order#kod=…`). The code is shown only here and in
 * the confirmation email.
 */
@Component({
  selector: 'sf-confirmation-page',
  imports: [RouterLink, RsdPipe, SrDatePipe, TrackingCodeCard, UiButton, UiCard, UiEmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-3xl px-gutter pb-section pt-10 md:pt-14">
      @if (order; as o) {
        <div
          class="rounded-xl border border-sage-200 bg-sage-50 p-6 md:p-8"
          data-testid="confirmation"
        >
          <p class="eyebrow">Hvala vam!</p>
          <h1 class="mt-3 text-4xl md:text-5xl">Porudžbina je primljena</h1>
          <p class="mt-4 text-lg text-ink-700">
            Broj porudžbine:
            <strong class="whitespace-nowrap text-ink-900" data-testid="order-number">{{
              o.orderNumber
            }}</strong>
          </p>
          <p class="mt-1 text-sm text-ink-700">
            Poslato {{ o.placedAt | srDate: 'dateTime' }}. Sačuvajte broj porudžbine ako budete
            hteli da nas pitate nešto o njoj.
          </p>
        </div>

        <sf-tracking-code-card class="mt-8" [code]="o.trackingCode" />

        <section class="mt-10" aria-labelledby="sf-next-steps">
          <h2 id="sf-next-steps" class="text-3xl">Šta sledi</h2>
          <ol class="mt-5 space-y-4" data-testid="next-steps">
            <li class="flex gap-4">
              <span
                class="w-6 shrink-0 font-serif text-3xl font-semibold text-olive-500"
                aria-hidden="true"
                >1</span
              >
              <p class="text-ink-700">
                <strong class="text-ink-900">Potvrđujemo porudžbinu.</strong> Pregledamo je i
                javljamo vam se ako nešto treba da proverimo.
              </p>
            </li>
            <li class="flex gap-4">
              <span
                class="w-6 shrink-0 font-serif text-3xl font-semibold text-olive-500"
                aria-hidden="true"
                >2</span
              >
              <p class="text-ink-700">
                <strong class="text-ink-900">Pakujemo i šaljemo.</strong> Paket predajemo kurirskoj
                službi na adresu koju ste upisali.
              </p>
            </li>
            <li class="flex gap-4">
              <span
                class="w-6 shrink-0 font-serif text-3xl font-semibold text-olive-500"
                aria-hidden="true"
                >3</span
              >
              <p class="text-ink-700">
                <strong class="text-ink-900">Plaćate pri preuzimanju.</strong>
                {{ paymentLabel(o.paymentMethod) }}: iznos od {{ o.total | rsd }} plaćate kuriru
                kada vam preda paket.
              </p>
            </li>
          </ol>
        </section>

        <ui-card class="mt-10" data-testid="confirmation-summary">
          <h2 class="text-2xl">Vaša porudžbina</h2>
          <ul class="mt-4 divide-y divide-cream-200 border-y border-cream-200">
            @for (item of o.items; track item.variantId) {
              <li class="flex justify-between gap-4 py-3" data-testid="confirmation-item">
                <div class="min-w-0">
                  <p class="font-semibold text-ink-900">{{ item.productName }}</p>
                  <p class="text-sm text-ink-700">
                    {{ item.variantName }} · {{ item.quantity }} × {{ item.unitPrice | rsd }}
                  </p>
                </div>
                <p class="shrink-0 font-semibold">{{ item.lineTotal | rsd }}</p>
              </li>
            }
          </ul>
          <dl class="mt-4 space-y-2">
            <div class="flex justify-between gap-4">
              <dt class="text-ink-700">Međuzbir</dt>
              <dd class="font-semibold" data-testid="subtotal">{{ o.subtotal | rsd }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-ink-700">Dostava</dt>
              <dd class="font-semibold" data-testid="shipping">
                {{ o.shippingPrice > 0 ? (o.shippingPrice | rsd) : 'Besplatna dostava' }}
              </dd>
            </div>
            <div class="flex justify-between gap-4 border-t border-cream-200 pt-3 text-lg">
              <dt class="font-semibold">Ukupno za plaćanje</dt>
              <dd class="font-semibold" data-testid="total">{{ o.total | rsd }}</dd>
            </div>
            <div class="flex justify-between gap-4 pt-1">
              <dt class="text-ink-700">Način plaćanja</dt>
              <dd class="text-right font-semibold" data-testid="payment-method">
                {{ paymentLabel(o.paymentMethod) }}
              </dd>
            </div>
          </dl>
        </ui-card>

        <div class="mt-10">
          <a uiButton size="lg" routerLink="/prodavnica">Nazad u prodavnicu</a>
        </div>
      } @else {
        <h1 class="text-4xl md:text-5xl">Porudžbina</h1>
        <ui-card padding="lg" class="mt-8">
          <ui-empty-state
            title="Ovde trenutno nema porudžbine za prikaz"
            description="Potvrda se prikazuje odmah posle poručivanja, u istom prozoru pregledača. Ako ste već poručili, porudžbina je sačuvana i javićemo vam se."
          >
            <a uiButton routerLink="/prodavnica">Pogledajte ponudu</a>
          </ui-empty-state>
        </ui-card>
      }
    </div>
  `,
})
export class ConfirmationPage {
  protected readonly order = inject(CheckoutSession).readConfirmation();

  protected paymentLabel(method: string): string {
    return paymentMethodLabel(method);
  }
}
