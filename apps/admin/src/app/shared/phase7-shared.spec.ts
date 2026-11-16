import {
  HttpHandlerFn,
  HttpRequest,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { apiErrorInterceptor, provideAppConfig } from '@zladovce/api';
import { RevenuePoint } from '@zladovce/models';
import { fileNameFromDisposition, FileDownloadService } from '../data/file-download';
import { BarList } from './charts/bar-list';
import {
  axisNumber,
  bucketLongLabel,
  bucketShortLabel,
  labelIndexes,
  niceTicks,
  toTimeChart,
  trend,
} from './charts/chart-data';
import { TimeChart } from './charts/time-chart';
import {
  isValidCustomRange,
  parsePeriodQuery,
  periodApiParams,
  periodQueryParams,
  rangeText,
} from './period';
import { periodFromRoute } from './period-route';
import { PeriodSelector } from './period-selector';
import { isMediaImageSrc, sanitizeRichText } from './rich-text';
import { RichTextEditor } from './rich-text-editor';
import { belgradeInstant } from './serbian-dates';

const API = 'http://localhost:5080/api/v1';
const MEDIA = 'http://localhost:9000/zladovce-media/media/blog/abc';

const text = (element: Element | null | undefined): string =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function settle(detect: () => void, rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    detect();
  }
}

describe('period query', () => {
  it('reads presets and custom ranges from the URL and falls back to the last 30 days', () => {
    expect(parsePeriodQuery({})).toEqual({ period: 'last30', from: '', to: '' });
    expect(parsePeriodQuery({ period: 'yesterday' })).toEqual({
      period: 'yesterday',
      from: '',
      to: '',
    });
    expect(parsePeriodQuery({ period: 'nesto' }).period).toBe('last30');
    expect(parsePeriodQuery({ period: 'custom', from: '2026-11-14', to: '2026-11-14' })).toEqual({
      period: 'custom',
      from: '2026-11-14',
      to: '2026-11-14',
    });
    // Reversed, invalid or too long ranges are not used.
    expect(
      parsePeriodQuery({ period: 'custom', from: '2026-11-15', to: '2026-11-14' }).period,
    ).toBe('last30');
    expect(
      parsePeriodQuery({ period: 'custom', from: '2026-02-30', to: '2026-03-01' }).period,
    ).toBe('last30');
    expect(isValidCustomRange('2020-01-01', '2026-01-01')).toBe(false);
  });

  it('writes short URLs and the API parameters', () => {
    expect(periodQueryParams({ period: 'last30', from: '', to: '' })).toEqual({
      period: null,
      from: null,
      to: null,
    });
    expect(periodQueryParams({ period: 'thisYear', from: 'x', to: 'y' })).toEqual({
      period: 'thisYear',
      from: null,
      to: null,
    });
    expect(periodQueryParams({ period: 'custom', from: '2026-11-01', to: '2026-11-14' })).toEqual({
      period: 'custom',
      from: '2026-11-01',
      to: '2026-11-14',
    });
    expect(periodApiParams({ period: 'last7', from: '', to: '' })).toEqual({ period: 'last7' });
    expect(periodApiParams({ period: 'custom', from: '2026-11-14', to: '2026-11-14' })).toEqual({
      period: 'custom',
      from: '2026-11-14',
      to: '2026-11-14',
    });
    expect(rangeText({ from: '2026-11-01', to: '2026-11-15' })).toBe('01.11.2026. – 15.11.2026.');
    expect(rangeText({ from: '2026-11-14', to: '2026-11-14' })).toBe('14.11.2026.');
  });
});

