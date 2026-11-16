import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DestroyRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ApiError, apiErrorInterceptor, provideAppConfig } from '@zladovce/api';
import { AuthService } from '@zladovce/auth';
import { AdminStoreSettings, AdminUser } from '@zladovce/models';
import { UnreadMessagesStore } from '../core/unread-messages';
import { activeOwners, changeBlocked } from './admin-users/admin-users.page';
import { adminUserErrorText, InviteDialog } from './admin-users/invite.dialog';
import {
  actionLabel,
  auditQueryParams,
  changeRows,
  parseAuditFilters,
  toAuditApiQuery,
} from './audit/audit-log';
import {
  createExpenseForm,
  ExpenseDialog,
  expenseRequest,
  fillExpenseForm,
} from './expenses/expense.dialog';
import { ContactMessagesPage } from './messages/contact-messages.page';
import { NewsletterPage } from './newsletter/newsletter.page';
import { salesCsvName } from './reports/reports.page';
import { createSettingsForm, fillSettingsForm, settingsRequest } from './settings/settings-form';
import { SettingsPage } from './settings/settings.page';

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
    { provide: AuthService, useValue: { user: signal({ role: 'Owner' }), role: signal('Owner') } },
  ];
}

describe('expenses', () => {
  it('validates and sends all four members', () => {
    const form = createExpenseForm(new FormBuilder());
    expect(form.controls.expenseDate.value).toBeInstanceOf(Date);
    form.patchValue({ category: '', description: ' ', amount: 0 });
    expect(form.controls.category.errors?.['required']).toBe(true);
    expect(form.controls.description.invalid).toBe(true);
    expect(form.controls.amount.errors?.['amount']).toBe('Iznos mora biti veći od nule.');
    form.patchValue({ amount: 12.345 });
    expect(form.controls.amount.errors?.['amount']).toBe('Iznos može imati najviše dve decimale.');

    fillExpenseForm(form, {
      id: 'e1',
      expenseDate: '2026-11-14',
      category: 'Ambalaza',
      categoryLabel: 'Ambalaža',
      description: ' Tegle 370 g ',
      amount: 4800,
      createdByAdminId: 'a',
      createdByAdminName: null,
      createdAt: '2026-11-14T10:00:00Z',
      updatedAt: '2026-11-14T10:00:00Z',
    });
    expect(form.valid).toBe(true);
    expect(expenseRequest(form)).toEqual({
      expenseDate: '2026-11-14',
      category: 'Ambalaza',
      description: 'Tegle 370 g',
      amount: 4800,
    });
  });

  it('creates an expense from the dialog and shows server field errors', async () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        ...providers(),
        { provide: MAT_DIALOG_DATA, useValue: { expense: null } },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(ExpenseDialog);
    const controller = TestBed.inject(HttpTestingController);
    controller.expectOne(`${API}/admin/expenses/categories`).flush([
      { value: 'Ambalaza', label: 'Ambalaža' },
      { value: 'Ostalo', label: 'Ostalo' },
    ]);
    await settle(() => fixture.detectChanges());
    const dialog = fixture.componentInstance;
    dialog.form.patchValue({ category: 'Ostalo', description: 'Oglas', amount: 1500 });
    dialog.save();
    const post = controller.expectOne({ method: 'POST', url: `${API}/admin/expenses` });
    expect(post.request.body).toMatchObject({
      category: 'Ostalo',
      description: 'Oglas',
      amount: 1500,
    });
    post.flush(
      { code: 'VALIDATION_FAILED', detail: 'x', errors: { amount: ['Iznos je prevelik.'] } },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(dialog.form.controls.amount.errors?.['server']).toBe('Iznos je prevelik.');
    // Changing the value clears the server message.
    dialog.form.controls.amount.setValue(1400);
    dialog.save();
    controller.expectOne(`${API}/admin/expenses`).flush({ id: 'e2' });
    expect(close).toHaveBeenCalledWith({ id: 'e2' });
  });

  it('names sales CSV files like the server', () => {
    expect(salesCsvName('variant', '2026-11-01', '2026-11-15')).toBe(
      'prodaja-po-proizvodima-2026-11-01-2026-11-15.csv',
    );
    expect(salesCsvName('category', '2026-11-14', '2026-11-14')).toBe(
      'prodaja-po-kategorijama-2026-11-14-2026-11-14.csv',
    );
  });
});

