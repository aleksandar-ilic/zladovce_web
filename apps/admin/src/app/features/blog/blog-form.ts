import { FormBuilder, Validators } from '@angular/forms';
import { AdminBlogPost, BlogPostState, SaveBlogPostRequest } from '@zladovce/models';
import { notBlank } from '@zladovce/shared';
import { UiBadgeTone } from '@zladovce/ui';
import { formatDateTime } from '@zladovce/utilities';
import { SLUG_PATTERN } from '../../shared/patterns';
import { richTextToPlain } from '../../shared/rich-text';
import { belgradeInstant } from '../../shared/serbian-dates';

export const BLOG_LIMITS = {
  title: 200,
  excerpt: 500,
  slug: 200,
  seoTitle: 120,
  seoDescription: 320,
} as const;

export const BLOG_STATE_LABELS: Record<BlogPostState, string> = {
  Draft: 'Nacrt',
  Scheduled: 'Zakazano',
  Published: 'Objavljeno',
};

export const BLOG_STATE_TONES: Record<BlogPostState, UiBadgeTone> = {
  Draft: 'neutral',
  Scheduled: 'info',
  Published: 'success',
};

/** "Nacrt – nije na sajtu", "Zakazano za 20.11.2026. 08:00", "Objavljeno 14.11.2026. 10:00". */
export function blogStateText(state: BlogPostState, publishedAt: string | null): string {
  switch (state) {
    case 'Scheduled':
      return `Zakazano za ${formatDateTime(publishedAt)} – do tada se ne vidi na sajtu`;
    case 'Published':
      return `Objavljeno ${formatDateTime(publishedAt)} – vidi se na sajtu`;
    default:
      return 'Nacrt – ne vidi se na sajtu';
  }
}

/**
 * The post form. Control names are the API member names, so validation errors (`title`,
 * `excerpt`, `contentHtml`) land under the right field. `coverImageKey` follows the API's
 * keep/remove/replace rule: the current key keeps the cover, null removes it, an upload key
 * (purpose `blog`) replaces it.
 */
export function createBlogForm(fb: FormBuilder) {
  return fb.group({
    title: fb.nonNullable.control('', [
      Validators.required,
      notBlank,
      Validators.maxLength(BLOG_LIMITS.title),
    ]),
    slug: fb.nonNullable.control('', [
      Validators.maxLength(BLOG_LIMITS.slug),
      Validators.pattern(SLUG_PATTERN),
    ]),
    excerpt: fb.nonNullable.control('', [Validators.maxLength(BLOG_LIMITS.excerpt)]),
    coverImageKey: fb.control<string | null>(null),
    contentHtml: fb.nonNullable.control(''),
    categoryId: fb.control<string | null>(null),
    seoTitle: fb.nonNullable.control('', [Validators.maxLength(BLOG_LIMITS.seoTitle)]),
    seoDescription: fb.nonNullable.control('', [Validators.maxLength(BLOG_LIMITS.seoDescription)]),
  });
}

export type BlogForm = ReturnType<typeof createBlogForm>;

export function fillBlogForm(form: BlogForm, post: AdminBlogPost): void {
  form.reset({
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    coverImageKey: post.coverImage?.key ?? null,
    contentHtml: post.contentHtml,
    categoryId: post.category?.id ?? null,
    seoTitle: post.seoTitle ?? '',
    seoDescription: post.seoDescription ?? '',
  });
}

const text = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/**
 * Every member is sent (the API requires them all, including `version` when editing). An empty
 * slug lets the server derive it from the title.
 */
export function blogRequest(form: BlogForm, version: number | null): SaveBlogPostRequest {
  const v = form.getRawValue();
  return {
    version,
    title: v.title.trim(),
    slug: text(v.slug),
    excerpt: text(v.excerpt),
    coverImageKey: v.coverImageKey,
    contentHtml: v.contentHtml.trim() === '' ? null : v.contentHtml,
    categoryId: v.categoryId,
    seoTitle: text(v.seoTitle),
    seoDescription: text(v.seoDescription),
  };
}

/** What is still missing before the post can be published (the API requires excerpt and text). */
export function missingForPublish(form: BlogForm): string[] {
  const v = form.getRawValue();
  const missing: string[] = [];
  if (v.title.trim() === '') missing.push('naslov');
  if (v.excerpt.trim() === '') missing.push('kratak uvod');
  if (richTextToPlain(v.contentHtml) === '' && !v.contentHtml.includes('<img')) {
    missing.push('tekst objave');
  }
  return missing;
}

export type PublishChoice = { when: 'now' } | { when: 'later'; day: string; time: string };

/**
 * `publishedAt` for `POST …/publish`: null publishes now; a later Serbian date and time schedules
 * the post. Returns an error message for a missing or past moment.
 */
export function publishInstant(
  choice: PublishChoice,
  now = Date.now(),
): { publishedAt: string | null } | { error: string } {
  if (choice.when === 'now') {
    return { publishedAt: null };
  }
  const instant = belgradeInstant(choice.day, choice.time);
  if (!instant) {
    return { error: 'Izaberite datum i upišite vreme, na primer 08:30.' };
  }
  if (new Date(instant).getTime() <= now) {
    return { error: 'Vreme objave mora biti u budućnosti. Za objavu odmah izaberite „Odmah“.' };
  }
  return { publishedAt: instant };
}
