import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormBuilder, FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { apiErrorInterceptor, provideAppConfig } from '@zladovce/api';
import { AdminStoreSettings } from '@zladovce/models';
import { COURIER } from '../../testing/fixtures';
import {
  CourierDialog,
  courierRequest,
  isValidTrackingTemplate,
  previewTrackingUrl,
  trackingTemplateValidator,
} from '../couriers/courier.dialog';
import {
  addLink,
  amountValidator,
  createSettingsForm,
  fillSettingsForm,
  httpsUrlValidator,
  MAX_OTHER_LINKS,
  settingsRequest,
  syncThreshold,
} from './settings-form';
import { SettingsPage } from './settings.page';

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
  ];
}

const SETTINGS: AdminStoreSettings = {
  storeName: 'Zladovce',
  logoKey: null,
  logo: null,
  contactEmail: 'kontakt@zladovce.rs',
  phone: null,
  businessAddress: null,
  shippingEnabled: true,
  shippingPrice: 0,
  freeShippingThreshold: null,
  minOrderAmount: 1500,
  estimatedDeliveryText: '2–3 radna dana',
  deliveryInfo: null,
  facebookUrl: null,
  instagramUrl: 'https://instagram.com/zladovce',
  otherLinks: [{ label: 'Blog', url: 'https://blog.zladovce.rs' }],
  defaultSeoTitle: null,
  defaultSeoDescription: null,
  updatedAt: '2026-11-14T10:00:00Z',
  updatedByAdminId: null,
  updatedByAdminName: 'Milica',
  version: 41,
};

describe('courier tracking address', () => {
  it('accepts only https templates with {trackingNumber}', () => {
    expect(isValidTrackingTemplate('https://kurir.rs/pracenje?broj={trackingNumber}')).toBe(true);
    expect(isValidTrackingTemplate('https://kurir.rs/{trackingNumber}/status')).toBe(true);
    expect(isValidTrackingTemplate('http://kurir.rs/{trackingNumber}')).toBe(false);
    expect(isValidTrackingTemplate('https://kurir.rs/pracenje')).toBe(false);
    expect(isValidTrackingTemplate('https://kurir.rs/a b/{trackingNumber}')).toBe(false);
    expect(isValidTrackingTemplate('https://user:pw@kurir.rs/{trackingNumber}')).toBe(false);
    expect(isValidTrackingTemplate(`https://kurir.rs/${'a'.repeat(500)}{trackingNumber}`)).toBe(
      false,
    );

    expect(trackingTemplateValidator(new FormControl(''))).toBeNull();
    expect(trackingTemplateValidator(new FormControl('http://kurir.rs/{trackingNumber}'))).toEqual({
      template: 'Adresa mora počinjati sa https://.',
    });
    expect(trackingTemplateValidator(new FormControl('https://kurir.rs/pracenje'))).toEqual({
      template: 'Adresa mora sadržati {trackingNumber} na mestu broja pošiljke.',
    });
    expect(previewTrackingUrl('https://kurir.rs/p?b={trackingNumber}')).toBe(
      'https://kurir.rs/p?b=RS123456789',
    );
    expect(previewTrackingUrl('nije adresa')).toBeNull();
    expect(
      courierRequest({
        name: ' Kurir ',
        trackingUrlTemplate: '  ',
        isActive: false,
        sortOrder: null,
      }),
    ).toEqual({ name: 'Kurir', trackingUrlTemplate: null, isActive: false, sortOrder: 0 });
  });

  it('shows a taken name under the field and the link preview', async () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        ...providers(),
        { provide: MAT_DIALOG_DATA, useValue: null },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(CourierDialog);
    const render = () => settle(() => fixture.detectChanges());
    await render();
    const dialog = fixture.componentInstance;
    const root = fixture.nativeElement as HTMLElement;
    dialog.form.controls.name.setValue('Brza pošta');
    dialog.form.controls.trackingUrlTemplate.setValue('https://brza.example/p?b={trackingNumber}');
    await render();
    expect(text(root.querySelector('[data-testid="template-preview"]'))).toContain(
      'https://brza.example/p?b=RS123456789',
    );
    dialog.submit();
    const http = TestBed.inject(HttpTestingController);
    const request = http.expectOne(`${API}/admin/couriers`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      name: 'Brza pošta',
      trackingUrlTemplate: 'https://brza.example/p?b={trackingNumber}',
      isActive: true,
      sortOrder: 0,
    });
    request.flush(
      {
        code: 'COURIER_NAME_TAKEN',
        status: 409,
        title: 'Naziv je zauzet',
        detail: 'Kurirska služba sa ovim nazivom već postoji.',
        errors: { name: ['Kurirska služba sa ovim nazivom već postoji.'] },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await render();
    expect(text(root)).toContain('Kurirska služba sa ovim nazivom već postoji.');
    expect(dialog.form.controls.name.errors?.['server']).toBeDefined();
    expect(close).not.toHaveBeenCalled();
    dialog.form.controls.name.setValue('Brza pošta 2');
    dialog.submit();
    http.expectOne(`${API}/admin/couriers`).flush({ ...COURIER, name: 'Brza pošta 2' });
    expect(close).toHaveBeenCalled();
  });
});

