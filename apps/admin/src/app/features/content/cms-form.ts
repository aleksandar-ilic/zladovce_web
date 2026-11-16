import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  AboutPageContent,
  AboutPageContentInput,
  CmsImage,
  CmsImageInput,
  CmsPageKey,
  CmsTextSectionInput,
  HomePageContent,
  HomePageContentInput,
  RichTextPageContent,
} from '@zladovce/models';
import { notBlank } from '@zladovce/shared';
import { AdminCmsPage, SaveCmsPageRequest } from '../../data/content-api';
import { imageSrc } from '../../shared/images';

export const CMS_PAGE_KEYS: readonly CmsPageKey[] = [
  'home',
  'about',
  'delivery',
  'privacy',
  'terms',
];

export interface CmsPageInfo {
  key: CmsPageKey;
  label: string;
  /** Address of the page on the site. */
  path: string;
  description: string;
  /** Legal text: must be written or approved by the business itself. */
  legal: boolean;
}

export const CMS_PAGES: Record<CmsPageKey, CmsPageInfo> = {
  home: {
    key: 'home',
    label: 'Početna strana',
    path: '/',
    description: 'Veliki naslov sa fotografijom, uvod, priča, zašto mi i kvalitet.',
    legal: false,
  },
  about: {
    key: 'about',
    label: 'O nama',
    path: '/o-nama',
    description: 'Ko ste, kako radite, fotografije imanja i proizvodnje.',
    legal: false,
  },
  delivery: {
    key: 'delivery',
    label: 'Dostava i plaćanje',
    path: '/dostava-i-placanje',
    description: 'Kako se šalje, koliko košta, rokovi i plaćanje pouzećem.',
    legal: true,
  },
  privacy: {
    key: 'privacy',
    label: 'Politika privatnosti',
    path: '/politika-privatnosti',
    description: 'Koje podatke kupaca prikupljate i kako ih čuvate.',
    legal: true,
  },
  terms: {
    key: 'terms',
    label: 'Uslovi korišćenja',
    path: '/uslovi-koriscenja',
    description: 'Uslovi kupovine, reklamacije i odustanak od kupovine.',
    legal: true,
  },
};

export function isCmsPageKey(value: unknown): value is CmsPageKey {
  return typeof value === 'string' && (CMS_PAGE_KEYS as readonly string[]).includes(value);
}

export const CMS_LIMITS = {
  title: 200,
  seoTitle: 120,
  seoDescription: 320,
  heroTitle: 120,
  heroSubtitle: 300,
  cta: 40,
  sectionTitle: 120,
  sectionText: 3000,
  storyText: 5000,
  itemTitle: 80,
  itemText: 400,
  alt: 200,
  items: 6,
  images: 6,
} as const;

// ---- Image fields -------------------------------------------------------------------------

/** One image of a page: `key` (current key keeps it, an upload key adds it), alt text, preview. */
function imageGroup(fb: FormBuilder, key: string | null = null, alt = '', preview = '') {
  return fb.nonNullable.group({
    key: fb.control<string | null>(key),
    alt: fb.nonNullable.control(alt, Validators.maxLength(CMS_LIMITS.alt)),
    /** Not sent: what the form shows (a rendition or the chosen file). */
    preview: fb.nonNullable.control(preview),
  });
}

export type CmsImageGroup = ReturnType<typeof imageGroup>;

function fillImage(group: CmsImageGroup, image: CmsImage | null | undefined): void {
  group.reset({
    key: image?.key ?? null,
    alt: image?.alt ?? '',
    preview: image ? imageSrc(image, 800) : '',
  });
}

function imageInput(group: CmsImageGroup): CmsImageInput | null {
  const v = group.getRawValue();
  return v.key ? { key: v.key, alt: text(v.alt) } : null;
}

// ---- Shared page fields -------------------------------------------------------------------

function pageFields(fb: FormBuilder) {
  return {
    title: fb.nonNullable.control('', Validators.maxLength(CMS_LIMITS.title)),
    seoTitle: fb.nonNullable.control('', Validators.maxLength(CMS_LIMITS.seoTitle)),
    seoDescription: fb.nonNullable.control('', Validators.maxLength(CMS_LIMITS.seoDescription)),
  };
}

