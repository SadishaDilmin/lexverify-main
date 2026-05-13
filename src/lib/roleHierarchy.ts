/**
 * Role hierarchy and permission utilities for user management.
 *
 * Hierarchy (highest to lowest):
 *   admin > support_admin > auditor > user
 */

export type AppRole = "super_admin" | "admin" | "support_admin" | "auditor" | "user";

const ROLE_RANK: Record<AppRole, number> = {
  super_admin: 150,
  admin: 100,
  support_admin: 75,
  auditor: 50,
  user: 10,
};

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  support_admin: "Support Admin",
  auditor: "Auditor",
  user: "User",
};

export const ALL_ROLES: AppRole[] = ["super_admin", "admin", "support_admin", "auditor", "user"];

/** Returns numeric rank for a role string */
export function roleRank(role: string): number {
  return ROLE_RANK[role as AppRole] ?? 0;
}

/** True if actor's role outranks or equals target role */
export function canManageRole(actorRole: string, targetRole: string): boolean {
  return roleRank(actorRole) >= roleRank(targetRole);
}

/** Returns roles the actor is allowed to assign (same level or below) */
export function assignableRoles(actorRole: string): AppRole[] {
  const rank = roleRank(actorRole);
  return ALL_ROLES.filter((r) => ROLE_RANK[r] <= rank);
}

/** Permission matrix — what each role can do */
export interface RolePermissions {
  canViewUsers: boolean;
  canCreateUsers: boolean;
  canEditUsers: boolean;
  canDeleteUsers: boolean;
  canManageRoles: boolean;
  canResetCredentials: boolean;
  canRevokeSession: boolean;
  canBulkActions: boolean;
  canExportUsers: boolean;
  canViewAuditLog: boolean;
  canPermanentDelete: boolean;
}

const PERMISSIONS: Record<AppRole, RolePermissions> = {
  super_admin: {
    canViewUsers: true,
    canCreateUsers: true,
    canEditUsers: true,
    canDeleteUsers: true,
    canManageRoles: true,
    canResetCredentials: true,
    canRevokeSession: true,
    canBulkActions: true,
    canExportUsers: true,
    canViewAuditLog: true,
    canPermanentDelete: true,
  },
  admin: {
    canViewUsers: true,
    canCreateUsers: true,
    canEditUsers: true,
    canDeleteUsers: true,
    canManageRoles: true,
    canResetCredentials: true,
    canRevokeSession: true,
    canBulkActions: true,
    canExportUsers: true,
    canViewAuditLog: true,
    canPermanentDelete: true,
  },
  support_admin: {
    canViewUsers: true,
    canCreateUsers: true,
    canEditUsers: true,
    canDeleteUsers: false,
    canManageRoles: false,
    canResetCredentials: true,
    canRevokeSession: false,
    canBulkActions: false,
    canExportUsers: true,
    canViewAuditLog: true,
    canPermanentDelete: false,
  },
  auditor: {
    canViewUsers: true,
    canCreateUsers: false,
    canEditUsers: false,
    canDeleteUsers: false,
    canManageRoles: false,
    canResetCredentials: false,
    canRevokeSession: false,
    canBulkActions: false,
    canExportUsers: true,
    canViewAuditLog: true,
    canPermanentDelete: false,
  },
  user: {
    canViewUsers: false,
    canCreateUsers: false,
    canEditUsers: false,
    canDeleteUsers: false,
    canManageRoles: false,
    canResetCredentials: false,
    canRevokeSession: false,
    canBulkActions: false,
    canExportUsers: false,
    canViewAuditLog: false,
    canPermanentDelete: false,
  },
};

export function getPermissions(role: string): RolePermissions {
  return PERMISSIONS[role as AppRole] ?? PERMISSIONS.user;
}
