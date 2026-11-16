import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiError, asApiError } from '@zladovce/api';
import { AdminStoreSettings } from '@zladovce/models';
import { UiErrorState, UiLoadingState, validationMessage } from '@zladovce/ui';
import { SrDatePipe } from '@zladovce/utilities';
import { retryWhileImageNotReady, uploadErrorMessage } from '../../data/media-upload';
import { SettingsApi } from '../../data/settings-api';
import { ImageUpload, UploadedImage } from '../../shared/image-upload';
import { imageSrc } from '../../shared/images';
import { applyServerErrors } from '../../shared/server-errors';
import { HasUnsavedChanges, warnBeforeUnload } from '../../shared/unsaved-changes';
import {
  addLink,
  createSettingsForm,
  fillSettingsForm,
  MAX_OTHER_LINKS,
  settingsRequest,
  syncThreshold,
} from './settings-form';

type LoadState =
  { status: 'loading' } | { status: 'error'; error: ApiError } | { status: 'loaded' };

/**
 * Podešavanja prodavnice (owner only): name, contact, delivery prices and limits, social links
 * and SEO defaults, as one form in sections. Delivery changes apply to the next cart quote and
 * order at once. Saved with the latest `version`; a change made meanwhile by someone else is
 * reported instead of overwritten.
 */
