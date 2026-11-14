import { FormBuilder, Validators } from '@angular/forms';
import { ApiError } from '@zladovce/api';
import { CartQuote, CreateOrderRequest } from '@zladovce/models';
import {
  CONTACT_LIMITS,
  emailAddressValidator,
  notBlank,
  personNameValidator,
  postalCodeValidator,
  serbianPhoneValidator,
} from '@zladovce/shared';
import { formatRsd } from '@zladovce/utilities';
import { CheckoutDraft } from './checkout-session';

/** The checkout form; group names match the API body (`customer.phone`, `address.postalCode`). */
export function createCheckoutForm(fb: FormBuilder, draft: Partial<CheckoutDraft> = {}) {
  const required = [Validators.required, notBlank];
  return fb.nonNullable.group({
    customer: fb.nonNullable.group({
      firstName: [draft.firstName ?? '', [...required, personNameValidator('Ime')]],
      lastName: [draft.lastName ?? '', [...required, personNameValidator('Prezime')]],
      email: [draft.email ?? '', [...required, emailAddressValidator]],
      phone: [draft.phone ?? '', [...required, serbianPhoneValidator]],
    }),
    address: fb.nonNullable.group({
      city: [draft.city ?? '', [...required, Validators.maxLength(CONTACT_LIMITS.city)]],
      street: [draft.street ?? '', [...required, Validators.maxLength(CONTACT_LIMITS.street)]],
      postalCode: [draft.postalCode ?? '', [...required, postalCodeValidator]],
    }),
    deliveryNote: [draft.deliveryNote ?? '', [Validators.maxLength(CONTACT_LIMITS.deliveryNote)]],
    acceptedTerms: [false, [Validators.requiredTrue]],
  });
}

export type CheckoutForm = ReturnType<typeof createCheckoutForm>;
export type CheckoutFormValue = ReturnType<CheckoutForm['getRawValue']>;

/** Messages for the built-in validators of the checkout fields. */
export const CHECKOUT_MESSAGES = {
  firstName: { required: 'Ime je obavezno.' },
  lastName: { required: 'Prezime je obavezno.' },
  email: { required: 'Adresa e-pošte je obavezna.' },
  phone: { required: 'Broj telefona je obavezan.' },
  city: {
    required: 'Mesto je obavezno.',
    maxlength: `Mesto može imati najviše ${CONTACT_LIMITS.city} znakova.`,
  },
  street: {
    required: 'Ulica i broj su obavezni.',
    maxlength: `Ulica i broj mogu imati najviše ${CONTACT_LIMITS.street} znakova.`,
  },
  postalCode: { required: 'Poštanski broj je obavezan.' },
  deliveryNote: {
    maxlength: `Napomena može imati najviše ${CONTACT_LIMITS.deliveryNote} znakova.`,
  },
  acceptedTerms: 'Da biste poručili, potvrdite da prihvatate uslove kupovine.',
} as const;

export function draftOf(value: CheckoutFormValue): CheckoutDraft {
  return {
    ...value.customer,
    ...value.address,
    deliveryNote: value.deliveryNote,
  };
}

/**
 * The order request: the lines and prices of the quote the customer is looking at
 * (`knownUnitPrice`, `expectedTotal`), so the API refuses with the fresh quote when anything
 * changed meanwhile instead of charging a different amount.
 */
export function buildOrderRequest(value: CheckoutFormValue, quote: CartQuote): CreateOrderRequest {
  const note = value.deliveryNote.trim();
  return {
    items: quote.lines.map((line) => ({
      variantId: line.variantId,
      quantity: line.quantity,
      knownUnitPrice: line.unitPrice,
    })),
    customer: {
      firstName: value.customer.firstName.trim(),
      lastName: value.customer.lastName.trim(),
      email: value.customer.email.trim(),
      phone: value.customer.phone.trim(),
    },
    address: {
      city: value.address.city.trim(),
      street: value.address.street.trim(),
      postalCode: value.address.postalCode.trim(),
    },
    deliveryNote: note === '' ? null : note,
    acceptedTerms: value.acceptedTerms,
    expectedTotal: quote.total,
  };
}

