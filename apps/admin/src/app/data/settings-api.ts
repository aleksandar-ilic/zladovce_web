import { inject, Injectable } from '@angular/core';
import { ApiClient } from '@zladovce/api';
import { AdminStoreSettings, UpdateStoreSettingsRequest } from '@zladovce/models';
import { Observable } from 'rxjs';

/** `/admin/settings` (owner only). PUT sends every member and the latest `version`. */
@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private readonly api = inject(ApiClient);

  get(): Observable<AdminStoreSettings> {
    return this.api.get<AdminStoreSettings>('/admin/settings');
  }

  update(body: UpdateStoreSettingsRequest): Observable<AdminStoreSettings> {
    return this.api.put<AdminStoreSettings>('/admin/settings', body);
  }
}
