/**
 * NetAxis ISP - CTDISR-2025 Security Events Service
 * Handles security event logging and SIEM integration
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash, randomUUID } from 'crypto';
import {
  SecurityEvent,
  SecurityEventCategory,
  SecurityEventOutcome,
  IncidentSeverity,
  CtdisrContext,
  SiemEvent,
} from './types';

@Injectable()
export class SecurityEventsService {
  private readonly logger = new Logger(SecurityEventsService.name);
  private readonly eventBuffer: SecurityEvent[] = [];
  private readonly BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 5000;
  private flushTimeout: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {}

  // ============================================
  // EVENT LOGGING
  // ============================================

  /**
   * Log a security event
   */
  async logEvent(params: {
    eventType: string;
    category: SecurityEventCategory;
    severity: IncidentSeverity;
    sourceSystem: string;
    sourceComponent?: string;
    context: CtdisrContext;
    targetType?: string;
    targetId?: string;
    action: string;
    outcome: SecurityEventOutcome;
    details?: Record<string, unknown>;
    parentEventId?: number;
  }): Promise<SecurityEvent> {
    const eventId = randomUUID();
    const previousHash = await this.getLatestEventHash();

    const event: SecurityEvent = {
      id: 0, // Will be set by database
      eventId,
      eventType: params.eventType,
      eventCategory: params.category,
      severity: params.severity,
      sourceSystem: params.sourceSystem,
      sourceComponent: params.sourceComponent,
      actorType: params.context.userId ? 'USER' : 'SYSTEM',
      actorId: params.context.userId,
      actorIp: params.context.ipAddress,
      targetType: params.targetType,
      targetId: params.targetId,
      action: params.action,
      outcome: params.outcome,
      details: params.details,
      correlationId: params.context.correlationId,
      parentEventId: params.parentEventId,
      eventTime: new Date(),
      receivedAt: new Date(),
      forwardedToSiem: false,
      previousHash,
      recordHash: '', // Calculated below
    };

    // Calculate hash
    event.recordHash = this.calculateEventHash(event, previousHash);

    // Add to buffer for batch insert
    this.eventBuffer.push(event);

    // Flush if buffer is full
    if (this.eventBuffer.length >= this.BUFFER_SIZE) {
      await this.flushEventBuffer();
    } else if (!this.flushTimeout) {
      // Schedule flush
      this.flushTimeout = setTimeout(() => {
        this.flushEventBuffer();
      }, this.FLUSH_INTERVAL_MS);
    }

    // For critical events, log immediately
    if (params.severity === IncidentSeverity.P1_CRITICAL) {
      this.logger.error(`CRITICAL SECURITY EVENT: ${params.eventType}`, {
        eventId,
        action: params.action,
        outcome: params.outcome,
        actor: params.context.userId,
        ip: params.context.ipAddress,
      });
    }

    return event;
  }

  /**
   * Log authentication event
   */
  async logAuthEvent(params: {
    eventType: 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'MFA_CHALLENGE' | 'MFA_SUCCESS' | 'MFA_FAILED';
    context: CtdisrContext;
    outcome: SecurityEventOutcome;
    details?: Record<string, unknown>;
  }): Promise<SecurityEvent> {
    const severity = params.outcome === SecurityEventOutcome.FAILURE 
      ? IncidentSeverity.P3_MEDIUM 
      : IncidentSeverity.P5_INFO;

    return this.logEvent({
      eventType: params.eventType,
      category: SecurityEventCategory.AUTH,
      severity,
      sourceSystem: 'BACKEND',
      sourceComponent: 'auth',
      context: params.context,
      action: params.eventType,
      outcome: params.outcome,
      details: params.details,
    });
  }

  /**
   * Log access event
   */
  async logAccessEvent(params: {
    eventType: string;
    context: CtdisrContext;
    targetType: string;
    targetId?: string;
    action: string;
    outcome: SecurityEventOutcome;
    details?: Record<string, unknown>;
  }): Promise<SecurityEvent> {
    const severity = params.outcome === SecurityEventOutcome.FAILURE
      ? IncidentSeverity.P4_LOW
      : IncidentSeverity.P5_INFO;

    return this.logEvent({
      eventType: params.eventType,
      category: SecurityEventCategory.ACCESS,
      severity,
      sourceSystem: 'BACKEND',
      context: params.context,
      targetType: params.targetType,
      targetId: params.targetId,
      action: params.action,
      outcome: params.outcome,
      details: params.details,
    });
  }

  /**
   * Log configuration change event
   */
  async logConfigChange(params: {
    context: CtdisrContext;
    targetType: string;
    targetId: string;
    action: string;
    previousValue?: unknown;
    newValue?: unknown;
  }): Promise<SecurityEvent> {
    return this.logEvent({
      eventType: 'CONFIG_CHANGE',
      category: SecurityEventCategory.CONFIG,
      severity: IncidentSeverity.P4_LOW,
      sourceSystem: 'BACKEND',
      context: params.context,
      targetType: params.targetType,
      targetId: params.targetId,
      action: params.action,
      outcome: SecurityEventOutcome.SUCCESS,
      details: {
        previousValue: params.previousValue,
        newValue: params.newValue,
      },
    });
  }

  /**
   * Log data access event (for sensitive data like subscriber PII, LI data)
   */
  async logDataAccess(params: {
    context: CtdisrContext;
    dataType: 'SUBSCRIBER_PII' | 'LI_DATA' | 'BILLING' | 'AUDIT_LOG';
    resourceId: string;
    action: string;
    fields?: string[];
    outcome: SecurityEventOutcome;
  }): Promise<SecurityEvent> {
    const severity = 
      params.dataType === 'LI_DATA' 
        ? IncidentSeverity.P2_HIGH 
        : params.dataType === 'SUBSCRIBER_PII'
        ? IncidentSeverity.P3_MEDIUM
        : IncidentSeverity.P4_LOW;

    return this.logEvent({
      eventType: `DATA_ACCESS_${params.dataType}`,
      category: SecurityEventCategory.DATA,
      severity,
      sourceSystem: 'BACKEND',
      context: params.context,
      targetType: params.dataType,
      targetId: params.resourceId,
      action: params.action,
      outcome: params.outcome,
      details: {
        fields: params.fields,
      },
    });
  }

  // ============================================
  // SIEM INTEGRATION
  // ============================================

  /**
   * Format event for SIEM consumption
   */
  formatForSiem(event: SecurityEvent): SiemEvent {
    return {
      timestamp: event.eventTime.toISOString(),
      eventId: event.eventId,
      severity: event.severity,
      category: event.eventCategory,
      source: {
        system: event.sourceSystem,
        component: event.sourceComponent,
        ip: event.actorIp,
      },
      actor: event.actorId ? {
        type: event.actorType || 'UNKNOWN',
        id: event.actorId,
        ip: event.actorIp,
      } : undefined,
      target: event.targetType ? {
        type: event.targetType,
        id: event.targetId,
      } : undefined,
      action: {
        name: event.action,
        outcome: event.outcome,
      },
      details: event.details,
      correlation: {
        id: event.correlationId || event.eventId,
        parentEventId: event.parentEventId?.toString(),
      },
    };
  }

  /**
   * Forward pending events to SIEM
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async forwardToSiem(): Promise<void> {
    const siemEndpoint = this.configService.get<string>('SIEM_ENDPOINT');
    const siemApiKey = this.configService.get<string>('SIEM_API_KEY');

    if (!siemEndpoint) {
      return; // SIEM not configured
    }

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    try {
      // Get unforwarded events
      const response = await fetch(
        `${supabaseUrl}/rest/v1/security_events?forwarded_to_siem=eq.false&order=event_time.asc&limit=100`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error('Failed to fetch events for SIEM');
      }

      const events = await response.json();
      if (events.length === 0) return;

      // Format events for SIEM
      const siemEvents = events.map((e: Record<string, unknown>) => 
        this.formatForSiem(this.mapEventFromDb(e))
      );

      // Send to SIEM
      const siemResponse = await fetch(siemEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${siemApiKey}`,
        },
        body: JSON.stringify({ events: siemEvents }),
      });

      if (siemResponse.ok) {
        // Mark events as forwarded
        const eventIds = events.map((e: { id: number }) => e.id);
        await fetch(
          `${supabaseUrl}/rest/v1/security_events?id=in.(${eventIds.join(',')})`,
          {
            method: 'PATCH',
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              forwarded_to_siem: true,
              forwarded_at: new Date().toISOString(),
            }),
          },
        );

        this.logger.log(`Forwarded ${events.length} events to SIEM`);
      } else {
        this.logger.error(`SIEM forwarding failed: ${siemResponse.statusText}`);
      }
    } catch (error) {
      this.logger.error('Error forwarding events to SIEM', error);
    }
  }

  // ============================================
  // EVENT QUERIES
  // ============================================

  /**
   * Get events by correlation ID
   */
  async getEventsByCorrelation(correlationId: string): Promise<SecurityEvent[]> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(
      `${supabaseUrl}/rest/v1/security_events?correlation_id=eq.${correlationId}&order=event_time.asc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch events');
    }

    const events = await response.json();
    return events.map((e: Record<string, unknown>) => this.mapEventFromDb(e));
  }

  /**
   * Get events by actor (user)
   */
  async getEventsByActor(
    actorId: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<SecurityEvent[]> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    let query = `actor_id=eq.${actorId}`;
    if (fromDate) query += `&event_time=gte.${fromDate.toISOString()}`;
    if (toDate) query += `&event_time=lte.${toDate.toISOString()}`;

    const response = await fetch(
      `${supabaseUrl}/rest/v1/security_events?${query}&order=event_time.desc&limit=1000`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch events');
    }

    const events = await response.json();
    return events.map((e: Record<string, unknown>) => this.mapEventFromDb(e));
  }

  /**
   * Get high-severity events
   */
  async getHighSeverityEvents(hours: number = 24): Promise<SecurityEvent[]> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const fromDate = new Date(Date.now() - hours * 60 * 60 * 1000);

    const response = await fetch(
      `${supabaseUrl}/rest/v1/security_events?severity=in.(P1_CRITICAL,P2_HIGH)&event_time=gte.${fromDate.toISOString()}&order=event_time.desc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch events');
    }

    const events = await response.json();
    return events.map((e: Record<string, unknown>) => this.mapEventFromDb(e));
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private async flushEventBuffer(): Promise<void> {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.eventBuffer.length === 0) return;

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const eventsToInsert = this.eventBuffer.splice(0, this.eventBuffer.length);

    try {
      const rows = eventsToInsert.map(e => ({
        event_id: e.eventId,
        event_type: e.eventType,
        event_category: e.eventCategory,
        severity: e.severity,
        source_system: e.sourceSystem,
        source_component: e.sourceComponent,
        actor_type: e.actorType,
        actor_id: e.actorId,
        actor_ip: e.actorIp,
        actor_geo: e.actorGeo,
        target_type: e.targetType,
        target_id: e.targetId,
        action: e.action,
        outcome: e.outcome,
        details: e.details,
        correlation_id: e.correlationId,
        parent_event_id: e.parentEventId,
        event_time: e.eventTime.toISOString(),
        received_at: e.receivedAt.toISOString(),
        forwarded_to_siem: false,
        previous_hash: e.previousHash,
        record_hash: e.recordHash,
      }));

      const response = await fetch(`${supabaseUrl}/rest/v1/security_events`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(rows),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Failed to flush event buffer: ${error}`);
        // Re-add events to buffer for retry
        this.eventBuffer.unshift(...eventsToInsert);
      }
    } catch (error) {
      this.logger.error('Error flushing event buffer', error);
      this.eventBuffer.unshift(...eventsToInsert);
    }
  }

  private async getLatestEventHash(): Promise<string | undefined> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/security_events?order=id.desc&limit=1&select=record_hash`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) return undefined;

      const [latest] = await response.json();
      return latest?.record_hash;
    } catch {
      return undefined;
    }
  }

  private calculateEventHash(event: SecurityEvent, previousHash?: string): string {
    const data = {
      eventId: event.eventId,
      eventType: event.eventType,
      eventTime: event.eventTime.toISOString(),
      actorId: event.actorId,
      action: event.action,
      outcome: event.outcome,
    };
    const input = (previousHash || '') + JSON.stringify(data);
    return createHash('sha256').update(input).digest('hex');
  }

  private mapEventFromDb(row: Record<string, unknown>): SecurityEvent {
    return {
      id: row.id as number,
      eventId: row.event_id as string,
      eventType: row.event_type as string,
      eventCategory: row.event_category as SecurityEventCategory,
      severity: row.severity as IncidentSeverity,
      sourceSystem: row.source_system as string,
      sourceComponent: row.source_component as string,
      actorType: row.actor_type as 'USER' | 'SYSTEM' | 'EXTERNAL',
      actorId: row.actor_id as string,
      actorIp: row.actor_ip as string,
      actorGeo: row.actor_geo as SecurityEvent['actorGeo'],
      targetType: row.target_type as string,
      targetId: row.target_id as string,
      action: row.action as string,
      outcome: row.outcome as SecurityEventOutcome,
      details: row.details as Record<string, unknown>,
      correlationId: row.correlation_id as string,
      parentEventId: row.parent_event_id as number,
      eventTime: new Date(row.event_time as string),
      receivedAt: new Date(row.received_at as string),
      forwardedToSiem: row.forwarded_to_siem as boolean,
      forwardedAt: row.forwarded_at ? new Date(row.forwarded_at as string) : undefined,
      previousHash: row.previous_hash as string,
      recordHash: row.record_hash as string,
    };
  }
}
