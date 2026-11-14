import { ApiError } from '@zladovce/api';

/** State of one remote resource on a page: the loading, error and loaded states of A5. */
export type Remote<T> =
  { status: 'loading' } | { status: 'error'; error: ApiError } | { status: 'loaded'; data: T };

export const LOADING: Remote<never> = { status: 'loading' };

export function dataOf<T>(remote: Remote<T>): T | null {
  return remote.status === 'loaded' ? remote.data : null;
}
