import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { apiErrorInterceptor, provideAppConfig } from '@zladovce/api';
import { InventoryItem } from '@zladovce/models';
import { INVENTORY_ITEM } from '../../testing/fixtures';
import { AdjustStockDialog, resultingStock } from './adjust-stock.dialog';
import { inventoryQueryParams, parseInventoryQuery } from './inventory-query';
import { InventoryPage } from './inventory.page';
import { formatDelta } from './movements.dialog';

const API = 'http://localhost:5080/api/v1';

const text = (element: Element | null | undefined): string =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

function baseProviders() {
  return [
    provideAppConfig({ apiBaseUrl: API, healthUrl: 'http://localhost:5080/health' }),
    provideHttpClient(withInterceptors([apiErrorInterceptor])),
    provideHttpClientTesting(),
  ];
}

describe('resultingStock', () => {
  it('adds or removes whole pieces', () => {
    expect(resultingStock(12, 'add', 5)).toBe(17);
    expect(resultingStock(12, 'remove', 5)).toBe(7);
    expect(resultingStock(3, 'remove', 5)).toBe(-2);
    expect(resultingStock(12, 'add', null)).toBeNull();
    expect(resultingStock(12, 'add', 0)).toBeNull();
    expect(resultingStock(12, 'add', 1.5)).toBeNull();
    expect(formatDelta(5)).toBe('+5');
    expect(formatDelta(-3)).toBe('−3');
  });
});

