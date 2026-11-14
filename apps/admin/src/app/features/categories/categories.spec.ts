import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { apiErrorInterceptor, provideAppConfig } from '@zladovce/api';
import { CATEGORY } from '../../testing/fixtures';
import { CategoriesPage, productCountLabel } from './categories.page';
import { CategoryFormPage } from './category-form.page';

const API = 'http://localhost:5080/api/v1';
const SECOND = {
  ...CATEGORY,
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Sokovi',
  slug: 'sokovi',
  sortOrder: 1,
  productCount: 0,
  isActive: false,
};

const text = (element: Element | null | undefined): string =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function open(url: string) {
  TestBed.configureTestingModule({
    providers: [
      provideAppConfig({ apiBaseUrl: API, healthUrl: 'http://localhost:5080/health' }),
      provideHttpClient(withInterceptors([apiErrorInterceptor])),
      provideHttpClientTesting(),
      provideRouter(
        [
          { path: 'kategorije', component: CategoriesPage },
          { path: 'kategorije/nova', component: CategoryFormPage },
          { path: 'kategorije/:id', component: CategoryFormPage },
        ],
        withComponentInputBinding(),
      ),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const render = async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve));
      harness.detectChanges();
      await harness.fixture.whenStable();
    }
  };
  return {
    harness,
    render,
    controller: TestBed.inject(HttpTestingController),
    root: () => harness.routeNativeElement as HTMLElement,
  };
}

/** Waits (up to ~2 s) until the condition holds; dialogs close after their exit animation. */
async function waitFor(condition: () => boolean, render: () => Promise<void>): Promise<void> {
  for (let i = 0; i < 40 && !condition(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await render();
  }
}

function dialogButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('adm-confirm-dialog button')].find(
    (b) => text(b) === label,
  );
}

describe('CategoriesPage', () => {
  it('counts products in Serbian', () => {
    expect(productCountLabel(1)).toBe('1 proizvod');
    expect(productCountLabel(3)).toBe('3 proizvoda');
    expect(productCountLabel(11)).toBe('11 proizvoda');
    expect(productCountLabel(21)).toBe('21 proizvod');
  });

  it('lists categories in shop order and saves a new order with every id once', async () => {
    const { render, controller, root } = await open('/kategorije');
    controller.expectOne(`${API}/admin/categories`).flush({ items: [SECOND, CATEGORY] });
    await render();
    const rows = () => [...root().querySelectorAll('[data-testid="category-row"]')].map(text);
    expect(rows()[0]).toContain('Džemovi');
    expect(rows()[0]).toContain('1 proizvod');
    expect(rows()[0]).toContain('Aktivna');
    expect(rows()[1]).toContain('Skrivena');

    root().querySelector<HTMLButtonElement>('button[aria-label="Pomeri dole: Džemovi"]')?.click();
    await render();
    const order = controller.expectOne(`${API}/admin/categories/order`);
    expect(order.request.method).toBe('PUT');
    expect(order.request.body).toEqual({ ids: [SECOND.id, CATEGORY.id] });
    order.flush({
      items: [
        { ...SECOND, sortOrder: 0 },
        { ...CATEGORY, sortOrder: 1 },
      ],
    });
    await render();
    expect(rows()[0]).toContain('Sokovi');
  });

  it('puts the old order back when saving the order fails', async () => {
    const { render, controller, root } = await open('/kategorije');
    controller.expectOne(`${API}/admin/categories`).flush({ items: [CATEGORY, SECOND] });
    await render();
    root().querySelector<HTMLButtonElement>('button[aria-label="Pomeri gore: Sokovi"]')?.click();
    await render();
    controller
      .expectOne(`${API}/admin/categories/order`)
      .flush(
        { title: 'x', status: 400, code: 'VALIDATION_FAILED', detail: 'Spisak nije potpun.' },
        { status: 400, statusText: 'Bad Request' },
      );
    await render();
    expect(text(root().querySelector('[data-testid="category-row"]'))).toContain('Džemovi');
  });

  it('asks before archiving and explains CATEGORY_HAS_PRODUCTS plainly', async () => {
    const { render, controller, root } = await open('/kategorije');
    controller.expectOne(`${API}/admin/categories`).flush({ items: [CATEGORY] });
    await render();
    [...root().querySelectorAll('button')].find((b) => text(b) === 'Arhiviraj')?.click();
    await render();
    expect(text(document.querySelector('adm-confirm-dialog'))).toContain(
      'samo kada u njoj nema proizvoda',
    );
    dialogButton('Arhiviraj')?.click();
    await waitFor(() => document.querySelector('adm-confirm-dialog') === null, render);
    controller
      .expectOne(`${API}/admin/categories/${CATEGORY.id}`)
      .flush(
        {
          title: 'x',
          status: 409,
          code: 'CATEGORY_HAS_PRODUCTS',
          detail: 'Kategorija ima proizvode.',
        },
        { status: 409, statusText: 'Conflict' },
      );
    await render();
    expect(text(document.querySelector('mat-snack-bar-container'))).toContain(
      'nije arhivirana jer u njoj još ima proizvoda',
    );
    expect(root().querySelectorAll('[data-testid="category-row"]').length).toBe(1);
  });
});

