import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ApiError, apiErrorInterceptor, provideAppConfig } from '@zladovce/api';
import { AdminFaqItem, AdminHomePage } from '@zladovce/models';
import { applyServerErrors } from '../../shared/server-errors';
import {
  AboutForm,
  addAboutImage,
  cmsRequest,
  createCmsForm,
  fillCmsForm,
  HomeForm,
  RichTextForm,
  whyUsItem,
} from './cms-form';
import { CmsPageFormPage } from './cms-page-form.page';
import { FaqPage, moveItem } from './faq.page';
import { testimonialRequest, TestimonialsPage } from './testimonials.page';

const API = 'http://localhost:5080/api/v1';

const text = (element: Element | null | undefined): string =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function settle(detect: () => void, rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    detect();
  }
}

function providers() {
  return [
    provideAppConfig({ apiBaseUrl: API, healthUrl: 'http://localhost:5080/health' }),
    provideHttpClient(withInterceptors([apiErrorInterceptor])),
    provideHttpClientTesting(),
    provideRouter([]),
  ];
}

const IMAGE = {
  key: 'media/pages/hero1',
  baseUrl: 'http://localhost:9000/m/media/pages/hero1',
  widths: [400, 800, 1600],
  width: 1600,
  height: 900,
  alt: 'Imanje',
};

const HOME: AdminHomePage = {
  key: 'home',
  title: null,
  seoTitle: null,
  seoDescription: null,
  hasContent: true,
  content: {
    hero: {
      title: 'Domaći džem',
      subtitle: null,
      primaryCtaLabel: 'Pogledajte ponudu',
      secondaryCtaLabel: null,
      image: IMAGE,
    },
    intro: null,
    story: null,
    whyUs: { title: 'Zašto mi', items: [{ title: 'Bez aditiva', text: null }] },
    quality: null,
  },
  updatedAt: '2026-11-15T10:00:00Z',
  updatedByAdminName: null,
  version: 3,
};

describe('CMS page forms', () => {
  const fb = new FormBuilder();

  it('home: typed sections, image keep/replace/remove and nested error paths', () => {
    const form = createCmsForm('home', fb) as HomeForm;
    fillCmsForm('home', form, fb, HOME);
    const request = cmsRequest('home', form, 3);
    expect(request).toEqual({
      version: 3,
      title: null,
      seoTitle: null,
      seoDescription: null,
      content: {
        hero: {
          title: 'Domaći džem',
          subtitle: null,
          primaryCtaLabel: 'Pogledajte ponudu',
          secondaryCtaLabel: null,
          image: { key: 'media/pages/hero1', alt: 'Imanje' },
        },
        intro: { title: null, text: null },
        story: { title: null, text: null, image: null },
        whyUs: { title: 'Zašto mi', items: [{ title: 'Bez aditiva', text: null }] },
        quality: { title: null, text: null },
      },
    });
    const hero = form.controls.content.controls.hero.controls.image;
    hero.patchValue({ key: 'uploads/page/new.jpg' });
    expect(
      (cmsRequest('home', form, 3).content as { hero: { image: unknown } }).hero.image,
    ).toEqual({
      key: 'uploads/page/new.jpg',
      alt: 'Imanje',
    });
    hero.patchValue({ key: null });
    expect(
      (cmsRequest('home', form, 3).content as { hero: { image: unknown } }).hero.image,
    ).toBeNull();

    // An added "why us" item must have a title.
    form.controls.content.controls.whyUs.controls.items.push(whyUsItem(fb));
    expect(form.invalid).toBe(true);

    const unmatched = applyServerErrors(
      form,
      new ApiError({
        status: 400,
        code: 'VALIDATION_FAILED',
        title: 'x',
        detail: 'x',
        errors: {
          'content.hero.title': ['Naslov može imati najviše 120 znakova.'],
          'content.whyUs.items[0].title': ['Naslov stavke je obavezan.'],
          version: ['Verzija je obavezna.'],
        },
      }),
    );
    expect(form.controls.content.controls.hero.controls.title.errors?.['server']).toBe(
      'Naslov može imati najviše 120 znakova.',
    );
    expect(
      form.controls.content.controls.whyUs.controls.items.at(0).controls.title.errors?.['server'],
    ).toBe('Naslov stavke je obavezan.');
    expect(unmatched).toEqual(['Verzija je obavezna.']);

    // "Isprazni stranicu" sends content null.
    expect(cmsRequest('home', form, 3, { empty: true }).content).toBeNull();
  });

  it('about: text and up to six photos; legal pages: one text', () => {
    const about = createCmsForm('about', fb) as AboutForm;
    fillCmsForm('about', about, fb, {
      ...HOME,
      key: 'about',
      content: { bodyHtml: '<p>O nama</p>', images: [IMAGE] },
    });
    expect(addAboutImage(about, fb, 'uploads/page/2.jpg', 'blob:x')).toBe(true);
    expect(cmsRequest('about', about, 4).content).toEqual({
      bodyHtml: '<p>O nama</p>',
      images: [
        { key: 'media/pages/hero1', alt: 'Imanje' },
        { key: 'uploads/page/2.jpg', alt: null },
      ],
    });
    for (let i = 0; i < 4; i++) addAboutImage(about, fb, `k${i}`, '');
    expect(addAboutImage(about, fb, 'k7', '')).toBe(false);

    const privacy = createCmsForm('privacy', fb) as RichTextForm;
    fillCmsForm('privacy', privacy, fb, {
      ...HOME,
      key: 'privacy',
      content: null,
      hasContent: false,
    });
    expect(cmsRequest('privacy', privacy, 2).content).toEqual({ bodyHtml: null });
  });
});

