/**
 * Audit Export Role Guard
 * 
 * Enforces role-based access control for specific audit export operations.
 * Supports decorator-based permission requirements.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseClientService } from '../../database/supabase-client.service';
import { AuditExportRole, ROLE_PERMISSIONS, AuditExportPermission } from '../types';

// Decorator for setting required permissions
export const REQUIRED_PERMISSIONS_KEY = 'requiredAuditPermissions';
export const RequireAuditPermissions = (...permissions: AuditExportPermission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

// Decorator for setting allowed roles
export const ALLOWED_ROLES_KEY = 'allowedAuditRoles';
export const AllowAuditRoles = (...roles: AuditExportRole[]) =>
  SetMetadata(ALLOWED_ROLES_KEY, roles);

@Injectable()
export class AuditExportRoleGuard implements CanActivate {
  constructor(
    private readonly supabase: SupabaseClientService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.id) {
      throw new UnauthorizedException('Authentication required');
    }

    // Get role from admin_roles table
    const client = this.supabase.getClient();
    const { data: adminRole, error } = await client
      .from('admin_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      throw new ForbiddenException('Failed to verify role');
    }

    // Default to VIEW_ONLY_AUDIT if no role found
    const role = (adminRole?.role as AuditExportRole) || AuditExportRole.VIEW_ONLY_AUDIT;
    const permissions = ROLE_PERMISSIONS[role] || [];

    // Attach to request
    request.user.auditRole = role;
    request.user.auditPermissions = permissions;

    // Check required roles (if decorator used)
    const allowedRoles = this.reflector.getAllAndOverride<AuditExportRole[]>(
      ALLOWED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (allowedRoles && allowedRoles.length > 0) {
      if (!allowedRoles.includes(role)) {
        throw new ForbiddenException(
          `Role ${role} is not authorized. Required: ${allowedRoles.join(' or ')}`,
        );
      }
    }

    // Check required permissions (if decorator used)
    const requiredPermissions = this.reflector.getAllAndOverride<AuditExportPermission[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasAllPermissions = requiredPermissions.every((perm) =>
        permissions.includes(perm),
      );

      if (!hasAllPermissions) {
        throw new ForbiddenException(
          `Missing required permissions: ${requiredPermissions.filter(
            (p) => !permissions.includes(p),
          ).join(', ')}`,
        );
      }
    }

    return true;
  }
}

/**
 * Helper to check if user has a specific permission
 */
export function hasPermission(
  permissions: AuditExportPermission[],
  required: AuditExportPermission,
): boolean {
  return permissions.includes(required);
}

/**
 * Helper to check if user has any of the specified permissions
 */
export function hasAnyPermission(
  permissions: AuditExportPermission[],
  required: AuditExportPermission[],
): boolean {
  return required.some((r) => permissions.includes(r));
}

/**
 * Helper to check if user has all of the specified permissions
 */
export function hasAllPermissions(
  permissions: AuditExportPermission[],
  required: AuditExportPermission[],
): boolean {
  return required.every((r) => permissions.includes(r));
}
