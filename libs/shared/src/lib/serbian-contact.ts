import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Contact rules of the checkout, identical to the API (`CheckoutRules`, `SerbianPhone`,
 * `SerbianPostalCode` in the backend). The browser checks them first so mistakes show at once;
 * the API checks them again and its messages are shown the same way.
 */
export const CONTACT_LIMITS = {
  name: 100,
  email: 254,
  phone: 30,
  city: 100,
  street: 200,
  deliveryNote: 500,
} as const;

/** Letters (any script, with diacritics), then letters, spaces, `.`, `'`, `’` and `-`. */
export const PERSON_NAME_PATTERN = /^\p{L}[\p{L}\p{M} .'’-]*$/u;
export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s.]{2,}$/;
export const POSTAL_CODE_PATTERN = /^\d{5}$/;

export const PHONE_EXAMPLE = '064 123 4567';
export const PHONE_MESSAGE = `Unesite ispravan broj telefona u Srbiji, npr. ${PHONE_EXAMPLE} ili +381 64 123 4567.`;

/**
 * A Serbian phone number in E.164 (`+381641234567`), or null when the value is not one.
 * Accepted: `+381 64 123 4567`, `00381641234567`, `+381 (0)64 …`, `064/123-4567`, `011 123 4567`.
 * Spaces, `-`, `/`, `.` and parentheses are ignored; the national number has 8–10 digits and
 * does not start with 0.
 */
export function normaliseSerbianPhone(value: string | null | undefined): string | null {
  if (!value || value.trim() === '') {
    return null;
  }
  const trimmed = value.trim();
  let digits = '';
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed.charAt(i);
    if (c >= '0' && c <= '9') {
      digits += c;
    } else if (c === '+' && i === 0) {
      digits += c;
    } else if (!' -/.()'.includes(c)) {
      return null;
    }
  }
  let national: string;
  if (digits.startsWith('+381') || digits.startsWith('00381')) {
    national = digits.slice(digits.startsWith('+') ? 4 : 5);
    if (national.startsWith('0')) {
      national = national.slice(1);
    }
  } else if (digits.startsWith('0') && !digits.startsWith('00')) {
    national = digits.slice(1);
  } else {
    return null;
  }
  if (
    national.length < 8 ||
    national.length > 10 ||
    national.startsWith('0') ||
    !/^\d+$/.test(national)
  ) {
    return null;
  }
  return `+381${national}`;
}

const text = (control: AbstractControl): string => {
  const value: unknown = control.value;
  return typeof value === 'string' ? value.trim() : '';
};

/** Person name (first or last): letters, space, `-`, `.`, `'`. Empty values are left to `required`. */
export function personNameValidator(label: string): ValidatorFn {
  return (control) => {
    const value = text(control);
    if (value === '') {
      return null;
    }
    if (value.length > CONTACT_LIMITS.name) {
      return { personName: `${label} može imati najviše ${CONTACT_LIMITS.name} znakova.` };
    }
    return PERSON_NAME_PATTERN.test(value)
      ? null
      : { personName: `${label} sme da sadrži samo slova, razmak, crticu, tačku i apostrof.` };
  };
}

export const emailAddressValidator: ValidatorFn = (control): ValidationErrors | null => {
  const value = text(control);
  if (value === '') {
    return null;
  }
  return value.length <= CONTACT_LIMITS.email && EMAIL_PATTERN.test(value)
    ? null
    : { emailAddress: 'Unesite ispravnu adresu e-pošte (npr. ime@primer.rs).' };
};

export const serbianPhoneValidator: ValidatorFn = (control): ValidationErrors | null => {
  const raw: unknown = control.value;
  const value = typeof raw === 'string' ? raw : '';
  if (value.trim() === '') {
    return null;
  }
  return value.length <= CONTACT_LIMITS.phone && normaliseSerbianPhone(value) !== null
    ? null
    : { serbianPhone: PHONE_MESSAGE };
};

export const postalCodeValidator: ValidatorFn = (control): ValidationErrors | null => {
  const value = text(control);
  if (value === '') {
    return null;
  }
  return POSTAL_CODE_PATTERN.test(value)
    ? null
    : { postalCode: 'Poštanski broj ima tačno 5 cifara.' };
};
