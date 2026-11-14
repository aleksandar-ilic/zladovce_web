import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { APP_CONFIG } from '@zladovce/api';
import { AUTH_ROUTES, AuthService, safeReturnUrl, SignInStep, toAuthError } from '@zladovce/auth';
import { adminRoleLabel, matchingValues } from '@zladovce/shared';
import { validationMessage } from '@zladovce/ui';

type Step = 'credentials' | 'newPassword' | 'totp';

const NEW_PASSWORD_MIN_LENGTH = 8;

/**
 * Sign-in for administrators.
 *  - cognito mode: e-mail + password, then (when Cognito asks) a new password for invited
 *    administrators or the code from the authenticator app.
 *  - dev mode (local development only): one button, no password.
 */
@Component({
  selector: 'adm-sign-in-page',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-dvh items-center justify-center bg-cream-100 px-5 py-10' },
  template: `
    <main class="w-full max-w-md">
      <p class="text-center font-serif text-4xl font-semibold text-olive-800">Zladovce</p>

      <div
        class="relative mt-8 overflow-hidden rounded-lg border border-cream-200 bg-white shadow-card"
      >
        @if (submitting()) {
          <mat-progress-bar
            class="absolute inset-x-0 top-0"
            mode="indeterminate"
            aria-label="Prijavljivanje je u toku"
          />
        }

        <div class="p-7 sm:p-9">
          <h1 class="text-2xl">{{ heading() }}</h1>

          @if (notice(); as text) {
            <p
              class="mt-4 rounded-md bg-warning-50 px-4 py-3 text-sm text-warning-700"
              role="status"
              data-testid="notice"
            >
              {{ text }}
            </p>
          }
          @if (error(); as text) {
            <p
              class="mt-4 rounded-md bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
              role="alert"
              data-testid="error"
            >
              {{ text }}
            </p>
          }

          @if (!auth.requiresPassword) {
            <p class="mt-4 text-sm text-ink-700">
              Razvojni režim prijave je uključen u <code>config.json</code>. Lozinka nije potrebna,
              a prijavljujete se kao:
            </p>
            <dl class="mt-4 rounded-md bg-sage-50 px-4 py-3 text-sm">
              <div class="flex justify-between gap-4">
                <dt class="text-ink-500">E-adresa</dt>
                <dd class="font-semibold">{{ devIdentity()?.email }}</dd>
              </div>
              <div class="mt-1 flex justify-between gap-4">
                <dt class="text-ink-500">Uloga</dt>
                <dd class="font-semibold">{{ devRole() }}</dd>
              </div>
            </dl>
            <button
              matButton="filled"
              type="button"
              class="mt-6 w-full"
              [disabled]="submitting()"
              (click)="signInDev()"
            >
              {{ submitting() ? 'Prijavljivanje…' : 'Prijavi se' }}
            </button>
          } @else {
            @switch (step()) {
              @case ('credentials') {
                <form
                  class="mt-6 flex flex-col gap-2"
                  [formGroup]="credentialsForm"
                  (ngSubmit)="submitCredentials()"
                  novalidate
                >
                  <mat-form-field appearance="outline">
                    <mat-label>E-adresa</mat-label>
                    <input
                      matInput
                      type="email"
                      formControlName="email"
                      autocomplete="username"
                      inputmode="email"
                    />
                    @if (credentialsForm.controls.email.errors; as errors) {
                      <mat-error>{{ message(errors) }}</mat-error>
                    }
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Lozinka</mat-label>
                    <input
                      matInput
                      type="password"
                      formControlName="password"
                      autocomplete="current-password"
                    />
                    @if (credentialsForm.controls.password.errors; as errors) {
                      <mat-error>{{ message(errors) }}</mat-error>
                    }
                  </mat-form-field>
                  <button
                    matButton="filled"
                    type="submit"
                    class="mt-2 w-full"
                    [disabled]="submitting()"
                  >
                    {{ submitting() ? 'Prijavljivanje…' : 'Prijavi se' }}
                  </button>
                </form>
              }
              @case ('newPassword') {
                <p class="mt-4 text-sm text-ink-700">
                  Ovo je vaša prva prijava. Izaberite novu lozinku koju ćete ubuduće koristiti.
                </p>
                <form
                  class="mt-6 flex flex-col gap-2"
                  [formGroup]="newPasswordForm"
                  (ngSubmit)="submitNewPassword()"
                  novalidate
                >
                  <mat-form-field appearance="outline">
                    <mat-label>Nova lozinka</mat-label>
                    <input
                      matInput
                      type="password"
                      formControlName="password"
                      autocomplete="new-password"
                    />
                    <mat-hint>Najmanje {{ minLength }} znakova.</mat-hint>
                    @if (newPasswordForm.controls.password.errors; as errors) {
                      <mat-error>{{ message(errors) }}</mat-error>
                    }
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Ponovite novu lozinku</mat-label>
                    <input
                      matInput
                      type="password"
                      formControlName="confirm"
                      autocomplete="new-password"
                    />
                    @if (newPasswordForm.controls.confirm.errors; as errors) {
                      <mat-error>{{ message(errors) }}</mat-error>
                    }
                  </mat-form-field>
                  @if (passwordMismatch()) {
                    <p
                      class="text-sm font-medium text-danger-700"
                      role="alert"
                      data-testid="mismatch"
                    >
                      Lozinke se ne poklapaju.
                    </p>
                  }
                  <button
                    matButton="filled"
                    type="submit"
                    class="mt-2 w-full"
                    [disabled]="submitting()"
                  >
                    {{ submitting() ? 'Čuvanje…' : 'Sačuvaj lozinku i prijavi se' }}
                  </button>
                  <button
                    matButton
                    type="button"
                    class="w-full"
                    [disabled]="submitting()"
                    (click)="backToCredentials()"
                  >
                    Nazad na prijavu
                  </button>
                </form>
              }
              @case ('totp') {
                <p class="mt-4 text-sm text-ink-700">
                  Unesite šestocifreni kod iz aplikacije za potvrdu identiteta.
                </p>
                <form
                  class="mt-6 flex flex-col gap-2"
                  [formGroup]="totpForm"
                  (ngSubmit)="submitTotp()"
                  novalidate
                >
                  <mat-form-field appearance="outline">
                    <mat-label>Kod</mat-label>
                    <input
                      matInput
                      type="text"
                      formControlName="code"
                      autocomplete="one-time-code"
                      inputmode="numeric"
                      maxlength="7"
                    />
                    @if (totpForm.controls.code.errors; as errors) {
                      <mat-error>{{
                        message(errors, { pattern: 'Kod ima šest cifara.' })
                      }}</mat-error>
                    }
                  </mat-form-field>
                  <button
                    matButton="filled"
                    type="submit"
                    class="mt-2 w-full"
                    [disabled]="submitting()"
                  >
                    {{ submitting() ? 'Provera…' : 'Potvrdi' }}
                  </button>
                  <button
                    matButton
                    type="button"
                    class="w-full"
                    [disabled]="submitting()"
                    (click)="backToCredentials()"
                  >
                    Nazad na prijavu
                  </button>
                </form>
              }
            }
          }
        </div>
      </div>
    </main>
  `,
})
export class SignInPage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authRoutes = inject(AUTH_ROUTES);
  private readonly config = inject(APP_CONFIG);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly minLength = NEW_PASSWORD_MIN_LENGTH;
  protected readonly message = validationMessage;

  protected readonly step = signal<Step>('credentials');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  /** True once the new-password form was submitted with two different values. */
  protected readonly passwordMismatch = signal(false);

  protected readonly heading = computed(() => {
    switch (this.step()) {
      case 'newPassword':
        return 'Postavite novu lozinku';
      case 'totp':
        return 'Potvrda identiteta';
      default:
        return 'Prijava u administraciju';
    }
  });

  /** Why the administrator ended up here, when it was not their own choice. */
  protected readonly notice = computed(() =>
    !this.error() && this.auth.signOutReason() === 'sessionExpired'
      ? 'Prijava je istekla. Prijavite se ponovo.'
      : null,
  );

  protected readonly devIdentity = computed(() =>
    this.config.auth?.mode === 'dev' ? this.config.auth.dev : null,
  );
  protected readonly devRole = computed(() => adminRoleLabel(this.devIdentity()?.role));

  protected readonly credentialsForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected readonly newPasswordForm = this.fb.group(
    {
      password: ['', [Validators.required, Validators.minLength(NEW_PASSWORD_MIN_LENGTH)]],
      confirm: ['', [Validators.required]],
    },
    { validators: matchingValues('password', 'confirm') },
  );

  protected readonly totpForm = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^\s*\d{3}\s?\d{3}\s*$/)]],
  });

  constructor() {
    if (this.auth.signOutReason() === 'notAllowed') {
      this.error.set(this.auth.profile().error?.detail ?? 'Vaš nalog nema pristup administraciji.');
    }
  }

  protected signInDev(): Promise<void> {
    return this.run(() => this.auth.signIn());
  }

  protected submitCredentials(): Promise<void> {
    if (this.credentialsForm.invalid) {
      this.credentialsForm.markAllAsTouched();
      return Promise.resolve();
    }
    return this.run(() => this.auth.signIn(this.credentialsForm.getRawValue()));
  }

  protected submitNewPassword(): Promise<void> {
    this.passwordMismatch.set(this.newPasswordForm.hasError('mismatch'));
    if (this.newPasswordForm.invalid) {
      this.newPasswordForm.markAllAsTouched();
      return Promise.resolve();
    }
    return this.run(() =>
      this.auth.completeNewPassword(this.newPasswordForm.controls.password.value),
    );
  }

  protected submitTotp(): Promise<void> {
    if (this.totpForm.invalid) {
      this.totpForm.markAllAsTouched();
      return Promise.resolve();
    }
    return this.run(() => this.auth.confirmTotp(this.totpForm.controls.code.value));
  }

  protected backToCredentials(): void {
    this.error.set(null);
    this.passwordMismatch.set(false);
    this.newPasswordForm.reset();
    this.totpForm.reset();
    this.credentialsForm.controls.password.reset();
    this.step.set('credentials');
  }

  private async run(action: () => Promise<SignInStep>): Promise<void> {
    if (this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    try {
      const next = await action();
      if (next === 'done') {
        const target = safeReturnUrl(
          this.route.snapshot.queryParamMap.get('returnUrl'),
          this.authRoutes.home,
        );
        await this.router.navigateByUrl(target);
      } else {
        this.step.set(next === 'newPasswordRequired' ? 'newPassword' : 'totp');
      }
    } catch (caught) {
      const error = toAuthError(caught);
      this.error.set(error.message);
      if (error.code === 'SESSION_EXPIRED' || error.code === 'NOT_ALLOWED') {
        // The challenge can no longer be answered: start again from e-mail and password.
        this.newPasswordForm.reset();
        this.totpForm.reset();
        this.passwordMismatch.set(false);
        this.step.set('credentials');
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