function section(fb: FormBuilder, textMax: number = CMS_LIMITS.sectionText) {
  return fb.nonNullable.group({
    title: fb.nonNullable.control('', Validators.maxLength(CMS_LIMITS.sectionTitle)),
    text: fb.nonNullable.control('', Validators.maxLength(textMax)),
  });
}

export function whyUsItem(fb: FormBuilder, title = '', itemText = '') {
  return fb.nonNullable.group({
    title: fb.nonNullable.control(title, [
      Validators.required,
      notBlank,
      Validators.maxLength(CMS_LIMITS.itemTitle),
    ]),
    text: fb.nonNullable.control(itemText, Validators.maxLength(CMS_LIMITS.itemText)),
  });
}

// ---- Home ----------------------------------------------------------------------------------

/**
 * Home page form. The groups mirror the API's `content` object, so validation errors such as
 * `content.hero.title` or `content.whyUs.items[0].title` land on the right field.
 */
export function createHomeForm(fb: FormBuilder) {
  return fb.nonNullable.group({
    ...pageFields(fb),
    content: fb.nonNullable.group({
      hero: fb.nonNullable.group({
        title: fb.nonNullable.control('', Validators.maxLength(CMS_LIMITS.heroTitle)),
        subtitle: fb.nonNullable.control('', Validators.maxLength(CMS_LIMITS.heroSubtitle)),
        primaryCtaLabel: fb.nonNullable.control('', Validators.maxLength(CMS_LIMITS.cta)),
        secondaryCtaLabel: fb.nonNullable.control('', Validators.maxLength(CMS_LIMITS.cta)),
        image: imageGroup(fb),
      }),
      intro: section(fb),
      story: fb.nonNullable.group({
        title: fb.nonNullable.control('', Validators.maxLength(CMS_LIMITS.sectionTitle)),
        text: fb.nonNullable.control('', Validators.maxLength(CMS_LIMITS.storyText)),
        image: imageGroup(fb),
      }),
      whyUs: fb.nonNullable.group({
        title: fb.nonNullable.control('', Validators.maxLength(CMS_LIMITS.sectionTitle)),
        items: fb.array<ReturnType<typeof whyUsItem>>([]),
      }),
      quality: section(fb),
    }),
  });
}

export type HomeForm = ReturnType<typeof createHomeForm>;

export function fillHomeForm(form: HomeForm, fb: FormBuilder, content: HomePageContent | null) {
  const c = form.controls.content.controls;
  c.hero.patchValue({
    title: content?.hero?.title ?? '',
    subtitle: content?.hero?.subtitle ?? '',
    primaryCtaLabel: content?.hero?.primaryCtaLabel ?? '',
    secondaryCtaLabel: content?.hero?.secondaryCtaLabel ?? '',
  });
  fillImage(c.hero.controls.image, content?.hero?.image);
  c.intro.reset({ title: content?.intro?.title ?? '', text: content?.intro?.text ?? '' });
  c.story.patchValue({ title: content?.story?.title ?? '', text: content?.story?.text ?? '' });
  fillImage(c.story.controls.image, content?.story?.image);
  c.whyUs.controls.title.reset(content?.whyUs?.title ?? '');
  const items = c.whyUs.controls.items;
  items.clear({ emitEvent: false });
  for (const item of content?.whyUs?.items ?? []) {
    items.push(whyUsItem(fb, item.title, item.text ?? ''), { emitEvent: false });
  }
  c.quality.reset({ title: content?.quality?.title ?? '', text: content?.quality?.text ?? '' });
}

function sectionInput(group: FormGroup): CmsTextSectionInput {
  const v = group.getRawValue() as { title: string; text: string };
  return { title: text(v.title), text: text(v.text) };
}

export function homeContent(form: HomeForm): HomePageContentInput {
  const c = form.controls.content.controls;
  const hero = c.hero.getRawValue();
  const story = c.story.getRawValue();
  return {
    hero: {
      title: text(hero.title),
      subtitle: text(hero.subtitle),
      primaryCtaLabel: text(hero.primaryCtaLabel),
      secondaryCtaLabel: text(hero.secondaryCtaLabel),
      image: imageInput(c.hero.controls.image),
    },
    intro: sectionInput(c.intro),
    story: {
      title: text(story.title),
      text: text(story.text),
      image: imageInput(c.story.controls.image),
    },
    whyUs: {
      title: text(c.whyUs.controls.title.value),
      items: c.whyUs.controls.items.getRawValue().map((item) => ({
        title: item.title.trim(),
        text: text(item.text),
      })),
    },
    quality: sectionInput(c.quality),
  };
}

