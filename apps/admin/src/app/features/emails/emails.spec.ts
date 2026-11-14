import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { apiErrorInterceptor, provideAppConfig } from '@zladovce/api';
import { AuthService } from '@zladovce/auth';
import { AdminEmailDetail, AdminEmailItem, AdminOrderDetail } from '@zladovce/models';
import { DeadEmailsStore } from '../../core/dead-emails';
import { BADGE_REFRESH_MS } from '../../core/polling';
import {
  deadEmailsText,
  emailErrorText,
  emailTemplateLabel,
  pluralSr,
} from '../../shared/email-labels';
import { ORDER_ID, orderDetail } from '../../testing/fixtures';
import { OrderDetailPage } from '../orders/order-detail.page';
import { RESEND_CONFIRMATION_TEXT, REVOKE_TRACKING_TEXT } from '../orders/order-emails';
import {
  emailsQueryParams,
  parseEmailsQuery,
  toEmailsApiQuery,
  toggleStatus,
} from './emails-query';
import { EmailsPage } from './emails.page';

const API = 'http://localhost:5080/api/v1';
const EMAILS_URL = `${API}/admin/emails`;
const DETAIL_URL = `${API}/admin/orders/${ORDER_ID}`;

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
    { provide: AuthService, useValue: { user: signal({ role: 'Staff' }), role: signal('Staff') } },
  ];
}

function email(overrides: Partial<AdminEmailItem> = {}): AdminEmailItem {
  return {
    id: '88888888-8888-4888-8888-888888888881',
    template: 'OrderReceived',
    status: 'Sent',
    orderId: ORDER_ID,
    orderNumber: 'ZLD-2026-000042',
    recipient: 'milica@primer.rs',
    attempts: 1,
    lastError: null,
    nextAttemptAt: '2026-11-10T09:30:00Z',
    createdAt: '2026-11-10T09:30:00Z',
    sentAt: '2026-11-10T09:30:05Z',
    isResent: false,
    ...overrides,
  };
}

const DEAD = email({
  id: '88888888-8888-4888-8888-888888888882',
  template: 'OrderShipped',
  status: 'Dead',
  attempts: 6,
  lastError: 'SocketException: Connection refused',
  sentAt: null,
  createdAt: '2026-11-11T08:00:00Z',
});
const PENDING = email({
  id: '88888888-8888-4888-8888-888888888883',
  template: 'OrderAccepted',
  status: 'Pending',
  attempts: 2,
  lastError: 'SmtpCommandException: 421 Too many connections',
  nextAttemptAt: '2026-11-11T09:30:00Z',
  sentAt: null,
});

const page = (items: AdminEmailItem[], totalItems = items.length) => ({
  items,
  page: 1,
  pageSize: 20,
  totalItems,
  totalPages: Math.ceil(totalItems / 20),
});

const overlay = () => document.querySelector('.cdk-overlay-container') as HTMLElement;

afterEach(() => {
  document
    .querySelectorAll('.cdk-overlay-container')
    .forEach((element) => (element.innerHTML = ''));
});

describe('email labels', () => {
  it('names templates, marks resent emails and words failures plainly', () => {
    expect(emailTemplateLabel(email())).toBe('Porudžbina primljena');
    expect(emailTemplateLabel(email({ template: 'OrderPreparing', isResent: true }))).toBe(
      'Porudžbina se priprema (ponovo poslato)',
    );
    expect(emailErrorText('SocketException: Connection refused')).toBe(
      'Server za slanje e-pošte nije bio dostupan.',
    );
    expect(emailErrorText('TimeoutException: The operation has timed out.')).toBe(
      'Servis za slanje e-pošte nije odgovorio na vreme.',
    );
    expect(emailErrorText('SmtpCommandException: 550 5.1.1 [primalac]: mailbox unavailable')).toBe(
      'Adresa primaoca je odbijena. Proverite e-adresu kupca.',
    );
    expect(emailErrorText('SES TooManyRequestsException')).toBe(
      'Servis za slanje e-pošte je privremeno ograničio slanje.',
    );
    expect(emailErrorText('Something odd')).toBe('Slanje nije uspelo.');
    expect(emailErrorText(null)).toBe('');
    expect([1, 2, 5, 11, 21, 22].map((n) => pluralSr(n, 'a', 'b', 'c'))).toEqual([
      'a',
      'b',
      'c',
      'c',
      'a',
      'b',
    ]);
    expect(deadEmailsText(1)).toBe('1 neposlata e-poruka');
    expect(deadEmailsText(12)).toBe('12 neposlatih e-poruka');
  });
});

