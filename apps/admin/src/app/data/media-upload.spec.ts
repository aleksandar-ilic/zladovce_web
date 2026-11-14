import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ApiError,
  apiErrorInterceptor,
  AppConfig,
  CORRELATION_ID_HEADER,
  correlationIdInterceptor,
  provideAppConfig,
} from '@zladovce/api';
import { authInterceptor, AuthService, createAuthService, DEV_SESSION_KEY } from '@zladovce/auth';
import { firstValueFrom, Observable } from 'rxjs';
import {
  checkImageFile,
  MAX_IMAGE_BYTES,
  MediaUploadService,
  retryWhileImageNotReady,
  UploadError,
  uploadErrorMessage,
  uploadFormData,
  UploadProgress,
} from './media-upload';

const API = 'http://localhost:5080/api/v1';
const STORAGE = 'http://localhost:9000/zladovce-media-dev';
const CONFIG: AppConfig = {
  apiBaseUrl: API,
  healthUrl: 'http://localhost:5080/health',
  auth: { mode: 'dev', dev: { email: 'vlasnik@zladovce.local', role: 'Owner' } },
};

const FIELDS = {
  key: 'uploads/product/abc.jpg',
  'Content-Type': 'image/jpeg',
  bucket: 'zladovce-media-dev',
  'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
  'X-Amz-Credential': 'cred',
  'X-Amz-Date': '20261114T120000Z',
  Policy: 'cG9saWN5',
  'X-Amz-Signature': 'sig',
};

function jpeg(name = 'tegla.jpg', size = 2048, type = 'image/jpeg'): File {
  return new File([new Uint8Array(size)], name, { type });
}

async function setup() {
  sessionStorage.setItem(DEV_SESSION_KEY, '1');
  TestBed.configureTestingModule({
    providers: [
      provideAppConfig(CONFIG),
      provideHttpClient(
        withInterceptors([correlationIdInterceptor, authInterceptor, apiErrorInterceptor]),
      ),
      provideHttpClientTesting(),
      {
        provide: AuthService,
        useFactory: () =>
          createAuthService(CONFIG, () => {
            throw new Error('no cognito');
          }),
      },
    ],
  });
  await TestBed.inject(AuthService).restore();
  return {
    service: TestBed.inject(MediaUploadService),
    controller: TestBed.inject(HttpTestingController),
  };
}

/** Lets the auth interceptor's promise resolve so the request reaches the testing backend. */
const tick = () => new Promise((resolve) => setTimeout(resolve));

afterEach(() => sessionStorage.clear());

describe('checkImageFile', () => {
  it('accepts JPEG, PNG and WebP up to 10 MB', () => {
    expect(checkImageFile({ type: 'image/jpeg', size: 1 })).toBeNull();
    expect(checkImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES })).toBeNull();
    expect(checkImageFile({ type: 'image/webp', size: 5000 })).toBeNull();
  });

  it('refuses other types, empty files and files over 10 MB with Serbian messages', () => {
    expect(checkImageFile({ type: 'image/gif', size: 10 })).toContain('JPG, PNG ili WebP');
    expect(checkImageFile({ type: 'application/pdf', size: 10 })).toContain('nije podržana');
    expect(checkImageFile({ type: '', size: 10 })).not.toBeNull();
    expect(checkImageFile({ type: 'image/jpeg', size: 0 })).toBe('Datoteka je prazna.');
    expect(checkImageFile({ type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 })).toContain('10 MB');
  });
});

describe('uploadFormData', () => {
  it('appends every field unchanged and in order, then the file last as "file"', () => {
    const file = jpeg();
    const body = uploadFormData(FIELDS, file, file.name);
    const entries = [...body.entries()];
    expect(entries.map(([name]) => name)).toEqual([...Object.keys(FIELDS), 'file']);
    expect(entries.slice(0, -1).map(([, value]) => value)).toEqual(Object.values(FIELDS));
    const last = entries.at(-1)?.[1] as File;
    expect(last).toBeInstanceOf(File);
    expect(last.name).toBe('tegla.jpg');
  });
});

