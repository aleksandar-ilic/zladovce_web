/**
 * API contract types.
 *
 * Phase 2 contains only what the API exposes today and is written by hand.
 * From Phase 3 on, endpoint DTOs come from `npm run generate:models`
 * (output: ./generated/zladovce-v1.ts) and are re-exported from here.
 */

/** RFC 9457 Problem Details as returned by the Zladovce API. `detail` is a Serbian, user-facing message. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  /** Stable machine-readable code, e.g. `INSUFFICIENT_STOCK`. */
  code: string;
  detail: string;
  /** Field-level validation messages keyed by field path. */
  errors?: Record<string, string[]>;
  traceId: string;
}

/** Envelope of every paged list response. `page` starts at 1. */
export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** Query parameters accepted by paged list endpoints. */
export interface PageQuery {
  page?: number;
  pageSize?: number;
  sort?: string;
}

/** Administrator roles; values match the Cognito group names. */
export const AdminRole = {
  Owner: 'Owner',
  Staff: 'Staff',
} as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

export const ADMIN_ROLES: readonly AdminRole[] = [AdminRole.Owner, AdminRole.Staff];

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && (ADMIN_ROLES as readonly string[]).includes(value);
}

/** Response of `GET /api/v1/admin/me`. */
export interface AdminMe {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
}