describe('newsletter', () => {
  it('lists subscribers with counts and filters, and exports confirmed ones as a file', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const clicks = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(NewsletterPage);
    const controller = TestBed.inject(HttpTestingController);
    await settle(() => fixture.detectChanges());
    const list = controller.expectOne((r) => r.url === `${API}/admin/newsletter/subscribers`);
    expect(list.request.params.get('status')).toBeNull();
    list.flush({
      subscribers: {
        items: [
          {
            id: 's1',
            email: 'kupac@primer.rs',
            status: 'Confirmed',
            consentedAt: '2026-11-14T10:00:00Z',
            confirmedAt: '2026-11-14T10:05:00Z',
            unsubscribedAt: null,
            createdAt: '2026-11-14T10:00:00Z',
          },
        ],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      },
      counts: { Pending: 2, Confirmed: 1, Unsubscribed: 0 },
    });
    await settle(() => fixture.detectChanges());
    const root = fixture.nativeElement as HTMLElement;
    expect(text(root.querySelector('[data-status="Pending"]'))).toBe('Čekaju potvrdu (2)');
    const cells = [...root.querySelectorAll('[data-testid="subscribers-table"] tbody tr > *')].map(
      text,
    );
    expect(cells.slice(0, 2)).toEqual(['kupac@primer.rs', 'Potvrđen']);

    root.querySelector<HTMLButtonElement>('[data-status="Pending"]')?.click();
    await settle(() => fixture.detectChanges());
    const filtered = controller.expectOne((r) => r.url === `${API}/admin/newsletter/subscribers`);
    expect(filtered.request.params.get('status')).toBe('Pending');
    filtered.flush({
      subscribers: { items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      counts: {},
    });

    root.querySelector<HTMLButtonElement>('[data-testid="export"]')?.click();
    const csv = controller.expectOne(`${API}/admin/newsletter/subscribers/export`);
    expect(csv.request.responseType).toBe('blob');
    csv.flush(new Blob(['E-adresa']), {
      headers: { 'Content-Disposition': 'attachment; filename=pretplatnici-2026-11-16.csv' },
    });
    expect(clicks).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});

const message = (id: string, readAt: string | null) => ({
  id,
  name: 'Ana',
  email: 'ana@primer.rs',
  message: 'Da li imate džem od dunja?',
  createdAt: '2026-11-16T08:00:00Z',
  readAt,
  readByAdminName: null,
});

describe('contact messages', () => {
  it('counts unread messages for the menu badge', () => {
    TestBed.configureTestingModule({ providers: providers() });
    const store = TestBed.inject(UnreadMessagesStore);
    store.start(TestBed.inject(DestroyRef));
    const controller = TestBed.inject(HttpTestingController);
    const request = controller.expectOne((r) => r.url === `${API}/admin/contact-messages`);
    expect(request.request.params.get('unreadOnly')).toBe('true');
    expect(request.request.params.get('pageSize')).toBe('1');
    request.flush({
      messages: { items: [], page: 1, pageSize: 1, totalItems: 3, totalPages: 3 },
      unreadCount: 3,
    });
    expect(store.count()).toBe(3);
  });

  it('marks a message read and the badge follows the list', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    const fixture = TestBed.createComponent(ContactMessagesPage);
    const controller = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(UnreadMessagesStore);
    await settle(() => fixture.detectChanges());
    const page = (items: unknown[], unreadCount: number) => ({
      messages: { items, page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 },
      unreadCount,
    });
    controller
      .expectOne((r) => r.url === `${API}/admin/contact-messages`)
      .flush(page([message('m1', null)], 1));
    await settle(() => fixture.detectChanges());
    expect(store.count()).toBe(1);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="message-row"]')?.getAttribute('data-unread')).toBe(
      'true',
    );
    root.querySelector<HTMLButtonElement>('[data-testid="mark-read"]')?.click();
    controller
      .expectOne({ method: 'POST', url: `${API}/admin/contact-messages/m1/read` })
      .flush(message('m1', '2026-11-16T09:00:00Z'));
    await settle(() => fixture.detectChanges());
    controller
      .expectOne((r) => r.url === `${API}/admin/contact-messages`)
      .flush(page([message('m1', '2026-11-16T09:00:00Z')], 0));
    await settle(() => fixture.detectChanges());
    expect(store.count()).toBe(0);
    expect(root.querySelector('[data-testid="mark-unread"]')).not.toBeNull();
  });
});

