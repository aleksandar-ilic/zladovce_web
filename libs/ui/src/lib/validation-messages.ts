import { ValidationErrors } from '@angular/forms';

/** Message for one validator: fixed text or a function of the validator's error payload. */
export type ValidationMessage = string | ((error: unknown) => string);
export type ValidationMessages = Record<string, ValidationMessage>;

const numberFrom = (error: unknown, key: string): string => {
  const value = (error as Record<string, unknown> | null)?.[key];
  return typeof value === 'number' || typeof value === 'string' ? String(value) : '';
};

/** Serbian messages for Angular's built-in validators. */
export const DEFAULT_VALIDATION_MESSAGES: ValidationMessages = {
  required: 'Ovo polje je obavezno.',
  email: 'Unesite ispravnu e-adresu.',
  minlength: (e) => `Najmanji broj znakova: ${numberFrom(e, 'requiredLength')}.`,
  maxlength: (e) => `Najveći broj znakova: ${numberFrom(e, 'requiredLength')}.`,
  min: (e) => `Najmanja dozvoljena vrednost: ${numberFrom(e, 'min')}.`,
  max: (e) => `Najveća dozvoljena vrednost: ${numberFrom(e, 'max')}.`,
  pattern: 'Vrednost nije u ispravnom formatu.',
};

const FALLBACK = 'Vrednost nije ispravna.';

/**
 * Returns the message of the first validation error, or null when there is none.
 * Lookup order: `overrides`, built-in Serbian defaults, the error value itself when a custom
 * validator returned a string, and finally a generic message.
 */
export function validationMessage(
  errors: ValidationErrors | null | undefined,
  overrides: ValidationMessages = {},
): string | null {
  if (!errors) {
    return null;
  }
  const key = Object.keys(errors)[0];
  if (key === undefined) {
    return null;
  }
  const error: unknown = errors[key];
  const message = overrides[key] ?? DEFAULT_VALIDATION_MESSAGES[key];
  if (typeof message === 'function') {
    return message(error);
  }
  if (typeof message === 'string') {
    return message;
  }
  return typeof error === 'string' && error.length > 0 ? error : FALLBACK;
}