@Component({
  selector: 'adm-settings-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    SrDatePipe,
    UiErrorState,
    UiLoadingState,
    ImageUpload,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
  template: `
    <h1 class="text-3xl">Podešavanja prodavnice</h1>
    <p class="mt-2 max-w-2xl text-ink-700">
      Podaci koje kupci vide na sajtu i pravila dostave. Izmene važe čim ih sačuvate.
    </p>

    @switch (load().status) {
      @case ('loading') {
        <ui-loading-state label="Učitavanje podešavanja…" />
      }
      @case ('error') {
        <ui-error-state
          title="Podešavanja nisu učitana"
          [message]="loadError()"
          [retryable]="!forbidden()"
          (retry)="reload()"
        />
      }
      @default {
        @if (conflict()) {
          <div
            class="mt-4 max-w-3xl rounded-lg border border-warning-700/25 bg-warning-50 p-4"
            role="alert"
            data-testid="conflict"
          >
            <p class="font-semibold">Podešavanja je u međuvremenu promenio neko drugi.</p>
            <p class="mt-1">
              Vaše izmene nisu sačuvane. Učitajte najnoviju verziju (vaše izmene na ovoj strani će
              se izgubiti), pa ih unesite ponovo.
            </p>
            <button
              matButton="filled"
              type="button"
              class="mt-3"
              data-testid="reload-latest"
              (click)="reload()"
            >
              Učitaj najnoviju verziju
            </button>
          </div>
        }

        <form
          class="mt-6 flex max-w-3xl flex-col gap-6"
          [formGroup]="form"
          (ngSubmit)="save()"
          novalidate
        >
          <section
            class="rounded-lg border border-cream-200 bg-white p-5"
            aria-labelledby="set-basic"
          >
            <h2 id="set-basic" class="text-xl">Osnovno</h2>
            <mat-form-field appearance="outline" class="mt-3 w-full">
              <mat-label>Naziv prodavnice</mat-label>
              <input matInput formControlName="storeName" maxlength="100" data-testid="storeName" />
              @if (form.controls.storeName.errors; as e) {
                <mat-error>{{ message(e, { required: 'Upišite naziv prodavnice.' }) }}</mat-error>
              }
            </mat-form-field>
            <h3 class="mt-2 text-base font-semibold">Logo</h3>
            <p class="mt-1 text-sm text-ink-700">
              Prikazuje se u zaglavlju sajta i u e-porukama kupcima. Najbolje izgleda logo na
              providnoj ili beloj pozadini (PNG). Bez loga se prikazuje naziv prodavnice.
            </p>
            @if (logoPreview(); as preview) {
              <div class="mt-3 flex flex-wrap items-end gap-4" data-testid="logo">
                <img
                  [src]="preview"
                  alt="Logo prodavnice"
                  class="max-h-24 max-w-64 rounded-md border border-cream-200 bg-white object-contain p-2"
                  data-testid="logo-preview"
                />
                <button
                  matButton
                  type="button"
                  class="danger-button"
                  data-testid="remove-logo"
                  (click)="removeLogo()"
                >
                  Ukloni logo
                </button>
              </div>
              @if (form.controls.logoKey.dirty) {
                <p class="mt-2 text-sm text-warning-700" data-testid="logo-pending">
                  Novi logo će se prikazati kada sačuvate podešavanja.
                </p>
              }
            } @else {
              <p class="mt-2 text-sm text-ink-700" data-testid="no-logo">
                {{
                  form.controls.logoKey.dirty
                    ? 'Logo će biti uklonjen kada sačuvate podešavanja.'
                    : 'Logo nije postavljen.'
                }}
              </p>
            }
            @if (form.controls.logoKey.errors?.['server']; as serverError) {
              <p class="mt-2 text-sm font-medium text-danger-700" role="alert">{{ serverError }}</p>
            }
            <adm-image-upload
              class="mt-3"
              purpose="logo"
              (uploaded)="logoUploaded($event)"
              (busyChange)="uploading.set($event)"
            />
          </section>

          <section
            class="rounded-lg border border-cream-200 bg-white p-5"
            aria-labelledby="set-contact"
          >
            <h2 id="set-contact" class="text-xl">Kontakt</h2>
            <p class="mt-1 text-sm text-ink-700">
              Prikazuje se na sajtu. Prazno polje se ne prikazuje.
            </p>
            <div class="mt-3 grid gap-x-4 sm:grid-cols-2">
              <mat-form-field appearance="outline">
                <mat-label>E-pošta za kontakt</mat-label>
                <input
                  matInput
                  type="email"
                  formControlName="contactEmail"
                  maxlength="254"
                  data-testid="contactEmail"
                />
                @if (form.controls.contactEmail.errors; as e) {
                  <mat-error>{{ message(e) }}</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Telefon</mat-label>
                <input
                  matInput
                  type="tel"
                  formControlName="phone"
                  maxlength="50"
                  data-testid="phone"
                />
                @if (form.controls.phone.errors; as e) {
                  <mat-error>{{ message(e) }}</mat-error>
                }
              </mat-form-field>
            </div>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Adresa</mat-label>
              <input matInput formControlName="businessAddress" maxlength="300" />
              @if (form.controls.businessAddress.errors; as e) {
                <mat-error>{{ message(e) }}</mat-error>
              }
            </mat-form-field>
          </section>

          <section
            class="rounded-lg border border-cream-200 bg-white p-5"
            aria-labelledby="set-shipping"
          >
            <h2 id="set-shipping" class="text-xl">Dostava</h2>
            <mat-slide-toggle
              class="mt-3"
              formControlName="shippingEnabled"
              data-testid="shippingEnabled"
            >
              Dostava je uključena (kupci mogu da poruče)
            </mat-slide-toggle>
            @if (!form.controls.shippingEnabled.value) {
              <p
                class="mt-2 rounded-md bg-warning-50 px-3 py-2 text-sm text-warning-700"
                data-testid="shipping-off"
              >
                Dok je dostava isključena, niko ne može da poruči preko sajta.
              </p>
            }
            <div class="mt-4 grid gap-x-4 sm:grid-cols-2">
              <mat-form-field appearance="outline">
                <mat-label>Cena dostave</mat-label>
                <input
                  matInput
                  type="number"
                  inputmode="decimal"
                  min="0"
                  step="0.01"
                  formControlName="shippingPrice"
                  data-testid="shippingPrice"
                />
                <span matTextSuffix>RSD</span>
                <mat-hint>0 = besplatna dostava za sve porudžbine.</mat-hint>
                @if (form.controls.shippingPrice.errors; as e) {
                  <mat-error>{{
                    message(e, { required: 'Upišite cenu dostave (0 za besplatnu).' })
                  }}</mat-error>
                }
              </mat-form-field>
            </div>

            <div class="mt-4 grid gap-x-4 sm:grid-cols-2">
              <div>
                <mat-checkbox
                  formControlName="noFreeShippingThreshold"
                  data-testid="noFreeShippingThreshold"
                  (change)="sync('freeShippingThreshold')"
                  >Bez praga za besplatnu dostavu</mat-checkbox
                >
                <mat-form-field appearance="outline" class="mt-1 w-full">
                  <mat-label>Besplatna dostava od</mat-label>
                  <input
                    matInput
                    type="number"
                    inputmode="decimal"
                    min="0.01"
                    step="0.01"
                    formControlName="freeShippingThreshold"
                    data-testid="freeShippingThreshold"
                  />
                  <span matTextSuffix>RSD</span>
                  <mat-hint
                    >Kada proizvodi u korpi vrede bar ovoliko, dostava je besplatna.</mat-hint
                  >
                  @if (form.controls.freeShippingThreshold.errors; as e) {
                    <mat-error>{{
                      message(e, { required: 'Upišite iznos ili izaberite „Bez praga“.' })
                    }}</mat-error>
                  }
                </mat-form-field>
              </div>
              <div>
                <mat-checkbox
                  formControlName="noMinOrderAmount"
                  data-testid="noMinOrderAmount"
                  (change)="sync('minOrderAmount')"
                  >Bez najmanjeg iznosa porudžbine</mat-checkbox
                >
                <mat-form-field appearance="outline" class="mt-1 w-full">
                  <mat-label>Najmanji iznos porudžbine</mat-label>
                  <input
                    matInput
                    type="number"
                    inputmode="decimal"
                    min="0.01"
                    step="0.01"
                    formControlName="minOrderAmount"
                    data-testid="minOrderAmount"
                  />
                  <span matTextSuffix>RSD</span>
                  <mat-hint
                    >Vrednost proizvoda (bez dostave) ispod koje se ne može poručiti.</mat-hint
                  >
                  @if (form.controls.minOrderAmount.errors; as e) {
                    <mat-error>{{
                      message(e, {
                        required: 'Upišite iznos ili izaberite „Bez najmanjeg iznosa“.',
                      })
                    }}</mat-error>
                  }
                </mat-form-field>
              </div>
            </div>

            <mat-form-field appearance="outline" class="mt-4 w-full">
              <mat-label>Rok isporuke</mat-label>
              <input matInput formControlName="estimatedDeliveryText" maxlength="200" />
              <mat-hint>Na primer „2–3 radna dana“.</mat-hint>
              @if (form.controls.estimatedDeliveryText.errors; as e) {
                <mat-error>{{ message(e) }}</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline" class="mt-4 w-full">
              <mat-label>Informacije o dostavi</mat-label>
              <textarea
                matInput
                rows="3"
                formControlName="deliveryInfo"
                maxlength="4000"
              ></textarea>
              @if (form.controls.deliveryInfo.errors; as e) {
                <mat-error>{{ message(e) }}</mat-error>
              }
            </mat-form-field>
          </section>

          <section
            class="rounded-lg border border-cream-200 bg-white p-5"
            aria-labelledby="set-social"
          >
            <h2 id="set-social" class="text-xl">Društvene mreže</h2>
            <p class="mt-1 text-sm text-ink-700">Pune adrese koje počinju sa https://.</p>
            <div class="mt-3 grid gap-x-4 sm:grid-cols-2">
              <mat-form-field appearance="outline">
                <mat-label>Facebook</mat-label>
                <input
                  matInput
                  type="url"
                  formControlName="facebookUrl"
                  data-testid="facebookUrl"
                />
                @if (form.controls.facebookUrl.errors; as e) {
                  <mat-error>{{ message(e) }}</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Instagram</mat-label>
                <input
                  matInput
                  type="url"
                  formControlName="instagramUrl"
                  data-testid="instagramUrl"
                />
                @if (form.controls.instagramUrl.errors; as e) {
                  <mat-error>{{ message(e) }}</mat-error>
                }
              </mat-form-field>
            </div>
            <h3 class="mt-2 text-base font-semibold">Ostali linkovi</h3>
            <div formArrayName="otherLinks" class="mt-2 flex flex-col gap-2">
              @for (link of form.controls.otherLinks.controls; track link; let i = $index) {
                <div
                  class="grid gap-x-3 sm:grid-cols-[12rem_1fr_auto]"
                  [formGroupName]="i"
                  data-testid="link-row"
                >
                  <mat-form-field appearance="outline">
                    <mat-label>Naziv</mat-label>
                    <input matInput formControlName="label" maxlength="50" />
                    @if (link.controls.label.errors; as e) {
                      <mat-error>{{ message(e, { required: 'Upišite naziv linka.' }) }}</mat-error>
                    }
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Adresa</mat-label>
                    <input matInput type="url" formControlName="url" data-testid="link-url" />
                    @if (link.controls.url.errors; as e) {
                      <mat-error>{{ message(e, { required: 'Upišite adresu.' }) }}</mat-error>
                    }
                  </mat-form-field>
                  <button
                    matButton
                    type="button"
                    class="danger-button sm:mt-2"
                    (click)="removeLink(i)"
                  >
                    Ukloni
                  </button>
                </div>
              }
            </div>
            <button
              matButton="outlined"
              type="button"
              class="mt-2"
              data-testid="add-link"
              [disabled]="form.controls.otherLinks.length >= maxLinks"
              (click)="addLink()"
            >
              Dodaj link
            </button>
            @if (form.controls.otherLinks.length >= maxLinks) {
              <p class="mt-1 text-sm text-ink-500">Najviše {{ maxLinks }} dodatnih linkova.</p>
            }
          </section>

          <section
            class="rounded-lg border border-cream-200 bg-white p-5"
            aria-labelledby="set-seo"
          >
            <h2 id="set-seo" class="text-xl">SEO (pretraživači)</h2>
            <p class="mt-1 text-sm text-ink-700">
              Naslov i opis koje pretraživači prikazuju kada stranica nema svoje.
            </p>
            <mat-form-field appearance="outline" class="mt-3 w-full">
              <mat-label>Podrazumevani naslov</mat-label>
              <input matInput formControlName="defaultSeoTitle" maxlength="120" />
              <mat-hint align="end">{{ form.controls.defaultSeoTitle.value.length }}/120</mat-hint>
              @if (form.controls.defaultSeoTitle.errors; as e) {
                <mat-error>{{ message(e) }}</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline" class="mt-3 w-full">
              <mat-label>Podrazumevani opis</mat-label>
              <textarea
                matInput
                rows="3"
                formControlName="defaultSeoDescription"
                maxlength="320"
              ></textarea>
              <mat-hint align="end"
                >{{ form.controls.defaultSeoDescription.value.length }}/320</mat-hint
              >
              @if (form.controls.defaultSeoDescription.errors; as e) {
                <mat-error>{{ message(e) }}</mat-error>
              }
            </mat-form-field>
          </section>

          @if (saveError(); as text) {
            <p
              class="rounded-md bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
              role="alert"
              data-testid="save-error"
            >
              {{ text }}
            </p>
          }
          <div
            class="sticky bottom-0 flex flex-wrap items-center gap-4 border-t border-cream-200 bg-cream-50 py-3"
          >
            <button
              matButton="filled"
              type="submit"
              class="min-h-12"
              data-testid="save"
              [disabled]="saving() || conflict() || uploading()"
            >
              {{ saving() ? 'Čuvanje…' : 'Sačuvaj podešavanja' }}
            </button>
            @if (updatedAt(); as at) {
              <span class="text-sm text-ink-500">
                Poslednja izmena: {{ at | srDate: 'dateTime'
                }}{{ updatedBy() ? ', ' + updatedBy() : '' }}
              </span>
            }
          </div>
        </form>
      }
    }
  `,
})
export class SettingsPage implements HasUnsavedChanges {
  private readonly api = inject(SettingsApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly message = validationMessage;
  protected readonly maxLinks = MAX_OTHER_LINKS;
  readonly form = createSettingsForm(this.fb);
  readonly load = signal<LoadState>({ status: 'loading' });
  /** `version` from the latest response; sent with the next save. */
  readonly version = signal<number | null>(null);
  readonly conflict = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  protected readonly logoPreview = signal<string | null>(null);
  protected readonly uploading = signal(false);
  private localPreview: string | null = null;
  protected readonly updatedAt = signal<string | null>(null);
  protected readonly updatedBy = signal<string | null>(null);

  constructor() {
    this.reload();
    inject(DestroyRef).onDestroy(() => this.revokePreview());
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  protected beforeUnload(event: BeforeUnloadEvent): void {
    warnBeforeUnload(event, this.hasUnsavedChanges());
  }

  protected loadError(): string {
    const state = this.load();
    if (state.status !== 'error') {
      return '';
    }
    return state.error.isForbidden
      ? 'Podešavanja prodavnice može da menja samo vlasnik.'
      : state.error.detail;
  }

  protected forbidden(): boolean {
    const state = this.load();
    return state.status === 'error' && state.error.isForbidden;
  }

  reload(): void {
    this.load.set({ status: 'loading' });
    this.api
      .get()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.apply(settings);
          this.conflict.set(false);
          this.load.set({ status: 'loaded' });
        },
        error: (error: unknown) => this.load.set({ status: 'error', error: asApiError(error) }),
      });
  }

  protected logoUploaded(upload: UploadedImage): void {
    this.revokePreview();
    this.localPreview =
      typeof URL.createObjectURL === 'function' ? URL.createObjectURL(upload.file) : null;
    this.logoPreview.set(this.localPreview);
    this.form.controls.logoKey.setValue(upload.key);
    this.form.controls.logoKey.markAsDirty();
  }

  removeLogo(): void {
    this.revokePreview();
    this.logoPreview.set(null);
    this.form.controls.logoKey.setValue(null);
    this.form.controls.logoKey.markAsDirty();
  }

  private revokePreview(): void {
    if (this.localPreview && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(this.localPreview);
    }
    this.localPreview = null;
  }

  protected sync(which: 'freeShippingThreshold' | 'minOrderAmount'): void {
    syncThreshold(this.form, which);
  }

  protected addLink(): void {
    if (addLink(this.form, this.fb)) {
      this.form.markAsDirty();
    }
  }

  protected removeLink(index: number): void {
    this.form.controls.otherLinks.removeAt(index);
    this.form.markAsDirty();
  }

  save(): void {
    if (this.saving() || this.conflict()) {
      return;
    }
    this.saveError.set(null);
    syncThreshold(this.form, 'freeShippingThreshold');
    syncThreshold(this.form, 'minOrderAmount');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.saveError.set('Proverite označena polja.');
      return;
    }
    const version = this.version();
    if (version === null) {
      return;
    }
    this.saving.set(true);
    this.api
      .update(settingsRequest(this.form, version))
      .pipe(retryWhileImageNotReady(), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.saving.set(false);
          this.apply(settings);
          this.snackBar.open('Podešavanja su sačuvana.', 'U redu', { duration: 4000 });
        },
        error: (error: unknown) => {
          this.saving.set(false);
          const apiError = asApiError(error);
          if (apiError.code === 'CONCURRENT_EDIT') {
            this.conflict.set(true);
            return;
          }
          if (['IMAGE_NOT_READY', 'INVALID_IMAGE', 'UPLOAD_NOT_FOUND'].includes(apiError.code)) {
            this.form.controls.logoKey.setErrors({ server: uploadErrorMessage(apiError) });
          }
          const unmatched = applyServerErrors(this.form, apiError);
          this.saveError.set(
            unmatched.length > 0
              ? unmatched.join(' ')
              : apiError.isValidation
                ? 'Proverite označena polja.'
                : apiError.detail,
          );
        },
      });
  }

  private apply(settings: AdminStoreSettings): void {
    fillSettingsForm(this.form, this.fb, settings);
    this.version.set(settings.version);
    this.revokePreview();
    this.logoPreview.set(settings.logo ? imageSrc(settings.logo, 400) : null);
    this.updatedAt.set(settings.updatedAt);
    this.updatedBy.set(settings.updatedByAdminName);
  }
}
