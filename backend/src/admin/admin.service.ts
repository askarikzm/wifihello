import { Injectable, UnauthorizedException } from '@nestjs/common';

import { SupabaseClientService } from '../database/supabase-client.service';

@Injectable()
export class AdminService {
  constructor(private readonly supabase: SupabaseClientService) {}

  async dashboard(userId: string) {
    const client = this.supabase.getClient();
    const { data: role } = await client
      .from('admin_roles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!role) {
      throw new UnauthorizedException('Admin role required');
    }

    const [{ data: revenue }, { data: tickets }] = await Promise.all([
      client.rpc('revenue_summary'),
      client.from('support_tickets_view').select('*').limit(5),
    ]);

    return { revenue, tickets };
  }
}