describe('MediaUploadService', () => {
  it('asks the API for a pre-signed POST, then posts the file to the storage without app headers', async () => {
    const { service, controller } = await setup();
    const file = jpeg();
    const events: UploadProgress[] = [];
    let completed = false;
    service.upload(file, 'product').subscribe({
      next: (event) => events.push(event),
      complete: () => (completed = true),
    });
    await tick();

    const ticket = controller.expectOne(`${API}/admin/media/upload-url`);
    expect(ticket.request.method).toBe('POST');
    expect(ticket.request.body).toEqual({
      fileName: 'tegla.jpg',
      contentType: 'image/jpeg',
      size: 2048,
      purpose: 'product',
    });
    // The API request itself carries the dev credentials and a correlation id.
    expect(ticket.request.headers.get('X-Dev-User-Email')).toBe('vlasnik@zladovce.local');
    expect(ticket.request.headers.has(CORRELATION_ID_HEADER)).toBe(true);
    ticket.flush({
      uploadUrl: STORAGE,
      fields: FIELDS,
      key: FIELDS.key,
      expiresAt: '2026-11-14T12:10:00Z',
      maxSize: MAX_IMAGE_BYTES,
    });
    await tick();

    const upload = controller.expectOne(STORAGE);
    expect(upload.request.method).toBe('POST');
    expect(upload.request.headers.keys()).toEqual([]); // no auth, correlation, dev or content-type header
    expect(upload.request.reportProgress).toBe(true);
    const body = upload.request.body as FormData;
    expect([...body.keys()]).toEqual([...Object.keys(FIELDS), 'file']);
    expect(body.get('file')).toBeInstanceOf(File);

    upload.event({ type: 1, loaded: 1024, total: 2048 }); // HttpEventType.UploadProgress
    upload.flush('', { status: 204, statusText: 'No Content' });
    expect(events).toEqual([
      { type: 'progress', percent: 50 },
      { type: 'done', key: FIELDS.key },
    ]);
    expect(completed).toBe(true);
    controller.verify();
  });

  it('refuses a wrong file type or size before any request', async () => {
    const { service, controller } = await setup();
    const gif = firstValueFrom(service.upload(jpeg('slika.gif', 10, 'image/gif'), 'product'));
    await expect(gif).rejects.toBeInstanceOf(UploadError);
    const big = firstValueFrom(service.upload(jpeg('velika.jpg', MAX_IMAGE_BYTES + 1), 'category'));
    await expect(big).rejects.toThrow(/10 MB/);
    await tick();
    controller.verify();
  });

  it('turns a storage refusal (403) into a plain Serbian message', async () => {
    const { service, controller } = await setup();
    const result = firstValueFrom(service.upload(jpeg(), 'category'));
    await tick();
    controller.expectOne(`${API}/admin/media/upload-url`).flush({
      uploadUrl: STORAGE,
      fields: FIELDS,
      key: FIELDS.key,
      expiresAt: '',
      maxSize: MAX_IMAGE_BYTES,
    });
    await tick();
    controller
      .expectOne(STORAGE)
      .flush('<Error><Code>AccessDenied</Code></Error>', { status: 403, statusText: 'Forbidden' });
    const error = await result.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadError);
    expect(uploadErrorMessage(error)).toContain('Skladište nije prihvatilo fotografiju');
  });
});

describe('retryWhileImageNotReady', () => {
  const notReady = () =>
    new ApiError({ status: 409, code: 'IMAGE_NOT_READY', title: 'x', detail: 'Obrada traje.' });

  it('retries 409 IMAGE_NOT_READY after a delay and then succeeds', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const source = new Observable<string>((subscriber) => {
        calls++;
        if (calls < 3) {
          subscriber.error(notReady());
        } else {
          subscriber.next('product');
          subscriber.complete();
        }
      });
      const result = firstValueFrom(
        source.pipe(retryWhileImageNotReady({ attempts: 5, delayMs: 2000 })),
      );
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(1999);
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toBe(2);
      await vi.advanceTimersByTimeAsync(2000);
      expect(calls).toBe(3);
      await expect(result).resolves.toBe('product');
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after the allowed attempts', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const source = new Observable<string>((subscriber) => {
        calls++;
        subscriber.error(notReady());
      });
      const result = firstValueFrom(
        source.pipe(retryWhileImageNotReady({ attempts: 2, delayMs: 10 })),
      );
      const settled = result.catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(100);
      expect(calls).toBe(3);
      expect(((await settled) as ApiError).code).toBe('IMAGE_NOT_READY');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry other errors', async () => {
    let calls = 0;
    const source = new Observable<string>((subscriber) => {
      calls++;
      subscriber.error(
        new ApiError({ status: 400, code: 'INVALID_IMAGE', title: 'x', detail: 'Neispravno.' }),
      );
    });
    await expect(firstValueFrom(source.pipe(retryWhileImageNotReady()))).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(calls).toBe(1);
  });

  it('maps the image error codes to plain messages', () => {
    const message = (code: string) =>
      uploadErrorMessage(new ApiError({ status: 409, code, title: '', detail: 'server' }));
    expect(message('IMAGE_LIMIT_REACHED')).toContain('20');
    expect(message('INVALID_IMAGE')).toContain('nije ispravna fotografija');
    expect(message('UPLOAD_NOT_FOUND')).toContain('nije pronađena');
    expect(message('SOMETHING_ELSE')).toBe('server');
  });
});
