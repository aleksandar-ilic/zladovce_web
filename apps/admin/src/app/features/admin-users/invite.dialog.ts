import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { ApiError, asApiError } from '@zladovce/api';
import { AdminRole, AdminUser } from '@zladovce/models';
import { emailAddressValidator, notBlank } from '@zladovce/shared';
import { validationMessage } from '@zladovce/ui';
import { AdminUsersApi } from '../../data/people-api';
import { applyServerErrors } from '../../shared/server-errors';

/** Plain message for an error of inviting or changing an administrator. */
export function adminUserErrorText(error: ApiError): string {
  switch (error.code) {
    case 'ADMIN_EMAIL_TAKEN':
      return 'Administrator sa ovom e-adresom već postoji.';
    case 'IDENTITY_PROVIDER_ERROR':
      return 'Sistem za prijavu trenutno ne odgovara, pa ništa nije sačuvano. Pokušajte ponovo za nekoliko minuta.';
    case 'CANNOT_CHANGE_SELF':
      return 'Svoju ulogu i svoj nalog ne možete menjati. To može uraditi drugi vlasnik.';
    case 'LAST_OWNER':
      return 'Ovo je jedini aktivni vlasnik. Prvo dodajte ili aktivirajte drugog vlasnika, pa onda promenite ovaj nalog.';
    default:
      return error.detail;
  }
}

/**
 * "Dodaj administratora": name, e-mail and role. The person gets an e-mail from the sign-in system
 * with a temporary password and sets their own on first sign-in.
 */
@Component({
  selector: 'adm-invite-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Novi administrator</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content>
        <p class="mb-3 text-sm text-ink-700">
          Osoba će dobiti e-poruku od sistema za prijavu sa privremenom lozinkom. Pri prvoj prijavi
          postavlja svoju lozinku.
        </p>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Ime i prezime</mat-label>
          <input matInput formControlName="fullName" maxlength="100" data-testid="invite-name" />
          @if (form.controls.fullName.errors; as e) {
            <mat-error>{{ message(e, { required: 'Upišite ime i prezime.' }) }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="mt-2 w-full">
          <mat-label>E-adresa</mat-label>
          <input
            matInput
            type="email"
            formControlName="email"
            maxlength="254"
            data-testid="invite-email"
          />
          @if (form.controls.email.errors; as e) {
            <mat-error>{{ message(e, { required: 'Upišite e-adresu.' }) }}</mat-error>
          }
        </mat-form-field>
        <mat-radio-group formControlName="role" class="mt-2 flex flex-col gap-2" aria-label="Uloga">
          <mat-radio-button value="Staff" data-testid="role-staff">
            <span class="font-semibold">Urednik</span> – porudžbine, proizvodi, zalihe, blog i
            sadržaj sajta
          </mat-radio-button>
          <mat-radio-button value="Owner" data-testid="role-owner">
            <span class="font-semibold">Vlasnik</span> – sve, uključujući troškove, podešavanja i
            administratore
          </mat-radio-button>
        </mat-radio-group>
        @if (error()) {
          <p
            class="mt-3 rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700"
            role="alert"
            data-testid="invite-error"
          >
            {{ error() }}
          </p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Odustani</button>
        <button matButton="filled" type="submit" data-testid="invite-save" [disabled]="saving()">
          {{ saving() ? 'Slanje…' : 'Dodaj i pošalji poziv' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class InviteDialog {
  private readonly api = inject(AdminUsersApi);
  private readonly ref = inject<MatDialogRef<InviteDialog, AdminUser>>(MatDialogRef);

  protected readonly message = validationMessage;
  readonly saving = signal(false);
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    fullName: ['', [Validators.required, notBlank, Validators.maxLength(100)]],
    email: ['', [Validators.required, emailAddressValidator]],
    role: ['Staff' as AdminRole],
  });

  save(): void {
    if (this.saving()) {
      return;
    }
    this.error.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.api
      .invite({ email: v.email.trim(), fullName: v.fullName.trim(), role: v.role })
      .subscribe({
        next: (user) => this.ref.close(user),
        error: (error: unknown) => {
          this.saving.set(false);
          const apiError = asApiError(error);
          if (apiError.code === 'ADMIN_EMAIL_TAKEN') {
            this.form.controls.email.setErrors({ server: adminUserErrorText(apiError) });
            this.form.controls.email.markAsTouched();
            return;
          }
          const unmatched = applyServerErrors(this.form, apiError);
          this.error.set(
            unmatched.length > 0
              ? unmatched.join(' ')
              : apiError.isValidation
                ? ''
                : adminUserErrorText(apiError),
          );
        },
      });
  }
}
