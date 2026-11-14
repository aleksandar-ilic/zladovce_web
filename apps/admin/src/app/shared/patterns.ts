/** Shop address segment: lower-case letters without diacritics, digits and single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const SLUG_MESSAGES = {
  pattern:
    'Adresa sme da sadrži samo mala slova bez kvačica, cifre i crtice (na primer dzem-od-sljiva).',
};
