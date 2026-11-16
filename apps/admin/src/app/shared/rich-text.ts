/**
 * Clean-up of rich-text HTML to the subset the API keeps (and the storefront renders):
 * p, br, strong, em, u, s, ul, ol, li, h2–h4, blockquote, a[href,title], hr; with
 * `{ images: true }` (blog, CMS pages) also figure, figcaption and img[src, alt, width, height]
 * from the shop's media storage.
 *
 * Browser editing produces b/i/div/span and pasted text brings anything at all, so the editor
 * runs every change through this function. Unknown elements are unwrapped (their text stays),
 * dangerous ones are removed with their content, and every attribute except a link's href/title
 * is dropped.
 */

const KEEP = new Set([
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'a',
  'hr',
]);

const RENAME: Record<string, string> = {
  b: 'strong',
  i: 'em',
  strike: 's',
  del: 's',
  div: 'p',
  h1: 'h2',
  h5: 'h4',
  h6: 'h4',
};

/** Removed together with everything inside them. */
const DROP = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'template',
  'noscript',
  'svg',
  'math',
  'head',
  'title',
  'meta',
  'link',
  'img',
  'video',
  'audio',
  'canvas',
  'form',
  'input',
  'button',
  'select',
  'textarea',
]);

const BLOCKS = new Set(['p', 'ul', 'ol', 'h2', 'h3', 'h4', 'blockquote', 'hr', 'figure']);

export interface RichTextOptions {
  /**
   * Allow `img` (and `figure`/`figcaption`) whose `src` is an image of the shop's media storage
   * (blog posts and CMS pages; the API keeps only `{Media:BaseUrl}/media/blog|pages/…`).
   * Product descriptions keep the default: no images.
   */
  images?: boolean;
}

/**
 * A rendition of an uploaded blog or page image: http(s), path `/media/blog/…` or
 * `/media/pages/…`, no `..`, no quotes or spaces. The API checks the exact storage address.
 */
export function isMediaImageSrc(value: string | null | undefined): boolean {
  const src = (value ?? '').trim();
  return (
    /^https?:\/\/[^\s"'<>]+\/media\/(blog|pages)\/[^\s"'<>]+$/i.test(src) && !src.includes('..')
  );
}

/** `<img>` markup for an image inserted into rich text (attributes the API keeps). */
export function richTextImage(
  doc: Document,
  image: { src: string; alt: string; width?: number; height?: number },
): HTMLImageElement {
  const img = doc.createElement('img');
  img.setAttribute('src', image.src);
  img.setAttribute('alt', image.alt.trim());
  if (image.width && image.height) {
    img.setAttribute('width', String(Math.round(image.width)));
    img.setAttribute('height', String(Math.round(image.height)));
  }
  return img;
}

/** Links may point to the web, e-mail, phone or a path on this site. */
export function safeHref(value: string | null | undefined): string | null {
  const href = (value ?? '').trim();
  if (href === '') {
    return null;
  }
  if (/^(https?:|mailto:|tel:)/i.test(href)) {
    return href;
  }
  if (href.startsWith('/') && !href.startsWith('//')) {
    return href;
  }
  return null;
}

/** Adds `https://` to a bare address typed by the user (`zladovce.com/x`). */
export function normalizeHref(value: string): string | null {
  const href = value.trim();
  if (href === '') {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('/')) {
    return safeHref(href);
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href)) {
    return `mailto:${href}`;
  }
  return safeHref(`https://${href}`);
}

function cleanChildren(source: Node, target: Node, doc: Document, options: RichTextOptions): void {
  for (const child of Array.from(source.childNodes)) {
    cleanNode(child, target, doc, options);
  }
}

const DIMENSION = /^\d{1,5}$/;

function cleanImage(element: Element, target: Node, doc: Document): void {
  const src = element.getAttribute('src');
  if (!isMediaImageSrc(src)) {
    return;
  }
  const width = element.getAttribute('width') ?? '';
  const height = element.getAttribute('height') ?? '';
  const sized = DIMENSION.test(width) && DIMENSION.test(height);
  target.appendChild(
    richTextImage(doc, {
      src: (src ?? '').trim(),
      alt: element.getAttribute('alt') ?? '',
      ...(sized ? { width: Number(width), height: Number(height) } : {}),
    }),
  );
}

