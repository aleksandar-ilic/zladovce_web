import {
  HttpBackend,
  HttpClient,
  HttpErrorResponse,
  HttpEvent,
  HttpEventType,
} from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ApiClient, ApiError, asApiError } from '@zladovce/api';
import { UploadPurpose, UploadUrlResponse } from '@zladovce/models';
import {
  catchError,
  defer,
  filter,
  map,
  MonoTypeOperatorFunction,
  Observable,
  retry,
  switchMap,
  throwError,
  timer,
} from 'rxjs';

/** Types the storage accepts (the pre-signed POST pins the exact Content-Type). */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** 10 MB, the limit of the pre-signed POST. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(',');

/** Serbian message when the file cannot be uploaded at all, or null when it is acceptable. */
export function checkImageFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return 'Ova vrsta datoteke nije podržana. Izaberite fotografiju u formatu JPG, PNG ili WebP.';
  }
  if (file.size <= 0) {
    return 'Datoteka je prazna.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'Fotografija je veća od 10 MB. Izaberite manju fotografiju ili je smanjite pre slanja.';
  }
  return null;
}

/** Progress of one upload to the storage. `done` carries the key to attach. */
export type UploadProgress = { type: 'progress'; percent: number } | { type: 'done'; key: string };

/** A file rejected on the client or by the storage; the message is Serbian. */
export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

/** Error code the API returns while the uploaded image is still being processed. */
export const IMAGE_NOT_READY = 'IMAGE_NOT_READY';

export interface RetryOptions {
  /** Retries after the first attempt. */
  attempts: number;
  delayMs: number;
}

export const IMAGE_NOT_READY_RETRY: RetryOptions = { attempts: 5, delayMs: 2000 };

/**
 * Retries a request that failed with 409 IMAGE_NOT_READY (the image processor is still running).
 * Any other error is passed on at once.
 */
export function retryWhileImageNotReady<T>(
  options: RetryOptions = IMAGE_NOT_READY_RETRY,
): MonoTypeOperatorFunction<T> {
  return retry({
    count: options.attempts,
    delay: (error: unknown) =>
      error instanceof ApiError && error.code === IMAGE_NOT_READY
        ? timer(options.delayMs)
        : throwError(() => error),
  });
}

/** Message for an error of any upload step (client check, storage or API). */
export function uploadErrorMessage(error: unknown): string {
  if (error instanceof UploadError) {
    return error.message;
  }
  const apiError = asApiError(error);
  switch (apiError.code) {
    case IMAGE_NOT_READY:
      return 'Fotografija se još obrađuje. Sačekajte malo i pokušajte ponovo.';
    case 'INVALID_IMAGE':
      return 'Datoteka nije ispravna fotografija. Izaberite drugu fotografiju.';
    case 'UPLOAD_NOT_FOUND':
      return 'Poslata datoteka nije pronađena (možda je isteklo vreme). Pokušajte ponovo.';
    case 'IMAGE_LIMIT_REACHED':
      return 'Proizvod već ima najveći dozvoljeni broj fotografija (20). Obrišite neku da biste dodali novu.';
    case 'IMAGE_ALREADY_ATTACHED':
      return 'Ova fotografija je već dodata.';
    default:
      return apiError.detail;
  }
}

function storageMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'Slanje fotografije nije uspelo. Proverite internet vezu i pokušajte ponovo.';
    }
    if (error.status === 400 || error.status === 403) {
      return 'Skladište nije prihvatilo fotografiju (dozvoljeni su JPG, PNG i WebP do 10 MB, a vreme za slanje je ograničeno). Pokušajte ponovo.';
    }
  }
  return 'Slanje fotografije nije uspelo. Pokušajte ponovo.';
}

/** Builds the multipart body: every `fields` entry unchanged and in order, then the file as `file`. */
export function uploadFormData(
  fields: Readonly<Record<string, string>>,
  file: Blob,
  fileName?: string,
): FormData {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    body.append(name, value);
  }
  if (fileName) {
    body.append('file', file, fileName);
  } else {
    body.append('file', file);
  }
  return body;
}

/**
 * Direct browser upload of an image (pre-signed POST):
 *  1. `POST /admin/media/upload-url` → `{ uploadUrl, fields, key }`;
 *  2. multipart POST to the storage (expects 204).
 *
 * The storage is another origin. Its request goes through a bare HttpClient built on HttpBackend,
 * so none of the app's interceptors run: no credentials, correlation id or dev headers reach it,
 * and no Content-Type is set by hand (the browser adds the multipart boundary).
 * Attaching the returned key (product image, category `imageKey`) is the caller's step.
 */
@Injectable({ providedIn: 'root' })
export class MediaUploadService {
  private readonly api = inject(ApiClient);
  private readonly storage = new HttpClient(inject(HttpBackend));

  upload(file: File, purpose: UploadPurpose): Observable<UploadProgress> {
    return defer(() => {
      const problem = checkImageFile(file);
      if (problem) {
        return throwError(() => new UploadError(problem));
      }
      return this.api
        .post<UploadUrlResponse>('/admin/media/upload-url', {
          fileName: file.name,
          contentType: file.type,
          size: file.size,
          purpose,
        })
        .pipe(switchMap((target) => this.send(file, target)));
    });
  }

  private send(file: File, target: UploadUrlResponse): Observable<UploadProgress> {
    return this.storage
      .post(target.uploadUrl, uploadFormData(target.fields, file, file.name), {
        observe: 'events',
        reportProgress: true,
        responseType: 'text',
      })
      .pipe(
        map((event: HttpEvent<string>): UploadProgress | null => {
          if (event.type === HttpEventType.UploadProgress) {
            const total = event.total ?? file.size;
            const percent = total > 0 ? Math.round((event.loaded / total) * 100) : 0;
            return { type: 'progress', percent: Math.min(100, percent) };
          }
          return event.type === HttpEventType.Response ? { type: 'done', key: target.key } : null;
        }),
        filter((progress): progress is UploadProgress => progress !== null),
        catchError((error: unknown) => throwError(() => new UploadError(storageMessage(error)))),
      );
  }
}
