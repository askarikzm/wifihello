import { Injectable, Logger } from '@nestjs/common';

import { SupabaseClientService } from '../database/supabase-client.service';

export interface UsageDay {
  date: string;
  bytes_down: number;
  bytes_up: number;
  download_gb: number;
  upload_gb: number;
}

export interface UsageResponse {
  days: UsageDay[];
  total_download_gb: number;
  total_upload_gb: number;
  avg_daily_gb: number;
  peak_day: {
    date: string;
    download_gb: number;
  } | null;
}

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(private readonly supabase: SupabaseClientService) {}

  async daily(userId: string, limit: number): Promise<UsageResponse> {
    const client = this.supabase.getClient();
    
    // First get the subscriber ID for this user
    const { data: subscriber, error: subError } = await client
      .from('subscribers')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (subError) {
      this.logger.error(`Failed to find subscriber for user ${userId}`, subError);
      return this.emptyResponse();
    }

    // Get usage logs for the subscriber
    const { data, error } = await client
      .from('usage_logs')
      .select('*')
      .eq('subscriber_id', subscriber.id)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      this.logger.error(`Failed to fetch usage logs`, error);
      throw error;
    }

    if (!data || data.length === 0) {
      return this.emptyResponse();
    }

    // Transform to daily format
    const days: UsageDay[] = data.map((log) => ({
      date: log.created_at?.split('T')[0] || log.created_at?.split(' ')[0] || '',
      bytes_down: Number(log.bytes_down) || 0,
      bytes_up: Number(log.bytes_up) || 0,
      download_gb: (Number(log.bytes_down) || 0) / (1024 * 1024 * 1024),
      upload_gb: (Number(log.bytes_up) || 0) / (1024 * 1024 * 1024),
    }));

    // Calculate totals
    const totalDownload = days.reduce((sum, d) => sum + d.download_gb, 0);
    const totalUpload = days.reduce((sum, d) => sum + d.upload_gb, 0);
    const avgDaily = days.length > 0 ? totalDownload / days.length : 0;

    // Find peak day
    let peakDay: { date: string; download_gb: number } | null = null;
    let peakValue = 0;
    for (const day of days) {
      if (day.download_gb > peakValue) {
        peakValue = day.download_gb;
        peakDay = { date: day.date, download_gb: day.download_gb };
      }
    }

    return {
      days,
      total_download_gb: Math.round(totalDownload * 100) / 100,
      total_upload_gb: Math.round(totalUpload * 100) / 100,
      avg_daily_gb: Math.round(avgDaily * 100) / 100,
      peak_day: peakDay,
    };
  }

  private emptyResponse(): UsageResponse {
    return {
      days: [],
      total_download_gb: 0,
      total_upload_gb: 0,
      avg_daily_gb: 0,
      peak_day: null,
    };
  }
}
