import { AuthMode } from '@zladovce/api';
import { authError, toAuthError } from './auth-error';
import { AuthService, Credentials, SignInStep } from './auth.service';
import { CognitoClient, CognitoStep } from './cognito-client';

function toStep(step: CognitoStep): SignInStep {
  switch (step) {
    case 'DONE':
      return 'done';
    case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED':
      return 'newPasswordRequired';
    case 'CONFIRM_SIGN_IN_WITH_TOTP_CODE':
      return 'totpRequired';
    case 'RESET_PASSWORD':
      throw authError('PASSWORD_RESET_REQUIRED');
    default:
      // SMS/e-mail codes, MFA setup, custom challenges: not part of the admin sign-in.
      throw authError('UNSUPPORTED_STEP');
  }
}

/**
 * Production sign-in against the Cognito user pool: e-mail + password (SRP), the
 * new-password challenge of invited administrators, optional TOTP, refresh and sign-out.
 * API requests carry the access token as `Authorization: Bearer …`.
 */
export class CognitoAuthService extends AuthService {
  readonly mode: AuthMode = 'cognito';
  readonly requiresPassword = true;

  constructor(private readonly cognito: CognitoClient) {
    super();
  }

  async credentialHeaders(): Promise<Record<string, string> | null> {
    if (!this.isSignedIn()) {
      return null;
    }
    const token = await this.cognito.accessToken();
    return token ? { Authorization: `Bearer ${token}` } : null;
  }

  protected async startSignIn(credentials?: Credentials): Promise<SignInStep> {
    if (!credentials?.email || !credentials.password) {
      throw authError('INVALID_CREDENTIALS');
    }
    try {
      return toStep(await this.cognito.signIn(credentials.email.trim(), credentials.password));
    } catch (error) {
      throw toAuthError(error);
    }
  }

  protected async submitNewPassword(newPassword: string): Promise<SignInStep> {
    return this.confirm(newPassword);
  }

  protected async submitTotp(code: string): Promise<SignInStep> {
    return this.confirm(code.replace(/\s+/g, ''));
  }

  protected async hasSession(): Promise<boolean> {
    return (await this.cognito.accessToken()) !== null;
  }

  protected clearSession(): Promise<void> {
    return this.cognito.signOut();
  }

  private async confirm(response: string): Promise<SignInStep> {
    try {
      return toStep(await this.cognito.confirmSignIn(response));
    } catch (error) {
      throw toAuthError(error);
    }
  }
}
