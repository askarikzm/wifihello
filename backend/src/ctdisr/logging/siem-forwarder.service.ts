/**
 * NetAxis ISP - CTDISR-2025 SIEM Forwarder Service
 * Forward security events to SIEM systems
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import axios, { AxiosInstance } from 'axios';
import {
  SiemTarget,
  SiemQueueStatus,
  SiemConfig,
  SiemQueueEntry,
} from './types';

@Injectable()
export class SiemForwarderService implements OnModuleInit {
  private readonly logger = new Logger(SiemForwarderService.name);
  private supabase: SupabaseClient;
  private siemConfigs: Map<SiemTarget, SiemConfig> = new Map();
  private httpClients: Map<SiemTarget, AxiosInstance> = new Map();
  private isProcessing = false;

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL'),
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.initializeSiemConfigs();
    this.logger.log('SIEM Forwarder Service initialized');
  }

  /**
   * Initialize SIEM configurations from environment
   */
  private async initializeSiemConfigs(): Promise<void> {
    // Elasticsearch config
    const esEndpoint = this.configService.get<string>('SIEM_ELASTICSEARCH_URL');
    if (esEndpoint) {
      this.siemConfigs.set(SiemTarget.ELASTICSEARCH, {
        target: SiemTarget.ELASTICSEARCH,
        enabled: true,
        endpoint: esEndpoint,
        apiKey: this.configService.get<string>('SIEM_ELASTICSEARCH_API_KEY'),
        index: this.configService.get<string>('SIEM_ELASTICSEARCH_INDEX') || 'netaxis-security',
        batchSize: 100,
        flushIntervalMs: 5000,
        retryDelayMs: 1000,
        maxRetries: 5,
      });

      this.httpClients.set(SiemTarget.ELASTICSEARCH, axios.create({
        baseURL: esEndpoint,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `ApiKey ${this.configService.get<string>('SIEM_ELASTICSEARCH_API_KEY')}`,
        },
        timeout: 30000,
      }));
    }

    // Splunk config
    const splunkEndpoint = this.configService.get<string>('SIEM_SPLUNK_URL');
    if (splunkEndpoint) {
      this.siemConfigs.set(SiemTarget.SPLUNK, {
        target: SiemTarget.SPLUNK,
        enabled: true,
        endpoint: splunkEndpoint,
        apiKey: this.configService.get<string>('SIEM_SPLUNK_TOKEN'),
        index: this.configService.get<string>('SIEM_SPLUNK_INDEX') || 'main',
        batchSize: 50,
        flushIntervalMs: 10000,
        retryDelayMs: 2000,
        maxRetries: 3,
      });

      this.httpClients.set(SiemTarget.SPLUNK, axios.create({
        baseURL: splunkEndpoint,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Splunk ${this.configService.get<string>('SIEM_SPLUNK_TOKEN')}`,
        },
        timeout: 30000,
      }));
    }

    // Azure Sentinel config
    const sentinelWorkspaceId = this.configService.get<string>('SIEM_SENTINEL_WORKSPACE_ID');
    if (sentinelWorkspaceId) {
      this.siemConfigs.set(SiemTarget.SENTINEL, {
        target: SiemTarget.SENTINEL,
        enabled: true,
        endpoint: `https://${sentinelWorkspaceId}.ods.opinsights.azure.com`,
        apiKey: this.configService.get<string>('SIEM_SENTINEL_SHARED_KEY'),
        batchSize: 50,
        flushIntervalMs: 10000,
        retryDelayMs: 2000,
        maxRetries: 3,
      });
    }
  }

  // ============================================
  // QUEUE PROCESSING
  // ============================================

  /**
   * Process SIEM queue every 30 seconds
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      for (const [target, config] of this.siemConfigs) {
        if (!config.enabled) continue;

        await this.processQueueForTarget(target, config);
      }
    } catch (err) {
      this.logger.error(`SIEM queue processing failed: ${err.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process queue for a specific SIEM target
   */
  private async processQueueForTarget(target: SiemTarget, config: SiemConfig): Promise<void> {
    // Get pending items
    const { data: items, error } = await this.supabase
      .from('ctdisr.siem_queue')
      .select('*')
      .eq('siem_target', target)
      .eq('status', SiemQueueStatus.PENDING)
      .lte('scheduled_at', new Date().toISOString())
      .order('priority', { ascending: true })
      .order('scheduled_at', { ascending: true })
      .limit(config.batchSize);

    if (error || !items || items.length === 0) {
      return;
    }

    this.logger.log(`Processing ${items.length} items for ${target}`);

    // Mark as processing
    await this.supabase
      .from('ctdisr.siem_queue')
      .update({ status: SiemQueueStatus.PROCESSING })
      .in('id', items.map(i => i.id));

    // Send to SIEM
    const results = await this.sendToSiem(target, items);

    // Update statuses
    for (const result of results) {
      if (result.success) {
        await this.supabase
          .from('ctdisr.siem_queue')
          .update({
            status: SiemQueueStatus.SENT,
            processed_at: new Date().toISOString(),
          })
          .eq('id', result.id);

        // Mark audit log as forwarded
        await this.supabase
          .from('ctdisr.audit_log')
          .update({
            forwarded_to_siem: true,
            siem_forwarded_at: new Date().toISOString(),
          })
          .eq('id', result.auditLogId);
      } else {
        const item = items.find(i => i.id === result.id);
        const newRetryCount = (item?.retry_count || 0) + 1;
        const newStatus = newRetryCount >= config.maxRetries 
          ? SiemQueueStatus.DEAD_LETTER 
          : SiemQueueStatus.PENDING;

        await this.supabase
          .from('ctdisr.siem_queue')
          .update({
            status: newStatus,
            retry_count: newRetryCount,
            last_error: result.error,
            scheduled_at: new Date(Date.now() + config.retryDelayMs * newRetryCount).toISOString(),
          })
          .eq('id', result.id);
      }
    }
  }

  /**
   * Send events to SIEM system
   */
  private async sendToSiem(
    target: SiemTarget,
    items: SiemQueueEntry[],
  ): Promise<Array<{ id: string; auditLogId: string; success: boolean; error?: string }>> {
    const results: Array<{ id: string; auditLogId: string; success: boolean; error?: string }> = [];

    switch (target) {
      case SiemTarget.ELASTICSEARCH:
        return this.sendToElasticsearch(items);
      case SiemTarget.SPLUNK:
        return this.sendToSplunk(items);
      case SiemTarget.SENTINEL:
        return this.sendToSentinel(items);
      default:
        items.forEach(item => {
          results.push({
            id: item.id,
            auditLogId: item.audit_log_id,
            success: false,
            error: `Unsupported SIEM target: ${target}`,
          });
        });
        return results;
    }
  }

  /**
   * Send events to Elasticsearch
   */
  private async sendToElasticsearch(
    items: SiemQueueEntry[],
  ): Promise<Array<{ id: string; auditLogId: string; success: boolean; error?: string }>> {
    const results: Array<{ id: string; auditLogId: string; success: boolean; error?: string }> = [];
    const client = this.httpClients.get(SiemTarget.ELASTICSEARCH);
    const config = this.siemConfigs.get(SiemTarget.ELASTICSEARCH);

    if (!client || !config) {
      items.forEach(item => {
        results.push({
          id: item.id,
          auditLogId: item.audit_log_id,
          success: false,
          error: 'Elasticsearch client not configured',
        });
      });
      return results;
    }

    // Bulk API format
    const bulkBody = items.flatMap(item => [
      { index: { _index: config.index } },
      {
        ...item.payload,
        '@timestamp': new Date().toISOString(),
        source: 'netaxis-isp',
      },
    ]);

    try {
      const response = await client.post('/_bulk', 
        bulkBody.map(line => JSON.stringify(line)).join('\n') + '\n',
        { headers: { 'Content-Type': 'application/x-ndjson' } }
      );

      // Parse bulk response
      const bulkResponse = response.data;
      items.forEach((item, index) => {
        const itemResponse = bulkResponse.items?.[index];
        if (itemResponse?.index?.status >= 200 && itemResponse?.index?.status < 300) {
          results.push({ id: item.id, auditLogId: item.audit_log_id, success: true });
        } else {
          results.push({
            id: item.id,
            auditLogId: item.audit_log_id,
            success: false,
            error: itemResponse?.index?.error?.reason || 'Unknown error',
          });
        }
      });
    } catch (err) {
      items.forEach(item => {
        results.push({
          id: item.id,
          auditLogId: item.audit_log_id,
          success: false,
          error: err.message,
        });
      });
    }

    return results;
  }

  /**
   * Send events to Splunk
   */
  private async sendToSplunk(
    items: SiemQueueEntry[],
  ): Promise<Array<{ id: string; auditLogId: string; success: boolean; error?: string }>> {
    const results: Array<{ id: string; auditLogId: string; success: boolean; error?: string }> = [];
    const client = this.httpClients.get(SiemTarget.SPLUNK);
    const config = this.siemConfigs.get(SiemTarget.SPLUNK);

    if (!client || !config) {
      items.forEach(item => {
        results.push({
          id: item.id,
          auditLogId: item.audit_log_id,
          success: false,
          error: 'Splunk client not configured',
        });
      });
      return results;
    }

    // Splunk HEC format - send each event
    for (const item of items) {
      try {
        await client.post('/services/collector/event', {
          index: config.index,
          sourcetype: 'netaxis:security',
          event: item.payload,
          time: Date.now() / 1000,
        });

        results.push({ id: item.id, auditLogId: item.audit_log_id, success: true });
      } catch (err) {
        results.push({
          id: item.id,
          auditLogId: item.audit_log_id,
          success: false,
          error: err.message,
        });
      }
    }

    return results;
  }

  /**
   * Send events to Azure Sentinel
   */
  private async sendToSentinel(
    items: SiemQueueEntry[],
  ): Promise<Array<{ id: string; auditLogId: string; success: boolean; error?: string }>> {
    const results: Array<{ id: string; auditLogId: string; success: boolean; error?: string }> = [];
    const config = this.siemConfigs.get(SiemTarget.SENTINEL);

    if (!config) {
      items.forEach(item => {
        results.push({
          id: item.id,
          auditLogId: item.audit_log_id,
          success: false,
          error: 'Sentinel not configured',
        });
      });
      return results;
    }

    // Azure Log Analytics Data Collector API
    const logType = 'NetAxisSecurityEvents';
    const body = JSON.stringify(items.map(i => i.payload));
    const contentLength = Buffer.byteLength(body, 'utf8');
    const date = new Date().toUTCString();

    // Build signature
    const signature = this.buildSentinelSignature(
      config.apiKey!,
      date,
      contentLength,
      'POST',
      'application/json',
      '/api/logs',
    );

    try {
      await axios.post(
        `${config.endpoint}/api/logs?api-version=2016-04-01`,
        body,
        {
          headers: {
            'Content-Type': 'application/json',
            'Log-Type': logType,
            'Authorization': signature,
            'x-ms-date': date,
            'time-generated-field': 'timestamp',
          },
        },
      );

      items.forEach(item => {
        results.push({ id: item.id, auditLogId: item.audit_log_id, success: true });
      });
    } catch (err) {
      items.forEach(item => {
        results.push({
          id: item.id,
          auditLogId: item.audit_log_id,
          success: false,
          error: err.message,
        });
      });
    }

    return results;
  }

  /**
   * Build Azure Sentinel authorization signature
   */
  private buildSentinelSignature(
    sharedKey: string,
    date: string,
    contentLength: number,
    method: string,
    contentType: string,
    resource: string,
  ): string {
    const crypto = require('crypto');
    const stringToSign = `${method}\n${contentLength}\n${contentType}\nx-ms-date:${date}\n${resource}`;
    const decodedKey = Buffer.from(sharedKey, 'base64');
    const hmac = crypto.createHmac('sha256', decodedKey).update(stringToSign, 'utf8').digest('base64');
    return `SharedKey ${this.configService.get('SIEM_SENTINEL_WORKSPACE_ID')}:${hmac}`;
  }

  // ============================================
  // MANUAL OPERATIONS
  // ============================================

  /**
   * Manually queue an event for SIEM
   */
  async queueForSiem(
    auditLogId: string,
    target: SiemTarget,
    payload: Record<string, unknown>,
    priority: number = 5,
  ): Promise<string> {
    const { data, error } = await this.supabase
      .from('ctdisr.siem_queue')
      .insert({
        audit_log_id: auditLogId,
        siem_target: target,
        payload,
        priority,
        status: SiemQueueStatus.PENDING,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to queue for SIEM: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    deadLetter: number;
    sent24h: number;
  }> {
    const { data, error } = await this.supabase
      .from('ctdisr.siem_queue')
      .select('status', { count: 'exact' });

    if (error) {
      throw new Error(`Failed to get queue stats: ${error.message}`);
    }

    const { data: sent24h } = await this.supabase
      .from('ctdisr.siem_queue')
      .select('id', { count: 'exact' })
      .eq('status', SiemQueueStatus.SENT)
      .gte('processed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const statsByStatus = (data || []).reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      pending: statsByStatus[SiemQueueStatus.PENDING] || 0,
      processing: statsByStatus[SiemQueueStatus.PROCESSING] || 0,
      failed: statsByStatus[SiemQueueStatus.FAILED] || 0,
      deadLetter: statsByStatus[SiemQueueStatus.DEAD_LETTER] || 0,
      sent24h: sent24h?.length || 0,
    };
  }

  /**
   * Retry dead letter items
   */
  async retryDeadLetterItems(target?: SiemTarget): Promise<number> {
    let query = this.supabase
      .from('ctdisr.siem_queue')
      .update({
        status: SiemQueueStatus.PENDING,
        retry_count: 0,
        scheduled_at: new Date().toISOString(),
      })
      .eq('status', SiemQueueStatus.DEAD_LETTER);

    if (target) {
      query = query.eq('siem_target', target);
    }

    const { data, error } = await query.select();

    if (error) {
      throw new Error(`Failed to retry dead letter items: ${error.message}`);
    }

    return data?.length || 0;
  }
}
