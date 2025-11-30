import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SupabaseClientService } from '../../database/supabase-client.service';

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseClientService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.id) {
      throw new UnauthorizedException('Authentication required');
    }

    // Check if user has admin role
    const client = this.supabase.getClient();
    const { data: adminRole, error } = await client
      .from('admin_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      throw new UnauthorizedException('Failed to verify admin role');
    }

    if (!adminRole) {
      throw new UnauthorizedException('Admin access required. Please contact administrator to grant admin privileges.');
    }

    // Attach role to request for later use
    request.user.adminRole = adminRole.role;

    return true;
  }
}
