/**
 * NetAxis ISP - CTDISR-2025 Audit Logging Service
 * Comprehensive audit trail with hash chain and SIEM integration
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import {
  LogLevel,
  EventCategory,
  ActorType,
  AuditOutcome,
  AuditLogEntry,
  CreateAuditLogDto,
  DataAccessLogEntry,
  CreateDataAccessLogDto,
  AuditLogSearchParams,
  AuditLogSummary,
} from './types';

@Injectable()
export class AuditLoggingService implements OnModuleInit {
  private readonly logger = new Logger(AuditLoggingService.name);
  private supabase: SupabaseClient;
  private sourceSystem: string;

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL'),
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
    this.sourceSystem = 'netaxis-backend';
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('CTDISR-2025 Audit Logging Service initialized');
  }

  // ============================================
  // AUDIT LOGGING
  // ============================================

  /**
   * Log an audit event
   */
  async log(dto: CreateAuditLogDto): Promise<string> {
    const logId = `LOG-${Date.now()}-${uuidv4().substring(0, 8)}`;
    const logLevel = this.determineLogLevel(dto);
    const riskScore = dto.riskScore ?? this.calculateRiskScore(dto);

    const { data, error } = await this.supabase
      .from('ctdisr.audit_log')
      .insert({
        log_id: logId,
        timestamp: new Date().toISOString(),
        log_level: logLevel,
        event_type: dto.eventType,
        event_category: dto.eventCategory,
        domain: dto.domain,
        source_system: dto.sourceSystem || this.sourceSystem,
        source_component: dto.sourceComponent,
        actor_id: dto.actorId,
        actor_type: dto.actorType,
        actor_email: dto.actorEmail,
        actor_ip: dto.actorIp,
        actor_user_agent: dto.actorUserAgent,
        session_id: dto.sessionId,
        request_id: dto.requestId,
        resource_type: dto.resourceType,
        resource_id: dto.resourceId,
        action: dto.action,
        outcome: dto.outcome,
        outcome_reason: dto.outcomeReason,
        affected_count: dto.affectedCount,
        old_values: dto.oldValues,
        new_values: dto.newValues,
        metadata: dto.metadata,
        geo_location: dto.geoLocation,
        risk_score: riskScore,
        tags: dto.tags,
        correlation_id: dto.correlationId,
        parent_event_id: dto.parentEventId,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to write audit log: ${error.message}`);
      throw new Error(`Audit logging failed: ${error.message}`);
    }

    return logId;
  }

  /**
   * Log authentication event
   */
  async logAuthentication(params: {
    actorId?: string;
    actorEmail?: string;
    actorIp?: string;
    actorUserAgent?: string;
    sessionId?: string;
    action: 'login' | 'logout' | 'mfa_verify' | 'password_reset' | 'token_refresh';
    outcome: AuditOutcome;
    outcomeReason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    return this.log({
      eventType: `auth_${params.action}`,
      eventCategory: EventCategory.AUTHENTICATION,
      domain: 'auth',
      actorId: params.actorId,
      actorType: ActorType.USER,
      actorEmail: params.actorEmail,
      actorIp: params.actorIp,
      actorUserAgent: params.actorUserAgent,
      sessionId: params.sessionId,
      action: params.action,
      outcome: params.outcome,
      outcomeReason: params.outcomeReason,
      metadata: params.metadata,
      riskScore: params.outcome === AuditOutcome.FAILURE ? 40 : 10,
    });
  }

  /**
   * Log authorization event
   */
  async logAuthorization(params: {
    actorId: string;
    actorIp?: string;
    sessionId?: string;
    resourceType: string;
    resourceId?: string;
    action: string;
    permission: string;
    outcome: AuditOutcome;
    outcomeReason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    return this.log({
      eventType: 'authorization_check',
      eventCategory: EventCategory.AUTHORIZATION,
      domain: 'access_control',
      actorId: params.actorId,
      actorType: ActorType.USER,
      actorIp: params.actorIp,
      sessionId: params.sessionId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      action: params.action,
      outcome: params.outcome,
      outcomeReason: params.outcomeReason,
      metadata: { permission: params.permission, ...params.metadata },
      riskScore: params.outcome === AuditOutcome.FAILURE ? 50 : 5,
    });
  }

  /**
   * Log data modification event
   */
  async logDataModification(params: {
    actorId: string;
    actorIp?: string;
    sessionId?: string;
    resourceType: string;
    resourceId: string;
    action: 'create' | 'update' | 'delete';
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    affectedCount?: number;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    return this.log({
      eventType: `data_${params.action}`,
      eventCategory: EventCategory.DATA_MODIFICATION,
      domain: 'data',
      actorId: params.actorId,
      actorType: ActorType.USER,
      actorIp: params.actorIp,
      sessionId: params.sessionId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      action: params.action,
      outcome: AuditOutcome.SUCCESS,
      oldValues: params.oldValues,
      newValues: params.newValues,
      affectedCount: params.affectedCount,
      metadata: params.metadata,
    });
  }

  /**
   * Log security event
   */
  async logSecurityEvent(params: {
    eventType: string;
    actorId?: string;
    actorIp?: string;
    sessionId?: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const riskScore = {
      low: 20,
      medium: 40,
      high: 70,
      critical: 95,
    }[params.severity];

    return this.log({
      eventType: params.eventType,
      eventCategory: EventCategory.SECURITY,
      domain: 'security',
      actorId: params.actorId,
      actorType: params.actorId ? ActorType.USER : ActorType.SYSTEM,
      actorIp: params.actorIp,
      sessionId: params.sessionId,
      action: params.eventType,
      outcome: AuditOutcome.SUCCESS,
      metadata: { description: params.description, severity: params.severity, ...params.metadata },
      riskScore,
      tags: ['security', params.severity],
    });
  }

  /**
   * Log configuration change
   */
  async logConfigChange(params: {
    actorId: string;
    actorIp?: string;
    configType: string;
    configKey: string;
    oldValue?: unknown;
    newValue?: unknown;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    return this.log({
      eventType: 'config_change',
      eventCategory: EventCategory.CONFIGURATION,
      domain: 'configuration',
      actorId: params.actorId,
      actorType: ActorType.ADMIN,
      actorIp: params.actorIp,
      resourceType: params.configType,
      resourceId: params.configKey,
      action: 'update',
      outcome: AuditOutcome.SUCCESS,
      oldValues: params.oldValue ? { value: params.oldValue } : undefined,
      newValues: params.newValue ? { value: params.newValue } : undefined,
      metadata: params.metadata,
      riskScore: 30,
      tags: ['configuration', params.configType],
    });
  }

  // ============================================
  // DATA ACCESS LOGGING
  // ============================================

  /**
   * Log data access event
   */
  async logDataAccess(dto: CreateDataAccessLogDto): Promise<string> {
    const { data, error } = await this.supabase
      .from('ctdisr.data_access_log')
      .insert({
        accessor_id: dto.accessorId,
        accessor_type: dto.accessorType,
        data_classification: dto.dataClassification,
        data_category: dto.dataCategory,
        table_name: dto.tableName,
        record_ids: dto.recordIds,
        fields_accessed: dto.fieldsAccessed,
        access_type: dto.accessType,
        purpose: dto.purpose,
        access_granted: dto.accessGranted,
        denial_reason: dto.denialReason,
        ip_address: dto.ipAddress,
        session_id: dto.sessionId,
        data_volume_bytes: dto.dataVolumeBytes,
        record_count: dto.recordCount,
        metadata: dto.metadata,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to log data access: ${error.message}`);
      throw new Error(`Data access logging failed: ${error.message}`);
    }

    return data.id;
  }

  // ============================================
  // LOG RETRIEVAL
  // ============================================

  /**
   * Search audit logs
   */
  async searchLogs(params: AuditLogSearchParams): Promise<AuditLogEntry[]> {
    const { data, error } = await this.supabase.rpc('ctdisr.search_audit_logs', {
      p_start_time: params.startTime?.toISOString() || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      p_end_time: params.endTime?.toISOString() || new Date().toISOString(),
      p_event_types: params.eventTypes || null,
      p_categories: params.categories || null,
      p_actors: params.actors || null,
      p_outcomes: params.outcomes || null,
      p_min_risk_score: params.minRiskScore || null,
      p_search_text: params.searchText || null,
      p_limit: params.limit || 100,
      p_offset: params.offset || 0,
    });

    if (error) {
      throw new Error(`Log search failed: ${error.message}`);
    }

    return (data || []).map(this.mapLogFromDb);
  }

  /**
   * Get audit log summary
   */
  async getSummary(hours: number = 24): Promise<AuditLogSummary> {
    const { data, error } = await this.supabase.rpc('ctdisr.get_audit_log_summary', {
      p_hours: hours,
    });

    if (error) {
      throw new Error(`Failed to get log summary: ${error.message}`);
    }

    return {
      totalEvents: data.total_events,
      eventsByLevel: data.events_by_level || {},
      eventsByCategory: data.events_by_category || {},
      failureCount: data.failure_count,
      highRiskEvents: data.high_risk_events,
      uniqueActors: data.unique_actors,
      pendingSiemQueue: data.pending_siem_queue,
      unacknowledgedAlerts: data.unacknowledged_alerts,
      generatedAt: new Date(data.generated_at),
    };
  }

  /**
   * Get logs by correlation ID
   */
  async getByCorrelationId(correlationId: string): Promise<AuditLogEntry[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.audit_log')
      .select('*')
      .eq('correlation_id', correlationId)
      .order('timestamp', { ascending: true });

    if (error) {
      throw new Error(`Failed to get correlated logs: ${error.message}`);
    }

    return (data || []).map(this.mapLogFromDb);
  }

  /**
   * Get high-risk events
   */
  async getHighRiskEvents(minScore: number = 70, limit: number = 50): Promise<AuditLogEntry[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.audit_log')
      .select('*')
      .gte('risk_score', minScore)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get high-risk events: ${error.message}`);
    }

    return (data || []).map(this.mapLogFromDb);
  }

  // ============================================
  // HELPERS
  // ============================================

  private determineLogLevel(dto: CreateAuditLogDto): LogLevel {
    if (dto.outcome === AuditOutcome.FAILURE) {
      if (dto.eventCategory === EventCategory.SECURITY) return LogLevel.CRITICAL;
      if (dto.eventCategory === EventCategory.AUTHENTICATION) return LogLevel.WARN;
      return LogLevel.ERROR;
    }

    if (dto.eventCategory === EventCategory.SECURITY) return LogLevel.WARN;
    if (dto.eventCategory === EventCategory.CONFIGURATION) return LogLevel.INFO;
    
    return LogLevel.INFO;
  }

  private calculateRiskScore(dto: CreateAuditLogDto): number {
    let score = 0;

    // Base score by category
    const categoryScores: Record<EventCategory, number> = {
      [EventCategory.AUTHENTICATION]: 20,
      [EventCategory.AUTHORIZATION]: 15,
      [EventCategory.DATA_ACCESS]: 10,
      [EventCategory.DATA_MODIFICATION]: 25,
      [EventCategory.CONFIGURATION]: 30,
      [EventCategory.NETWORK]: 15,
      [EventCategory.SECURITY]: 40,
      [EventCategory.SYSTEM]: 10,
      [EventCategory.COMPLIANCE]: 20,
      [EventCategory.USER_ACTIVITY]: 5,
    };

    score += categoryScores[dto.eventCategory] || 10;

    // Failure increases risk
    if (dto.outcome === AuditOutcome.FAILURE) {
      score += 20;
    }

    // Admin actions are higher risk
    if (dto.actorType === ActorType.ADMIN) {
      score += 10;
    }

    // Bulk operations are higher risk
    if (dto.affectedCount && dto.affectedCount > 10) {
      score += Math.min(dto.affectedCount / 10, 20);
    }

    return Math.min(score, 100);
  }

  private mapLogFromDb(data: any): AuditLogEntry {
    return {
      id: data.id,
      logId: data.log_id,
      timestamp: new Date(data.timestamp),
      logLevel: data.log_level,
      eventType: data.event_type,
      eventCategory: data.event_category,
      domain: data.domain,
      sourceSystem: data.source_system,
      sourceComponent: data.source_component,
      actorId: data.actor_id,
      actorType: data.actor_type,
      actorEmail: data.actor_email,
      actorIp: data.actor_ip,
      actorUserAgent: data.actor_user_agent,
      sessionId: data.session_id,
      requestId: data.request_id,
      resourceType: data.resource_type,
      resourceId: data.resource_id,
      action: data.action,
      outcome: data.outcome,
      outcomeReason: data.outcome_reason,
      affectedCount: data.affected_count,
      oldValues: data.old_values,
      newValues: data.new_values,
      metadata: data.metadata,
      geoLocation: data.geo_location,
      riskScore: data.risk_score,
      tags: data.tags,
      correlationId: data.correlation_id,
      parentEventId: data.parent_event_id,
      hashChain: data.hash_chain,
      forwardedToSiem: data.forwarded_to_siem,
      siemForwardedAt: data.siem_forwarded_at ? new Date(data.siem_forwarded_at) : undefined,
      retentionDays: data.retention_days,
      createdAt: new Date(data.created_at),
    };
  }
}
