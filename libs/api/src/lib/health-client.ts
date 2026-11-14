import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { APP_CONFIG } from './config';

export interface HealthResult {
  healthy: true;
  /** Status text reported by the API (e.g. `Healthy`), when it sends one. */
  status: string | null;
  checkedAt: Date;
}

function readStatus(body: string): string | null {
  const text = body.trim();
  if (text === '') {
    return null;
  }
  try {
    const json: unknown = JSON.parse(text);
    if (typeof json === 'object' && json !== null) {
      const status = (json as Record<string, unknown>)['status'];
      return typeof status === 'string' ? status : null;
    }
    return typeof json === 'string' ? json : null;
  } catch {
    return text.length <= 40 ? text : null;
  }
}

/**
 * Client for the API health endpoint (`config.healthUrl`, by default `/health` on the API origin).
 * Any 2xx answer means the API is reachable; failures surface as `ApiError`.
 */
@Injectable({ providedIn: 'root' })
export class HealthClient {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  check(): Observable<HealthResult> {
    return this.http
      .get(this.config.healthUrl, { responseType: 'text' })
      .pipe(
        map((body) => ({
          healthy: true as const,
          status: readStatus(body),
          checkedAt: new Date(),
        })),
      );
  }
}
