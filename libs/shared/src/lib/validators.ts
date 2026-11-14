import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Group validator: the two named controls must hold the same value.
 * The error (`mismatch`) is set on the group, so it does not hide the controls' own errors.
 */
export function matchingValues(first: string, second: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const a: unknown = group.get(first)?.value;
    const b: unknown = group.get(second)?.value;
    return a === b || b === '' || b === null || b === undefined ? null : { mismatch: true };
  };
}

/** The value must contain something other than whitespace. */
export const notBlank: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value: unknown = control.value;
  return typeof value === 'string' && value.trim() === '' ? { required: true } : null;
};
