import { HttpClient, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ApiClient, QueryParams, toHttpParams } from '@zladovce/api';
import { map, Observable } from 'rxjs';

/**
 * File name from a `Content-Disposition` header: `filename*=UTF-8''…` (RFC 5987) wins over
 * `filename=…`. Returns null when the header is missing or names no usable file.
 */
export function fileNameFromDisposition(header: string | null | undefined): string | null {
  if (!header) {
    return null;
  }
  const extended = /filename\*\s*=\s*([^;]+)/i.exec(header);
  if (extended?.[1]) {
    const raw = extended[1].trim().replace(/^"(.*)"$/, '$1');
    const value = raw.includes("''") ? raw.slice(raw.indexOf("''") + 2) : raw;
    try {
      const decoded = decodeURIComponent(value);
      if (safeName(decoded)) {
        return safeName(decoded);
      }
    } catch {
      // fall through to the plain parameter
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header);
  const name = plain ? (plain[2] ?? plain[1] ?? '').trim() : '';
  return safeName(name);
}

/** Strips path separators and control characters; null for an empty result. */
function safeName(name: string): string | null {
  // eslint-disable-next-line no-control-regex -- control characters are removed on purpose
  const clean = name.replace(/[\\/\u0000-\u001f]/g, '').trim();
  return clean === '' ? null : clean;
}

/** Hands a downloaded file to the browser ("Sačuvaj kao"/Preuzimanja). */
export function saveBlob(blob: Blob, fileName: string, doc: Document = document): void {
  if (typeof URL.createObjectURL !== 'function') {
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  doc.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}

/**
 * Downloads a file from the API (CSV reports and exports). A plain link cannot be used: it would
 * carry no `Authorization` header. The request goes through the app's HttpClient (credentials,
 * correlation id, error mapping); the name comes from `Content-Disposition`, or `fallbackName`
 * when the browser does not expose that header (cross-origin API without
 * `Access-Control-Expose-Headers: Content-Disposition`).
 */
@Injectable({ providedIn: 'root' })
export class FileDownloadService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiClient);

  fetch(path: string, params: QueryParams, fallbackName: string): Observable<DownloadedFile> {
    return this.http
      .get(this.api.url(path), {
        params: toHttpParams(params),
        responseType: 'blob',
        observe: 'response',
      })
      .pipe(
        map((response: HttpResponse<Blob>) => ({
          blob: response.body ?? new Blob([]),
          fileName:
            fileNameFromDisposition(response.headers.get('Content-Disposition')) ?? fallbackName,
        })),
      );
  }

  /** Fetches and saves the file; completes with the name it was saved under. */
  download(path: string, params: QueryParams, fallbackName: string): Observable<string> {
    return this.fetch(path, params, fallbackName).pipe(
      map((file) => {
        saveBlob(file.blob, file.fileName);
        return file.fileName;
      }),
    );
  }
}