describe('CategoryFormPage', () => {
  it('creates a category at the end of the list with an auto slug', async () => {
    const { harness, render, controller, root } = await open('/kategorije/nova');
    controller.expectOne(`${API}/admin/categories`).flush({ items: [CATEGORY, SECOND] });
    await render();
    const page = harness.routeDebugElement?.componentInstance as CategoryFormPage;
    page.form.controls.name.setValue('Sirće i kompoti');
    page.form.controls.name.markAsDirty();
    await render();
    expect(text(root().querySelector('[data-testid="slug-preview"]'))).toBe(
      '/prodavnica/sirce-i-kompoti',
    );

    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await render();
    const create = controller.expectOne(`${API}/admin/categories`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({
      name: 'Sirće i kompoti',
      slug: null,
      description: null,
      imageKey: null,
      sortOrder: 2,
      isActive: true,
      seoTitle: null,
      seoDescription: null,
    });
    create.flush({ ...CATEGORY, name: 'Sirće i kompoti' }, { status: 201, statusText: 'Created' });
    await render();
    expect(TestBed.inject(Router).url).toBe('/kategorije');
    controller.expectOne(`${API}/admin/categories`).flush({ items: [] });
  });

  it('keeps the current image key when saving, sends null after removing it, and shows server errors', async () => {
    const withImage = {
      ...CATEGORY,
      image: {
        key: 'media/categories/x',
        baseUrl: 'http://localhost:9000/b/media/categories/x',
        widths: [400, 800],
        width: 800,
        height: 600,
      },
    };
    const { harness, render, controller, root } = await open(`/kategorije/${CATEGORY.id}`);
    controller.expectOne(`${API}/admin/categories/${CATEGORY.id}`).flush(withImage);
    await render();
    expect(root().querySelector('[data-testid="category-image"]')?.getAttribute('src')).toBe(
      'http://localhost:9000/b/media/categories/x/800.webp',
    );
    const page = harness.routeDebugElement?.componentInstance as CategoryFormPage;
    page.form.controls.description.setValue('Opis');
    page.form.controls.description.markAsDirty();
    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await render();
    const put = controller.expectOne(`${API}/admin/categories/${CATEGORY.id}`);
    expect(put.request.body).toMatchObject({
      imageKey: 'media/categories/x',
      sortOrder: 0,
      description: 'Opis',
      slug: null,
    });
    put.flush(
      {
        title: 'x',
        status: 400,
        code: 'VALIDATION_FAILED',
        detail: 'Neispravno.',
        errors: { name: ['Naziv je predugačak.'] },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await render();
    expect([...root().querySelectorAll('mat-error')].map(text)).toEqual(['Naziv je predugačak.']);

    [...root().querySelectorAll('button')].find((b) => text(b) === 'Ukloni sliku')?.click();
    page.form.controls.name.setValue('Džemovi');
    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await render();
    const second = controller.expectOne(`${API}/admin/categories/${CATEGORY.id}`);
    expect(second.request.body).toMatchObject({ imageKey: null });
    second.flush(CATEGORY);
    await render();
    controller.expectOne(`${API}/admin/categories`).flush({ items: [CATEGORY] });
  });
});
