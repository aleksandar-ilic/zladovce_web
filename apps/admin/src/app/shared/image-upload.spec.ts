import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { apiErrorInterceptor, provideAppConfig } from '@zladovce/api';
import { Observable, of } from 'rxjs';
import { ImageUpload, UploadedImage } from './image-upload';

const API = 'http://localhost:5080/api/v1';
const STORAGE = 'http://localhost:9000/zladovce-media-dev';

@Component({
  imports: [ImageUpload],
  template: `<adm-image-upload
    purpose="product"
    multiple
    [attach]="attach"
    (uploaded)="done.push($event)"
  />`,
})
class Host {
  readonly done: UploadedImage[] = [];
  readonly attached = signal<string[]>([]);
  attach = (key: string): Observable<unknown> => {
    this.attached.update((keys) => [...keys, key]);
    return of({ attached: key });
  };
}

const text = (element: Element | null | undefined): string =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

function file(name: string, type = 'image/jpeg', size = 1000): File {
  return new File([new Uint8Array(size)], name, { type });
}

async function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideAppConfig({ apiBaseUrl: API, healthUrl: 'http://localhost:5080/health' }),
      provideHttpClient(withInterceptors([apiErrorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  await fixture.whenStable();
  const upload = fixture.debugElement.children[0]?.componentInstance as ImageUpload;
  const root = fixture.nativeElement as HTMLElement;
  const render = async () => {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { fixture, upload, root, render, controller: TestBed.inject(HttpTestingController) };
}

function ticket(key: string) {
  return {
    uploadUrl: STORAGE,
    fields: { key, Policy: 'p' },
    key,
    expiresAt: '',
    maxSize: 10485760,
  };
}

describe('ImageUpload', () => {
  it('uploads several files one after another, attaches each and shows per-file state', async () => {
    const { fixture, upload, root, render, controller } = await setup();
    upload.addFiles([file('a.jpg'), file('b.png', 'image/png'), file('c.gif', 'image/gif')]);
    await render();

    const rows = () => [...root.querySelectorAll('[data-testid="upload-queue"] li')];
    expect(rows().map((r) => r.getAttribute('data-status'))).toEqual([
      'uploading',
      'waiting',
      'error',
    ]);
    expect(text(rows()[2])).toContain('JPG, PNG ili WebP');
    expect(text(rows()[1])).toContain('Čeka na slanje');

    // Only the first file is in flight.
    const first = controller.expectOne(`${API}/admin/media/upload-url`);
    expect(first.request.body).toMatchObject({ fileName: 'a.jpg', purpose: 'product' });
    first.flush(ticket('uploads/product/a.jpg'));
    await render();
    const storage = controller.expectOne(STORAGE);
    storage.event({ type: 1, loaded: 400, total: 1000 });
    await render();
    expect(text(rows()[0])).toContain('Slanje: 40%');
    storage.flush('', { status: 204, statusText: 'No Content' });
    await render();

    // a.jpg attached and gone from the queue; b.png starts.
    const host = fixture.componentInstance;
    expect(host.attached()).toEqual(['uploads/product/a.jpg']);
    expect(host.done.map((d) => d.key)).toEqual(['uploads/product/a.jpg']);
    expect(host.done[0]?.result).toEqual({ attached: 'uploads/product/a.jpg' });
    const second = controller.expectOne(`${API}/admin/media/upload-url`);
    expect(second.request.body).toMatchObject({ fileName: 'b.png', contentType: 'image/png' });
    second.flush(ticket('uploads/product/b.png'));
    await render();
    controller.expectOne(STORAGE).flush('', { status: 204, statusText: 'No Content' });
    await render();
    expect(host.done.map((d) => d.key)).toEqual(['uploads/product/a.jpg', 'uploads/product/b.png']);

    // The refused file stays with its message and can be removed.
    expect(rows().length).toBe(1);
    const remove = [...rows()[0]!.querySelectorAll('button')].find((b) => text(b) === 'Ukloni');
    expect(
      [...rows()[0]!.querySelectorAll('button')].some((b) => text(b) === 'Pokušaj ponovo'),
    ).toBe(false);
    remove?.click();
    await render();
    expect(root.querySelector('[data-testid="upload-queue"]')).toBeNull();
    controller.verify();
  });

  it('keeps a failed upload with a retry button', async () => {
    const { upload, root, render, controller } = await setup();
    upload.addFiles([file('a.jpg')]);
    await render();
    controller.expectOne(`${API}/admin/media/upload-url`).flush(ticket('k'));
    await render();
    controller.expectOne(STORAGE).flush('denied', { status: 403, statusText: 'Forbidden' });
    await render();
    const row = root.querySelector('[data-testid="upload-queue"] li');
    expect(row?.getAttribute('data-status')).toBe('error');
    expect(text(row)).toContain('Skladište nije prihvatilo fotografiju');

    [...(row?.querySelectorAll('button') ?? [])].find((b) => text(b) === 'Pokušaj ponovo')?.click();
    await render();
    controller.expectOne(`${API}/admin/media/upload-url`).flush(ticket('k2'));
    await render();
    controller.expectOne(STORAGE).flush('', { status: 204, statusText: 'No Content' });
    await render();
    expect(root.querySelector('[data-testid="upload-queue"]')).toBeNull();
  });

  it('accepts dropped files', async () => {
    const { root, render, controller } = await setup();
    const zone = root.querySelector('[data-testid="drop-zone"]');
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as Event & {
      dataTransfer: { files: File[] };
    };
    Object.defineProperty(drop, 'dataTransfer', {
      value: { files: [file('d.webp', 'image/webp')] },
    });
    zone?.dispatchEvent(drop);
    await render();
    expect(controller.expectOne(`${API}/admin/media/upload-url`).request.body).toMatchObject({
      fileName: 'd.webp',
      contentType: 'image/webp',
    });
  });
});
