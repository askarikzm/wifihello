/**
 * NetAxis ISP - CTDISR-2025 Network Security Service
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  NetworkZone,
  CreateNetworkZoneDto,
  FirewallRule,
  CreateFirewallRuleDto,
  FirewallAction,
  IdsEvent,
  IdsSeverity,
  DdosAttack,
  DdosAttackStatus,
  DdosBlacklistEntry,
  VpnSession,
  NetworkSecuritySummary,
  ThreatSource,
} from './types';

@Injectable()
export class NetworkSecurityService {
  private readonly logger = new Logger(NetworkSecurityService.name);
  private supabase: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL'),
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // ============================================
  // NETWORK ZONES
  // ============================================

  async createZone(dto: CreateNetworkZoneDto, userId?: string): Promise<NetworkZone> {
    const { data, error } = await this.supabase
      .from('ctdisr.network_zones')
      .insert({
        zone_name: dto.zoneName,
        zone_type: dto.zoneType,
        description: dto.description,
        cidr_blocks: dto.cidrBlocks,
        vlan_ids: dto.vlanIds,
        security_level: dto.securityLevel,
        parent_zone_id: dto.parentZoneId,
        allowed_protocols: dto.allowedProtocols || ['tcp', 'udp', 'icmp'],
        default_policy: dto.defaultPolicy || 'deny',
        isolation_enabled: dto.isolationEnabled ?? true,
        monitoring_enabled: dto.monitoringEnabled ?? true,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create zone: ${error.message}`);
    }

    this.logger.log(`Created network zone: ${dto.zoneName}`);
    return this.mapZoneFromDb(data);
  }

  async getZones(activeOnly: boolean = true): Promise<NetworkZone[]> {
    let query = this.supabase.from('ctdisr.network_zones').select('*');
    
    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query.order('security_level', { ascending: false });

    if (error) {
      throw new Error(`Failed to get zones: ${error.message}`);
    }

    return (data || []).map(this.mapZoneFromDb);
  }

  async updateZone(zoneId: string, updates: Partial<CreateNetworkZoneDto>): Promise<NetworkZone> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    
    if (updates.zoneName) updateData.zone_name = updates.zoneName;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.cidrBlocks) updateData.cidr_blocks = updates.cidrBlocks;
    if (updates.vlanIds) updateData.vlan_ids = updates.vlanIds;
    if (updates.securityLevel !== undefined) updateData.security_level = updates.securityLevel;
    if (updates.allowedProtocols) updateData.allowed_protocols = updates.allowedProtocols;
    if (updates.defaultPolicy) updateData.default_policy = updates.defaultPolicy;
    if (updates.isolationEnabled !== undefined) updateData.isolation_enabled = updates.isolationEnabled;
    if (updates.monitoringEnabled !== undefined) updateData.monitoring_enabled = updates.monitoringEnabled;

    const { data, error } = await this.supabase
      .from('ctdisr.network_zones')
      .update(updateData)
      .eq('id', zoneId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update zone: ${error.message}`);
    }

    return this.mapZoneFromDb(data);
  }

  // ============================================
  // FIREWALL RULES
  // ============================================

  async createFirewallRule(
    dto: CreateFirewallRuleDto,
    userId?: string,
    approvedBy?: string,
  ): Promise<FirewallRule> {
    const { data, error } = await this.supabase
      .from('ctdisr.firewall_rules')
      .insert({
        rule_name: dto.ruleName,
        rule_number: dto.ruleNumber,
        description: dto.description,
        source_zone_id: dto.sourceZoneId,
        source_addresses: dto.sourceAddresses,
        source_ports: dto.sourcePorts,
        destination_zone_id: dto.destinationZoneId,
        destination_addresses: dto.destinationAddresses,
        destination_ports: dto.destinationPorts,
        protocols: dto.protocols || ['tcp'],
        action: dto.action,
        log_enabled: dto.logEnabled ?? true,
        rate_limit: dto.rateLimit,
        schedule_start: dto.scheduleStart,
        schedule_end: dto.scheduleEnd,
        schedule_days: dto.scheduleDays,
        expires_at: dto.expiresAt?.toISOString(),
        change_ticket: dto.changeTicket,
        approved_by: approvedBy,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create firewall rule: ${error.message}`);
    }

    // Record history
    await this.recordFirewallRuleHistory(data.id, 'create', null, data, 'Rule created', dto.changeTicket, userId, approvedBy);

    this.logger.log(`Created firewall rule: ${dto.ruleName} (#${dto.ruleNumber})`);
    return this.mapFirewallRuleFromDb(data);
  }

  async getFirewallRules(activeOnly: boolean = true): Promise<FirewallRule[]> {
    let query = this.supabase.from('ctdisr.firewall_rules').select('*');
    
    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query.order('rule_number', { ascending: true });

    if (error) {
      throw new Error(`Failed to get firewall rules: ${error.message}`);
    }

    return (data || []).map(this.mapFirewallRuleFromDb);
  }

  async updateFirewallRule(
    ruleId: string,
    updates: Partial<CreateFirewallRuleDto>,
    changeReason: string,
    userId?: string,
    approvedBy?: string,
  ): Promise<FirewallRule> {
    // Get current values for history
    const { data: oldRule } = await this.supabase
      .from('ctdisr.firewall_rules')
      .select('*')
      .eq('id', ruleId)
      .single();

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    
    if (updates.ruleName) updateData.rule_name = updates.ruleName;
    if (updates.ruleNumber !== undefined) updateData.rule_number = updates.ruleNumber;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.sourceAddresses) updateData.source_addresses = updates.sourceAddresses;
    if (updates.destinationAddresses) updateData.destination_addresses = updates.destinationAddresses;
    if (updates.action) updateData.action = updates.action;
    if (updates.protocols) updateData.protocols = updates.protocols;
    if (updates.logEnabled !== undefined) updateData.log_enabled = updates.logEnabled;
    if (updates.changeTicket) updateData.change_ticket = updates.changeTicket;
    if (approvedBy) updateData.approved_by = approvedBy;

    const { data, error } = await this.supabase
      .from('ctdisr.firewall_rules')
      .update(updateData)
      .eq('id', ruleId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update firewall rule: ${error.message}`);
    }

    await this.recordFirewallRuleHistory(ruleId, 'update', oldRule, data, changeReason, updates.changeTicket, userId, approvedBy);

    return this.mapFirewallRuleFromDb(data);
  }

  async deleteFirewallRule(ruleId: string, reason: string, userId?: string): Promise<void> {
    const { data: oldRule } = await this.supabase
      .from('ctdisr.firewall_rules')
      .select('*')
      .eq('id', ruleId)
      .single();

    const { error } = await this.supabase
      .from('ctdisr.firewall_rules')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', ruleId);

    if (error) {
      throw new Error(`Failed to delete firewall rule: ${error.message}`);
    }

    await this.recordFirewallRuleHistory(ruleId, 'delete', oldRule, null, reason, undefined, userId);
  }

  private async recordFirewallRuleHistory(
    ruleId: string,
    changeType: string,
    oldValues: any,
    newValues: any,
    changeReason: string,
    changeTicket?: string,
    changedBy?: string,
    approvedBy?: string,
  ): Promise<void> {
    await this.supabase.from('ctdisr.firewall_rule_history').insert({
      rule_id: ruleId,
      change_type: changeType,
      old_values: oldValues,
      new_values: newValues,
      change_reason: changeReason,
      change_ticket: changeTicket,
      changed_by: changedBy,
      approved_by: approvedBy,
    });
  }

  // ============================================
  // IDS/IPS
  // ============================================

  async getIdsEvents(params: {
    startTime?: Date;
    endTime?: Date;
    severity?: IdsSeverity[];
    sourceIp?: string;
    destinationIp?: string;
    investigated?: boolean;
    limit?: number;
  }): Promise<IdsEvent[]> {
    let query = this.supabase.from('ctdisr.ids_events').select('*');

    if (params.startTime) {
      query = query.gte('event_timestamp', params.startTime.toISOString());
    }
    if (params.endTime) {
      query = query.lte('event_timestamp', params.endTime.toISOString());
    }
    if (params.severity && params.severity.length > 0) {
      query = query.in('severity', params.severity);
    }
    if (params.sourceIp) {
      query = query.eq('source_ip', params.sourceIp);
    }
    if (params.destinationIp) {
      query = query.eq('destination_ip', params.destinationIp);
    }
    if (params.investigated !== undefined) {
      query = query.eq('is_investigated', params.investigated);
    }

    const { data, error } = await query
      .order('event_timestamp', { ascending: false })
      .limit(params.limit || 100);

    if (error) {
      throw new Error(`Failed to get IDS events: ${error.message}`);
    }

    return (data || []).map(this.mapIdsEventFromDb);
  }

  async markIdsEventInvestigated(
    eventId: string,
    notes: string,
    falsePositive: boolean,
    userId: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('ctdisr.ids_events')
      .update({
        is_investigated: true,
        investigated_by: userId,
        investigation_notes: notes,
        false_positive: falsePositive,
      })
      .eq('id', eventId);

    if (error) {
      throw new Error(`Failed to mark event investigated: ${error.message}`);
    }
  }

  async getTopThreatSources(hours: number = 24, limit: number = 10): Promise<ThreatSource[]> {
    const { data, error } = await this.supabase.rpc('ctdisr.get_top_threat_sources', {
      p_hours: hours,
      p_limit: limit,
    });

    if (error) {
      throw new Error(`Failed to get threat sources: ${error.message}`);
    }

    return (data || []).map((d: any) => ({
      sourceIp: d.source_ip,
      eventCount: d.event_count,
      severityBreakdown: d.severity_breakdown,
      firstSeen: new Date(d.first_seen),
      lastSeen: new Date(d.last_seen),
    }));
  }

  // ============================================
  // DDOS PROTECTION
  // ============================================

  async getActiveDdosAttacks(): Promise<DdosAttack[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.ddos_attacks')
      .select('*')
      .eq('status', DdosAttackStatus.ONGOING)
      .order('attack_start', { ascending: false });

    if (error) {
      throw new Error(`Failed to get DDoS attacks: ${error.message}`);
    }

    return (data || []).map(this.mapDdosAttackFromDb);
  }

  async recordDdosAttack(attack: Partial<DdosAttack>): Promise<DdosAttack> {
    const { data, error } = await this.supabase
      .from('ctdisr.ddos_attacks')
      .insert({
        attack_start: attack.attackStart?.toISOString() || new Date().toISOString(),
        attack_type: attack.attackType,
        target_resource: attack.targetResource,
        peak_pps: attack.peakPps,
        peak_bps: attack.peakBps,
        source_count: attack.sourceCount,
        top_sources: attack.topSources,
        attack_vectors: attack.attackVectors,
        protection_profile_id: attack.protectionProfileId,
        status: DdosAttackStatus.ONGOING,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to record DDoS attack: ${error.message}`);
    }

    this.logger.warn(`DDoS attack recorded: ${attack.attackType} on ${attack.targetResource}`);
    return this.mapDdosAttackFromDb(data);
  }

  async updateDdosAttackStatus(
    attackId: string,
    status: DdosAttackStatus,
    updates?: Partial<DdosAttack>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = { status };
    
    if (status !== DdosAttackStatus.ONGOING) {
      updateData.attack_end = new Date().toISOString();
    }
    if (updates?.totalPackets) updateData.total_packets = updates.totalPackets;
    if (updates?.totalBytes) updateData.total_bytes = updates.totalBytes;
    if (updates?.mitigationActions) updateData.mitigation_actions = updates.mitigationActions;
    if (updates?.impactAssessment) updateData.impact_assessment = updates.impactAssessment;

    const { error } = await this.supabase
      .from('ctdisr.ddos_attacks')
      .update(updateData)
      .eq('id', attackId);

    if (error) {
      throw new Error(`Failed to update DDoS attack: ${error.message}`);
    }
  }

  async addToBlacklist(
    ipAddress: string,
    reason: string,
    attackId?: string,
    expiresAt?: Date,
    isPermanent: boolean = false,
    userId?: string,
  ): Promise<DdosBlacklistEntry> {
    const { data, error } = await this.supabase
      .from('ctdisr.ddos_blacklist')
      .insert({
        ip_address: ipAddress,
        reason,
        attack_id: attackId,
        expires_at: expiresAt?.toISOString(),
        is_permanent: isPermanent,
        auto_blocked: !userId,
        blocked_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to add to blacklist: ${error.message}`);
    }

    this.logger.warn(`IP blacklisted: ${ipAddress} - ${reason}`);
    return this.mapBlacklistFromDb(data);
  }

  async removeFromBlacklist(ipAddress: string): Promise<void> {
    const { error } = await this.supabase
      .from('ctdisr.ddos_blacklist')
      .delete()
      .eq('ip_address', ipAddress);

    if (error) {
      throw new Error(`Failed to remove from blacklist: ${error.message}`);
    }
  }

  async getBlacklist(): Promise<DdosBlacklistEntry[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.ddos_blacklist')
      .select('*')
      .or(`is_permanent.eq.true,expires_at.gt.${new Date().toISOString()}`)
      .order('blocked_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get blacklist: ${error.message}`);
    }

    return (data || []).map(this.mapBlacklistFromDb);
  }

  // ============================================
  // VPN SESSIONS
  // ============================================

  async getActiveVpnSessions(): Promise<VpnSession[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.vpn_sessions')
      .select('*')
      .eq('is_active', true)
      .order('session_start', { ascending: false });

    if (error) {
      throw new Error(`Failed to get VPN sessions: ${error.message}`);
    }

    return (data || []).map(this.mapVpnSessionFromDb);
  }

  async terminateVpnSession(sessionId: string, reason: string): Promise<void> {
    const { error } = await this.supabase
      .from('ctdisr.vpn_sessions')
      .update({
        is_active: false,
        session_end: new Date().toISOString(),
        disconnect_reason: reason,
      })
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to terminate VPN session: ${error.message}`);
    }
  }

  // ============================================
  // SUMMARY
  // ============================================

  async getSecuritySummary(): Promise<NetworkSecuritySummary> {
    const { data, error } = await this.supabase.rpc('ctdisr.get_network_security_summary');

    if (error) {
      throw new Error(`Failed to get security summary: ${error.message}`);
    }

    return {
      activeZones: data.active_zones,
      activeFirewallRules: data.active_firewall_rules,
      idsEvents24h: data.ids_events_24h,
      criticalIdsEvents: data.critical_ids_events,
      uninvestigatedIdsEvents: data.uninvestigated_ids_events,
      activeDdosAttacks: data.active_ddos_attacks,
      ddosAttacks24h: data.ddos_attacks_24h,
      activeVpnSessions: data.active_vpn_sessions,
      blacklistedIps: data.blacklisted_ips,
      generatedAt: new Date(data.generated_at),
    };
  }

  // ============================================
  // MAPPERS
  // ============================================

  private mapZoneFromDb(data: any): NetworkZone {
    return {
      id: data.id,
      zoneName: data.zone_name,
      zoneType: data.zone_type,
      description: data.description,
      cidrBlocks: data.cidr_blocks,
      vlanIds: data.vlan_ids,
      securityLevel: data.security_level,
      parentZoneId: data.parent_zone_id,
      allowedProtocols: data.allowed_protocols,
      defaultPolicy: data.default_policy,
      isolationEnabled: data.isolation_enabled,
      monitoringEnabled: data.monitoring_enabled,
      zoneMetadata: data.zone_metadata,
      isActive: data.is_active,
      createdBy: data.created_by,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  private mapFirewallRuleFromDb(data: any): FirewallRule {
    return {
      id: data.id,
      ruleName: data.rule_name,
      ruleNumber: data.rule_number,
      description: data.description,
      sourceZoneId: data.source_zone_id,
      sourceAddresses: data.source_addresses,
      sourcePorts: data.source_ports,
      destinationZoneId: data.destination_zone_id,
      destinationAddresses: data.destination_addresses,
      destinationPorts: data.destination_ports,
      protocols: data.protocols,
      action: data.action,
      logEnabled: data.log_enabled,
      rateLimit: data.rate_limit,
      scheduleStart: data.schedule_start,
      scheduleEnd: data.schedule_end,
      scheduleDays: data.schedule_days,
      expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
      isActive: data.is_active,
      hitCount: data.hit_count,
      lastHitAt: data.last_hit_at ? new Date(data.last_hit_at) : undefined,
      changeTicket: data.change_ticket,
      approvedBy: data.approved_by,
      createdBy: data.created_by,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  private mapIdsEventFromDb(data: any): IdsEvent {
    return {
      id: data.id,
      eventTimestamp: new Date(data.event_timestamp),
      signatureId: data.signature_id,
      sensorId: data.sensor_id,
      sourceIp: data.source_ip,
      sourcePort: data.source_port,
      destinationIp: data.destination_ip,
      destinationPort: data.destination_port,
      protocol: data.protocol,
      severity: data.severity,
      actionTaken: data.action_taken,
      packetPayload: data.packet_payload,
      rawEvent: data.raw_event,
      geoSource: data.geo_source,
      geoDestination: data.geo_destination,
      isInvestigated: data.is_investigated,
      investigatedBy: data.investigated_by,
      investigationNotes: data.investigation_notes,
      falsePositive: data.false_positive,
      createdAt: new Date(data.created_at),
    };
  }

  private mapDdosAttackFromDb(data: any): DdosAttack {
    return {
      id: data.id,
      attackStart: new Date(data.attack_start),
      attackEnd: data.attack_end ? new Date(data.attack_end) : undefined,
      attackType: data.attack_type,
      targetResource: data.target_resource,
      peakPps: data.peak_pps,
      peakBps: data.peak_bps,
      totalPackets: data.total_packets,
      totalBytes: data.total_bytes,
      sourceCount: data.source_count,
      topSources: data.top_sources,
      attackVectors: data.attack_vectors,
      mitigationActions: data.mitigation_actions,
      protectionProfileId: data.protection_profile_id,
      status: data.status,
      impactAssessment: data.impact_assessment,
      createdAt: new Date(data.created_at),
    };
  }

  private mapBlacklistFromDb(data: any): DdosBlacklistEntry {
    return {
      id: data.id,
      ipAddress: data.ip_address,
      reason: data.reason,
      attackId: data.attack_id,
      blockedAt: new Date(data.blocked_at),
      expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
      isPermanent: data.is_permanent,
      autoBlocked: data.auto_blocked,
      blockedBy: data.blocked_by,
      createdAt: new Date(data.created_at),
    };
  }

  private mapVpnSessionFromDb(data: any): VpnSession {
    return {
      id: data.id,
      profileId: data.profile_id,
      userId: data.user_id,
      sessionStart: new Date(data.session_start),
      sessionEnd: data.session_end ? new Date(data.session_end) : undefined,
      clientIp: data.client_ip,
      assignedIp: data.assigned_ip,
      clientDevice: data.client_device,
      clientOs: data.client_os,
      bytesIn: data.bytes_in,
      bytesOut: data.bytes_out,
      packetsIn: data.packets_in,
      packetsOut: data.packets_out,
      disconnectReason: data.disconnect_reason,
      isActive: data.is_active,
      createdAt: new Date(data.created_at),
    };
  }
}
