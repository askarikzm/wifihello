/**
 * NetAxis ISP - CTDISR-2025 Alert Service
 * Real-time security alerting
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import axios from 'axios';
import {
  AlertSeverity,
  AlertChannel,
  AlertRule,
  CreateAlertRuleDto,
  AlertHistoryEntry,
  AuditLogEntry,
} from './types';

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private supabase: SupabaseClient;
  private alertRulesCache: AlertRule[] = [];
  private lastCacheRefresh = 0;
  private readonly CACHE_TTL_MS = 60000; // 1 minute

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL'),
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // ============================================
  // ALERT RULE MANAGEMENT
  // ============================================

  /**
   * Create an alert rule
   */
  async createRule(dto: CreateAlertRuleDto, userId?: string): Promise<AlertRule> {
    const { data, error } = await this.supabase
      .from('ctdisr.alert_rules')
      .insert({
        rule_name: dto.ruleName,
        description: dto.description,
        event_pattern: dto.eventPattern,
        threshold_count: dto.thresholdCount || 1,
        threshold_window_minutes: dto.thresholdWindowMinutes || 5,
        severity: dto.severity,
        alert_channels: dto.alertChannels,
        recipients: dto.recipients,
        cooldown_minutes: dto.cooldownMinutes || 15,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create alert rule: ${error.message}`);
    }

    this.invalidateCache();
    return this.mapRuleFromDb(data);
  }

  /**
   * Get all active alert rules
   */
  async getActiveRules(): Promise<AlertRule[]> {
    if (Date.now() - this.lastCacheRefresh < this.CACHE_TTL_MS && this.alertRulesCache.length > 0) {
      return this.alertRulesCache;
    }

    const { data, error } = await this.supabase
      .from('ctdisr.alert_rules')
      .select('*')
      .eq('is_active', true);

    if (error) {
      throw new Error(`Failed to get alert rules: ${error.message}`);
    }

    this.alertRulesCache = (data || []).map(this.mapRuleFromDb);
    this.lastCacheRefresh = Date.now();
    return this.alertRulesCache;
  }

  /**
   * Update an alert rule
   */
  async updateRule(ruleId: string, updates: Partial<CreateAlertRuleDto>): Promise<AlertRule> {
    const updateData: Record<string, unknown> = {};
    if (updates.ruleName) updateData.rule_name = updates.ruleName;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.eventPattern) updateData.event_pattern = updates.eventPattern;
    if (updates.thresholdCount) updateData.threshold_count = updates.thresholdCount;
    if (updates.thresholdWindowMinutes) updateData.threshold_window_minutes = updates.thresholdWindowMinutes;
    if (updates.severity) updateData.severity = updates.severity;
    if (updates.alertChannels) updateData.alert_channels = updates.alertChannels;
    if (updates.recipients) updateData.recipients = updates.recipients;
    if (updates.cooldownMinutes) updateData.cooldown_minutes = updates.cooldownMinutes;
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('ctdisr.alert_rules')
      .update(updateData)
      .eq('id', ruleId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update alert rule: ${error.message}`);
    }

    this.invalidateCache();
    return this.mapRuleFromDb(data);
  }

  /**
   * Disable an alert rule
   */
  async disableRule(ruleId: string): Promise<void> {
    const { error } = await this.supabase
      .from('ctdisr.alert_rules')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', ruleId);

    if (error) {
      throw new Error(`Failed to disable alert rule: ${error.message}`);
    }

    this.invalidateCache();
  }

  // ============================================
  // ALERT EVALUATION
  // ============================================

  /**
   * Check an event against all active rules
   */
  async evaluateEvent(event: AuditLogEntry): Promise<void> {
    const rules = await this.getActiveRules();

    for (const rule of rules) {
      if (this.matchesPattern(event, rule.eventPattern)) {
        await this.checkThresholdAndAlert(rule, event);
      }
    }
  }

  /**
   * Check if event matches rule pattern
   */
  private matchesPattern(event: AuditLogEntry, pattern: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(pattern)) {
      const eventValue = (event as Record<string, unknown>)[key];

      if (Array.isArray(value)) {
        if (!value.includes(eventValue)) return false;
      } else if (typeof value === 'object' && value !== null) {
        // Handle operators like $gte, $lte, $contains
        const operators = value as Record<string, unknown>;
        if (operators.$gte !== undefined && eventValue < operators.$gte) return false;
        if (operators.$lte !== undefined && eventValue > operators.$lte) return false;
        if (operators.$contains !== undefined && !(eventValue as string)?.includes(operators.$contains as string)) return false;
      } else {
        if (eventValue !== value) return false;
      }
    }
    return true;
  }

  /**
   * Check threshold and trigger alert if needed
   */
  private async checkThresholdAndAlert(rule: AlertRule, triggeringEvent: AuditLogEntry): Promise<void> {
    // Check cooldown
    if (rule.lastTriggeredAt) {
      const cooldownEnd = new Date(rule.lastTriggeredAt.getTime() + rule.cooldownMinutes * 60 * 1000);
      if (new Date() < cooldownEnd) {
        return;
      }
    }

    // Check threshold (count events in window)
    const windowStart = new Date(Date.now() - rule.thresholdWindowMinutes * 60 * 1000);
    
    const { count, error } = await this.supabase
      .from('ctdisr.audit_log')
      .select('id', { count: 'exact', head: true })
      .gte('timestamp', windowStart.toISOString())
      .match(this.patternToMatch(rule.eventPattern));

    if (error) {
      this.logger.error(`Failed to count events for rule ${rule.ruleName}: ${error.message}`);
      return;
    }

    if ((count || 0) >= rule.thresholdCount) {
      await this.triggerAlert(rule, triggeringEvent);
    }
  }

  /**
   * Convert pattern to Supabase match object
   */
  private patternToMatch(pattern: Record<string, unknown>): Record<string, unknown> {
    const match: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(pattern)) {
      if (!Array.isArray(value) && typeof value !== 'object') {
        match[key] = value;
      }
    }
    return match;
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(rule: AlertRule, triggeringEvent: AuditLogEntry): Promise<void> {
    const alertTitle = `[${rule.severity.toUpperCase()}] ${rule.ruleName}`;
    const alertBody = this.formatAlertBody(rule, triggeringEvent);

    // Create alert history entry
    const { data: alert, error } = await this.supabase
      .from('ctdisr.alert_history')
      .insert({
        rule_id: rule.id,
        alert_title: alertTitle,
        alert_body: alertBody,
        severity: rule.severity,
        triggering_events: [triggeringEvent.id],
        channels_notified: rule.alertChannels,
        notification_status: {},
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create alert: ${error.message}`);
      return;
    }

    // Update rule trigger info
    await this.supabase
      .from('ctdisr.alert_rules')
      .update({
        last_triggered_at: new Date().toISOString(),
        trigger_count: rule.triggerCount + 1,
      })
      .eq('id', rule.id);

    this.invalidateCache();

    // Send notifications
    await this.sendNotifications(rule, alertTitle, alertBody, alert.id);
  }

  /**
   * Format alert body
   */
  private formatAlertBody(rule: AlertRule, event: AuditLogEntry): string {
    return `
Alert Rule: ${rule.ruleName}
${rule.description ? `Description: ${rule.description}` : ''}
Severity: ${rule.severity}

Triggering Event:
- Event Type: ${event.eventType}
- Category: ${event.eventCategory}
- Action: ${event.action}
- Outcome: ${event.outcome}
- Actor: ${event.actorEmail || event.actorId || 'Unknown'}
- IP: ${event.actorIp || 'Unknown'}
- Timestamp: ${event.timestamp.toISOString()}
- Risk Score: ${event.riskScore || 'N/A'}

Resource: ${event.resourceType}/${event.resourceId || 'N/A'}
    `.trim();
  }

  /**
   * Send notifications through configured channels
   */
  private async sendNotifications(
    rule: AlertRule,
    title: string,
    body: string,
    alertId: string,
  ): Promise<void> {
    const notificationStatus: Record<string, { sent: boolean; error?: string }> = {};

    for (const channel of rule.alertChannels) {
      try {
        switch (channel) {
          case AlertChannel.EMAIL:
            await this.sendEmailAlert(rule.recipients.email || [], title, body);
            notificationStatus.email = { sent: true };
            break;

          case AlertChannel.SMS:
            await this.sendSmsAlert(rule.recipients.phone || [], title);
            notificationStatus.sms = { sent: true };
            break;

          case AlertChannel.SLACK:
            await this.sendSlackAlert(title, body);
            notificationStatus.slack = { sent: true };
            break;

          case AlertChannel.WEBHOOK:
            await this.sendWebhookAlert(rule.recipients.webhook || [], title, body, alertId);
            notificationStatus.webhook = { sent: true };
            break;

          case AlertChannel.PAGERDUTY:
            await this.sendPagerDutyAlert(rule, title, body);
            notificationStatus.pagerduty = { sent: true };
            break;
        }
      } catch (err) {
        this.logger.error(`Failed to send ${channel} notification: ${err.message}`);
        notificationStatus[channel] = { sent: false, error: err.message };
      }
    }

    // Update notification status
    await this.supabase
      .from('ctdisr.alert_history')
      .update({ notification_status: notificationStatus })
      .eq('id', alertId);
  }

  /**
   * Send email alert
   */
  private async sendEmailAlert(recipients: string[], subject: string, body: string): Promise<void> {
    // Integration with notification service
    const notificationUrl = this.configService.get<string>('NOTIFICATION_SERVICE_URL');
    if (!notificationUrl) {
      this.logger.warn('Email notification skipped: NOTIFICATION_SERVICE_URL not configured');
      return;
    }

    await axios.post(`${notificationUrl}/api/email/send`, {
      to: recipients,
      subject,
      body,
      priority: 'high',
    });
  }

  /**
   * Send SMS alert
   */
  private async sendSmsAlert(phones: string[], message: string): Promise<void> {
    const notificationUrl = this.configService.get<string>('NOTIFICATION_SERVICE_URL');
    if (!notificationUrl) {
      this.logger.warn('SMS notification skipped: NOTIFICATION_SERVICE_URL not configured');
      return;
    }

    await axios.post(`${notificationUrl}/api/sms/send`, {
      phones,
      message: message.substring(0, 160),
      priority: 'high',
    });
  }

  /**
   * Send Slack alert
   */
  private async sendSlackAlert(title: string, body: string): Promise<void> {
    const webhookUrl = this.configService.get<string>('SLACK_WEBHOOK_URL');
    if (!webhookUrl) {
      this.logger.warn('Slack notification skipped: SLACK_WEBHOOK_URL not configured');
      return;
    }

    await axios.post(webhookUrl, {
      text: title,
      attachments: [{
        color: 'danger',
        text: body,
      }],
    });
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(
    webhooks: string[],
    title: string,
    body: string,
    alertId: string,
  ): Promise<void> {
    for (const url of webhooks) {
      await axios.post(url, {
        alertId,
        title,
        body,
        timestamp: new Date().toISOString(),
        source: 'netaxis-ctdisr',
      });
    }
  }

  /**
   * Send PagerDuty alert
   */
  private async sendPagerDutyAlert(rule: AlertRule, title: string, body: string): Promise<void> {
    const routingKey = this.configService.get<string>('PAGERDUTY_ROUTING_KEY');
    if (!routingKey) {
      this.logger.warn('PagerDuty notification skipped: PAGERDUTY_ROUTING_KEY not configured');
      return;
    }

    const severity = {
      [AlertSeverity.LOW]: 'info',
      [AlertSeverity.MEDIUM]: 'warning',
      [AlertSeverity.HIGH]: 'error',
      [AlertSeverity.CRITICAL]: 'critical',
    }[rule.severity];

    await axios.post('https://events.pagerduty.com/v2/enqueue', {
      routing_key: routingKey,
      event_action: 'trigger',
      payload: {
        summary: title,
        severity,
        source: 'netaxis-ctdisr',
        custom_details: { body },
      },
    });
  }

  // ============================================
  // ALERT HISTORY
  // ============================================

  /**
   * Get unacknowledged alerts
   */
  async getUnacknowledgedAlerts(): Promise<AlertHistoryEntry[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.alert_history')
      .select('*')
      .eq('acknowledged', false)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get alerts: ${error.message}`);
    }

    return (data || []).map(this.mapAlertFromDb);
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('ctdisr.alert_history')
      .update({
        acknowledged: true,
        acknowledged_by: userId,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', alertId);

    if (error) {
      throw new Error(`Failed to acknowledge alert: ${error.message}`);
    }
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, userId: string, notes?: string): Promise<void> {
    const { error } = await this.supabase
      .from('ctdisr.alert_history')
      .update({
        resolved: true,
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
        resolution_notes: notes,
      })
      .eq('id', alertId);

    if (error) {
      throw new Error(`Failed to resolve alert: ${error.message}`);
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  private invalidateCache(): void {
    this.alertRulesCache = [];
    this.lastCacheRefresh = 0;
  }

  private mapRuleFromDb(data: any): AlertRule {
    return {
      id: data.id,
      ruleName: data.rule_name,
      description: data.description,
      eventPattern: data.event_pattern,
      thresholdCount: data.threshold_count,
      thresholdWindowMinutes: data.threshold_window_minutes,
      severity: data.severity,
      alertChannels: data.alert_channels,
      recipients: data.recipients,
      isActive: data.is_active,
      cooldownMinutes: data.cooldown_minutes,
      lastTriggeredAt: data.last_triggered_at ? new Date(data.last_triggered_at) : undefined,
      triggerCount: data.trigger_count,
      createdBy: data.created_by,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  private mapAlertFromDb(data: any): AlertHistoryEntry {
    return {
      id: data.id,
      ruleId: data.rule_id,
      alertTitle: data.alert_title,
      alertBody: data.alert_body,
      severity: data.severity,
      triggeringEvents: data.triggering_events,
      channelsNotified: data.channels_notified,
      notificationStatus: data.notification_status,
      acknowledged: data.acknowledged,
      acknowledgedBy: data.acknowledged_by,
      acknowledgedAt: data.acknowledged_at ? new Date(data.acknowledged_at) : undefined,
      resolved: data.resolved,
      resolvedBy: data.resolved_by,
      resolvedAt: data.resolved_at ? new Date(data.resolved_at) : undefined,
      resolutionNotes: data.resolution_notes,
      createdAt: new Date(data.created_at),
    };
  }
}
