import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { apiErrorInterceptor, provideAppConfig } from '@zladovce/api';
import { AdminProduct } from '@zladovce/models';
import { unsavedChangesGuard } from '../../shared/unsaved-changes';
import { CATEGORY, PRODUCT } from '../../testing/fixtures';
import { ProductFormPage } from './product-form.page';

const API = 'http://localhost:5080/api/v1';

async function settle(harness: RouterTestingHarness): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    harness.detectChanges();
    await harness.fixture.whenStable();
  }
}

async function open(url: string) {
  TestBed.configureTestingModule({
    providers: [
      provideAppConfig({ apiBaseUrl: API, healthUrl: 'http://localhost:5080/health' }),
      provideHttpClient(withInterceptors([apiErrorInterceptor])),
      provideHttpClientTesting(),
      provideRouter(
        [
          { path: 'proizvodi', children: [] },
          {
            path: 'proizvodi/novi',
            component: ProductFormPage,
            canDeactivate: [unsavedChangesGuard],
          },
          {
            path: 'proizvodi/:id',
            component: ProductFormPage,
            canDeactivate: [unsavedChangesGuard],
          },
        ],
        withComponentInputBinding(),
      ),
    ],
  });
  const harness = await RouterTestingHarness.create();
  const controller = TestBed.inject(HttpTestingController);
  const page = await harness.navigateByUrl(url, ProductFormPage);
  return { harness, controller, page, root: harness.routeNativeElement as HTMLElement };
}

const text = (element: Element | null | undefined): string =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

function load(controller: HttpTestingController, product: AdminProduct | null): void {
  controller.expectOne(`${API}/admin/categories`).flush({ items: [CATEGORY] });
  if (product) {
    controller.expectOne(`${API}/admin/products/${product.id}`).flush(product);
  }
}

function submit(root: HTMLElement): void {
  root.querySelector('form')?.dispatchEvent(new Event('submit'));
}

function expectRequest(
  controller: HttpTestingController,
  method: string,
  path: string,
): TestRequest {
  const request = controller.expectOne(`${API}${path}`);
  expect(request.request.method).toBe(method);
  return request;
}

const conflict = {
  type: 'https://zladovce.com/errors/concurrent-edit',
  title: 'Izmena u međuvremenu',
  status: 409,
  code: 'CONCURRENT_EDIT',
  detail: 'Proizvod je u međuvremenu izmenjen.',
};

afterEach(() => TestBed.inject(HttpTestingController).verify());

