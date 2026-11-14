import { inject, Injectable } from '@angular/core';
import { ApiClient } from '@zladovce/api';
import { TrackingLookup } from '@zladovce/models';
import { Observable } from 'rxjs';

/**
 * `POST /tracking/lookup`. The code travels only in the request body – never in a URL, a log
 * line or analytics. 404 TRACKING_NOT_FOUND is the same for every unknown, revoked or malformed code.
 */
@Injectable({ providedIn: 'root' })
export class TrackingApi {
  private readonly api = inject(ApiClient);

  lookup(code: string): Observable<TrackingLookup> {
    return this.api.post<TrackingLookup>('/tracking/lookup', { code });
  }
}