describe('E-poruke query ↔ URL', () => {
  it('defaults to the emails that need attention and keeps every filter in the URL', () => {
    const empty = parseEmailsQuery({});
    expect(empty).toEqual({ statuses: ['Pending', 'Dead'], orderId: '', page: 1, pageSize: 20 });
    expect(toEmailsApiQuery(empty).status).toEqual(['Pending', 'Dead']);
    expect(emailsQueryParams(empty)).toEqual({
      status: null,
      orderId: null,
      page: null,
      pageSize: null,
    });

    const query = parseEmailsQuery({
      status: 'Sent,Dead,Bogus,Sent',
      orderId: ORDER_ID,
      page: '3',
      pageSize: '50',
    });
    expect(query).toEqual({ statuses: ['Sent', 'Dead'], orderId: ORDER_ID, page: 3, pageSize: 50 });
    expect(emailsQueryParams(query)).toEqual({
      status: 'Sent,Dead',
      orderId: ORDER_ID,
      page: '3',
      pageSize: '50',
    });
    expect(parseEmailsQuery({ status: 'all' }).statuses).toEqual([]);
    expect(emailsQueryParams({ ...empty, statuses: [] })['status']).toBe('all');
    expect(toEmailsApiQuery({ ...empty, statuses: [] }).status).toEqual([]);
    expect(parseEmailsQuery({ status: 'nonsense', orderId: 'x' })).toEqual(empty);
    expect(parseEmailsQuery({ status: 'Dead,Pending' }).statuses).toEqual(['Pending', 'Dead']);
    expect(toggleStatus(['Pending', 'Dead'], 'Pending')).toEqual(['Dead']);
    expect(toggleStatus(['Dead'], 'Sent')).toEqual(['Sent', 'Dead']);
  });
});

