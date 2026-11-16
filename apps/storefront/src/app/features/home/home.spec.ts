import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CmsImage, HomePage as HomePageResponse, HomePageContent } from '@zladovce/models';
import { routes } from '../../app.routes';
import { API, settle, testProviders, text } from '../../testing/fixtures';
import {
  DEFAULT_HERO,
  DEFAULT_REASONS,
  DEFAULT_STORY,
  DEFAULT_WHY_US_TITLE,
  homeView,
  paragraphs,
} from './home-content';

const IMAGE: CmsImage = {
  key: 'pages/i1',
  baseUrl: 'http://localhost:9000/media/pages/i1',
  widths: [400, 800, 1600],
  width: 1600,
  height: 1200,
  alt: 'Tegle na stolu',
};

const EMPTY_CONTENT: HomePageContent = {
  hero: null,
  intro: null,
  story: null,
  whyUs: null,
  quality: null,
};

function homePage(content: Partial<HomePageContent>): HomePageResponse {
  return {
    key: 'home',
    title: null,
    content: { ...EMPTY_CONTENT, ...content },
    seoTitle: null,
    seoDescription: null,
    updatedAt: '2026-11-15T10:00:00Z',
  };
}

const POST = {
  title: 'Kako kuvamo džem',
  slug: 'kako-kuvamo-dzem',
  excerpt: 'Polako i strpljivo.',
  coverImage: null,
  category: { name: 'Iz kuhinje', slug: 'iz-kuhinje' },
  publishedAt: '2026-11-14T10:00:00Z',
};

describe('homepage content (CMS with defaults)', () => {
  it('uses the defaults for everything when the CMS page is empty', () => {
    const view = homeView(null);
    expect(view.hero).toEqual(DEFAULT_HERO);
    expect(view.intro).toBeNull();
    expect(view.story).toEqual(DEFAULT_STORY);
    expect(view.whyUs).toEqual({ title: DEFAULT_WHY_US_TITLE, items: [...DEFAULT_REASONS] });
    expect(view.quality).toBeNull();
    expect(homeView(EMPTY_CONTENT)).toEqual(view);
  });

  it('takes each section from the CMS and keeps the default per null section and empty field', () => {
    const view = homeView({
      ...EMPTY_CONTENT,
      hero: {
        title: 'Naslov iz CMS-a',
        subtitle: null,
        primaryCtaLabel: '  ',
        secondaryCtaLabel: 'Kako do nas',
        image: IMAGE,
      },
      intro: { title: 'Uvod', text: 'Prvi pasus.\n\nDrugi pasus.' },
      whyUs: { title: null, items: [{ title: 'Ručno', text: null }, { title: ' ', text: 'x' }] },
    });
    expect(view.hero).toEqual({
      title: 'Naslov iz CMS-a',
      subtitle: DEFAULT_HERO.subtitle,
      primaryCtaLabel: DEFAULT_HERO.primaryCtaLabel,
      secondaryCtaLabel: 'Kako do nas',
      image: IMAGE,
    });
    expect(view.intro).toEqual({
      title: 'Uvod',
      paragraphs: ['Prvi pasus.', 'Drugi pasus.'],
      image: null,
    });
    expect(view.story).toEqual(DEFAULT_STORY);
    expect(view.whyUs).toEqual({
      title: DEFAULT_WHY_US_TITLE,
      items: [{ title: 'Ručno', text: '' }],
    });
    expect(view.quality).toBeNull();
  });

  it('splits plain text into paragraphs and keeps single line breaks', () => {
    expect(paragraphs('a\r\nb\n\n\n c ')).toEqual(['a\nb', 'c']);
    expect(paragraphs(null)).toEqual([]);
  });
});

