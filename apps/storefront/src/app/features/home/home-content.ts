import { CmsImage, HomePageContent } from '@zladovce/models';
import { TextItem } from '../../shared/delivery-facts';

export interface HomeHeroView {
  title: string;
  subtitle: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  image: CmsImage | null;
}

export interface HomeSectionView {
  title: string;
  paragraphs: string[];
  image: CmsImage | null;
}

/** What the homepage shows: CMS text where the owner entered it, the default copy elsewhere. */
export interface HomeView {
  hero: HomeHeroView;
  /** Only from the CMS (there is no default introduction). */
  intro: HomeSectionView | null;
  story: HomeSectionView;
  whyUs: { title: string; items: TextItem[] };
  /** Only from the CMS (no quality claims are made without the owner's text). */
  quality: HomeSectionView | null;
}

/**
 * Default copy: only what is known (family business from the south of Serbia, what is made,
 * cash on delivery, no account needed); no certificates, awards, ingredients or "organski".
 */
export const DEFAULT_HERO: HomeHeroView = {
  title: 'Domaći ukusi, pripremljeni kao za svoju kuću',
  subtitle:
    'Zladovce je porodični posao sa juga Srbije. Pravimo domaće džemove, voćne sokove, sirće i kompote i šaljemo ih na adrese širom zemlje.',
  primaryCtaLabel: 'Pogledajte ponudu',
  secondaryCtaLabel: 'Kako se poručuje',
  image: null,
};

export const DEFAULT_STORY: HomeSectionView = {
  title: 'Porodica iza svake tegle',
  paragraphs: [
    'Iza imena Zladovce stoji jedna porodica i njena kuhinja. Proizvode pripremamo sami, onako kako ih pravimo i za svoju trpezu.',
    'Ono što pravimo kod kuće sada šaljemo i vama – u teglama i flašama, spakovano tako da stigne čitavo na vašu adresu.',
  ],
  image: null,
};

export const DEFAULT_WHY_US_TITLE = 'Domaće, jednostavno i bez iznenađenja';

export const DEFAULT_REASONS: readonly TextItem[] = [
  {
    title: 'Iz porodične kuhinje',
    text: 'Pripremamo ih sami, na isti način na koji ih pravimo za svoju porodicu.',
  },
  {
    title: 'Jasno na svakom proizvodu',
    text: 'Pakovanje, cena i dostupnost piše na strani proizvoda pre nego što ga dodate u korpu.',
  },
  {
    title: 'Plaćate kad stigne',
    text: 'Nema plaćanja unapred: porudžbinu plaćate kuriru pri preuzimanju.',
  },
  {
    title: 'Na adresu širom Srbije',
    text: 'Paket šaljemo kurirskom službom na adresu koju navedete.',
  },
];

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Plain CMS text → paragraphs (blank lines separate them; single line breaks stay). */
export function paragraphs(text: string | null | undefined): string[] {
  return (text ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function textSection(
  section: { title: string | null; text: string | null; image?: CmsImage | null } | null,
): HomeSectionView | null {
  if (!section) {
    return null;
  }
  const title = clean(section.title);
  const body = paragraphs(section.text);
  if (!title && body.length === 0) {
    return null;
  }
  return { title: title ?? '', paragraphs: body, image: section.image ?? null };
}

/**
 * Merges the CMS homepage (`GET /content/pages/home`, null while the page is empty) with the
 * defaults, section by section; inside hero, story and "why us" every empty field keeps its
 * default, so the page never shows a blank heading or button.
 */
export function homeView(content: HomePageContent | null | undefined): HomeView {
  const hero = content?.hero;
  const story = textSection(content?.story ?? null);
  const whyUs = content?.whyUs;
  const items = (whyUs?.items ?? [])
    .map((item) => ({ title: clean(item.title) ?? '', text: clean(item.text) ?? '' }))
    .filter((item) => item.title !== '');
  return {
    hero: {
      title: clean(hero?.title) ?? DEFAULT_HERO.title,
      subtitle: clean(hero?.subtitle) ?? DEFAULT_HERO.subtitle,
      primaryCtaLabel: clean(hero?.primaryCtaLabel) ?? DEFAULT_HERO.primaryCtaLabel,
      secondaryCtaLabel: clean(hero?.secondaryCtaLabel) ?? DEFAULT_HERO.secondaryCtaLabel,
      image: hero?.image ?? null,
    },
    intro: textSection(content?.intro ?? null),
    story: story
      ? {
          title: story.title || DEFAULT_STORY.title,
          paragraphs: story.paragraphs.length > 0 ? story.paragraphs : DEFAULT_STORY.paragraphs,
          image: story.image,
        }
      : DEFAULT_STORY,
    whyUs: {
      title: clean(whyUs?.title) ?? DEFAULT_WHY_US_TITLE,
      items: items.length > 0 ? items : [...DEFAULT_REASONS],
    },
    quality: textSection(content?.quality ?? null),
  };
}
