import { Injectable } from '@nestjs/common';

import { SupabaseClientService } from '../database/supabase-client.service';

@Injectable()
export class UsageService {
  constructor(private readonly supabase: SupabaseClientService) {}

  async daily(userId: string, limit: number) {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('usage_logs_view')
      .select('*')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }
}
