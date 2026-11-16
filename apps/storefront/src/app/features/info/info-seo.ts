import { SeoService, SITE_NAME } from '../../core/seo';
import { htmlToText, truncate } from '../../core/structured-data';

export const NOT_FOUND_TITLE = `Stranica nije pronađena – ${SITE_NAME}`;

export interface InfoSeoInput {
  path: string;
  title: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  /** Fallback description: plain text of the body. */
  html?: string | null;
  text?: string | null;
  jsonLd?: readonly object[];
  /** Absolute Open Graph image URL. */
  image?: string | null;
}

/** Title, description, canonical and Open Graph of an informational page. */
export function setInfoSeo(seo: SeoService, page: InfoSeoInput): void {
  const description =
    page.seoDescription?.trim() || truncate(page.text?.trim() || htmlToText(page.html)) || null;
  seo.setPage({
    title: page.seoTitle?.trim() || `${page.title} – ${SITE_NAME}`,
    description,
    path: page.path,
    image: page.image,
    jsonLd: page.jsonLd,
  });
}

/** An empty page is a 404: noindex and no canonical URL. */
export function setMissingSeo(seo: SeoService, path: string): void {
  seo.setPage({ title: NOT_FOUND_TITLE, path, noindex: true });
}
