import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetails } from '@zladovce/models';

/** Codes produced by the client itself when the response carries no Problem Details. */
export const ClientErrorCode = {
  Network: 'NETWORK_ERROR',
  Unauthorized: 'UNAUTHORIZED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  TooManyRequests: 'TOO_MANY_REQUESTS',
  Server: 'SERVER_ERROR',
  Unknown: 'UNKNOWN_ERROR',
} as const;

export interface ApiErrorInit {
  status: number;
  code: string;
  title: string;
  detail: string;
  errors?: Record<string, string[]>;
  traceId?: string;
  correlationId?: string;
  type?: string;
}

/**
 * The only error shape the rest of the application handles for HTTP failures.
 * `detail` is always a Serbian message that is safe to show to the user.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail: string;
  /** Field-level messages keyed by field path; empty when the error is not a validation error. */
  readonly errors: Readonly<Record<string, string[]>>;
  readonly traceId?: string;
  /** Value of the `X-Correlation-Id` header sent with the failed request. */
  readonly correlationId?: string;
  readonly type?: string;

  constructor(init: ApiErrorInit) {
    super(init.detail);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.title = init.title;
    this.detail = init.detail;
    this.errors = init.errors ?? {};
    this.traceId = init.traceId;
    this.correlationId = init.correlationId;
    this.type = init.type;
  }

  /** The request never reached the server (offline, DNS, CORS, server down). */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isValidation(): boolean {
    return Object.keys(this.errors).length > 0;
  }

  /** Messages for one field, e.g. `error.fieldErrors('items[0].quantity')`. */
  fieldErrors(field: string): string[] {
    return this.errors[field] ?? [];
  }
}

interface Fallback {
  code: string;
  title: string;
  detail: string;
}

function fallbackFor(status: number): Fallback {
  if (status === 0) {
    return {
      code: ClientErrorCode.Network,
      title: 'Nema veze sa serverom',
      detail: 'Server trenutno nije dostupan. Proverite internet vezu i pokušajte ponovo.',
    };
  }
  if (status === 401) {
    return {
      code: ClientErrorCode.Unauthorized,
      title: 'Potrebna je prijava',
      detail: 'Vaša prijava je istekla. Prijavite se ponovo.',
    };
  }
  if (status === 403) {
    return {
      code: ClientErrorCode.Forbidden,
      title: 'Pristup nije dozvoljen',
      detail: 'Nemate dozvolu za ovu radnju.',
    };
  }
  if (status === 404) {
    return {
      code: ClientErrorCode.NotFound,
      title: 'Nije pronađeno',
      detail: 'Traženi podatak nije pronađen.',
    };
  }
  if (status === 429) {
    return {
      code: ClientErrorCode.TooManyRequests,
      title: 'Previše zahteva',
      detail: 'Previše pokušaja u kratkom roku. Sačekajte malo i pokušajte ponovo.',
    };
  }
  if (status >= 500) {
    return {
      code: ClientErrorCode.Server,
      title: 'Greška na serveru',
      detail: 'Došlo je do greške na serveru. Pokušajte ponovo za nekoliko trenutaka.',
    };
  }
  return {
    code: ClientErrorCode.Unknown,
    title: 'Došlo je do greške',
    detail: 'Zahtev nije uspeo. Pokušajte ponovo.',
  };
}

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

function parseBody(body: unknown): Record<string, unknown> | null {
  if (typeof body === 'string') {
    // Responses requested as text (e.g. the health check) still carry JSON problem details.
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function parseFieldErrors(value: unknown): Record<string, string[]> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const result: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(value)) {
    const list = (Array.isArray(messages) ? messages : [messages]).filter(nonEmptyString);
    if (list.length > 0) {
      result[field] = list;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Reads the body as Problem Details; fields that are missing or of the wrong type are ignored. */
export function readProblemDetails(body: unknown): Partial<ProblemDetails> | null {
  const source = parseBody(body);
  if (!source) {
    return null;
  }
  const problem: Partial<ProblemDetails> = {};
  if (nonEmptyString(source['type'])) problem.type = source['type'];
  if (nonEmptyString(source['title'])) problem.title = source['title'];
  if (nonEmptyString(source['code'])) problem.code = source['code'];
  if (nonEmptyString(source['detail'])) problem.detail = source['detail'];
  if (nonEmptyString(source['traceId'])) problem.traceId = source['traceId'];
  if (typeof source['status'] === 'number') problem.status = source['status'];
  const errors = parseFieldErrors(source['errors']);
  if (errors) problem.errors = errors;
  return Object.keys(problem).length > 0 ? problem : null;
}

/**
 * Converts any failed HTTP response into an `ApiError`. Server-provided Problem Details win;
 * whatever is missing is filled with a Serbian fallback chosen by status code.
 */
export function toApiError(response: HttpErrorResponse, correlationId?: string): ApiError {
  const fallback = fallbackFor(response.status);
  const problem = response.status === 0 ? null : readProblemDetails(response.error);
  return new ApiError({
    status: response.status,
    code: problem?.code ?? fallback.code,
    title: problem?.title ?? fallback.title,
    detail: problem?.detail ?? fallback.detail,
    errors: problem?.errors,
    traceId: problem?.traceId,
    type: problem?.type,
    correlationId,
  });
}

/** Normalises anything caught in a `catch`/`catchError` into an `ApiError`. */
export function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof HttpErrorResponse) {
    return toApiError(error);
  }
  const fallback = fallbackFor(-1);
  return new ApiError({ status: -1, ...fallback });
}
