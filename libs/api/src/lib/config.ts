import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { AdminRole, isAdminRole } from '@zladovce/models';

/**
 * Runtime configuration, loaded from `/config.json` before the application bootstraps.
 * The file is public: it must contain only values that are safe to show to anyone
 * (URLs, Cognito pool and client ids). Never put secrets in it.
 */
export interface AppConfig {
  /** Absolute API base URL including the version, e.g. `http://localhost:5080/api/v1`. No trailing slash. */
  apiBaseUrl: string;
  /** Health endpoint. Defaults to `/health` on the origin of `apiBaseUrl`. */
  healthUrl: string;
  /** Present only in the admin app. */
  auth?: AuthConfig;
}

export type AuthMode = 'cognito' | 'dev';

export interface CognitoAuthConfig {
  region: string;
  userPoolId: string;
  clientId: string;
}

export interface DevAuthConfig {
  email: string;
  role: AdminRole;
}

export type AuthConfig =
  { mode: 'cognito'; cognito: CognitoAuthConfig } | { mode: 'dev'; dev: DevAuthConfig };

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

export function provideAppConfig(config: AppConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: APP_CONFIG, useValue: config }]);
}

/** Thrown when `config.json` is missing or invalid. The message is for developers and operators. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(`config.json: ${message}`);
    this.name = 'ConfigError';
  }
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function requiredString(source: Json, key: string, path: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigError(`"${path}" is missing or empty.`);
  }
  return value.trim();
}

function absoluteHttpUrl(value: string, path: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`"${path}" must be an absolute URL, got "${value}".`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(`"${path}" must use http or https, got "${value}".`);
  }
  return url;
}

function parseAuth(raw: unknown): AuthConfig {
  if (!isObject(raw)) {
    throw new ConfigError('"auth" must be an object.');
  }
  const mode = raw['mode'];
  if (mode === 'cognito') {
    const cognito = raw['cognito'];
    if (!isObject(cognito)) {
      throw new ConfigError('"auth.cognito" is required when auth.mode is "cognito".');
    }
    return {
      mode,
      cognito: {
        region: requiredString(cognito, 'region', 'auth.cognito.region'),
        userPoolId: requiredString(cognito, 'userPoolId', 'auth.cognito.userPoolId'),
        clientId: requiredString(cognito, 'clientId', 'auth.cognito.clientId'),
      },
    };
  }
  if (mode === 'dev') {
    const dev = raw['dev'];
    if (!isObject(dev)) {
      throw new ConfigError('"auth.dev" is required when auth.mode is "dev".');
    }
    const role = dev['role'];
    if (!isAdminRole(role)) {
      throw new ConfigError('"auth.dev.role" must be "Owner" or "Staff".');
    }
    return { mode, dev: { email: requiredString(dev, 'email', 'auth.dev.email'), role } };
  }
  // Anything else is rejected: there is no implicit default and, in particular, no fallback to dev.
  throw new ConfigError('"auth.mode" must be "cognito" or "dev".');
}

export interface ParseConfigOptions {
  /** The admin app requires the `auth` section; the storefront ignores it. */
  requireAuth?: boolean;
}

/** Validates and normalises raw configuration. Throws `ConfigError` with a precise reason. */
export function parseAppConfig(raw: unknown, options: ParseConfigOptions = {}): AppConfig {
  if (!isObject(raw)) {
    throw new ConfigError('the file must contain a JSON object.');
  }
  const apiUrl = absoluteHttpUrl(requiredString(raw, 'apiBaseUrl', 'apiBaseUrl'), 'apiBaseUrl');
  const apiBaseUrl = apiUrl.href.replace(/\/+$/, '');

  const rawHealth = raw['healthUrl'];
  const healthUrl =
    typeof rawHealth === 'string' && rawHealth.trim() !== ''
      ? absoluteHttpUrl(rawHealth.trim(), 'healthUrl').href
      : new URL('/health', apiUrl).href;

  const config: AppConfig = { apiBaseUrl, healthUrl };
  if (options.requireAuth) {
    if (raw['auth'] === undefined) {
      throw new ConfigError('"auth" is required for the admin application.');
    }
    config.auth = parseAuth(raw['auth']);
  }
  return config;
}

/**
 * Fetches and validates `/config.json`. Call it in `main.ts` before `bootstrapApplication`.
 * The file is requested with `no-store` so a new deployment is picked up immediately.
 */
export async function loadAppConfig(
  options: ParseConfigOptions & { url?: string; fetchFn?: typeof fetch } = {},
): Promise<AppConfig> {
  const { url = '/config.json', fetchFn = fetch, ...parseOptions } = options;
  let response: Response;
  try {
    response = await fetchFn(url, { cache: 'no-store' });
  } catch {
    throw new ConfigError(`could not be loaded from ${url} (network error).`);
  }
  if (!response.ok) {
    throw new ConfigError(`could not be loaded from ${url} (HTTP ${response.status}).`);
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new ConfigError('is not valid JSON.');
  }
  return parseAppConfig(raw, parseOptions);
}