describe('homepage', () => {
  async function open() {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), ...testProviders()] });
    const harness = await RouterTestingHarness.create('/');
    const http = TestBed.inject(HttpTestingController);
    const page = harness.routeNativeElement as HTMLElement;
    const el = (id: string) => page.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    /** `GET /seo/routes` (the homepage asks for its CMS page only when it is listed). */
    const routesWith = (pages: string[]) =>
      http.expectOne(`${API}/seo/routes`).flush({
        categories: [],
        products: [],
        blogPosts: [],
        blogCategories: [],
        pages: pages.map((key) => ({ key, updatedAt: '2026-11-15T10:00:00Z' })),
      });
    return {
      harness,
      http,
      page,
      el,
      routesWith,
      detect: () => settle(() => harness.detectChanges()),
    };
  }

  beforeEach(() => localStorage.clear());

  it('shows the CMS hero, introduction, story, reasons and quality', async () => {
    const { http, el, page, detect, routesWith } = await open();
    routesWith(['home']);
    http.expectOne(`${API}/content/pages/home`).flush(
      homePage({
        hero: {
          title: 'Džemovi iz Zladovca',
          subtitle: 'Kuvani u porodičnoj kuhinji.',
          primaryCtaLabel: 'U prodavnicu',
          secondaryCtaLabel: null,
          image: IMAGE,
        },
        intro: { title: 'Ko smo mi', text: 'Porodica.' },
        story: { title: 'Naša priča', text: 'Prvo.\n\nDrugo.', image: IMAGE },
        whyUs: { title: 'Zašto mi', items: [{ title: 'Jedan', text: 'Tekst jedan' }] },
        quality: { title: 'Kvalitet', text: 'Biramo voće.' },
      }),
    );
    await detect();
    expect(page.querySelectorAll('h1').length).toBe(1);
    expect(text(el('hero-title'))).toBe('Džemovi iz Zladovca');
    expect(text(el('hero-subtitle'))).toBe('Kuvani u porodičnoj kuhinji.');
    expect(text(el('hero-primary'))).toBe('U prodavnicu');
    expect(text(el('hero-secondary'))).toBe('Kako se poručuje');
    expect(el('hero-image')?.querySelector('img')?.getAttribute('alt')).toBe('Tegle na stolu');
    expect(el('hero-photos')).toBeNull();
    expect(text(el('home-intro')?.querySelector('h2'))).toBe('Ko smo mi');
    expect(text(el('home-intro')?.querySelector('p'))).toBe('Porodica.');
    expect(text(el('story-title'))).toBe('Naša priča');
    expect(el('story-text')?.querySelectorAll('p').length).toBe(2);
    expect(el('story-image')).not.toBeNull();
    expect(text(el('why-title'))).toBe('Zašto mi');
    expect(el('why-items')?.querySelectorAll('li').length).toBe(1);
    expect(text(el('home-quality'))).toContain('Biramo voće.');
  });

  it('does not ask for the CMS page while /seo/routes does not list it', async () => {
    const { http, el, detect, routesWith } = await open();
    routesWith(['about']);
    await detect();
    http.expectNone(`${API}/content/pages/home`);
    expect(text(el('hero-title'))).toBe(DEFAULT_HERO.title);
  });

  it('keeps the default copy when the CMS page is empty (404) and hides CMS-only sections', async () => {
    const { http, el, detect, routesWith } = await open();
    routesWith(['home']);
    http
      .expectOne(`${API}/content/pages/home`)
      .flush({ code: 'NOT_FOUND', detail: 'Nije pronađeno.' }, { status: 404, statusText: 'NF' });
    await detect();
    expect(text(el('hero-title'))).toBe(DEFAULT_HERO.title);
    expect(text(el('hero-primary'))).toBe(DEFAULT_HERO.primaryCtaLabel);
    expect(text(el('story-title'))).toBe(DEFAULT_STORY.title);
    expect(text(el('why-title'))).toBe(DEFAULT_WHY_US_TITLE);
    expect(el('why-items')?.querySelectorAll('li').length).toBe(DEFAULT_REASONS.length);
    expect(el('home-intro')).toBeNull();
    expect(el('home-quality')).toBeNull();
    expect(el('hero-image')).toBeNull();
  });

  it('keeps the default for each null section of a CMS page', async () => {
    const { http, el, detect, routesWith } = await open();
    routesWith(['home']);
    http
      .expectOne(`${API}/content/pages/home`)
      .flush(homePage({ story: { title: 'Samo priča', text: 'Naš tekst.', image: null } }));
    await detect();
    expect(text(el('hero-title'))).toBe(DEFAULT_HERO.title);
    expect(text(el('story-title'))).toBe('Samo priča');
    expect(text(el('story-text'))).toBe('Naš tekst.');
    expect(text(el('why-title'))).toBe(DEFAULT_WHY_US_TITLE);
  });

  it('hides testimonials and blog previews while there are none, and always offers the sign-up', async () => {
    const { http, el, detect } = await open();
    http.expectOne(`${API}/content/testimonials`).flush({ items: [] });
    const latest = http.expectOne((r) => r.url === `${API}/blog/latest-posts`);
    expect(latest.request.params.get('limit')).toBe('3');
    latest.flush({ items: [] });
    await detect();
    expect(el('home-testimonials')).toBeNull();
    expect(el('home-blog')).toBeNull();
    expect(el('home-newsletter')).not.toBeNull();
    expect(el('newsletter-form')).not.toBeNull();
  });

  it('shows real testimonials and the latest blog posts', async () => {
    const { http, el, detect } = await open();
    http.expectOne(`${API}/content/testimonials`).flush({
      items: [
        { id: 't1', authorName: 'Marija', place: 'Niš', text: 'Odličan džem.' },
        { id: 't2', authorName: 'Petar', place: null, text: 'Sok kao kod kuće.' },
      ],
    });
    http
      .expectOne((r) => r.url === `${API}/blog/latest-posts`)
      .flush({ items: [POST, { ...POST, slug: 'drugi', title: 'Drugi tekst' }] });
    await detect();
    const testimonials = el('home-testimonials');
    expect(testimonials?.querySelectorAll('figure').length).toBe(2);
    expect(text(testimonials)).toContain('Marija, Niš');
    expect(text(testimonials)).toContain('„Sok kao kod kuće.“ Petar');
    const blog = el('home-blog');
    expect(blog?.querySelectorAll('[data-testid="blog-card"]').length).toBe(2);
    expect(blog?.querySelector('a[href="/blog/kako-kuvamo-dzem"]')).not.toBeNull();
    expect(text(blog)).toContain('14. novembar 2026.');
    expect(blog?.querySelector('a[href="/blog"]')).not.toBeNull();
  });
});