describe('AdjustStockDialog', () => {
  async function openDialog(item: InventoryItem = INVENTORY_ITEM) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        ...baseProviders(),
        { provide: MAT_DIALOG_DATA, useValue: item },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(AdjustStockDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const render = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const input = (testId: string, value: string) => {
      const el = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[data-testid="${testId}"]`,
      );
      if (!el) throw new Error(testId);
      el.value = value;
      el.dispatchEvent(new Event('input'));
    };
    const click = (testId: string) =>
      root
        .querySelector<HTMLElement>(
          `[data-testid="${testId}"] button, button[data-testid="${testId}"]`,
        )
        ?.click();
    return {
      fixture,
      root,
      render,
      input,
      click,
      close,
      controller: TestBed.inject(HttpTestingController),
    };
  }

  it('shows the resulting stock before confirming, for + and −', async () => {
    const d = await openDialog();
    expect(text(d.root.querySelector('[data-testid="current"]'))).toBe('Trenutno na stanju: 12');
    expect(text(d.root.querySelector('[data-testid="preview"]'))).toContain('Unesite količinu');

    d.input('amount', '5');
    await d.render();
    expect(text(d.root.querySelector('[data-testid="preview"]'))).toBe('Novo stanje: 12 + 5 = 17');

    d.click('remove');
    await d.render();
    expect(text(d.root.querySelector('[data-testid="preview"]'))).toBe('Novo stanje: 12 − 5 = 7');

    d.input('amount', '20');
    await d.render();
    expect(text(d.root.querySelector('[data-testid="preview"]'))).toContain(
      'Ne možete skinuti više nego što ima na stanju (12)',
    );
  });

  it('requires a reason and offers quick reasons', async () => {
    const d = await openDialog();
    d.input('amount', '3');
    d.root.querySelector('form')?.dispatchEvent(new Event('submit'));
    await d.render();
    expect([...d.root.querySelectorAll('mat-error')].map(text)).toEqual([
      'Upišite razlog promene.',
    ]);
    d.controller.expectNone(() => true);

    d.input('reason', '   ');
    d.root.querySelector('form')?.dispatchEvent(new Event('submit'));
    await d.render();
    expect([...d.root.querySelectorAll('mat-error')].map(text)).toEqual([
      'Upišite razlog promene.',
    ]);

    const quick = [...d.root.querySelectorAll('button')].find(
      (b) => text(b) === 'Nova proizvodnja',
    );
    quick?.click();
    await d.render();
    expect(d.root.querySelector<HTMLTextAreaElement>('[data-testid="reason"]')?.value).toBe(
      'Nova proizvodnja',
    );
    expect(d.root.querySelectorAll('mat-error').length).toBe(0);
  });

  it('sends a positive or negative delta with the reason and closes with the updated row', async () => {
    const d = await openDialog();
    d.click('remove');
    d.input('amount', '4');
    d.input('reason', 'Oštećeno pri transportu');
    await d.render();
    d.root.querySelector('form')?.dispatchEvent(new Event('submit'));
    await d.render();
    const request = d.controller.expectOne(
      `${API}/admin/inventory/${INVENTORY_ITEM.variantId}/adjustments`,
    );
    expect(request.request.body).toEqual({ quantityDelta: -4, reason: 'Oštećeno pri transportu' });
    const updated = { ...INVENTORY_ITEM, quantityOnHand: 8 };
    request.flush(updated);
    await d.render();
    expect(d.close).toHaveBeenCalledWith(updated);
  });

  it('shows INSUFFICIENT_STOCK from the server and stays open', async () => {
    const d = await openDialog();
    d.click('remove');
    d.input('amount', '10');
    d.input('reason', 'Popis');
    await d.render();
    d.root.querySelector('form')?.dispatchEvent(new Event('submit'));
    await d.render();
    d.controller.expectOne(`${API}/admin/inventory/${INVENTORY_ITEM.variantId}/adjustments`).flush(
      {
        title: 'Nedovoljno',
        status: 409,
        code: 'INSUFFICIENT_STOCK',
        detail: 'Na stanju je samo 2 komada.',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await d.render();
    expect(text(d.root.querySelector('[role="alert"]'))).toBe('Na stanju je samo 2 komada.');
    expect(d.close).not.toHaveBeenCalled();
  });
});

describe('inventory query ↔ URL', () => {
  it('parses and writes filters, leaving defaults out', () => {
    const query = parseInventoryQuery({ q: ' dzem ', status: 'low', sort: 'stockAsc', page: '2' });
    expect(query).toEqual({ q: 'dzem', status: 'low', sort: 'stockAsc', page: 2, pageSize: 20 });
    expect(inventoryQueryParams(query)).toEqual({
      q: 'dzem',
      status: 'low',
      sort: 'stockAsc',
      page: '2',
      pageSize: null,
    });
    expect(parseInventoryQuery({ status: 'bad', sort: 'x', pageSize: '7' })).toEqual({
      q: '',
      status: undefined,
      sort: 'product',
      page: 1,
      pageSize: 20,
    });
  });

  it('reads the "low or out" filter however the statuses are written, and writes it as low,out', () => {
    for (const status of ['low,out', 'out,low', ['low', 'out'], ['out,low'], 'low, out']) {
      expect(parseInventoryQuery({ status }).status).toBe('low,out');
    }
    expect(parseInventoryQuery({ status: 'low,ok' }).status).toBeUndefined();
    expect(parseInventoryQuery({ status: ['low', 'low'] }).status).toBe('low');
    expect(inventoryQueryParams(parseInventoryQuery({ status: 'out,low' }))['status']).toBe(
      'low,out',
    );
  });
});

describe('InventoryPage', () => {
  async function openPage(url: string) {
    TestBed.configureTestingModule({
      providers: [
        ...baseProviders(),
        provideRouter([{ path: 'zalihe', component: InventoryPage }]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, InventoryPage);
    const render = async () => {
      for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve));
        harness.detectChanges();
        await harness.fixture.whenStable();
      }
    };
    return { harness, render, controller: TestBed.inject(HttpTestingController) };
  }

  it('loads with the filters from the URL and writes filter changes back to the URL', async () => {
    const { harness, render, controller } = await openPage('/zalihe?status=low&page=2');
    const first = controller.expectOne((r) => r.url === `${API}/admin/inventory`);
    expect(first.request.params.toString()).toBe('status=low&sort=product&page=2&pageSize=20');
    first.flush({ items: [INVENTORY_ITEM], page: 2, pageSize: 20, totalItems: 21, totalPages: 2 });
    await render();
    const root = harness.routeNativeElement as HTMLElement;
    expect(root.querySelectorAll('[data-testid="inventory-row"]').length).toBe(1);
    expect(text(root.querySelector('[data-testid="quantity"]'))).toBe('12');

    const page = harness.routeDebugElement?.componentInstance as InventoryPage;
    page.update({ status: 'out' });
    await render();
    expect(TestBed.inject(Router).url).toBe('/zalihe?status=out');
    const second = controller.expectOne((r) => r.url === `${API}/admin/inventory`);
    expect(second.request.params.get('status')).toBe('out');
    expect(second.request.params.get('page')).toBe('1');
    second.flush({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    await render();
    expect(text(root)).toContain('Nema pakovanja za izabrane filtere');
  });

  it('opens the dashboard link (status=low,out) and asks the API for both statuses', async () => {
    const { harness, render, controller } = await openPage('/zalihe?status=low,out');
    const request = controller.expectOne((r) => r.url === `${API}/admin/inventory`);
    expect(request.request.params.get('status')).toBe('low,out');
    request.flush({ items: [INVENTORY_ITEM], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
    await render();
    const page = harness.routeDebugElement?.componentInstance as InventoryPage;
    expect(page.query().status).toBe('low,out');
    page.update({ status: undefined });
    await render();
    expect(TestBed.inject(Router).url).toBe('/zalihe');
    controller
      .expectOne((r) => r.url === `${API}/admin/inventory`)
      .flush({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    await render();
  });

  it('shows an error state with a working retry', async () => {
    const { harness, render, controller } = await openPage('/zalihe');
    controller
      .expectOne((r) => r.url === `${API}/admin/inventory`)
      .error(new ProgressEvent('error'));
    await render();
    const root = harness.routeNativeElement as HTMLElement;
    expect(text(root)).toContain('Zalihe nisu učitane');
    [...root.querySelectorAll('button')].find((b) => text(b) === 'Pokušaj ponovo')?.click();
    await render();
    controller
      .expectOne((r) => r.url === `${API}/admin/inventory`)
      .flush({ items: [INVENTORY_ITEM], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
    await render();
    expect(root.querySelectorAll('[data-testid="inventory-row"]').length).toBe(1);
  });
});