// ---- About ---------------------------------------------------------------------------------

export function createAboutForm(fb: FormBuilder) {
  return fb.nonNullable.group({
    ...pageFields(fb),
    content: fb.nonNullable.group({
      bodyHtml: fb.nonNullable.control(''),
      images: fb.array<CmsImageGroup>([]),
    }),
  });
}

export type AboutForm = ReturnType<typeof createAboutForm>;

export function fillAboutForm(form: AboutForm, fb: FormBuilder, content: AboutPageContent | null) {
  form.controls.content.controls.bodyHtml.reset(content?.bodyHtml ?? '');
  const images = form.controls.content.controls.images;
  images.clear({ emitEvent: false });
  for (const image of content?.images ?? []) {
    images.push(imageGroup(fb, image.key, image.alt ?? '', imageSrc(image, 800)), {
      emitEvent: false,
    });
  }
}

export function addAboutImage(
  form: AboutForm,
  fb: FormBuilder,
  key: string,
  preview: string,
): boolean {
  const images = form.controls.content.controls.images;
  if (images.length >= CMS_LIMITS.images) {
    return false;
  }
  images.push(imageGroup(fb, key, '', preview));
  form.markAsDirty();
  return true;
}

export function aboutContent(form: AboutForm): AboutPageContentInput {
  const c = form.controls.content.controls;
  return {
    bodyHtml: c.bodyHtml.value.trim() === '' ? null : c.bodyHtml.value,
    images: (c.images as FormArray<CmsImageGroup>).controls
      .map(imageInput)
      .filter((image): image is CmsImageInput => image !== null),
  };
}

// ---- Delivery, privacy, terms --------------------------------------------------------------

export function createRichTextForm(fb: FormBuilder) {
  return fb.nonNullable.group({
    ...pageFields(fb),
    content: fb.nonNullable.group({ bodyHtml: fb.nonNullable.control('') }),
  });
}

export type RichTextForm = ReturnType<typeof createRichTextForm>;

export function fillRichTextForm(form: RichTextForm, content: RichTextPageContent | null) {
  form.controls.content.controls.bodyHtml.reset(content?.bodyHtml ?? '');
}

// ---- Shared --------------------------------------------------------------------------------

export type CmsForm = HomeForm | AboutForm | RichTextForm;

export function createCmsForm(key: CmsPageKey, fb: FormBuilder): CmsForm {
  if (key === 'home') return createHomeForm(fb);
  if (key === 'about') return createAboutForm(fb);
  return createRichTextForm(fb);
}

export function fillCmsForm(key: CmsPageKey, form: CmsForm, fb: FormBuilder, page: AdminCmsPage) {
  form.controls.title.reset(page.title ?? '');
  form.controls.seoTitle.reset(page.seoTitle ?? '');
  form.controls.seoDescription.reset(page.seoDescription ?? '');
  if (key === 'home') {
    fillHomeForm(form as HomeForm, fb, page.content as HomePageContent | null);
  } else if (key === 'about') {
    fillAboutForm(form as AboutForm, fb, page.content as AboutPageContent | null);
  } else {
    fillRichTextForm(form as RichTextForm, page.content as RichTextPageContent | null);
  }
  form.markAsPristine();
}

/**
 * The PUT body. Every member is sent; empty texts are null. `empty: true` sends `content: null`,
 * which takes the page off the site ("Isprazni stranicu").
 */
export function cmsRequest(
  key: CmsPageKey,
  form: CmsForm,
  version: number,
  options: { empty?: boolean } = {},
): SaveCmsPageRequest {
  const v = form.getRawValue();
  const base = {
    version,
    title: text(v.title),
    seoTitle: text(v.seoTitle),
    seoDescription: text(v.seoDescription),
  };
  if (options.empty) {
    return { ...base, content: null };
  }
  if (key === 'home') return { ...base, content: homeContent(form as HomeForm) };
  if (key === 'about') return { ...base, content: aboutContent(form as AboutForm) };
  const body = (form as RichTextForm).controls.content.controls.bodyHtml.value;
  return { ...base, content: { bodyHtml: body.trim() === '' ? null : body } };
}

function text(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}
