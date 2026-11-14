import { AuthMode, DevAuthConfig } from '@zladovce/api';
import { authError } from './auth-error';
import { AuthService, SignInStep } from './auth.service';

export const DEV_EMAIL_HEADER = 'X-Dev-User-Email';
export const DEV_ROLE_HEADER = 'X-Dev-User-Role';
/** Marks the tab as signed in so a reload keeps the dev session. Holds no credential. */
export const DEV_SESSION_KEY = 'zladovce.admin.dev-session';

function tabStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Local development sign-in: no password; requests carry `X-Dev-User-Email` and
 * `X-Dev-User-Role`, which only a backend running in Development accepts.
 *
 * It is created exclusively by `createAuthService` when `config.json` says `auth.mode = "dev"`.
 */
export class DevAuthService extends AuthService {
  readonly mode: AuthMode = 'dev';
  readonly requiresPassword = false;
  private readonly storage = tabStorage();

  constructor(readonly identity: DevAuthConfig) {
    super();
  }

  credentialHeaders(): Promise<Record<string, string> | null> {
    return Promise.resolve(
      this.isSignedIn()
        ? { [DEV_EMAIL_HEADER]: this.identity.email, [DEV_ROLE_HEADER]: this.identity.role }
        : null,
    );
  }

  protected startSignIn(): Promise<SignInStep> {
    this.storage?.setItem(DEV_SESSION_KEY, '1');
    return Promise.resolve('done');
  }

  protected submitNewPassword(): Promise<SignInStep> {
    return Promise.reject(authError('UNSUPPORTED_STEP'));
  }

  protected submitTotp(): Promise<SignInStep> {
    return Promise.reject(authError('UNSUPPORTED_STEP'));
  }

  protected hasSession(): Promise<boolean> {
    return Promise.resolve(this.storage?.getItem(DEV_SESSION_KEY) === '1');
  }

  protected clearSession(): Promise<void> {
    this.storage?.removeItem(DEV_SESSION_KEY);
    return Promise.resolve();
  }
}
