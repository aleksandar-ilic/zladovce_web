import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { apiErrorInterceptor, provideAppConfig } from '@zladovce/api';
import { AdminBlogPost } from '@zladovce/models';
import { of } from 'rxjs';
import {
  blogRequest,
  createBlogForm,
  fillBlogForm,
  missingForPublish,
  publishInstant,
} from './blog-form';
import { BlogPostFormPage } from './blog-post-form.page';
import { contentImageToInsert } from './content-image.dialog';

const API = 'http://localhost:5080/api/v1';
const ID = '99999999-9999-4999-8999-999999999999';
const POST_URL = `${API}/admin/blog/posts/${ID}`;

const text = (element: Element | null | undefined): string =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

const POST: AdminBlogPost = {
  id: ID,
  title: 'Kako kuvamo džem',
  slug: 'kako-kuvamo-dzem',
  excerpt: 'Polako i strpljivo.',
  coverImage: {
    key: 'media/blog/cover1',
    baseUrl: 'http://localhost:9000/m/media/blog/cover1',
    widths: [400, 800],
    width: 1200,
    height: 800,
  },
  contentHtml: '<p>Tekst</p>',
  category: null,
  status: 'Draft',
  state: 'Draft',
  publishedAt: null,
  seoTitle: null,
  seoDescription: null,
  author: null,
  createdAt: '2026-11-15T10:00:00Z',
  updatedAt: '2026-11-15T10:00:00Z',
  version: 7,
};

describe('blog form', () => {
  it('sends every member, with the version, and keeps/removes/replaces the cover', () => {
    const form = createBlogForm(new FormBuilder());
    fillBlogForm(form, POST);
    // Keep: the current key goes back unchanged.
    expect(blogRequest(form, 7)).toEqual({
      version: 7,
      title: 'Kako kuvamo džem',
      slug: 'kako-kuvamo-dzem',
      excerpt: 'Polako i strpljivo.',
      coverImageKey: 'media/blog/cover1',
      contentHtml: '<p>Tekst</p>',
      categoryId: null,
      seoTitle: null,
      seoDescription: null,
    });
    // Replace with an upload key, then remove.
    form.controls.coverImageKey.setValue('uploads/blog/new.jpg');
    expect(blogRequest(form, 7).coverImageKey).toBe('uploads/blog/new.jpg');
    form.controls.coverImageKey.setValue(null);
    expect(blogRequest(form, 7).coverImageKey).toBeNull();

    // New post: no version, empty texts are null.
    const empty = createBlogForm(new FormBuilder());
    empty.controls.title.setValue('  Novo ');
    expect(blogRequest(empty, null)).toMatchObject({
      version: null,
      title: 'Novo',
      slug: null,
      excerpt: null,
      contentHtml: null,
    });
    expect(missingForPublish(empty)).toEqual(['kratak uvod', 'tekst objave']);
    empty.controls.slug.setValue('Loša adresa');
    expect(empty.controls.slug.errors?.['pattern']).toBeDefined();
  });

  it('publishes now (null) or schedules a future Serbian time', () => {
    const now = Date.parse('2026-11-16T10:00:00Z');
    expect(publishInstant({ when: 'now' }, now)).toEqual({ publishedAt: null });
    expect(publishInstant({ when: 'later', day: '2026-11-20', time: '08:00' }, now)).toEqual({
      publishedAt: '2026-11-20T07:00:00.000Z',
    });
    expect(publishInstant({ when: 'later', day: '2026-11-16', time: '09:00' }, now)).toEqual({
      error: 'Vreme objave mora biti u budućnosti. Za objavu odmah izaberite „Odmah“.',
    });
    expect('error' in publishInstant({ when: 'later', day: '', time: '08:00' }, now)).toBe(true);
  });

  it('inserts the 800 px rendition with its size', () => {
    expect(
      contentImageToInsert(
        {
          key: 'k',
          baseUrl: 'http://localhost:9000/m/media/blog/i1',
          widths: [400, 800, 1600],
          width: 2000,
          height: 1000,
        },
        ' Tegle ',
      ),
    ).toEqual({
      src: 'http://localhost:9000/m/media/blog/i1/800.webp',
      alt: 'Tegle',
      width: 800,
      height: 400,
    });
  });
});