function cleanNode(node: Node, target: Node, doc: Document, options: RichTextOptions): void {
  if (node.nodeType === Node.TEXT_NODE) {
    target.appendChild(doc.createTextNode(node.textContent ?? ''));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return; // comments, processing instructions
  }
  const element = node as Element;
  const original = element.tagName.toLowerCase();
  if (options.images && original === 'img') {
    cleanImage(element, target, doc);
    return;
  }
  if (DROP.has(original)) {
    return;
  }
  const tag = RENAME[original] ?? original;
  const allowed = KEEP.has(tag) || (options.images && (tag === 'figure' || tag === 'figcaption'));
  if (!allowed) {
    cleanChildren(element, target, doc, options); // unwrap: span, font, section, table …
    return;
  }
  if (tag === 'a') {
    const href = safeHref(element.getAttribute('href'));
    if (!href) {
      cleanChildren(element, target, doc, options);
      return;
    }
    const link = doc.createElement('a');
    link.setAttribute('href', href);
    const title = element.getAttribute('title')?.trim();
    if (title) {
      link.setAttribute('title', title);
    }
    cleanChildren(element, link, doc, options);
    target.appendChild(link);
    return;
  }
  const clean = doc.createElement(tag);
  if (tag !== 'br' && tag !== 'hr') {
    cleanChildren(element, clean, doc, options);
  }
  if (tag === 'figure' && clean.querySelector('img') === null) {
    // A figure without its image is just its caption text.
    target.appendChild(doc.createTextNode(clean.textContent ?? ''));
    return;
  }
  target.appendChild(clean);
}

function isBlank(element: Element): boolean {
  return (
    (element.textContent ?? '').replace(/\u00a0/g, ' ').trim() === '' &&
    element.querySelector('hr, img') === null
  );
}

/**
 * Returns sanitized HTML. Loose inline content at the top level is wrapped in paragraphs,
 * blocks nested in paragraphs are flattened, and blank paragraphs at the start and end are removed.
 * An editor holding no text gives `''`.
 */
export function sanitizeRichText(
  html: string | null | undefined,
  options: RichTextOptions = {},
): string {
  if (!html || html.trim() === '') {
    return '';
  }
  const doc = document.implementation.createHTMLDocument('');
  const source = doc.createElement('div');
  source.innerHTML = html; // inert document: nothing is loaded or executed
  const cleaned = doc.createElement('div');
  cleanChildren(source, cleaned, doc, options);

  // Paragraphs cannot contain blocks (div → p can nest them): lift the blocks out.
  for (const paragraph of Array.from(cleaned.querySelectorAll('p'))) {
    if (Array.from(paragraph.children).some((child) => BLOCKS.has(child.tagName.toLowerCase()))) {
      paragraph.replaceWith(...Array.from(paragraph.childNodes));
    }
  }

  // Wrap top-level inline runs in <p>.
  const result = doc.createElement('div');
  let run: HTMLElement | null = null;
  for (const child of Array.from(cleaned.childNodes)) {
    const isBlock =
      child.nodeType === Node.ELEMENT_NODE && BLOCKS.has((child as Element).tagName.toLowerCase());
    if (isBlock) {
      run = null;
      result.appendChild(child);
    } else {
      if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() === '' && !run) {
        continue;
      }
      if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName === 'BR' && !run) {
        continue;
      }
      run ??= result.appendChild(doc.createElement('p'));
      run.appendChild(child);
    }
  }

  // Remove blank paragraphs at both ends; keep the ones in between (deliberate spacing).
  const blocks = (): Element[] => Array.from(result.children);
  while (blocks()[0]?.tagName === 'P' && isBlank(blocks()[0] as Element)) {
    blocks()[0]?.remove();
  }
  while (blocks().at(-1)?.tagName === 'P' && isBlank(blocks().at(-1) as Element)) {
    blocks().at(-1)?.remove();
  }
  if (result.textContent?.trim() === '' && result.querySelector('hr, img') === null) {
    return '';
  }
  return result.innerHTML;
}

/** Plain text of rich HTML (for counting and empty checks). */
export function richTextToPlain(html: string | null | undefined): string {
  if (!html) {
    return '';
  }
  const doc = document.implementation.createHTMLDocument('');
  const div = doc.createElement('div');
  div.innerHTML = html;
  return (div.textContent ?? '').replace(/\u00a0/g, ' ').trim();
}
