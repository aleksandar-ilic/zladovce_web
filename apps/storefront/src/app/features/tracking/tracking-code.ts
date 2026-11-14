/**
 * Tracking codes: 26 Crockford Base32 characters shown as `XXXXX-XXXXX-XXXXX-XXXXX-XXXXXX`.
 * The page only tidies the input for display (letters and digits, upper case, groups); the API
 * does the real normalisation (`O` → `0`, `I`/`L` → `1`) and answers the same 404 for every
 * code it does not know, so nothing here decides whether a code is valid.
 */
export const TRACKING_CODE_LENGTH = 26;
const GROUPS = [5, 5, 5, 5, 6] as const;

/** Letters and digits only, upper case, at most 26 characters. */
export function codeCharacters(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, TRACKING_CODE_LENGTH);
}

/** `abcde12345…` → `ABCDE-12345-…`; a hyphen is written only before a character that follows. */
export function formatTrackingCode(value: string): string {
  const chars = codeCharacters(value);
  const parts: string[] = [];
  let index = 0;
  for (const size of GROUPS) {
    if (index >= chars.length) {
      break;
    }
    parts.push(chars.slice(index, index + size));
    index += size;
  }
  return parts.join('-');
}

/** True when the input has all 26 characters (the API still decides whether the code exists). */
export function isCompleteCode(value: string): boolean {
  return codeCharacters(value).length === TRACKING_CODE_LENGTH;
}

/**
 * Where the caret belongs after formatting: behind the same number of code characters that were
 * in front of it before, so typing, deleting or pasting in the middle never jumps to the end.
 */
export function caretAfterFormat(raw: string, caret: number, formatted: string): number {
  const before = codeCharacters(raw.slice(0, caret)).length;
  if (before === 0) {
    return 0;
  }
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] !== '-') {
      seen++;
      if (seen === before) {
        return i + 1;
      }
    }
  }
  return formatted.length;
}

/**
 * The code from a URL fragment such as `kod=ABCDE-…` (email links: `/track-order#kod=…`).
 * Returns null when the fragment carries no `kod`.
 */
export function codeFromFragment(fragment: string | null | undefined): string | null {
  if (!fragment) {
    return null;
  }
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const code = params.get('kod');
  if (code === null) {
    return null;
  }
  const formatted = formatTrackingCode(code);
  return formatted === '' ? null : formatted;
}
