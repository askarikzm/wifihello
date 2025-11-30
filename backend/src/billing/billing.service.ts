import { Injectable, Logger } from '@nestjs/common';

import { SupabaseClientService } from '../database/supabase-client.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly supabase: SupabaseClientService) {}

  async listInvoices(userId: string, tenantId?: string) {
    const client = this.supabase.getClient();
    
    // First get the subscriber ID for this user
    const { data: subscriber, error: subError } = await client
      .from('subscribers')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (subError) {
      this.logger.warn(`No subscriber found for user ${userId}: ${subError.message}`);
      return [];
    }

    // Then get invoices for this subscriber
    const { data, error } = await client
      .from('invoices')
      .select('*')
      .eq('subscriber_id', subscriber.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      this.logger.error(`Error fetching invoices: ${error.message}`);
      throw error;
    }

    return data || [];
  }
}