describe('blog post page', () => {
  async function open() {
    TestBed.configureTestingModule({
      providers: [
        provideAppConfig({ apiBaseUrl: API, healthUrl: 'http://localhost:5080/health' }),
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideRouter(
          [{ path: 'blog/:id', component: BlogPostFormPage }],
          withComponentInputBinding(),
        ),
      ],
    });
    const harness = await RouterTestingHarness.create(`/blog/${ID}`);
    const controller = TestBed.inject(HttpTestingController);
    controller.expectOne(`${API}/admin/blog/categories`).flush({ items: [] });
    controller.expectOne(POST_URL).flush(POST);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const page = harness.routeDebugElement!.componentInstance as BlogPostFormPage;
    return { harness, controller, page, root: harness.routeNativeElement as HTMLElement };
  }

  it('saves the cover removal with the version and shows a conflict instead of overwriting', async () => {
    const { harness, controller, page, root } = await open();
    expect(text(root.querySelector('[data-testid="post-state"]'))).toContain('Nacrt');
    root.querySelector<HTMLButtonElement>('[data-testid="remove-cover"]')?.click();
    harness.detectChanges();
    page.save();
    const put = controller.expectOne({ method: 'PUT', url: POST_URL });
    expect(put.request.body).toMatchObject({ version: 7, coverImageKey: null, title: POST.title });
    put.flush(
      { code: 'CONCURRENT_EDIT', detail: 'Neko je promenio objavu.' },
      { status: 409, statusText: 'Conflict' },
    );
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(root.querySelector('[data-testid="conflict"]')).not.toBeNull();
    expect(page.conflict()).toBe(true);
    controller.verify();
  });

  it('publishes now, or schedules, after the dialog', async () => {
    const { harness, controller, page, root } = await open();
    const dialog = TestBed.inject(MatDialog);
    const answers = [{ publishedAt: null }, { publishedAt: '2026-11-20T07:00:00.000Z' }];
    vi.spyOn(dialog, 'open').mockImplementation(
      () => ({ afterClosed: () => of(answers.shift()) }) as never,
    );

    page.publish();
    const now = controller.expectOne(`${POST_URL}/publish`);
    expect(now.request.body).toEqual({ version: 7, publishedAt: null });
    now.flush({
      ...POST,
      status: 'Published',
      state: 'Published',
      publishedAt: '2026-11-16T10:00:00Z',
      version: 8,
    });
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(text(root.querySelector('[data-testid="post-state"]'))).toContain('Objavljeno');
    expect(root.querySelector('[data-testid="unpublish"]')).not.toBeNull();

    page.publish();
    const later = controller.expectOne(`${POST_URL}/publish`);
    expect(later.request.body).toEqual({ version: 8, publishedAt: '2026-11-20T07:00:00.000Z' });
    later.flush({
      ...POST,
      status: 'Published',
      state: 'Scheduled',
      publishedAt: '2026-11-20T07:00:00Z',
      version: 9,
    });
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(text(root.querySelector('[data-testid="post-state"]'))).toContain(
      'Zakazano za 20.11.2026. 08:00',
    );
  });

  it('maps publish errors (missing excerpt) to the field', async () => {
    const { harness, controller, page } = await open();
    vi.spyOn(TestBed.inject(MatDialog), 'open').mockImplementation(
      () => ({ afterClosed: () => of({ publishedAt: null }) }) as never,
    );
    page.publish();
    controller.expectOne(`${POST_URL}/publish`).flush(
      {
        code: 'VALIDATION_FAILED',
        detail: 'x',
        errors: { excerpt: ['Uvod je obavezan za objavu.'] },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await harness.fixture.whenStable();
    expect(page.form.controls.excerpt.errors?.['server']).toBe('Uvod je obavezan za objavu.');
  });
});