const user = (overrides: Partial<AdminUser>): AdminUser => ({
  id: 'u1',
  email: 'u1@primer.rs',
  fullName: 'U1',
  role: 'Owner',
  roleLabel: 'Vlasnik',
  isActive: true,
  lastLoginAt: null,
  createdAt: '2026-11-14T10:00:00Z',
  updatedAt: '2026-11-14T10:00:00Z',
  isCurrentUser: false,
  ...overrides,
});

describe('administrators', () => {
  it('refuses changing yourself and removing the last active owner', () => {
    const me = user({ id: 'me', isCurrentUser: true });
    const other = user({ id: 'o2' });
    const staff = user({ id: 's1', role: 'Staff', roleLabel: 'Urednik' });
    expect(changeBlocked(me, { role: 'Staff', isActive: true }, [me, other])).toContain(
      'Svoju ulogu',
    );
    expect(activeOwners([me, other, staff])).toBe(2);
    expect(changeBlocked(other, { role: 'Staff', isActive: true }, [me, other])).toBeNull();
    const lonely = user({ id: 'o3' });
    expect(changeBlocked(lonely, { role: 'Owner', isActive: false }, [lonely, staff])).toContain(
      'jedini aktivni vlasnik',
    );
    expect(changeBlocked(staff, { role: 'Staff', isActive: false }, [lonely, staff])).toBeNull();
    const error = (code: string) =>
      new ApiError({ status: 409, code, title: '', detail: 'server' });
    expect(adminUserErrorText(error('LAST_OWNER'))).toContain('jedini aktivni vlasnik');
    expect(adminUserErrorText(error('CANNOT_CHANGE_SELF'))).toContain('Svoju ulogu');
    expect(adminUserErrorText(error('IDENTITY_PROVIDER_ERROR'))).toContain('ništa nije sačuvano');
  });

  it('invites a person; a taken e-mail is shown under the field, a provider error as text', async () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [...providers(), { provide: MatDialogRef, useValue: { close } }],
    });
    const fixture = TestBed.createComponent(InviteDialog);
    const controller = TestBed.inject(HttpTestingController);
    await settle(() => fixture.detectChanges());
    const root = fixture.nativeElement as HTMLElement;
    expect(text(root)).toContain('privremenom lozinkom');
    const dialog = fixture.componentInstance;
    dialog.form.patchValue({ fullName: 'Jelena', email: 'jelena@primer.rs' });
    dialog.save();
    const post = controller.expectOne({ method: 'POST', url: `${API}/admin/users` });
    expect(post.request.body).toEqual({
      email: 'jelena@primer.rs',
      fullName: 'Jelena',
      role: 'Staff',
    });
    post.flush(
      { code: 'ADMIN_EMAIL_TAKEN', detail: 'x', errors: { email: ['Zauzeto.'] } },
      { status: 409, statusText: 'Conflict' },
    );
    expect(dialog.form.controls.email.errors?.['server']).toBe(
      'Administrator sa ovom e-adresom već postoji.',
    );
    dialog.form.controls.email.setValue('nova@primer.rs');
    dialog.save();
    controller
      .expectOne(`${API}/admin/users`)
      .flush({ code: 'IDENTITY_PROVIDER_ERROR', detail: 'x' }, { status: 503, statusText: 'x' });
    expect(dialog.error()).toContain('Sistem za prijavu trenutno ne odgovara');
    expect(close).not.toHaveBeenCalled();
  });
});

