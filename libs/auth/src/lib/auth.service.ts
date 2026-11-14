import { computed, inject, Signal, signal } from '@angular/core';
import { ApiClient, ApiError, asApiError, AuthMode } from '@zladovce/api';
import { AdminMe } from '@zladovce/models';
import { firstValueFrom } from 'rxjs';
import { authError } from './auth-error';

/** `unknown` until `restore()` has checked for an existing session. */
export type AuthStatus = 'unknown' | 'signedOut' | 'signedIn';

/** What the sign-in form has to do next. */
export type SignInStep = 'done' | 'newPasswordRequired' | 'totpRequired';

export interface Credentials {
  email: string;
  password: string;
}

export type ProfileState =
  | { status: 'idle' | 'loading'; user: null; error: null }
  | { status: 'loaded'; user: AdminMe; error: null }
  | { status: 'error'; user: null; error: ApiError };

/** Why the administrator was sent back to the sign-in page. */
export type SignOutReason = 'sessionExpired' | 'notAllowed';

const NO_PROFILE: ProfileState = { status: 'idle', user: null, error: null };

/**
 * Authentication of administrators. Two implementations exist and the one in use is chosen
 * only by `config.json` (`auth.mode`): `CognitoAuthService` and `DevAuthService`.
 *
 * The class owns two things:
 *  - the session (does this browser hold credentials?) – implemented by subclasses;
 *  - the profile (`GET /admin/me`) – who the API says the administrator is, including the role.
 *
 * The API is the authority on roles; guards and directives here are convenience only (A6).
 */
export abstract class AuthService {
  private readonly api = inject(ApiClient);

  abstract readonly mode: AuthMode;
  /** False in dev mode, where the sign-in page offers a single button instead of a form. */
  abstract readonly requiresPassword: boolean;

  protected readonly statusState = signal<AuthStatus>('unknown');
  private readonly profileState = signal<ProfileState>(NO_PROFILE);
  private readonly signOutReasonState = signal<SignOutReason | null>(null);
  private restoring: Promise<boolean> | null = null;
  private loadingProfile: Promise<AdminMe | null> | null = null;

  readonly status: Signal<AuthStatus> = this.statusState.asReadonly();
  readonly isSignedIn = computed(() => this.statusState() === 'signedIn');
  readonly profile: Signal<ProfileState> = this.profileState.asReadonly();
  readonly user = computed(() => this.profileState().user);
  readonly role = computed(() => this.profileState().user?.role ?? null);
  readonly signOutReason: Signal<SignOutReason | null> = this.signOutReasonState.asReadonly();

  /** Starts sign-in. `credentials` are ignored in dev mode. */
  async signIn(credentials?: Credentials): Promise<SignInStep> {
    this.signOutReasonState.set(null);
    return this.finish(await this.startSignIn(credentials));
  }

  /** Answers the "new password required" challenge of an invited administrator. */
  async completeNewPassword(newPassword: string): Promise<SignInStep> {
    return this.finish(await this.submitNewPassword(newPassword));
  }

  /** Answers the TOTP challenge of an administrator with MFA enabled. */
  async confirmTotp(code: string): Promise<SignInStep> {
    return this.finish(await this.submitTotp(code));
  }

  async signOut(): Promise<void> {
    this.reset('signedOut', null);
    await this.clearSession().catch(() => undefined);
  }

  /**
   * Looks for an existing session once (page load) and resolves to whether one exists.
   * Later calls return the current state.
   */
  restore(): Promise<boolean> {
    if (this.statusState() !== 'unknown') {
      return Promise.resolve(this.isSignedIn());
    }
    this.restoring ??= this.hasSession()
      .catch(() => false)
      .then((signedIn) => {
        if (this.statusState() === 'unknown') {
          this.statusState.set(signedIn ? 'signedIn' : 'signedOut');
        }
        this.restoring = null;
        return this.isSignedIn();
      });
    return this.restoring;
  }

  /**
   * Headers that authenticate an API request, or null when signed out.
   * Used only by `authInterceptor`, which sends them to `apiBaseUrl` and nowhere else.
   */
  abstract credentialHeaders(): Promise<Record<string, string> | null>;

  /**
   * Loads `GET /admin/me` (cached; pass `force` to reload). Resolves to null when it cannot be
   * loaded – the reason is in `profile().error`. A 401 or 403 ends the session.
   */
  loadProfile(force = false): Promise<AdminMe | null> {
    if (!this.isSignedIn()) {
      return Promise.resolve(null);
    }
    const current = this.profileState();
    if (!force && current.status === 'loaded') {
      return Promise.resolve(current.user);
    }
    this.loadingProfile ??= this.fetchProfile().finally(() => (this.loadingProfile = null));
    return this.loadingProfile;
  }

  /** Called by `authInterceptor` when the API answers 401 to an authenticated request. */
  handleUnauthorized(): void {
    if (this.statusState() !== 'signedIn') {
      return;
    }
    this.reset('signedOut', 'sessionExpired');
    void this.clearSession().catch(() => undefined);
  }

  protected abstract startSignIn(credentials?: Credentials): Promise<SignInStep>;
  protected abstract submitNewPassword(newPassword: string): Promise<SignInStep>;
  protected abstract submitTotp(code: string): Promise<SignInStep>;
  /** True when the browser holds usable credentials. */
  protected abstract hasSession(): Promise<boolean>;
  /** Removes local credentials (and revokes them where the provider supports it). */
  protected abstract clearSession(): Promise<void>;

  private async finish(step: SignInStep): Promise<SignInStep> {
    if (step !== 'done') {
      return step;
    }
    this.statusState.set('signedIn');
    this.profileState.set(NO_PROFILE);
    await this.loadProfile(true);
    const { error } = this.profileState();
    if (this.statusState() !== 'signedIn') {
      // /admin/me refused the freshly issued credentials: not an active administrator.
      throw error?.isForbidden || error?.isUnauthorized
        ? authError('NOT_ALLOWED', error.isForbidden ? error.detail : undefined)
        : authError('UNKNOWN');
    }
    // Any other failure (API down) keeps the session; the shell shows the error with a retry.
    return 'done';
  }

  private async fetchProfile(): Promise<AdminMe | null> {
    this.profileState.set({ status: 'loading', user: null, error: null });
    try {
      const user = await firstValueFrom(this.api.get<AdminMe>('/admin/me'));
      if (!this.isSignedIn()) {
        return null;
      }
      this.profileState.set({ status: 'loaded', user, error: null });
      return user;
    } catch (caught) {
      const error = asApiError(caught);
      if (error.isForbidden || error.isUnauthorized) {
        this.reset('signedOut', error.isForbidden ? 'notAllowed' : 'sessionExpired');
        void this.clearSession().catch(() => undefined);
      }
      if (this.isSignedIn() || error.isForbidden || error.isUnauthorized) {
        this.profileState.set({ status: 'error', user: null, error });
      }
      return null;
    }
  }

  private reset(status: AuthStatus, reason: SignOutReason | null): void {
    this.statusState.set(status);
    this.profileState.set(NO_PROFILE);
    this.signOutReasonState.set(reason);
  }
}
