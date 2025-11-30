import { Injectable, UnauthorizedException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { SupabaseClientService } from '../database/supabase-client.service';

interface PaginationOptions {
  page?: number;
  limit?: number;
  status?: string;
  entity?: string;
  action?: string;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly supabase: SupabaseClientService,
    private readonly configService: ConfigService,
    private readonly http: HttpService,
  ) {}

  private async verifyAdminRole(userId: string): Promise<string> {
    const client = this.supabase.getClient();
    const { data: role } = await client
      .from('admin_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (!role) {
      throw new UnauthorizedException('Admin role required');
    }
    return role.role;
  }

  async dashboard(userId: string) {
    await this.verifyAdminRole(userId);
    const client = this.supabase.getClient();

    const [revenue, subscribers, overdue, recentPayments] = await Promise.all([
      client.rpc('revenue_summary', { p_days: 30 }),
      client.rpc('active_subscribers_count'),
      client.from('invoices').select('id', { count: 'exact' }).eq('status', 'overdue'),
      client
        .from('payments')
        .select('id, amount, gateway, status, initiated_at')
        .eq('status', 'success')
        .order('initiated_at', { ascending: false })
        .limit(10),
    ]);

    return {
      revenue: revenue.data || { total: 0, count: 0 },
      activeSubscribers: subscribers.data || 0,
      overdueInvoices: overdue.count || 0,
      recentPayments: recentPayments.data || [],
    };
  }

  async getRevenueSummary(userId: string, startDate?: string, endDate?: string) {
    await this.verifyAdminRole(userId);
    const client = this.supabase.getClient();

    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    const { data, error } = await client.rpc('revenue_summary_range', {
      p_start_date: start,
      p_end_date: end,
    });

    if (error) {
      this.logger.error('Failed to get revenue summary', error);
      throw error;
    }

    return data;
  }

  async getSubscribers(userId: string, options: PaginationOptions) {
    await this.verifyAdminRole(userId);
    const client = this.supabase.getClient();

    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const offset = (page - 1) * limit;

    let query = client
      .from('customer_dashboard_view')
      .select('*', { count: 'exact' });

    if (options.status) {
      query = query.eq('customer_status', options.status);
    }

    const { data, error, count } = await query
      .order('full_name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      this.logger.error('Failed to get subscribers', error);
      throw error;
    }

    return {
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  async getSubscriberDetail(userId: string, customerId: string) {
    await this.verifyAdminRole(userId);
    const client = this.supabase.getClient();

    const { data: customer, error } = await client
      .from('customers')
      .select(`
        *,
        subscriptions(*, services(*)),
        onu_mapping(*, olt_devices(*))
      `)
      .eq('id', customerId)
      .single();

    if (error || !customer) {
      throw new NotFoundException('Customer not found');
    }

    // Get recent invoices
    const { data: invoices } = await client
      .from('invoices')
      .select('*')
      .eq('subscription_id', customer.subscriptions?.[0]?.id)
      .order('issued_at', { ascending: false })
      .limit(12);

    // Get recent payments
    const { data: payments } = await client
      .from('payments')
      .select('*')
      .eq('customer_id', customerId)
      .order('initiated_at', { ascending: false })
      .limit(10);

    return {
      customer,
      invoices: invoices || [],
      payments: payments || [],
    };
  }

  async getSubscriberUsage(userId: string, customerId: string, days: number) {
    await this.verifyAdminRole(userId);
    const client = this.supabase.getClient();

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await client
      .from('usage_logs')
      .select('*')
      .eq('customer_id', customerId)
      .gte('recorded_at', startDate)
      .order('recorded_at', { ascending: true });

    if (error) {
      throw error;
    }

    // Aggregate by day
    const dailyUsage = this.aggregateUsageByDay(data || []);

    return {
      daily: dailyUsage,
      total: {
        download_mb: data?.reduce((sum, r) => sum + (r.download_mb || 0), 0) || 0,
        upload_mb: data?.reduce((sum, r) => sum + (r.upload_mb || 0), 0) || 0,
      },
    };
  }

  private aggregateUsageByDay(records: any[]): any[] {
    const byDay: Record<string, { download_mb: number; upload_mb: number }> = {};

    for (const record of records) {
      const day = record.recorded_at.split('T')[0];
      if (!byDay[day]) {
        byDay[day] = { download_mb: 0, upload_mb: 0 };
      }
      byDay[day].download_mb += record.download_mb || 0;
      byDay[day].upload_mb += record.upload_mb || 0;
    }

    return Object.entries(byDay).map(([date, usage]) => ({
      date,
      ...usage,
    }));
  }

  async suspendSubscriber(userId: string, customerId: string, reason: string) {
    const role = await this.verifyAdminRole(userId);
    if (!['noc', 'superadmin'].includes(role)) {
      throw new UnauthorizedException('NOC or Superadmin role required');
    }

    const client = this.supabase.getClient();

    // Update customer status
    const { error } = await client
      .from('customers')
      .update({ status: 'suspended' })
      .eq('id', customerId);

    if (error) {
      throw error;
    }

    // Write audit log
    await client.from('audit_logs').insert({
      actor_user_id: userId,
      action: 'subscriber_suspended',
      entity: 'customer',
      entity_id: customerId,
      metadata: { reason },
    });

    // Notify network service to suspend ONU
    await this.notifyNetworkService('suspend', customerId);

    return { success: true, message: 'Subscriber suspended' };
  }

  async resumeSubscriber(userId: string, customerId: string) {
    const role = await this.verifyAdminRole(userId);
    if (!['noc', 'superadmin', 'finance'].includes(role)) {
      throw new UnauthorizedException('Insufficient permissions');
    }

    const client = this.supabase.getClient();

    // Check for overdue invoices if finance role
    if (role === 'finance') {
      const { count } = await client
        .from('invoices')
        .select('id', { count: 'exact' })
        .eq('customer_id', customerId)
        .eq('status', 'overdue');

      if (count && count > 0) {
        throw new UnauthorizedException('Customer has overdue invoices');
      }
    }

    const { error } = await client
      .from('customers')
      .update({ status: 'active' })
      .eq('id', customerId);

    if (error) {
      throw error;
    }

    await client.from('audit_logs').insert({
      actor_user_id: userId,
      action: 'subscriber_resumed',
      entity: 'customer',
      entity_id: customerId,
      metadata: {},
    });

    await this.notifyNetworkService('resume', customerId);

    return { success: true, message: 'Subscriber resumed' };
  }

  async getDailyCollections(userId: string, startDate?: string, endDate?: string) {
    await this.verifyAdminRole(userId);
    const client = this.supabase.getClient();

    const { data, error } = await client.rpc('daily_collections', {
      p_start_date: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      p_end_date: endDate || new Date().toISOString().split('T')[0],
    });

    if (error) {
      throw error;
    }

    return data;
  }

  async getOverdueInvoices(userId: string, options: PaginationOptions) {
    await this.verifyAdminRole(userId);
    const client = this.supabase.getClient();

    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const offset = (page - 1) * limit;

    const { data, error, count } = await client
      .from('billing_invoices_view')
      .select('*', { count: 'exact' })
      .eq('status', 'overdue')
      .order('due_date', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return {
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  async getNetworkAlarms(userId: string) {
    await this.verifyAdminRole(userId);

    const networkServiceUrl = this.configService.get<string>('NETWORK_SERVICE_URL') || 'http://network-service:9100';
    const apiKey = this.configService.get<string>('NETWORK_SERVICE_API_KEY') || '';

    try {
      const response = await firstValueFrom(
        this.http.get(`${networkServiceUrl}/api/v1/alarms`, {
          headers: { 'X-API-Key': apiKey },
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch network alarms', error);
      return [];
    }
  }

  async getOnuStatus(userId: string, serialNumber: string) {
    await this.verifyAdminRole(userId);

    const networkServiceUrl = this.configService.get<string>('NETWORK_SERVICE_URL') || 'http://network-service:9100';
    const apiKey = this.configService.get<string>('NETWORK_SERVICE_API_KEY') || '';

    try {
      const response = await firstValueFrom(
        this.http.get(`${networkServiceUrl}/api/v1/onu/${serialNumber}`, {
          headers: { 'X-API-Key': apiKey },
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch ONU status', error);
      throw new NotFoundException('ONU not found');
    }
  }

  async rebootOnu(userId: string, serialNumber: string) {
    const role = await this.verifyAdminRole(userId);
    if (!['noc', 'superadmin'].includes(role)) {
      throw new UnauthorizedException('NOC or Superadmin role required');
    }

    const networkServiceUrl = this.configService.get<string>('NETWORK_SERVICE_URL') || 'http://network-service:9100';
    const apiKey = this.configService.get<string>('NETWORK_SERVICE_API_KEY') || '';
    const client = this.supabase.getClient();

    try {
      const response = await firstValueFrom(
        this.http.post(
          `${networkServiceUrl}/api/v1/onu/reboot`,
          { serial_number: serialNumber },
          { headers: { 'X-API-Key': apiKey } },
        ),
      );

      await client.from('audit_logs').insert({
        actor_user_id: userId,
        action: 'onu_reboot',
        entity: 'onu',
        entity_id: serialNumber,
        metadata: { result: response.data },
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to reboot ONU', error);
      throw error;
    }
  }

  async getAuditLogs(userId: string, options: PaginationOptions) {
    await this.verifyAdminRole(userId);
    const client = this.supabase.getClient();

    const page = options.page || 1;
    const limit = Math.min(options.limit || 50, 200);
    const offset = (page - 1) * limit;

    let query = client.from('audit_logs').select('*', { count: 'exact' });

    if (options.entity) {
      query = query.eq('entity', options.entity);
    }
    if (options.action) {
      query = query.ilike('action', `%${options.action}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return {
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  async getStatsSummary(userId: string) {
    await this.verifyAdminRole(userId);
    const client = this.supabase.getClient();

    const [activeCount, suspendedCount, todayRevenue, monthRevenue] = await Promise.all([
      client.from('customers').select('id', { count: 'exact' }).eq('status', 'active'),
      client.from('customers').select('id', { count: 'exact' }).eq('status', 'suspended'),
      client.rpc('revenue_summary', { p_days: 1 }),
      client.rpc('revenue_summary', { p_days: 30 }),
    ]);

    return {
      subscribers: {
        active: activeCount.count || 0,
        suspended: suspendedCount.count || 0,
      },
      revenue: {
        today: todayRevenue.data?.total || 0,
        month: monthRevenue.data?.total || 0,
      },
    };
  }

  private async notifyNetworkService(action: 'suspend' | 'resume', customerId: string) {
    const client = this.supabase.getClient();

    // Get ONU mapping for customer
    const { data: mapping } = await client
      .from('onu_mapping')
      .select('serial')
      .eq('customer_id', customerId)
      .single();

    if (!mapping?.serial) {
      this.logger.warn('No ONU mapping found for customer', { customerId });
      return;
    }

    const networkServiceUrl = this.configService.get<string>('NETWORK_SERVICE_URL') || 'http://network-service:9100';
    const apiKey = this.configService.get<string>('NETWORK_SERVICE_API_KEY') || '';

    try {
      await firstValueFrom(
        this.http.post(
          `${networkServiceUrl}/api/v1/onu/${mapping.serial}/${action}`,
          {},
          { headers: { 'X-API-Key': apiKey } },
        ),
      );
    } catch (error) {
      this.logger.error(`Failed to ${action} ONU`, error);
    }
  }
}