describe('store settings form', () => {
  const fb = new FormBuilder();

  it('validates https links and amounts', () => {
    expect(httpsUrlValidator(new FormControl(''))).toBeNull();
    expect(httpsUrlValidator(new FormControl('https://facebook.com/zladovce'))).toBeNull();
    expect(httpsUrlValidator(new FormControl('http://facebook.com/zladovce'))).not.toBeNull();
    expect(httpsUrlValidator(new FormControl('facebook.com'))).not.toBeNull();
    expect(amountValidator(false)(new FormControl(0))).toBeNull();
    expect(amountValidator(true)(new FormControl(0))).toEqual({
      amount: 'Iznos mora biti veći od nule.',
    });
    expect(amountValidator(false)(new FormControl(-1))).toEqual({
      amount: 'Iznos ne može biti negativan.',
    });
    expect(amountValidator(false)(new FormControl(1.005))).toEqual({
      amount: 'Iznos može imati najviše dve decimale.',
    });
  });

  it('sends a switched-off threshold as null and every member', () => {
    const form = createSettingsForm(fb);
    fillSettingsForm(form, fb, SETTINGS);
    expect(form.controls.noFreeShippingThreshold.value).toBe(true);
    expect(form.controls.freeShippingThreshold.disabled).toBe(true);
    expect(form.controls.minOrderAmount.enabled).toBe(true);
    expect(form.pristine).toBe(true);
    expect(settingsRequest(form, 41)).toEqual({
      version: 41,
      storeName: 'Zladovce',
      logoKey: null,
      contactEmail: 'kontakt@zladovce.rs',
      phone: null,
      businessAddress: null,
      shippingEnabled: true,
      shippingPrice: 0,
      freeShippingThreshold: null,
      minOrderAmount: 1500,
      estimatedDeliveryText: '2–3 radna dana',
      deliveryInfo: null,
      facebookUrl: null,
      instagramUrl: 'https://instagram.com/zladovce',
      otherLinks: [{ label: 'Blog', url: 'https://blog.zladovce.rs' }],
      defaultSeoTitle: null,
      defaultSeoDescription: null,
    });

    // A threshold switched on must have an amount above zero.
    form.controls.noFreeShippingThreshold.setValue(false);
    syncThreshold(form, 'freeShippingThreshold');
    expect(form.controls.freeShippingThreshold.enabled).toBe(true);
    expect(form.valid).toBe(false);
    form.controls.freeShippingThreshold.setValue(5000);
    expect(form.valid).toBe(true);
    form.controls.noMinOrderAmount.setValue(true);
    syncThreshold(form, 'minOrderAmount');
    expect(settingsRequest(form, 41)).toMatchObject({
      freeShippingThreshold: 5000,
      minOrderAmount: null,
    });

    // At most ten other links, each https.
    for (let i = 0; i < 20; i++) addLink(form, fb, `L${i}`, 'https://a.rs');
    expect(form.controls.otherLinks.length).toBe(MAX_OTHER_LINKS);
    form.controls.otherLinks.at(3).controls.url.setValue('ftp://a.rs');
    expect(form.valid).toBe(false);
  });
});

