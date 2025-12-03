/**
 * PTA Compliance Guard
 * 
 * Restricts access to PTA audit export operations to users
 * with PTA_COMPLIANCE_OFFICER or SUPER_ADMIN roles only.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseClientService } from '../../database/supabase-client.service';
import { AuditExportRole, ROLE_PERMISSIONS } from '../types';

export const PTA_COMPLIANCE_ROLES = [
  AuditExportRole.SUPER_ADMIN,
  AuditExportRole.PTA_COMPLIANCE_OFFICER,
];

@Injectable()
export class PtaComplianceGuard implements CanActivate {
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

    // Check for PTA compliance role
    const client = this.supabase.getClient();
    const { data: adminRole, error } = await client
      .from('admin_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      throw new ForbiddenException('Failed to verify role');
    }

    if (!adminRole) {
      throw new ForbiddenException(
        'PTA Compliance Officer or Super Admin access required for audit exports',
      );
    }

    const role = adminRole.role as AuditExportRole;
    
    if (!PTA_COMPLIANCE_ROLES.includes(role)) {
      throw new ForbiddenException(
        'PTA Compliance Officer or Super Admin access required for audit exports',
      );
    }

    // Attach role and permissions to request
    request.user.auditRole = role;
    request.user.auditPermissions = ROLE_PERMISSIONS[role];

    return true;
  }
}
