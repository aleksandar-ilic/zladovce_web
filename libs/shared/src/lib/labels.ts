import { AdminRole } from '@zladovce/models';

/** Serbian names of the administrator roles (ARCHITECTURE.md A6). */
export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  Owner: 'Vlasnik',
  Staff: 'Urednik',
};

export function adminRoleLabel(role: AdminRole | null | undefined): string {
  return role ? (ADMIN_ROLE_LABELS[role] ?? role) : '';
}
