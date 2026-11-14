import {
  EnvironmentProviders,
  inject,
  InjectionToken,
  makeEnvironmentProviders,
} from '@angular/core';
import { APP_CONFIG, AppConfig, ConfigError } from '@zladovce/api';
import { AuthService } from './auth.service';
import { CognitoAuthService } from './cognito-auth.service';
import { AmplifyCognitoClient, CognitoClient } from './cognito-client';
import { DevAuthService } from './dev-auth.service';

export interface AuthRoutes {
  /** Where signed-out administrators are sent. */
  signIn: string;
  /** Where signed-in administrators land (and where a missing role redirects to). */
  home: string;
}

export const AUTH_ROUTES = new InjectionToken<AuthRoutes>('AUTH_ROUTES', {
  factory: () => ({ signIn: '/prijava', home: '/' }),
});

/**
 * The single place where the auth implementation is chosen. Must run in an injection context.
 *
 * Dev sign-in is returned only for the exact value `auth.mode === 'dev'`; there is no
 * environment flag, URL parameter or default that leads to it. A missing or unknown mode is
 * an error (and is already rejected when `config.json` is parsed).
 */
export function createAuthService(
  config: AppConfig,
  cognitoClientFactory: (config: AppConfig) => CognitoClient | null = () => null,
): AuthService {
  const auth = config.auth;
  if (auth?.mode === 'cognito') {
    return new CognitoAuthService(
      cognitoClientFactory(config) ?? new AmplifyCognitoClient(auth.cognito),
    );
  }
  if (auth?.mode === 'dev') {
    console.warn(
      `[auth] Razvojni režim prijave je uključen (config.json: auth.mode = "dev", ${auth.dev.email}, ${auth.dev.role}). Nikada ga ne koristite u produkciji.`,
    );
    return new DevAuthService(auth.dev);
  }
  throw new ConfigError('"auth.mode" must be "cognito" or "dev".');
}

/** Registers `AuthService` for the admin app. */
export function provideAuth(routes?: Partial<AuthRoutes>): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: AuthService, useFactory: () => createAuthService(inject(APP_CONFIG)) },
    ...(routes
      ? [{ provide: AUTH_ROUTES, useValue: { signIn: '/prijava', home: '/', ...routes } }]
      : []),
  ]);
}