describe('CMS page editor', () => {
  it('marks legal pages and empty pages, and saves with the version', async () => {
    TestBed.configureTestingModule({
      providers: [
        ...providers(),
        provideRouter(
          [{ path: 'sadrzaj/stranice/:key', component: CmsPageFormPage }],
          withComponentInputBinding(),
        ),
      ],
    });
    const harness = await RouterTestingHarness.create('/sadrzaj/stranice/terms');
    const controller = TestBed.inject(HttpTestingController);
    controller.expectOne(`${API}/admin/cms/pages/terms`).flush({
      ...HOME,
      key: 'terms',
      hasContent: false,
      content: null,
      version: 5,
    });
    await settle(() => harness.detectChanges());
    const root = harness.routeNativeElement as HTMLElement;
    expect(text(root.querySelector('[data-testid="legal-note"]'))).toContain(
      'mora napisati ili odobriti vlasnik radnje',
    );
    expect(text(root.querySelector('[data-testid="page-state"]'))).toContain(
      'Prazna – ne prikazuje se na sajtu',
    );
    // Nothing is prefilled.
    const page = harness.routeDebugElement!.componentInstance as CmsPageFormPage;
    expect((page.form() as RichTextForm).controls.content.controls.bodyHtml.value).toBe('');

    (page.form() as RichTextForm).controls.title.setValue('Uslovi');
    page.save();
    const put = controller.expectOne({ method: 'PUT', url: `${API}/admin/cms/pages/terms` });
    expect(put.request.body).toEqual({
      version: 5,
      title: 'Uslovi',
      seoTitle: null,
      seoDescription: null,
      content: { bodyHtml: null },
    });
    put.flush(
      {
        code: 'VALIDATION_FAILED',
        detail: 'x',
        errors: { 'content.bodyHtml': ['Tekst je predugačak.'] },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle(() => harness.detectChanges());
    expect(
      (page.form() as RichTextForm).controls.content.controls.bodyHtml.errors?.['server'],
    ).toBe('Tekst je predugačak.');
  });
});

const faq = (id: string, question: string, sortOrder: number): AdminFaqItem => ({
  id,
  question,
  answer: 'Odgovor',
  sortOrder,
  isPublished: true,
  createdAt: '2026-11-15T10:00:00Z',
  updatedAt: '2026-11-15T10:00:00Z',
});

describe('FAQ', () => {
  it('moves items within the list', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
  });

  it('saves the whole new order and adds new questions', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    const fixture = TestBed.createComponent(FaqPage);
    const controller = TestBed.inject(HttpTestingController);
    const items = [faq('1', 'Prvo?', 0), faq('2', 'Drugo?', 1), faq('3', 'Treće?', 2)];
    controller.expectOne(`${API}/admin/faq`).flush({ items });
    await settle(() => fixture.detectChanges());
    const root = fixture.nativeElement as HTMLElement;
    root.querySelectorAll<HTMLButtonElement>('[data-testid="faq-up"]')[2]?.click();
    const reorder = controller.expectOne({ method: 'PUT', url: `${API}/admin/faq/order` });
    expect(reorder.request.body).toEqual({ ids: ['1', '3', '2'] });
    reorder.flush({ items: [items[0], items[2], items[1]] });
    await settle(() => fixture.detectChanges());
    expect([...root.querySelectorAll('[data-testid="faq-row"] p.font-semibold')].map(text)).toEqual(
      ['Prvo?', 'Treće?', 'Drugo?'],
    );

    const page = fixture.componentInstance;
    page.form.setValue({ question: ' Da li šaljete? ', answer: 'Da.', isPublished: false });
    page.save();
    const create = controller.expectOne({ method: 'POST', url: `${API}/admin/faq` });
    expect(create.request.body).toEqual({
      question: 'Da li šaljete?',
      answer: 'Da.',
      isPublished: false,
    });
  });

  it('restores the order when saving it fails', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    const fixture = TestBed.createComponent(FaqPage);
    const controller = TestBed.inject(HttpTestingController);
    controller.expectOne(`${API}/admin/faq`).flush({ items: [faq('1', 'A', 0), faq('2', 'B', 1)] });
    await settle(() => fixture.detectChanges());
    fixture.componentInstance.move(0, 1);
    expect(fixture.componentInstance.items()?.map((i) => i.id)).toEqual(['2', '1']);
    controller
      .expectOne(`${API}/admin/faq/order`)
      .flush({ detail: 'Ne.' }, { status: 400, statusText: 'Bad Request' });
    expect(fixture.componentInstance.items()?.map((i) => i.id)).toEqual(['1', '2']);
  });
});

