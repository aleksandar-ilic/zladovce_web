export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'INVALID_NEW_PASSWORD'
  | 'INVALID_CODE'
  | 'TOO_MANY_ATTEMPTS'
  | 'PASSWORD_RESET_REQUIRED'
  | 'ACCOUNT_DISABLED'
  | 'SESSION_EXPIRED'
  | 'NOT_ALLOWED'
  | 'UNSUPPORTED_STEP'
  | 'NETWORK'
  | 'UNKNOWN';

/** Sign-in failure with a Serbian message that can be shown to the administrator as is. */
export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

const MESSAGES: Record<AuthErrorCode, string> = {
  // The same text for an unknown address and a wrong password, so accounts cannot be enumerated.
  INVALID_CREDENTIALS: 'Pogrešna e-adresa ili lozinka.',
  INVALID_NEW_PASSWORD:
    'Nova lozinka ne ispunjava pravila za lozinke. Izaberite dužu i složeniju lozinku.',
  INVALID_CODE: 'Kod nije ispravan ili je istekao. Pokušajte ponovo.',
  TOO_MANY_ATTEMPTS: 'Previše pokušaja. Sačekajte nekoliko minuta i pokušajte ponovo.',
  PASSWORD_RESET_REQUIRED: 'Lozinka mora da se promeni. Obratite se vlasniku naloga.',
  ACCOUNT_DISABLED: 'Nalog je deaktiviran. Obratite se vlasniku naloga.',
  SESSION_EXPIRED: 'Prijava je istekla. Prijavite se ponovo.',
  NOT_ALLOWED: 'Vaš nalog nema pristup administraciji.',
  UNSUPPORTED_STEP: 'Ovaj način prijave nije podržan. Obratite se vlasniku naloga.',
  NETWORK: 'Servis za prijavu trenutno nije dostupan. Proverite internet vezu i pokušajte ponovo.',
  UNKNOWN: 'Prijava nije uspela. Pokušajte ponovo.',
};

export function authError(code: AuthErrorCode, message?: string): AuthError {
  return new AuthError(code, message ?? MESSAGES[code]);
}

/** Cognito exception names → our codes. Anything unknown becomes UNKNOWN (never the raw English text). */
const COGNITO_CODES: Record<string, AuthErrorCode> = {
  NotAuthorizedException: 'INVALID_CREDENTIALS',
  UserNotFoundException: 'INVALID_CREDENTIALS',
  InvalidPasswordException: 'INVALID_NEW_PASSWORD',
  PasswordHistoryPolicyViolationException: 'INVALID_NEW_PASSWORD',
  CodeMismatchException: 'INVALID_CODE',
  ExpiredCodeException: 'INVALID_CODE',
  EnableSoftwareTokenMFAException: 'INVALID_CODE',
  LimitExceededException: 'TOO_MANY_ATTEMPTS',
  TooManyRequestsException: 'TOO_MANY_ATTEMPTS',
  TooManyFailedAttemptsException: 'TOO_MANY_ATTEMPTS',
  PasswordResetRequiredException: 'PASSWORD_RESET_REQUIRED',
  UserNotConfirmedException: 'ACCOUNT_DISABLED',
  NetworkError: 'NETWORK',
};

export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) {
    return error;
  }
  const name =
    typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : null;
  const message =
    typeof error === 'object' && error !== null ? (error as { message?: unknown }).message : null;
  if (name === 'NotAuthorizedException' && typeof message === 'string') {
    if (/disabled/i.test(message)) {
      return authError('ACCOUNT_DISABLED');
    }
    if (/attempts exceeded/i.test(message)) {
      return authError('TOO_MANY_ATTEMPTS');
    }
    if (/session/i.test(message)) {
      return authError('SESSION_EXPIRED');
    }
  }
  if (
    error instanceof TypeError ||
    (typeof message === 'string' && /network|fetch/i.test(message))
  ) {
    return authError('NETWORK');
  }
  return authError(typeof name === 'string' ? (COGNITO_CODES[name] ?? 'UNKNOWN') : 'UNKNOWN');
}