@Component({
  selector: 'adm-period-host',
  imports: [PeriodSelector],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<adm-period-selector [value]="period.value()" (changed)="period.set($event)" />
    <p data-testid="current">{{ period.value().period }} {{ period.value().from }}</p>`,
})
class PeriodHost {
  readonly period = periodFromRoute();
}

describe('period selector and the URL', () => {
  it('shows the period from the URL and puts a new choice into the URL', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'izvestaji', component: PeriodHost }])],
    });
    const harness = await RouterTestingHarness.create('/izvestaji?period=last7&tab=x');
    const root = harness.routeNativeElement as HTMLElement;
    const pressed = () =>
      root.querySelector('[aria-pressed="true"]')?.getAttribute('data-period') ?? '';
    expect(pressed()).toBe('last7');

    root.querySelector<HTMLButtonElement>('[data-period="yesterday"]')?.click();
    await harness.fixture.whenStable();
    const router = TestBed.inject(Router);
    expect(router.url).toBe('/izvestaji?period=yesterday&tab=x');
    harness.detectChanges();
    expect(pressed()).toBe('yesterday');
    expect(text(root.querySelector('[data-testid="current"]'))).toBe('yesterday');

    // Back to the default: the parameter disappears.
    root.querySelector<HTMLButtonElement>('[data-period="last30"]')?.click();
    await harness.fixture.whenStable();
    expect(router.url).toBe('/izvestaji?tab=x');

    // Custom range: dates first, then "Prikaži".
    await harness.navigateByUrl('/izvestaji?period=custom&from=2026-11-14&to=2026-11-14');
    harness.detectChanges();
    expect(pressed()).toBe('custom');
    expect(root.querySelector('[data-testid="custom-range"]')).not.toBeNull();
    root.querySelector('form')?.dispatchEvent(new Event('submit'));
    await harness.fixture.whenStable();
    expect(router.url).toBe('/izvestaji?period=custom&from=2026-11-14&to=2026-11-14');
  });

  it('refuses an incomplete custom range with a message', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PeriodSelector);
    fixture.componentRef.setInput('value', { period: 'last30', from: '', to: '' });
    const emitted: unknown[] = [];
    fixture.componentInstance.changed.subscribe((value) => emitted.push(value));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-period="custom"]')?.click();
    fixture.detectChanges();
    fixture.componentInstance.applyCustom();
    fixture.detectChanges();
    expect(emitted).toEqual([]);
    expect(text(root.querySelector('[role="alert"]'))).toContain('Izaberite datum');
  });
});

const point = (from: string, to: string, ordered: number, delivered: number): RevenuePoint => ({
  from,
  to,
  label: from,
  orderedValue: ordered,
  deliveredValue: delivered,
});

describe('chart data', () => {
  it('keeps every (zero-filled) day in order', () => {
    const data = toTimeChart(
      [
        point('2026-11-15', '2026-11-15', 0, 0),
        point('2026-11-13', '2026-11-13', 0, 0),
        point('2026-11-14', '2026-11-14', 3350, 3350),
      ],
      'Day',
      [
        { key: 'orderedValue', label: 'Poručeno', color: '#000' },
        { key: 'deliveredValue', label: 'Isporučeno', color: '#111' },
      ],
    );
    expect(data.labels).toEqual(['13.11.', '14.11.', '15.11.']);
    expect(data.longLabels).toEqual(['13.11.2026.', '14.11.2026.', '15.11.2026.']);
    expect(data.series.map((s) => s.values)).toEqual([
      [0, 3350, 0],
      [0, 3350, 0],
    ]);
  });

  it('labels months and notes months cut by the period', () => {
    expect(bucketShortLabel('2026-11-01', 'Month')).toBe('nov 2026.');
    expect(bucketLongLabel('2026-10-01', '2026-10-31', 'Month')).toBe('oktobar 2026.');
    expect(bucketLongLabel('2026-11-01', '2026-11-15', 'Month')).toBe('novembar 2026. (1.–15.)');
    const data = toTimeChart(
      [point('2026-01-01', '2026-01-31', 0, 0), point('2026-02-01', '2026-02-28', 1200.5, 0)],
      'Month',
      [{ key: 'orderedValue', label: 'Poručeno', color: '#000' }],
    );
    expect(data.labels).toEqual(['jan 2026.', 'feb 2026.']);
    expect(data.series[0]?.values).toEqual([0, 1200.5]);
  });

  it('computes round axis steps, compact axis numbers and visible x labels', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(3350)).toEqual([0, 1000, 2000, 3000, 4000]);
    expect(niceTicks(2, 4, true)).toEqual([0, 1, 2]);
    expect(axisNumber(2000)).toBe('2.000');
    expect(axisNumber(25000)).toBe('25 hilj.');
    expect(labelIndexes(3, 6)).toEqual([0, 1, 2]);
    const many = labelIndexes(30, 6);
    expect(many[0]).toBe(0);
    expect(many.at(-1)).toBe(29);
    expect(many.length).toBeLessThanOrEqual(7);
  });

  it('describes the change against the previous period', () => {
    expect(trend(1100, 1000)).toEqual({ direction: 'up', percent: 10, text: '+10%', tone: 'good' });
    expect(trend(900, 1000).text).toBe('−10%');
    expect(trend(900, 1000).tone).toBe('bad');
    expect(trend(1200, 1000, false).tone).toBe('bad');
    expect(trend(0, 0)).toMatchObject({ direction: 'flat', text: 'bez promene', tone: 'neutral' });
    expect(trend(3350, 0)).toMatchObject({ direction: 'new', percent: null, tone: 'good' });
    expect(trend(1001, 1000).text).toBe('+<1%');
  });
});

describe('time chart', () => {
  it('draws the series, shows a tooltip from the keyboard and offers a table', async () => {
    const fixture = TestBed.createComponent(TimeChart);
    fixture.componentRef.setInput(
      'data',
      toTimeChart(
        [point('2026-11-13', '2026-11-13', 0, 0), point('2026-11-14', '2026-11-14', 3350, 1200)],
        'Day',
        [
          { key: 'orderedValue', label: 'Poručeno', color: '#000' },
          { key: 'deliveredValue', label: 'Isporučeno', color: '#111' },
        ],
      ),
    );
    fixture.componentRef.setInput('label', 'Prihod');
    await settle(() => fixture.detectChanges());
    const root = fixture.nativeElement as HTMLElement;
    const chart = root.querySelector<HTMLElement>('[data-testid="chart"]');
    expect(chart?.getAttribute('role')).toBe('img');
    expect(chart?.getAttribute('aria-label')?.replace(/\s/g, ' ')).toContain(
      'Poručeno: ukupno 3.350 RSD',
    );
    expect(root.querySelectorAll('path[fill="none"]')).toHaveLength(2);
    expect(text(root.querySelector('[data-testid="legend"]'))).toBe('Poručeno Isporučeno');

    chart?.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    const tooltip = () =>
      (root.querySelector('[data-testid="chart-tooltip"]')?.textContent ?? '').replace(/\s/g, '');
    expect(tooltip()).toContain('14.11.2026.');
    expect(tooltip()).toContain('3.350RSDPoručeno');
    expect(tooltip()).toContain('1.200RSDIsporučeno');
    chart?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    fixture.detectChanges();
    expect(tooltip()).toContain('13.11.2026.');
    expect(tooltip()).toContain('0RSDPoručeno');

    root.querySelector<HTMLButtonElement>('[data-testid="toggle-table"]')?.click();
    fixture.detectChanges();
    const rows = [...root.querySelectorAll('[data-testid="chart-table"] tbody tr')].map((row) =>
      [...row.children].map(text),
    );
    expect(rows).toEqual([
      ['13.11.2026.', '0 RSD', '0 RSD'],
      ['14.11.2026.', '3.350 RSD', '1.200 RSD'],
    ]);
    expect(text(root.querySelector('caption'))).toBe('Prihod');
    expect(root.querySelector('[data-testid="chart"]')).toBeNull();
  });

  it('draws columns only for non-zero buckets and says when the period is empty', async () => {
    const fixture = TestBed.createComponent(TimeChart);
    fixture.componentRef.setInput(
      'data',
      toTimeChart([point('2026-11-13', '2026-11-13', 0, 0)], 'Day', [
        { key: 'orderedValue', label: 'Porudžbine', color: '#000' },
      ]),
    );
    fixture.componentRef.setInput('label', 'Broj porudžbina');
    fixture.componentRef.setInput('type', 'column');
    fixture.componentRef.setInput('format', 'count');
    await settle(() => fixture.detectChanges());
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('svg path[d^="M"]:not([fill="none"])')).toHaveLength(0);
    expect(text(root.querySelector('[data-testid="chart-empty"]'))).toBe(
      'U ovom periodu nema podataka.',
    );
  });

  it('lists ranked bars with their values', () => {
    const fixture = TestBed.createComponent(BarList);
    fixture.componentRef.setInput('label', 'Najprodavaniji');
    fixture.componentRef.setInput('items', [
      { key: 'a', label: 'Sok', value: 720 },
      { key: 'b', label: 'Džem', value: 1780, note: '2 kom.' },
    ]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect([...root.querySelectorAll('li')].map(text)).toEqual([
      'Džem: 1.780 RSD · 2 kom.',
      'Sok: 720 RSD',
    ]);
  });
});

describe('CSV download', () => {
  it('reads the file name from Content-Disposition', () => {
    expect(
      fileNameFromDisposition(
        "attachment; filename=zalihe-2026-11-15.csv; filename*=UTF-8''zalihe-2026-11-15.csv",
      ),
    ).toBe('zalihe-2026-11-15.csv');
    expect(fileNameFromDisposition('attachment; filename="prodaja.csv"')).toBe('prodaja.csv');
    expect(fileNameFromDisposition("attachment; filename*=UTF-8''pretplatnici%20%C5%A1.csv")).toBe(
      'pretplatnici š.csv',
    );
    expect(fileNameFromDisposition('attachment; filename="../../x.csv"')).toBe('....x.csv');
    expect(fileNameFromDisposition(null)).toBeNull();
  });

  it('fetches with the credentials and saves the blob under the server name (or the fallback)', async () => {
    const auth = (request: HttpRequest<unknown>, next: HttpHandlerFn) =>
      next(request.clone({ setHeaders: { Authorization: 'Bearer token' } }));
    TestBed.configureTestingModule({
      providers: [
        provideAppConfig({ apiBaseUrl: API, healthUrl: 'http://localhost:5080/health' }),
        provideHttpClient(withInterceptors([auth, apiErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return 'blob:x';
    });
    URL.revokeObjectURL = vi.fn();
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });
    const service = TestBed.inject(FileDownloadService);
    const controller = TestBed.inject(HttpTestingController);

    const names: string[] = [];
    service
      .download('/admin/reports/inventory', { format: 'csv' }, 'zalihe-fallback.csv')
      .subscribe((name) => names.push(name));
    const request = controller.expectOne((r) => r.url === `${API}/admin/reports/inventory`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer token');
    expect(request.request.params.get('format')).toBe('csv');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['﻿Proizvod;Stanje']), {
      headers: { 'Content-Disposition': 'attachment; filename=zalihe-2026-11-15.csv' },
    });
    expect(names).toEqual(['zalihe-2026-11-15.csv']);
    expect(clicked).toEqual(['zalihe-2026-11-15.csv']);
    expect(created).toHaveLength(1);

    // Cross-origin APIs may hide the header: the fallback name is used.
    service.download('/admin/newsletter/subscribers/export', {}, 'pretplatnici.csv').subscribe();
    controller.expectOne(`${API}/admin/newsletter/subscribers/export`).flush(new Blob(['x']));
    expect(clicked.at(-1)).toBe('pretplatnici.csv');
    vi.restoreAllMocks();
  });
});

describe('rich text with images', () => {
  it('keeps only media images with alt and size when images are allowed', () => {
    const img = `<img src="${MEDIA}/800.webp" alt="Tegle" width="800" height="600" onerror="x()">`;
    expect(sanitizeRichText(`<p>Tekst</p>${img}`, { images: true })).toBe(
      `<p>Tekst</p><p><img src="${MEDIA}/800.webp" alt="Tegle" width="800" height="600"></p>`,
    );
    // Product descriptions: no images at all.
    expect(sanitizeRichText(`<p>Tekst</p>${img}`)).toBe('<p>Tekst</p>');
    // Foreign or tricky addresses are dropped.
    expect(
      sanitizeRichText('<p><img src="https://zli.example/x.png" alt=""></p>', { images: true }),
    ).toBe('');
    expect(isMediaImageSrc(`${MEDIA}/../../x/800.webp`)).toBe(false);
    expect(isMediaImageSrc('http://localhost:9000/m/media/pages/a/400.webp')).toBe(true);
    expect(isMediaImageSrc('data:image/png;base64,AAA')).toBe(false);
    expect(
      sanitizeRichText(
        '<blockquote>Citat</blockquote><figure><figcaption>Bez slike</figcaption></figure>',
        {
          images: true,
        },
      ),
    ).toBe('<blockquote>Citat</blockquote><p>Bez slike</p>');
  });

  it('inserts a photo after the paragraph of the cursor and publishes the value', async () => {
    @Component({
      selector: 'adm-rte-host',
      imports: [RichTextEditor],
      template: `<adm-rich-text-editor
        #e
        label="Tekst"
        [images]="true"
        (imageRequested)="asked = true"
      />`,
    })
    class Host {
      asked = false;
    }
    const fixture = TestBed.createComponent(Host);
    await settle(() => fixture.detectChanges());
    const root = fixture.nativeElement as HTMLElement;
    const imageButton = [...root.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === 'Dodaj fotografiju',
    );
    expect(imageButton).toBeDefined();
    expect(
      [...root.querySelectorAll('button')].some((b) =>
        b.getAttribute('aria-label')?.startsWith('Citat'),
      ),
    ).toBe(true);
    imageButton?.click();
    expect(fixture.componentInstance.asked).toBe(true);

    const editor = fixture.debugElement.children[0]!.componentInstance as RichTextEditor;
    const values: string[] = [];
    editor.registerOnChange((value) => values.push(value));
    editor.writeValue('<p>Prvi</p><p>Drugi</p>');
    await settle(() => fixture.detectChanges());
    const area = root.querySelector<HTMLElement>('[role="textbox"]')!;
    const range = document.createRange();
    range.setStart(area.firstChild!.firstChild!, 2);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    editor.requestImage();
    editor.insertImage({ src: `${MEDIA}/800.webp`, alt: 'Džem', width: 800, height: 533 });
    expect(values.at(-1)).toBe(
      `<p>Prvi</p><p><img src="${MEDIA}/800.webp" alt="Džem" width="800" height="533"></p><p>Drugi</p>`,
    );
  });
});

describe('Serbian date and time', () => {
  it('converts a Belgrade local time to an instant (winter and summer time)', () => {
    expect(belgradeInstant('2026-11-20', '08:30')).toBe('2026-11-20T07:30:00.000Z');
    expect(belgradeInstant('2026-07-01', '08:30')).toBe('2026-07-01T06:30:00.000Z');
    expect(belgradeInstant('2026-11-20', '25:00')).toBeNull();
  });
});
