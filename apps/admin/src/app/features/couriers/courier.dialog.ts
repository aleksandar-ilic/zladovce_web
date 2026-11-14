import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { asApiError } from '@zladovce/api';
import { Courier, SaveCourierRequest } from '@zladovce/models';
import { notBlank } from '@zladovce/shared';
import { validationMessage } from '@zladovce/ui';
import { startWith } from 'rxjs';
import { CouriersApi } from '../../data/couriers-api';
import { applyServerErrors } from '../../shared/server-errors';

export const TRACKING_PLACEHOLDER = '{trackingNumber}';
export const TEMPLATE_MAX = 500;
export const COURIER_NAME_MAX = 100;
export const TEMPLATE_EXAMPLE = 'https://www.primer-kurira.rs/pracenje?broj={trackingNumber}';

/**
 * Same rule as the API (`CourierCompany.IsValidTemplate`): an https address with a host, no
 * spaces, at most 500 characters, containing `{trackingNumber}`. Empty is allowed (no tracking page).
 */
export function isValidTrackingTemplate(template: string): boolean {
  const value = template.trim();
  if (
    value === '' ||
    value.length > TEMPLATE_MAX ||
    /\s/.test(value) ||
    !value.includes(TRACKING_PLACEHOLDER)
  ) {
    return false;
  }
  try {
    const url = new URL(value.split(TRACKING_PLACEHOLDER).join('TEST123'));
    return (
      url.protocol === 'https:' && url.hostname !== '' && url.username === '' && url.password === ''
    );
  } catch {
    return false;
  }
}

export function trackingTemplateValidator(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  if (!value.trim().toLowerCase().startsWith('https://')) {
    return { template: 'Adresa mora počinjati sa https://.' };
  }
  if (!value.includes(TRACKING_PLACEHOLDER)) {
    return { template: `Adresa mora sadržati ${TRACKING_PLACEHOLDER} na mestu broja pošiljke.` };
  }
  return isValidTrackingTemplate(value)
    ? null
    : { template: 'Adresa nije ispravna (bez razmaka, najviše 500 znakova).' };
}

/** Example link for the help text: the template with a sample number. */
export function previewTrackingUrl(template: string, sample = 'RS123456789'): string | null {
  return isValidTrackingTemplate(template)
    ? template.trim().split(TRACKING_PLACEHOLDER).join(encodeURIComponent(sample))
    : null;
}

export interface CourierFormValue {
  name: string;
  trackingUrlTemplate: string;
  isActive: boolean;
  sortOrder: number | null;
}

/** Every member is sent; an empty template is null. */
export function courierRequest(value: CourierFormValue): SaveCourierRequest {
  const template = value.trackingUrlTemplate.trim();
  return {
    name: value.name.trim(),
    trackingUrlTemplate: template === '' ? null : template,
    isActive: value.isActive,
    sortOrder: value.sortOrder ?? 0,
  };
}

/** Create (no data) or change a courier company. Closes with the saved courier. */
@Component({
  selector: 'adm-courier-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ courier ? 'Izmena kurirske službe' : 'Nova kurirska služba' }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Naziv</mat-label>
          <input matInput formControlName="name" maxlength="100" data-testid="name" />
          <mat-hint>Kako se kurirska služba zove, na primer „Pošta Srbije“.</mat-hint>
          @if (form.controls.name.errors; as errors) {
            <mat-error>{{ message(errors, { required: 'Upišite naziv.' }) }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="mt-4 w-full">
          <mat-label>Adresa za praćenje pošiljke</mat-label>
          <input
            matInput
            formControlName="trackingUrlTemplate"
            maxlength="500"
            inputmode="url"
            autocomplete="off"
            data-testid="template"
          />
          @if (form.controls.trackingUrlTemplate.errors; as errors) {
            <mat-error>{{ message(errors) }}</mat-error>
          }
        </mat-form-field>
        <div class="text-sm text-ink-700" data-testid="template-help">
          <p>
            Nije obavezno. Ako kurir ima stranicu za praćenje, otvorite je sa nekim brojem pošiljke,
            kopirajte adresu i umesto broja upišite
            <code class="font-semibold">{{ placeholder }}</code>.
          </p>
          <p class="mt-1 break-all">Primer: {{ example }}</p>
          @if (preview(); as url) {
            <p class="mt-1 break-all" data-testid="template-preview">
              Za broj RS123456789 link će biti:
              <a
                [href]="url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-olive-700 underline"
                >{{ url }}</a
              >
            </p>
          }
        </div>

        <mat-form-field appearance="outline" class="mt-4 w-full">
          <mat-label>Redosled u listi</mat-label>
          <input
            matInput
            type="number"
            min="0"
            step="1"
            formControlName="sortOrder"
            data-testid="sort-order"
          />
          <mat-hint>Manji broj je više u listi pri slanju.</mat-hint>
          @if (form.controls.sortOrder.errors; as errors) {
            <mat-error>{{ message(errors, { min: 'Redosled mora biti 0 ili veći.' }) }}</mat-error>
          }
        </mat-form-field>

        <mat-slide-toggle class="mt-4" formControlName="isActive" data-testid="active"
          >Aktivna (nudi se pri slanju porudžbine)</mat-slide-toggle
        >

        @if (error(); as text) {
          <p
            class="mt-3 rounded-md bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
            role="alert"
          >
            {{ text }}
          </p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Odustani</button>
        <button matButton="filled" type="submit" data-testid="save-courier" [disabled]="saving()">
          {{ saving() ? 'Čuvanje…' : 'Sačuvaj' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class CourierDialog {
  private readonly api = inject(CouriersApi);
  private readonly dialogRef = inject<MatDialogRef<CourierDialog, Courier>>(MatDialogRef);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly courier = inject<Courier | null>(MAT_DIALOG_DATA, { optional: true });
  protected readonly message = validationMessage;
  protected readonly placeholder = TRACKING_PLACEHOLDER;
  protected readonly example = TEMPLATE_EXAMPLE;

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    name: [
      this.courier?.name ?? '',
      [Validators.required, notBlank, Validators.maxLength(COURIER_NAME_MAX)],
    ],
    trackingUrlTemplate: [this.courier?.trackingUrlTemplate ?? '', [trackingTemplateValidator]],
    isActive: [this.courier?.isActive ?? true],
    sortOrder: inject(FormBuilder).control<number | null>(this.courier?.sortOrder ?? 0, [
      Validators.min(0),
      Validators.pattern(/^\d+$/),
    ]),
  });

  private readonly template = toSignal(
    this.form.controls.trackingUrlTemplate.valueChanges.pipe(
      startWith(this.form.controls.trackingUrlTemplate.value),
    ),
    { initialValue: '' },
  );
  protected readonly preview = (): string | null => previewTrackingUrl(this.template());

  submit(): void {
    if (this.saving()) {
      return;
    }
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const body = courierRequest(this.form.getRawValue());
    this.saving.set(true);
    (this.courier ? this.api.update(this.courier.id, body) : this.api.create(body))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => this.dialogRef.close(saved),
        error: (error: unknown) => {
          this.saving.set(false);
          const apiError = asApiError(error);
          const unmatched = applyServerErrors(this.form, apiError);
          this.error.set(
            unmatched.length > 0
              ? unmatched.join(' ')
              : apiError.isValidation
                ? null
                : apiError.detail,
          );
        },
      });
  }
}