/** Refusals that carry a fresh quote in `quote`. */
export const QUOTE_CONFLICTS = [
  'CART_CHANGED',
  'INSUFFICIENT_STOCK',
  'MINIMUM_ORDER_NOT_MET',
  'SHIPPING_DISABLED',
] as const;

export interface CheckoutProblem {
  title: string;
  messages: readonly string[];
  /** `warning` for something the customer can fix right here, `danger` for a failure. */
  tone: 'warning' | 'danger';
}

/** "2 minuta", "45 sekundi" – rounded up, never zero. */
export function waitText(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return 'nekoliko minuta';
  }
  if (seconds < 60) {
    const s = Math.ceil(seconds);
    return `${s} ${s % 10 === 1 && s % 100 !== 11 ? 'sekundu' : s % 10 >= 2 && s % 10 <= 4 && (s % 100 < 12 || s % 100 > 14) ? 'sekunde' : 'sekundi'}`;
  }
  const m = Math.ceil(seconds / 60);
  return `${m} ${m % 10 === 1 && m % 100 !== 11 ? 'minut' : 'minuta'}`;
}

export function rateLimitProblem(seconds: number | null): CheckoutProblem {
  return {
    title: 'Previše pokušaja u kratkom roku',
    messages: [
      `Radi zaštite od zloupotrebe, sa jednog uređaja se može poslati samo nekoliko porudžbina za redom. Sačekajte oko ${waitText(seconds)} i pritisnite „Poruči“ ponovo.`,
      'Vaši podaci i korpa su sačuvani.',
    ],
    tone: 'warning',
  };
}

/**
 * Explanation of a 409 refusal after the fresh quote was applied. `notices` (removed or reduced
 * lines, new prices) are shown separately; when there are none, the new total is named here.
 */
export function quoteConflictProblem(
  code: string,
  fresh: CartQuote,
  previousTotal: number | null,
  notices: readonly string[],
): CheckoutProblem {
  // The changes themselves are listed in the notices box above; here only what they mean.
  const messages: string[] = [];
  if (notices.length === 0 && previousTotal !== null && previousTotal !== fresh.total) {
    messages.push(
      `Ukupan iznos za plaćanje je sada ${formatRsd(fresh.total)} (umesto ${formatRsd(previousTotal)}).`,
    );
  }
  const confirmAgain =
    'Proverite pregled porudžbine i, ako se slažete, pritisnite „Poruči“ ponovo.';
  switch (code) {
    case 'INSUFFICIENT_STOCK':
      return {
        title: 'Nekih proizvoda više nema u traženoj količini',
        messages: [...messages, 'Količine smo uskladili sa stanjem.', confirmAgain],
        tone: 'warning',
      };
    case 'MINIMUM_ORDER_NOT_MET':
      return {
        title: 'Porudžbina je ispod najmanjeg iznosa',
        messages,
        tone: 'warning',
      };
    case 'SHIPPING_DISABLED':
      return {
        title: 'Dostava je trenutno isključena',
        messages: [...messages, 'Poručivanje privremeno nije moguće. Pokušajte ponovo kasnije.'],
        tone: 'warning',
      };
    default:
      return {
        title: 'Ponuda se promenila dok ste popunjavali porudžbinu',
        messages: [...messages, confirmAgain],
        tone: 'warning',
      };
  }
}

/** Anything that is not a validation error or a quote conflict. */
export function failureProblem(error: ApiError): CheckoutProblem {
  if (error.code === 'IDEMPOTENCY_KEY_REUSED') {
    return {
      title: 'Porudžbina je možda već primljena',
      messages: [
        'Malopre je sa ovog uređaja već poslata porudžbina sa drugačijim sadržajem.',
        'Ako ste je već poručili, ne morate ništa da radite. Ako želite da pošaljete i ovu porudžbinu, pritisnite „Poruči“ ponovo.',
      ],
      tone: 'warning',
    };
  }
  if (error.isNetworkError || error.status >= 500) {
    return {
      title: 'Porudžbina nije poslata',
      messages: [
        error.detail,
        'Pritisnite „Poruči“ ponovo kada veza proradi – ako je porudžbina ipak stigla, nećemo napraviti duplu.',
      ],
      tone: 'danger',
    };
  }
  return { title: 'Porudžbina nije poslata', messages: [error.detail], tone: 'danger' };
}
