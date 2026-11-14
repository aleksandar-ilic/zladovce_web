import { AdminMe, AdminRole } from '@zladovce/models';

export type RoleRequirement = AdminRole | readonly AdminRole[];

/**
 * True when the administrator holds one of the required roles.
 * No user means no access; an empty requirement means "any signed-in administrator".
 */
export function hasRole(
  user: Pick<AdminMe, 'role'> | null | undefined,
  required: RoleRequirement | null | undefined,
): boolean {
  if (!user) {
    return false;
  }
  if (required === null || required === undefined) {
    return true;
  }
  const roles: readonly AdminRole[] = typeof required === 'string' ? [required] : required;
  return roles.length === 0 || roles.includes(user.role);
}
