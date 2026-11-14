const SERBIAN_LATIN: Record<string, string> = {
  č: 'c',
  ć: 'c',
  š: 's',
  ž: 'z',
  đ: 'dj',
};

/**
 * Builds a URL slug from Serbian Latin text.
 *
 *   slugify('Džem od šljiva – 370 g') -> "dzem-od-sljiva-370-g"
 *   slugify('Đurđevdanski kompot')    -> "djurdjevdanski-kompot"
 */
export function slugify(text: string | null | undefined): string {
  if (!text) {
    return '';
  }
  return text
    .toLowerCase()
    .replace(/[čćšžđ]/g, (letter) => SERBIAN_LATIN[letter] ?? letter)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
