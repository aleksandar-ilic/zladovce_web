import { CognitoAuthConfig } from '@zladovce/api';

/** Result of a Cognito sign-in call: the step name exactly as Amplify reports it. */
export type CognitoStep = string;

/**
 * The small part of Cognito the admin app needs. `CognitoAuthService` depends on this
 * interface, so its logic is unit-tested without the Amplify library or a network.
 */
export interface CognitoClient {
  /** Email + password sign-in with the SRP flow (the password never leaves the browser). */
  signIn(email: string, password: string): Promise<CognitoStep>;
  /** Answers the pending challenge (new password, TOTP code). */
  confirmSignIn(challengeResponse: string): Promise<CognitoStep>;
  signOut(): Promise<void>;
  /** Current access token, refreshed by the library when expired; null when signed out. */
  accessToken(): Promise<string | null>;
}

/**
 * `CognitoClient` backed by `aws-amplify` v6 (auth module only).
 *
 * - The library is loaded lazily, so it is not downloaded in dev auth mode.
 * - Tokens are kept by the library in `sessionStorage` instead of its default `localStorage`:
 *   they survive a reload but end with the tab, and nothing is written to `localStorage`.
 * - Token refresh is handled by `fetchAuthSession`.
 */
export class AmplifyCognitoClient implements CognitoClient {
  private ready: Promise<typeof import('aws-amplify/auth')> | null = null;

  constructor(private readonly config: CognitoAuthConfig) {}

  async signIn(email: string, password: string): Promise<CognitoStep> {
    const auth = await this.load();
    const attempt = () => auth.signIn({ username: email, password });
    try {
      return (await attempt()).nextStep.signInStep;
    } catch (error) {
      if ((error as { name?: string } | null)?.name !== 'UserAlreadyAuthenticatedException') {
        throw error;
      }
      // A stale session of another administrator in this tab: replace it.
      await auth.signOut();
      return (await attempt()).nextStep.signInStep;
    }
  }

  async confirmSignIn(challengeResponse: string): Promise<CognitoStep> {
    const auth = await this.load();
    return (await auth.confirmSignIn({ challengeResponse })).nextStep.signInStep;
  }

  async signOut(): Promise<void> {
    const auth = await this.load();
    await auth.signOut();
  }

  async accessToken(): Promise<string | null> {
    const auth = await this.load();
    try {
      const session = await auth.fetchAuthSession();
      return session.tokens?.accessToken?.toString() ?? null;
    } catch {
      return null;
    }
  }

  private load(): Promise<typeof import('aws-amplify/auth')> {
    this.ready ??= (async () => {
      const [{ Amplify }, auth, { cognitoUserPoolsTokenProvider }, { sessionStorage }] =
        await Promise.all([
          import('aws-amplify'),
          import('aws-amplify/auth'),
          import('aws-amplify/auth/cognito'),
          import('aws-amplify/utils'),
        ]);
      Amplify.configure({
        Auth: {
          Cognito: {
            userPoolId: this.config.userPoolId,
            userPoolClientId: this.config.clientId,
          },
        },
      });
      cognitoUserPoolsTokenProvider.setKeyValueStorage(sessionStorage);
      return auth;
    })();
    return this.ready;
  }
}
