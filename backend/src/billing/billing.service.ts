import { Injectable } from '@nestjs/common';

import { SupabaseClientService } from '../database/supabase-client.service';

@Injectable()
export class BillingService {
  constructor(private readonly supabase: SupabaseClientService) {}

  async listInvoices(userId: string, tenantId?: string) {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('billing_invoices_view')
      .select('*')
      .eq('user_id', userId)
      .order('issued_at', { ascending: false })
      .limit(50);
    if (error) {
      throw error;
    }
    return data;
  }
}