describe('audit log', () => {
  it('keeps filters in the URL and shows labels and changes readably', () => {
    const filters = parseAuditFilters({
      admin: '01a1d7dd-0ae1-4701-873d-3a669a0345f3',
      tip: 'Product',
      radnja: 'Product.Updated',
      od: '2026-11-15',
      do: '2026-11-01',
      page: '2',
    });
    expect(filters).toMatchObject({ from: '2026-11-01', to: '2026-11-15', page: 2 });
    expect(auditQueryParams(filters)).toMatchObject({
      tip: 'Product',
      radnja: 'Product.Updated',
      od: '2026-11-01',
      do: '2026-11-15',
      page: '2',
      pageSize: null,
    });
    expect(toAuditApiQuery({ ...filters, adminUserId: '' })).toMatchObject({
      adminUserId: undefined,
      entityType: 'Product',
      from: '2026-11-01',
    });
    expect(parseAuditFilters({ tip: '<script>', od: 'juče' })).toMatchObject({
      entityType: 'script',
      from: '',
    });
    const types = [{ value: 'Product', label: 'Proizvod' }];
    expect(actionLabel('Product.Updated', types)).toBe('Proizvod – izmena');
    expect(actionLabel('Auth.Login', types)).toBe('Prijava');
    expect(actionLabel('Expense.Created', types)).toBe('Expense – dodavanje');
    expect(
      changeRows({ name: { old: 'A', new: 'B' }, isActive: { old: true, new: false }, note: 'x' }),
    ).toEqual([
      { field: 'name', before: 'A', after: 'B' },
      { field: 'isActive', before: 'da', after: 'ne' },
      { field: 'note', before: '', after: 'x' },
    ]);
    expect(changeRows(null)).toEqual([]);
  });
});

describe('store settings logo', () => {
  const SETTINGS: AdminStoreSettings = {
    storeName: 'Zladovce',
    logoKey: 'media/logos/l1',
    logo: {
      key: 'media/logos/l1',
      baseUrl: 'http://localhost:9000/m/media/logos/l1',
      widths: [400],
      width: 400,
      height: 120,
      emailPngUrl: 'http://localhost:9000/m/media/logos/l1/email.png',
    },
    contactEmail: null,
    phone: null,
    businessAddress: null,
    shippingEnabled: true,
    shippingPrice: 0,
    freeShippingThreshold: null,
    minOrderAmount: null,
    estimatedDeliveryText: null,
    deliveryInfo: null,
    facebookUrl: null,
    instagramUrl: null,
    otherLinks: [],
    defaultSeoTitle: null,
    defaultSeoDescription: null,
    updatedAt: '2026-11-14T10:00:00Z',
    updatedByAdminId: null,
    updatedByAdminName: null,
    version: 9,
  };

  it('sends the current key to keep the logo, an upload key to replace it, null to remove it', () => {
    const fb = new FormBuilder();
    const form = createSettingsForm(fb);
    fillSettingsForm(form, fb, SETTINGS);
    expect(settingsRequest(form, 9).logoKey).toBe('media/logos/l1');
    form.controls.logoKey.setValue('uploads/logo/new.png');
    expect(settingsRequest(form, 9).logoKey).toBe('uploads/logo/new.png');
    form.controls.logoKey.setValue(null);
    expect(settingsRequest(form, 9).logoKey).toBeNull();
  });

  it('shows the logo and removes it on save', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    const fixture = TestBed.createComponent(SettingsPage);
    const controller = TestBed.inject(HttpTestingController);
    controller.expectOne(`${API}/admin/settings`).flush(SETTINGS);
    await settle(() => fixture.detectChanges());
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="logo-preview"]')?.getAttribute('src')).toBe(
      'http://localhost:9000/m/media/logos/l1/400.webp',
    );
    root.querySelector<HTMLButtonElement>('[data-testid="remove-logo"]')?.click();
    await settle(() => fixture.detectChanges());
    expect(text(root.querySelector('[data-testid="no-logo"]'))).toContain('biti uklonjen');
    fixture.componentInstance.save();
    const put = controller.expectOne({ method: 'PUT', url: `${API}/admin/settings` });
    expect(put.request.body).toMatchObject({ version: 9, logoKey: null, storeName: 'Zladovce' });
  });
});