describe('EmailsPage', () => {
  async function openList(url = '/e-poruke') {
    TestBed.configureTestingModule({
      providers: [
        ...providers(),
        provideRouter([
          { path: 'e-poruke', component: EmailsPage },
          { path: 'porudzbine/:id', children: [] },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create(url);
    const http = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    const root = harness.routeNativeElement as HTMLElement;
    const render = () => settle(() => harness.detectChanges(), 8);
    const lists = () => http.match((r) => r.url === EMAILS_URL);
    return { harness, http, router, root, render, lists };
  }

  it('lists the emails needing attention with order link, attempts and plain error words', async () => {
    const ctx = await openList();
    const [request] = ctx.lists();
    expect(request!.request.params.get('status')).toBe('Pending,Dead');
    request!.flush(page([DEAD, PENDING]));
    await ctx.render();

    const rows = [...ctx.root.querySelectorAll('[data-testid="email-row"]')];
    expect(rows.length).toBe(2);
    expect(text(rows[0])).toContain('Porudžbina poslata');
    expect(text(rows[0]?.querySelector('[data-testid="email-status"]'))).toBe('Neuspešno');
    expect(rows[0]?.querySelector('[data-testid="email-order"]')?.getAttribute('href')).toBe(
      `/porudzbine/${ORDER_ID}`,
    );
    expect(text(rows[0])).toContain('milica@primer.rs');
    expect(text(rows[0]?.querySelector('[data-testid="email-attempts"]'))).toBe('6');
    expect(text(rows[0]?.querySelector('[data-testid="email-error"]'))).toBe(
      'Server za slanje e-pošte nije bio dostupan.',
    );
    expect(text(rows[1]?.querySelector('[data-testid="email-status"]'))).toBe('Čeka slanje');
    expect(text(rows[1]?.querySelector('[data-testid="email-error"]'))).toContain(
      'Novi pokušaj 11.11.2026. 10:30',
    );
    // Retry only for Dead.
    expect(rows[0]?.querySelector('[data-testid="email-retry"]')).not.toBeNull();
    expect(rows[1]?.querySelector('[data-testid="email-retry"]')).toBeNull();
    const pressed = [
      ...ctx.root.querySelectorAll('[data-testid="status-filter"] [aria-pressed="true"]'),
    ];
    expect(pressed.map((b) => b.getAttribute('data-status'))).toEqual(['Pending', 'Dead']);
  });

  it('keeps the status filter in the URL and loads what the URL says', async () => {
    const ctx = await openList('/e-poruke?status=Sent');
    const sent = ctx.lists();
    expect(sent.length).toBe(1);
    expect(sent[0]!.request.params.get('status')).toBe('Sent');
    sent[0]!.flush(page([email()]));
    await ctx.render();
    expect(text(ctx.root.querySelector('[data-testid="email-status"]'))).toBe('Poslato');

    ctx.root.querySelector<HTMLButtonElement>('[data-status="Dead"]')!.click();
    await ctx.render();
    expect(ctx.router.url).toBe('/e-poruke?status=Sent,Dead');
    const sentDead = ctx.lists();
    expect(sentDead[0]!.request.params.get('status')).toBe('Sent,Dead');
    sentDead.forEach((r) => r.flush(page([])));
    await ctx.render();
    expect(text(ctx.root)).toContain('Nema e-poruka za ovaj filter');

    ctx.root.querySelector<HTMLButtonElement>('[data-status="all"]')!.click();
    await ctx.render();
    expect(ctx.router.url).toBe('/e-poruke?status=all');
    const all = ctx.lists();
    expect(all[0]!.request.params.has('status')).toBe(false);
    all.forEach((r) => r.flush(page([])));
    await ctx.render();

    ctx.root.querySelector<HTMLButtonElement>('[data-testid="default-filter"]')!.click();
    await ctx.render();
    expect(ctx.router.url).toBe('/e-poruke');
    ctx.lists().forEach((r) => r.flush(page([])));
    await ctx.render();
    expect(text(ctx.root)).toContain('Sve e-poruke su poslate');
  });

  it('opens the attempt log from a row and retries a Dead email from the dialog', async () => {
    const ctx = await openList();
    ctx.lists()[0]!.flush(page([DEAD]));
    await ctx.render();
    ctx.root.querySelector<HTMLButtonElement>('[data-testid="email-details"]')!.click();
    await ctx.render();
    const detail: AdminEmailDetail = {
      email: DEAD,
      attemptLog: [
        {
          attemptNumber: 1,
          succeeded: false,
          providerMessageId: null,
          error: 'SocketException: Connection refused',
          createdAt: '2026-11-11T08:00:05Z',
        },
        {
          attemptNumber: 2,
          succeeded: false,
          providerMessageId: null,
          error: 'TimeoutException: timed out',
          createdAt: '2026-11-11T08:01:05Z',
        },
      ],
    };
    ctx.http.expectOne(`${EMAILS_URL}/${DEAD.id}`).flush(detail);
    await ctx.render();
    const attempts = [...overlay().querySelectorAll('[data-testid="attempt"]')];
    expect(attempts.length).toBe(2);
    expect(text(attempts[0])).toContain('Pokušaj 1');
    expect(text(attempts[0])).toContain('Neuspešno');
    expect(text(attempts[0])).toContain('11.11.2026. 09:00');
    expect(text(attempts[1])).toContain('nije odgovorio na vreme');
    expect(text(overlay().querySelector('[data-testid="email-error"]'))).toContain(
      'Connection refused',
    );

    overlay().querySelector<HTMLButtonElement>('[data-testid="dialog-retry"]')!.click();
    await ctx.render();
    ctx.http.expectOne(`${EMAILS_URL}/${DEAD.id}/retry`).flush({ ...DEAD, status: 'Pending' });
    await ctx.render();
    // List and badge are loaded again.
    const reloads = ctx.lists();
    expect(reloads.some((r) => r.request.params.get('status') === 'Dead')).toBe(true);
    expect(reloads.some((r) => r.request.params.get('status') === 'Pending,Dead')).toBe(true);
  });

  it('retries from the row and explains EMAIL_NOT_RETRYABLE', async () => {
    const ctx = await openList();
    ctx.lists()[0]!.flush(page([DEAD]));
    await ctx.render();
    ctx.root.querySelector<HTMLButtonElement>('[data-testid="email-retry"]')!.click();
    await ctx.render();
    ctx.http
      .expectOne(`${EMAILS_URL}/${DEAD.id}/retry`)
      .flush(
        { code: 'EMAIL_NOT_RETRYABLE', title: 'Sukob', detail: 'x', status: 409 },
        { status: 409, statusText: 'Conflict' },
      );
    await ctx.render();
    expect(text(overlay())).toContain('Ova e-poruka više nije neuspešna');
    expect(ctx.lists().length).toBeGreaterThan(0);
  });
});

describe('DeadEmailsStore', () => {
  it('refreshes every minute with the shared poller and never sends two requests at once', async () => {
    vi.useFakeTimers();
    try {
      TestBed.configureTestingModule({ providers: [...providers(), provideRouter([])] });
      const store = TestBed.inject(DeadEmailsStore);
      const http = TestBed.inject(HttpTestingController);
      const destroy: (() => void)[] = [];
      const dead = () =>
        http.match((r) => r.url === EMAILS_URL && r.params.get('status') === 'Dead');
      store.start({ onDestroy: (fn: () => void) => destroy.push(fn) } as never);
      const first = dead();
      expect(first.length).toBe(1);
      store.refresh(true);
      expect(dead().length).toBe(0);
      first[0]!.flush(page([], 2));
      // The refresh asked for meanwhile follows right after.
      const second = dead();
      expect(second.length).toBe(1);
      second[0]!.flush(page([], 2));
      expect(store.count()).toBe(2);

      await vi.advanceTimersByTimeAsync(BADGE_REFRESH_MS);
      dead()[0]!.flush(page([], 0));
      expect(store.count()).toBe(0);
      expect(store.hasDead()).toBe(false);

      // A failed refresh keeps the last number.
      await vi.advanceTimersByTimeAsync(BADGE_REFRESH_MS);
      dead()[0]!.error(new ProgressEvent('error'));
      expect(store.count()).toBe(0);

      destroy.forEach((fn) => fn());
      await vi.advanceTimersByTimeAsync(BADGE_REFRESH_MS);
      expect(dead().length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('order detail – E-poruke', () => {
  async function openDetail(detail: AdminOrderDetail) {
    TestBed.configureTestingModule({
      providers: [
        ...providers(),
        provideRouter(
          [
            { path: 'porudzbine/:id', component: OrderDetailPage },
            { path: 'porudzbine', children: [] },
            { path: 'e-poruke', children: [] },
          ],
          withComponentInputBinding(),
        ),
      ],
    });
    const harness = await RouterTestingHarness.create(`/porudzbine/${ORDER_ID}`);
    const http = TestBed.inject(HttpTestingController);
    const root = harness.routeNativeElement as HTMLElement;
    const render = () => settle(() => harness.detectChanges(), 12);
    http.expectOne(DETAIL_URL).flush(detail);
    await render();
    const card = () => root.querySelector('[data-testid="order-emails"]') as HTMLElement;
    return { http, root, render, card };
  }

  const withEmails = () =>
    orderDetail({
      emails: [
        email(),
        PENDING,
        DEAD,
        email({ id: 'resent-1', isResent: true, sentAt: null, status: 'Processing' }),
      ],
    });

  it('lists the emails with status, attempts, plain errors and retry only for Dead', async () => {
    const ctx = await openDetail(withEmails());
    const rows = [...ctx.card().querySelectorAll('[data-testid="order-email"]')];
    expect(
      rows.map((row) => text(row.querySelector('[data-testid="order-email-status"]'))),
    ).toEqual(['Poslato', 'Čeka slanje', 'Neuspešno', 'Šalje se']);
    expect(text(rows[0])).toContain('Vreme slanja: 10.11.2026. 10:30');
    expect(text(rows[0])).toContain('pokušaja: 1');
    expect(text(rows[1]?.querySelector('[data-testid="order-email-error"]'))).toContain(
      'privremeno ograničio slanje',
    );
    expect(text(rows[2]?.querySelector('[data-testid="order-email-error"]'))).toContain(
      'Svi automatski pokušaji su iskorišćeni',
    );
    expect(text(rows[3])).toContain('Porudžbina primljena (ponovo poslato)');
    const retries = ctx.card().querySelectorAll('[data-testid="order-email-retry"]');
    expect(retries.length).toBe(1);
    expect(retries[0]?.closest('[data-testid="order-email"]')?.getAttribute('data-status')).toBe(
      'Dead',
    );
    expect(
      ctx.card().querySelector('[data-testid="order-emails-link"]')?.getAttribute('href'),
    ).toBe(`/e-poruke?status=all&orderId=${ORDER_ID}`);

    (retries[0] as HTMLButtonElement).click();
    await ctx.render();
    ctx.http.expectOne(`${EMAILS_URL}/${DEAD.id}/retry`).flush({ ...DEAD, status: 'Pending' });
    await ctx.render();
    // The order is loaded again.
    ctx.http.expectOne(DETAIL_URL).flush(orderDetail({ emails: [email()] }));
    await ctx.render();
    expect(ctx.card().querySelectorAll('[data-testid="order-email"]').length).toBe(1);
  });

  it('explains an order without emails', async () => {
    const ctx = await openDetail(orderDetail());
    expect(text(ctx.card())).toContain('Za ovu porudžbinu još nema e-poruka');
  });

  it('resends the confirmation only after the confirmation dialog, then reloads the order', async () => {
    const ctx = await openDetail(withEmails());
    ctx.card().querySelector<HTMLButtonElement>('[data-testid="resend-confirmation"]')!.click();
    await ctx.render();
    const dialog = text(overlay());
    expect(dialog).toContain('Poslati potvrdu ponovo?');
    expect(dialog).toContain(RESEND_CONFIRMATION_TEXT[0]!);
    expect(dialog).toContain('Raniji kodovi i dalje rade');
    ctx.http.expectNone(`${DETAIL_URL}/emails/resend-confirmation`);

    // Cancelling sends nothing.
    overlay()
      .querySelector<HTMLButtonElement>('mat-dialog-actions button:not([data-testid])')!
      .click();
    await ctx.render();
    ctx.http.expectNone(`${DETAIL_URL}/emails/resend-confirmation`);

    ctx.card().querySelector<HTMLButtonElement>('[data-testid="resend-confirmation"]')!.click();
    await ctx.render();
    overlay().querySelector<HTMLButtonElement>('[data-testid="confirm"]')!.click();
    await ctx.render();
    const request = ctx.http.expectOne(`${DETAIL_URL}/emails/resend-confirmation`);
    expect(request.request.method).toBe('POST');
    request.flush(email({ id: 'resent-2', status: 'Pending', isResent: true, sentAt: null }));
    await ctx.render();
    ctx.http.expectOne(DETAIL_URL).flush(withEmails());
    await ctx.render();
    expect(text(overlay())).toContain('Potvrda sa novim kodom za praćenje je u redu za slanje');
  });

  it('revokes the tracking codes behind a clear warning and suggests resending', async () => {
    const ctx = await openDetail(withEmails());
    ctx.card().querySelector<HTMLButtonElement>('[data-testid="revoke-tracking"]')!.click();
    await ctx.render();
    const dialog = text(overlay());
    expect(dialog).toContain('Poništiti kodove za praćenje?');
    expect(dialog).toContain(REVOKE_TRACKING_TEXT[0]!);
    expect(dialog).toContain('Kupac više neće moći da prati porudžbinu starim kodom');
    expect(
      overlay().querySelector('[data-testid="confirm"]')?.classList.contains('danger-button'),
    ).toBe(true);
    overlay().querySelector<HTMLButtonElement>('[data-testid="confirm"]')!.click();
    await ctx.render();
    ctx.http.expectOne(`${DETAIL_URL}/tracking/revoke`).flush({ revokedCount: 3 });
    await ctx.render();
    ctx.http.expectOne(DETAIL_URL).flush(withEmails());
    await ctx.render();
    const notice = ctx.card().querySelector('[data-testid="revoked-notice"]');
    expect(text(notice)).toContain('Kodovi za praćenje su poništeni (3)');
    expect(text(notice)).toContain('pošaljite potvrdu ponovo');
  });
});
