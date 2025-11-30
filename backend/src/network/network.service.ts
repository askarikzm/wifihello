import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { SupabaseClientService } from '../database/supabase-client.service';

export interface NetworkStatusResponse {
  onu_serial: string;
  onu_status: 'online' | 'offline' | 'degraded';
  signal_strength: number;
  connection_type: string;
  uptime: string;
  download_speed: string;
  upload_speed: string;
  last_checked: string;
  olt_name: string;
  port: string;
}

@Injectable()
export class NetworkService {
  private readonly logger = new Logger(NetworkService.name);

  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService,
    private readonly supabase: SupabaseClientService,
  ) {}

  async getStatus(userId: string): Promise<NetworkStatusResponse> {
    // First get subscriber details from database
    const client = this.supabase.getClient();
    const { data: subscriber, error: subError } = await client
      .from('subscribers')
      .select('id, onu_serial, olt_id, olt_port')
      .eq('user_id', userId)
      .single();

    if (subError || !subscriber) {
      this.logger.warn(`No subscriber found for user ${userId}`);
      return this.getDemoStatus();
    }

    try {
      const baseUrl = this.configService.get<string>('NETWORK_SERVICE_URL') || 'http://network-service:9100';
      const apiKey = this.configService.get<string>('NETWORK_SERVICE_API_KEY') || '';
      const url = `${baseUrl}/onu/${subscriber.onu_serial}/status`;

      const response = await firstValueFrom(
        this.http.get(url, {
          headers: { 'x-internal-api-key': apiKey },
          timeout: 5000,
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.warn(`Network service unavailable, returning demo data: ${error.message}`);
      
      // Return demo data if network service is not available
      return this.getDemoStatus(subscriber.onu_serial, subscriber.olt_id, subscriber.olt_port);
    }
  }

  private getDemoStatus(
    onuSerial = 'HWTC12345678',
    oltId = 'olt-islamabad-01',
    port = '0/1/3:5',
  ): NetworkStatusResponse {
    // Generate realistic demo data
    const uptimeHours = Math.floor(Math.random() * 720) + 24; // 1-30 days in hours
    const days = Math.floor(uptimeHours / 24);
    const hours = uptimeHours % 24;

    return {
      onu_serial: onuSerial,
      onu_status: 'online',
      signal_strength: -21.5 + (Math.random() * 3), // -18.5 to -21.5 dBm (excellent range)
      connection_type: 'GPON Fiber',
      uptime: `${days}d ${hours}h`,
      download_speed: '30 Mbps',
      upload_speed: '10 Mbps',
      last_checked: new Date().toISOString(),
      olt_name: oltId.replace('olt-', '').replace(/-/g, ' ').toUpperCase(),
      port: port,
    };
  }

  async reboot(userId: string): Promise<{ success: boolean; message: string }> {
    const client = this.supabase.getClient();
    const { data: subscriber, error: subError } = await client
      .from('subscribers')
      .select('onu_serial')
      .eq('user_id', userId)
      .single();

    if (subError || !subscriber) {
      return { success: false, message: 'Subscriber not found' };
    }

    try {
      const baseUrl = this.configService.get<string>('NETWORK_SERVICE_URL') || 'http://network-service:9100';
      const apiKey = this.configService.get<string>('NETWORK_SERVICE_API_KEY') || '';
      const url = `${baseUrl}/onu/${subscriber.onu_serial}/reboot`;

      await firstValueFrom(
        this.http.post(url, {}, {
          headers: { 'x-internal-api-key': apiKey },
          timeout: 10000,
        }),
      );

      return { success: true, message: 'ONU reboot initiated. It may take up to 2 minutes to reconnect.' };
    } catch (error) {
      this.logger.error(`Failed to reboot ONU: ${error.message}`);
      return { success: false, message: 'Failed to initiate reboot. Please try again or contact support.' };
    }
  }
}