describe('SettingsPage', () => {
  async function openPage() {
    TestBed.configureTestingModule({ providers: providers() });
    const fixture = TestBed.createComponent(SettingsPage);
    const render = () => settle(() => fixture.detectChanges());
    const http = TestBed.inject(HttpTestingController);
    await render();
    http.expectOne(`${API}/admin/settings`).flush(SETTINGS);
    await render();
    return {
      fixture,
      page: fixture.componentInstance,
      root: fixture.nativeElement as HTMLElement,
      render,
      http,
    };
  }

  it('saves with the latest version, reports CONCURRENT_EDIT and guards unsaved changes', async () => {
    const ctx = await openPage();
    expect(ctx.page.hasUnsavedChanges()).toBe(false);
    expect((ctx.root.querySelector('[data-testid="storeName"]') as HTMLInputElement).value).toBe(
      'Zladovce',
    );
    expect(
      (ctx.root.querySelector('[data-testid="freeShippingThreshold"]') as HTMLInputElement)
        .disabled,
    ).toBe(true);

    const price = ctx.root.querySelector<HTMLInputElement>('[data-testid="shippingPrice"]')!;
    price.value = '350';
    price.dispatchEvent(new Event('input'));
    await ctx.render();
    expect(ctx.page.hasUnsavedChanges()).toBe(true);

    ctx.page.save();
    const put = ctx.http.expectOne(`${API}/admin/settings`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toMatchObject({
      version: 41,
      shippingPrice: 350,
      freeShippingThreshold: null,
    });
    put.flush({ ...SETTINGS, shippingPrice: 350, version: 42 });
    await ctx.render();
    expect(ctx.page.version()).toBe(42);
    expect(ctx.page.hasUnsavedChanges()).toBe(false);

    ctx.page.form.controls.storeName.setValue('Zladovce 2');
    ctx.page.form.markAsDirty();
    ctx.page.save();
    const second = ctx.http.expectOne(`${API}/admin/settings`);
    expect(second.request.body.version).toBe(42);
    second.flush(
      { code: 'CONCURRENT_EDIT', status: 409, title: 'Sukob', detail: 'Promenjeno.' },
      { status: 409, statusText: 'Conflict' },
    );
    await ctx.render();
    expect(text(ctx.root.querySelector('[data-testid="conflict"]'))).toContain(
      'Podešavanja je u međuvremenu promenio neko drugi.',
    );
    expect(ctx.root.querySelector<HTMLButtonElement>('[data-testid="save"]')?.disabled).toBe(true);
    ctx.root.querySelector<HTMLButtonElement>('[data-testid="reload-latest"]')!.click();
    ctx.http
      .expectOne(`${API}/admin/settings`)
      .flush({ ...SETTINGS, storeName: 'Tuđa izmena', version: 50 });
    await ctx.render();
    expect(ctx.page.version()).toBe(50);
    expect(ctx.root.querySelector('[data-testid="conflict"]')).toBeNull();
    expect((ctx.root.querySelector('[data-testid="storeName"]') as HTMLInputElement).value).toBe(
      'Tuđa izmena',
    );
  });

  it('shows field errors from the API and refuses invalid links before sending', async () => {
    const ctx = await openPage();
    const facebook = ctx.root.querySelector<HTMLInputElement>('[data-testid="facebookUrl"]')!;
    facebook.value = 'http://facebook.com/zladovce';
    facebook.dispatchEvent(new Event('input'));
    ctx.page.save();
    await ctx.render();
    expect(ctx.http.match(`${API}/admin/settings`).length).toBe(0);
    expect(text(ctx.root)).toContain('Unesite punu adresu koja počinje sa https://');
    facebook.value = '';
    facebook.dispatchEvent(new Event('input'));

    ctx.page.save();
    ctx.http.expectOne(`${API}/admin/settings`).flush(
      {
        code: 'VALIDATION_FAILED',
        status: 400,
        title: 'Neispravni podaci',
        detail: 'Proverite unete podatke.',
        errors: {
          minOrderAmount: ['Minimalni iznos porudžbine mora biti veći od nule ili prazan.'],
        },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await ctx.render();
    expect(text(ctx.root)).toContain(
      'Minimalni iznos porudžbine mora biti veći od nule ili prazan.',
    );
  });

  it('explains a missing permission (staff) without a retry button', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    const fixture = TestBed.createComponent(SettingsPage);
    await settle(() => fixture.detectChanges());
    TestBed.inject(HttpTestingController)
      .expectOne(`${API}/admin/settings`)
      .flush(
        { code: 'FORBIDDEN', status: 403, title: 'Zabranjeno', detail: 'Nemate dozvolu.' },
        { status: 403, statusText: 'Forbidden' },
      );
    await settle(() => fixture.detectChanges());
    const root = fixture.nativeElement as HTMLElement;
    expect(text(root)).toContain('Podešavanja prodavnice može da menja samo vlasnik.');
    expect(root.querySelector('ui-error-state button')).toBeNull();
  });
});
