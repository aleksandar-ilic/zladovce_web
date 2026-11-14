import { AbstractControl } from '@angular/forms';
import { ApiError } from '@zladovce/api';

/**
 * Splits an API field path into form path segments:
 * `variants[0].discountPrice` → `['variants', 0, 'discountPrice']`.
 * Segments are camel-cased (`RegularPrice` → `regularPrice`) in case the server sends Pascal case.
 */
export function fieldPath(key: string): (string | number)[] {
  const segments: (string | number)[] = [];
  for (const part of key.split('.')) {
    const match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(part);
    if (!match) {
      segments.push(part);
      continue;
    }
    const [, name = '', indexes = ''] = match;
    if (name) {
      segments.push(name.charAt(0).toLowerCase() + name.slice(1));
    }
    for (const index of indexes.matchAll(/\[(\d+)\]/g)) {
      segments.push(Number(index[1]));
    }
  }
  return segments;
}

export interface ServerErrorOptions {
  /** Maps an API field name to a different control path (e.g. `{ imageKey: 'image' }`). */
  aliases?: Record<string, string>;
}

/**
 * Puts every field-level message of a validation error on the matching control as
 * `{ server: message }` (validationMessage shows the string) and marks it touched, so it shows
 * immediately under the field. The error disappears when the value changes.
 *
 * Also used for `409 SLUG_TAKEN` / `SKU_TAKEN`, which carry the same map (`slug`, `sku`,
 * `variants[i].sku`).
 *
 * Returns the messages that matched no control; show them in a general alert.
 */
export function applyServerErrors(
  form: AbstractControl,
  error: ApiError,
  options: ServerErrorOptions = {},
): string[] {
  const unmatched: string[] = [];
  for (const [key, messages] of Object.entries(error.errors)) {
    const message = messages.join(' ');
    const alias = options.aliases?.[key];
    const control = key === '' ? null : form.get(fieldPath(alias ?? key));
    if (control && control !== form) {
      control.setErrors({ ...(control.errors ?? {}), server: message });
      control.markAsTouched();
    } else {
      unmatched.push(message);
    }
  }
  return unmatched;
}