describe('ProductFormPage – new product', () => {
  it('creates the product with its packages, then opens it for adding photos', async () => {
    const { harness, controller, page, root } = await open('/proizvodi/novi');
    load(controller, null);
    await settle(harness);

    expect(text(root.querySelector('h1'))).toBe('Novi proizvod');
    // The only category is preselected; SKU and package name follow name and size.
    page.form.controls.name.setValue('Džem od šljiva');
    page.form.controls.name.markAsDirty();
    const row = page.form.controls.variants.at(0);
    row.controls.unitAmount.setValue(370);
    row.controls.regularPrice.setValue(650);
    row.controls.initialStock.setValue(12);
    expect(page.form.controls.categoryId.value).toBe(CATEGORY.id);
    expect(page.form.controls.sku.value).toBe('DZEM-OD-SLJIVA');
    expect(row.controls.name.value).toBe('370 g');
    expect(row.controls.sku.value).toBe('DZEM-OD-SLJIVA-370G');

    submit(root);
    await settle(harness);
    const create = expectRequest(controller, 'POST', '/admin/products');
    expect(create.request.body).toMatchObject({
      categoryId: CATEGORY.id,
      name: 'Džem od šljiva',
      sku: 'DZEM-OD-SLJIVA',
      slug: null,
      variants: [
        {
          name: '370 g',
          sku: 'DZEM-OD-SLJIVA-370G',
          unitAmount: 370,
          measurementUnit: 'g',
          regularPrice: 650,
          discountPrice: null,
          initialStock: 12,
          lowStockThreshold: 3,
          isActive: true,
          sortOrder: 0,
        },
      ],
    });
    expect(root.querySelector<HTMLButtonElement>('[data-testid="save"]')?.disabled).toBe(true);
    create.flush(PRODUCT, { status: 201, statusText: 'Created' });
    await settle(harness);

    expect(TestBed.inject(Router).url).toBe(`/proizvodi/${PRODUCT.id}#fotografije`);
    load(controller, PRODUCT);
    await settle(harness);
    expect(text(harness.routeNativeElement?.querySelector('h1'))).toBe('Izmena proizvoda');
    expect(text(harness.routeNativeElement)).toContain('Fotografije');
    expect(harness.routeNativeElement?.querySelector('adm-image-upload')).not.toBeNull();
  });

  it('shows server validation errors under the right package field', async () => {
    const { harness, controller, page, root } = await open('/proizvodi/novi');
    load(controller, null);
    await settle(harness);
    page.form.patchValue({ name: 'Sok od jabuke', sku: 'SOK' });
    page.form.controls.variants
      .at(0)
      .patchValue({
        unitAmount: 1,
        measurementUnit: 'l',
        regularPrice: 400,
        sku: 'SOK-1L',
        name: '1 l',
      });
    submit(root);
    await settle(harness);
    expectRequest(controller, 'POST', '/admin/products').flush(
      {
        title: 'Neispravni podaci',
        status: 400,
        code: 'VALIDATION_FAILED',
        detail: 'Proverite unete podatke.',
        errors: { 'variants[0].regularPrice': ['Cena je prevelika.'], name: ['Naziv je zauzet.'] },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle(harness);
    const errors = [...root.querySelectorAll('mat-error')].map(text);
    expect(errors).toContain('Naziv je zauzet.');
    expect(errors).toContain('Cena je prevelika.');
    const rowErrors = [...root.querySelectorAll('[data-testid="variant-row"] mat-error')].map(text);
    expect(rowErrors).toEqual(['Cena je prevelika.']);
    expect(text(root.querySelector('[data-testid="form-error"]'))).toBe(
      'Proverite označena polja.',
    );
    expect(TestBed.inject(Router).url).toBe('/proizvodi/novi');
  });

  it('does not send an invalid form', async () => {
    const { harness, controller, root } = await open('/proizvodi/novi');
    load(controller, null);
    await settle(harness);
    submit(root);
    await settle(harness);
    expect(text(root.querySelector('[data-testid="form-error"]'))).toBe(
      'Proverite označena polja.',
    );
    expect(root.querySelectorAll('mat-error').length).toBeGreaterThan(2);
  });
});

describe('ProductFormPage – editing and version handling', () => {
  it('saves product fields, changed and new packages in sequence, always with the latest version', async () => {
    const { harness, controller, page, root } = await open(`/proizvodi/${PRODUCT.id}`);
    load(controller, PRODUCT);
    await settle(harness);
    expect(page.version()).toBe(101);
    expect(text(root.querySelector('[data-testid="variant-stock"]'))).toContain('Na stanju: 12');

    page.form.controls.name.setValue('Džem od šljiva – novi');
    page.form.controls.name.markAsDirty();
    const existing = page.form.controls.variants.at(0);
    existing.controls.regularPrice.setValue(700);
    existing.controls.regularPrice.markAsDirty();
    root.querySelector<HTMLButtonElement>('button.mt-4[type="button"]')?.click(); // + Dodaj pakovanje
    await settle(harness);
    const added = page.form.controls.variants.at(1);
    added.patchValue({
      unitAmount: 720,
      regularPrice: 1100,
      initialStock: 6,
      lowStockThreshold: 2,
    });
    expect(added.controls.sku.value).toBe('DZEM-SLJIVA-720G');

    submit(root);
    await settle(harness);

    // 1. product fields with the version that was read
    const put = expectRequest(controller, 'PUT', `/admin/products/${PRODUCT.id}`);
    expect(put.request.body).toMatchObject({
      version: 101,
      name: 'Džem od šljiva – novi',
      isActive: true,
    });
    put.flush({ ...PRODUCT, name: 'Džem od šljiva – novi', version: 102 });
    await settle(harness);
    expect(page.version()).toBe(102);

    // 2. the changed package
    const variantId = PRODUCT.variants[0]!.id;
    const putVariant = expectRequest(
      controller,
      'PUT',
      `/admin/products/${PRODUCT.id}/variants/${variantId}`,
    );
    expect(putVariant.request.body).toMatchObject({
      regularPrice: 700,
      sku: 'DZEM-SLJIVA-370G',
      sortOrder: 0,
    });
    expect(putVariant.request.body).not.toHaveProperty('initialStock');
    const v1 = { ...PRODUCT.variants[0]!, regularPrice: 700 };
    putVariant.flush({ ...PRODUCT, name: 'Džem od šljiva – novi', variants: [v1], version: 103 });
    await settle(harness);

    // 3. the new package with its opening stock
    const post = expectRequest(controller, 'POST', `/admin/products/${PRODUCT.id}/variants`);
    expect(post.request.body).toMatchObject({
      unitAmount: 720,
      initialStock: 6,
      lowStockThreshold: 2,
      sortOrder: 1,
    });
    const v2 = {
      ...v1,
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      name: '720 g',
      sku: 'DZEM-SLJIVA-720G',
      unitAmount: 720,
      regularPrice: 1100,
      sortOrder: 1,
      quantityOnHand: 6,
    };
    post.flush(
      { ...PRODUCT, name: 'Džem od šljiva – novi', variants: [v1, v2], version: 104 },
      { status: 201, statusText: 'Created' },
    );
    await settle(harness);

    expect(page.version()).toBe(104);
    expect(page.form.dirty).toBe(false);
    expect(page.form.controls.variants.at(1).controls.id.value).toBe(v2.id);
    expect(page.hasUnsavedChanges()).toBe(false);

    // The next save uses the version of the last response.
    page.form.controls.isFeatured.setValue(true);
    page.form.controls.isFeatured.markAsDirty();
    submit(root);
    await settle(harness);
    const again = expectRequest(controller, 'PUT', `/admin/products/${PRODUCT.id}`);
    expect(again.request.body).toMatchObject({ version: 104, isFeatured: true });
    again.flush({ ...PRODUCT, isFeatured: true, variants: [v1, v2], version: 105 });
    await settle(harness);
  });

  it('keeps the version from photo changes for the next save', async () => {
    const image = (id: string, isMain: boolean, sortOrder: number) => ({
      id,
      altText: null,
      isMain,
      sortOrder,
      baseUrl: `http://localhost:9000/b/media/products/${id}`,
      widths: [400, 800],
      width: 800,
      height: 600,
    });
    const withImages = { ...PRODUCT, images: [image('i1', true, 0), image('i2', false, 1)] };
    const { harness, controller, page, root } = await open(`/proizvodi/${PRODUCT.id}`);
    load(controller, withImages);
    await settle(harness);

    const setMain = [...root.querySelectorAll('button')].find(
      (b) => text(b) === 'Postavi kao glavnu',
    );
    setMain?.click();
    await settle(harness);
    const order = expectRequest(controller, 'PUT', `/admin/products/${PRODUCT.id}/images/order`);
    expect(order.request.body).toEqual({ imageIds: ['i1', 'i2'], mainImageId: 'i2' });
    order.flush({
      ...withImages,
      images: [image('i1', false, 0), image('i2', true, 1)],
      version: 150,
    });
    await settle(harness);
    expect(page.version()).toBe(150);

    page.form.controls.shortDescription.setValue('Novi kratak opis.');
    page.form.controls.shortDescription.markAsDirty();
    submit(root);
    await settle(harness);
    const put = expectRequest(controller, 'PUT', `/admin/products/${PRODUCT.id}`);
    expect(put.request.body).toMatchObject({ version: 150, shortDescription: 'Novi kratak opis.' });
    put.flush({ ...withImages, version: 151 });
    await settle(harness);
  });

  it('explains CONCURRENT_EDIT plainly and reloads the latest version on request', async () => {
    const { harness, controller, page, root } = await open(`/proizvodi/${PRODUCT.id}`);
    load(controller, PRODUCT);
    await settle(harness);

    page.form.controls.name.setValue('Moja izmena');
    page.form.controls.name.markAsDirty();
    submit(root);
    await settle(harness);
    expectRequest(controller, 'PUT', `/admin/products/${PRODUCT.id}`).flush(conflict, {
      status: 409,
      statusText: 'Conflict',
    });
    await settle(harness);

    const banner = root.querySelector('[data-testid="conflict"]');
    expect(text(banner)).toContain('Neko je u međuvremenu izmenio ovaj proizvod.');
    expect(banner?.getAttribute('role')).toBe('alert');
    expect(page.conflict()).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('[data-testid="save"]')?.disabled).toBe(true);

    [...root.querySelectorAll('button')]
      .find((b) => text(b) === 'Učitaj najnoviju verziju')
      ?.click();
    await settle(harness);
    load(controller, { ...PRODUCT, name: 'Tuđa izmena', version: 120 });
    await settle(harness);

    expect(page.conflict()).toBe(false);
    expect(page.version()).toBe(120);
    expect(page.form.controls.name.value).toBe('Tuđa izmena');
    expect(page.form.dirty).toBe(false);
    expect(root.querySelector('[data-testid="conflict"]')).toBeNull();
  });

  it('stops at a failing package and keeps what was already saved', async () => {
    const { harness, controller, page, root } = await open(`/proizvodi/${PRODUCT.id}`);
    load(controller, PRODUCT);
    await settle(harness);
    const row = page.form.controls.variants.at(0);
    row.controls.sku.setValue('DZEM-ZAUZETO');
    row.controls.sku.markAsDirty();
    submit(root);
    await settle(harness);
    expectRequest(
      controller,
      'PUT',
      `/admin/products/${PRODUCT.id}/variants/${PRODUCT.variants[0]!.id}`,
    ).flush(
      {
        title: 'Šifra zauzeta',
        status: 409,
        code: 'SKU_TAKEN',
        detail: 'Šifra (SKU) „DZEM-ZAUZETO“ se već koristi. Izaberite drugu.',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle(harness);
    expect(row.controls.sku.errors?.['server']).toContain('se već koristi');
    expect(text(root.querySelector('[data-testid="form-error"]'))).toContain('pakovanje „370 g“');
    expect(page.form.dirty).toBe(true);
  });

  it('asks before leaving with unsaved changes', async () => {
    const { harness, controller, page } = await open(`/proizvodi/${PRODUCT.id}`);
    load(controller, PRODUCT);
    await settle(harness);
    page.form.controls.name.setValue('Nesačuvano');
    page.form.controls.name.markAsDirty();

    const router = TestBed.inject(Router);
    const navigation = router.navigateByUrl('/proizvodi');
    // The pending navigation keeps the app "unstable", so only flush timers and render here.
    const render = async () => {
      for (let i = 0; i < 4; i++) {
        await new Promise((resolve) => setTimeout(resolve));
        harness.detectChanges();
      }
    };
    await render();
    const dialog = document.querySelector('adm-confirm-dialog');
    expect(text(dialog)).toContain('Napustiti stranicu bez čuvanja?');
    [...(dialog?.querySelectorAll('button') ?? [])]
      .find((b) => text(b) === 'Ostani na stranici')
      ?.click();
    await render();
    expect(await navigation).toBe(false);
    expect(router.url).toBe(`/proizvodi/${PRODUCT.id}`);
  });
});