describe('testimonials', () => {
  it('requires confirming that the testimonial is real before adding it', async () => {
    expect(
      testimonialRequest({
        authorName: ' Marija ',
        place: ' ',
        text: ' Odlično ',
        isPublished: true,
        sortOrder: null,
      }),
    ).toEqual({
      authorName: 'Marija',
      place: null,
      text: 'Odlično',
      isPublished: true,
      sortOrder: 0,
    });

    TestBed.configureTestingModule({ providers: providers() });
    const fixture = TestBed.createComponent(TestimonialsPage);
    const controller = TestBed.inject(HttpTestingController);
    controller.expectOne(`${API}/admin/testimonials`).flush({ items: [] });
    await settle(() => fixture.detectChanges());
    const root = fixture.nativeElement as HTMLElement;
    expect(text(root.querySelector('[data-testid="real-only-note"]'))).toContain(
      'Samo stvarni utisci',
    );

    const page = fixture.componentInstance;
    page.form.patchValue({ authorName: 'Marija P.', place: 'Kragujevac', text: 'Najbolji džem.' });
    page.save();
    controller.expectNone(`${API}/admin/testimonials`);
    page.form.controls.confirmReal.setValue(true);
    page.save();
    const create = controller.expectOne({ method: 'POST', url: `${API}/admin/testimonials` });
    expect(create.request.body).toEqual({
      authorName: 'Marija P.',
      place: 'Kragujevac',
      text: 'Najbolji džem.',
      isPublished: true,
      sortOrder: 0,
    });
  });
});
