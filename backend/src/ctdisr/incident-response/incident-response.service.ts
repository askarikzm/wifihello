/**
 * CTDISR-2025 Incident Response Service
 * PTA Regulation: Chapter 7 - Security Incident Management
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import {
  SecurityIncident,
  IncidentSeverity,
  IncidentStatus,
  IncidentCategory,
  IncidentTimelineEvent,
  ResponsePlaybook,
  IncidentResponseTeamMember,
  IncidentCommunication,
  IncidentStatistics,
  IncidentTrend,
  CreateIncidentDto,
  UpdateIncidentStatusDto,
  AssignIncidentDto,
  EscalateIncidentDto,
  AddTimelineEventDto,
  ReportToPtaDto,
  PtaIncidentReport,
  RemediationAction,
  IndicatorOfCompromise,
} from './types';

@Injectable()
export class IncidentResponseService {
  private readonly logger = new Logger(IncidentResponseService.name);
  private readonly supabase: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.getOrThrow('SUPABASE_URL'),
      this.configService.getOrThrow('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // ============ Incident Management ============

  async createIncident(dto: CreateIncidentDto, createdBy: string): Promise<SecurityIncident> {
    this.logger.log(`Creating new security incident: ${dto.title}`);

    // Generate incident number
    const { data: incidentNumber } = await this.supabase.rpc('generate_incident_number');

    // Get applicable playbook for SLA
    const playbook = await this.findPlaybook(dto.category, dto.severity);
    
    const incidentData = {
      incident_number: incidentNumber,
      severity: dto.severity,
      status: IncidentStatus.DETECTED,
      category: dto.category,
      title: dto.title,
      description: dto.description,
      affected_assets: dto.affectedAssets || [],
      affected_systems: dto.affectedSystems || [],
      detection_method: dto.detectionMethod,
      detection_source: dto.detectionSource,
      initial_indicators: dto.initialIndicators || {},
      detected_at: new Date().toISOString(),
      response_sla_minutes: playbook?.initialResponseMinutes,
      containment_sla_minutes: playbook?.containmentTargetMinutes,
      created_by: createdBy,
    };

    // Calculate record hash for integrity
    const recordHash = this.calculateRecordHash(incidentData);

    const { data, error } = await this.supabase
      .from('ctdisr.security_incidents')
      .insert({ ...incidentData, record_hash: recordHash })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create incident: ${error.message}`);
      throw new BadRequestException(`Failed to create incident: ${error.message}`);
    }

    // Add initial timeline event
    await this.addTimelineEvent({
      incidentId: data.id,
      eventType: 'incident_created',
      description: `Incident ${incidentNumber} created with severity ${dto.severity}`,
      details: { severity: dto.severity, category: dto.category },
    }, createdBy);

    // Auto-assign on-call team if critical/high
    if ([IncidentSeverity.CRITICAL, IncidentSeverity.HIGH].includes(dto.severity)) {
      await this.autoAssignOnCallTeam(data.id);
    }

    this.logger.log(`Created incident ${incidentNumber} with ID ${data.id}`);
    return this.mapToIncident(data);
  }

  async getIncident(id: string): Promise<SecurityIncident> {
    const { data, error } = await this.supabase
      .from('ctdisr.security_incidents')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Incident not found: ${id}`);
    }

    return this.mapToIncident(data);
  }

  async getIncidentByNumber(incidentNumber: string): Promise<SecurityIncident> {
    const { data, error } = await this.supabase
      .from('ctdisr.security_incidents')
      .select('*')
      .eq('incident_number', incidentNumber)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Incident not found: ${incidentNumber}`);
    }

    return this.mapToIncident(data);
  }

  async listIncidents(filters: {
    status?: IncidentStatus[];
    severity?: IncidentSeverity[];
    category?: IncidentCategory[];
    fromDate?: Date;
    toDate?: Date;
    assignedTo?: string;
    ptaReported?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ incidents: SecurityIncident[]; total: number }> {
    let query = this.supabase
      .from('ctdisr.security_incidents')
      .select('*', { count: 'exact' });

    if (filters.status?.length) {
      query = query.in('status', filters.status);
    }
    if (filters.severity?.length) {
      query = query.in('severity', filters.severity);
    }
    if (filters.category?.length) {
      query = query.in('category', filters.category);
    }
    if (filters.fromDate) {
      query = query.gte('detected_at', filters.fromDate.toISOString());
    }
    if (filters.toDate) {
      query = query.lte('detected_at', filters.toDate.toISOString());
    }
    if (filters.assignedTo) {
      query = query.contains('assigned_team', [filters.assignedTo]);
    }
    if (filters.ptaReported !== undefined) {
      query = query.eq('pta_reported', filters.ptaReported);
    }

    query = query
      .order('detected_at', { ascending: false })
      .range(filters.offset || 0, (filters.offset || 0) + (filters.limit || 50) - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new BadRequestException(`Failed to list incidents: ${error.message}`);
    }

    return {
      incidents: (data || []).map(this.mapToIncident),
      total: count || 0,
    };
  }

  async updateIncidentStatus(
    id: string,
    dto: UpdateIncidentStatusDto,
    updatedBy: string,
  ): Promise<SecurityIncident> {
    const incident = await this.getIncident(id);
    
    // Validate status transition
    this.validateStatusTransition(incident.status, dto.status);

    const updateData: Record<string, unknown> = {
      status: dto.status,
      updated_at: new Date().toISOString(),
    };

    // Set appropriate timestamps
    switch (dto.status) {
      case IncidentStatus.TRIAGED:
        updateData.triaged_at = new Date().toISOString();
        break;
      case IncidentStatus.CONTAINED:
        updateData.contained_at = new Date().toISOString();
        break;
      case IncidentStatus.ERADICATED:
        updateData.eradicated_at = new Date().toISOString();
        break;
      case IncidentStatus.RECOVERED:
        updateData.recovered_at = new Date().toISOString();
        break;
      case IncidentStatus.CLOSED:
        updateData.closed_at = new Date().toISOString();
        break;
    }

    const { data, error } = await this.supabase
      .from('ctdisr.security_incidents')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update incident status: ${error.message}`);
    }

    // Add timeline event
    await this.addTimelineEvent({
      incidentId: id,
      eventType: 'status_changed',
      description: `Status changed from ${incident.status} to ${dto.status}`,
      details: { previousStatus: incident.status, newStatus: dto.status, notes: dto.notes },
    }, updatedBy);

    this.logger.log(`Updated incident ${incident.incidentNumber} status to ${dto.status}`);
    return this.mapToIncident(data);
  }

  async assignIncident(id: string, dto: AssignIncidentDto, assignedBy: string): Promise<SecurityIncident> {
    const incident = await this.getIncident(id);

    const { data, error } = await this.supabase
      .from('ctdisr.security_incidents')
      .update({
        incident_commander: dto.incidentCommander,
        assigned_team: dto.assignedTeam || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to assign incident: ${error.message}`);
    }

    await this.addTimelineEvent({
      incidentId: id,
      eventType: 'team_assigned',
      description: `Incident commander assigned: ${dto.incidentCommander}`,
      details: { commander: dto.incidentCommander, team: dto.assignedTeam },
    }, assignedBy);

    this.logger.log(`Assigned incident ${incident.incidentNumber} to ${dto.incidentCommander}`);
    return this.mapToIncident(data);
  }

  async escalateIncident(id: string, dto: EscalateIncidentDto, escalatedBy: string): Promise<SecurityIncident> {
    const incident = await this.getIncident(id);

    if (dto.newLevel <= incident.escalationLevel) {
      throw new BadRequestException('New escalation level must be higher than current level');
    }

    const { data, error } = await this.supabase
      .from('ctdisr.security_incidents')
      .update({
        escalation_level: dto.newLevel,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to escalate incident: ${error.message}`);
    }

    await this.addTimelineEvent({
      incidentId: id,
      eventType: 'escalated',
      description: `Escalated from level ${incident.escalationLevel} to level ${dto.newLevel}: ${dto.reason}`,
      details: { 
        previousLevel: incident.escalationLevel, 
        newLevel: dto.newLevel, 
        reason: dto.reason,
        notified: dto.notifyParties,
      },
    }, escalatedBy);

    // Notify parties
    if (dto.notifyParties?.length) {
      await this.notifyEscalation(incident, dto);
    }

    this.logger.log(`Escalated incident ${incident.incidentNumber} to level ${dto.newLevel}`);
    return this.mapToIncident(data);
  }

  async addIndicatorsOfCompromise(
    incidentId: string,
    iocs: IndicatorOfCompromise[],
    addedBy: string,
  ): Promise<SecurityIncident> {
    const incident = await this.getIncident(incidentId);
    const existingIocs = incident.iocs || [];
    const updatedIocs = [...existingIocs, ...iocs];

    const { data, error } = await this.supabase
      .from('ctdisr.security_incidents')
      .update({
        iocs: updatedIocs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', incidentId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to add IOCs: ${error.message}`);
    }

    await this.addTimelineEvent({
      incidentId,
      eventType: 'iocs_added',
      description: `Added ${iocs.length} indicators of compromise`,
      details: { iocs },
    }, addedBy);

    return this.mapToIncident(data);
  }

  async addRemediationAction(
    incidentId: string,
    action: RemediationAction,
    addedBy: string,
  ): Promise<SecurityIncident> {
    const incident = await this.getIncident(incidentId);
    const existingActions = incident.remediationActions || [];
    const updatedActions = [...existingActions, action];

    const { data, error } = await this.supabase
      .from('ctdisr.security_incidents')
      .update({
        remediation_actions: updatedActions,
        updated_at: new Date().toISOString(),
      })
      .eq('id', incidentId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to add remediation action: ${error.message}`);
    }

    await this.addTimelineEvent({
      incidentId,
      eventType: 'remediation_added',
      description: `Added remediation action: ${action.action}`,
      details: { action },
    }, addedBy);

    return this.mapToIncident(data);
  }

  // ============ Timeline Management ============

  async addTimelineEvent(dto: AddTimelineEventDto, performedBy: string): Promise<IncidentTimelineEvent> {
    const { data, error } = await this.supabase
      .from('ctdisr.incident_timeline')
      .insert({
        incident_id: dto.incidentId,
        event_type: dto.eventType,
        description: dto.description,
        performed_by: performedBy,
        automated: false,
        details: dto.details || {},
        attachments: dto.attachments || [],
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to add timeline event: ${error.message}`);
    }

    return this.mapToTimelineEvent(data);
  }

  async getIncidentTimeline(incidentId: string): Promise<IncidentTimelineEvent[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.incident_timeline')
      .select('*')
      .eq('incident_id', incidentId)
      .order('event_time', { ascending: true });

    if (error) {
      throw new BadRequestException(`Failed to get timeline: ${error.message}`);
    }

    return (data || []).map(this.mapToTimelineEvent);
  }

  // ============ Playbook Management ============

  async findPlaybook(
    category: IncidentCategory,
    severity: IncidentSeverity,
  ): Promise<ResponsePlaybook | null> {
    const { data } = await this.supabase
      .from('ctdisr.response_playbooks')
      .select('*')
      .eq('category', category)
      .contains('severity_levels', [severity])
      .eq('is_active', true)
      .single();

    return data ? this.mapToPlaybook(data) : null;
  }

  async listPlaybooks(): Promise<ResponsePlaybook[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.response_playbooks')
      .select('*')
      .eq('is_active', true)
      .order('category');

    if (error) {
      throw new BadRequestException(`Failed to list playbooks: ${error.message}`);
    }

    return (data || []).map(this.mapToPlaybook);
  }

  async executePlaybookStep(
    incidentId: string,
    playbookId: string,
    stepNumber: number,
    executedBy: string,
    result: string,
  ): Promise<void> {
    const playbook = await this.getPlaybookById(playbookId);
    const step = playbook.steps.find((s) => s.stepNumber === stepNumber);

    if (!step) {
      throw new NotFoundException(`Playbook step ${stepNumber} not found`);
    }

    await this.addTimelineEvent({
      incidentId,
      eventType: 'playbook_step_executed',
      description: `Executed playbook step ${stepNumber}: ${step.title}`,
      details: { playbookId, stepNumber, stepTitle: step.title, result },
    }, executedBy);
  }

  private async getPlaybookById(id: string): Promise<ResponsePlaybook> {
    const { data, error } = await this.supabase
      .from('ctdisr.response_playbooks')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Playbook not found: ${id}`);
    }

    return this.mapToPlaybook(data);
  }

  // ============ Team Management ============

  async getOnCallTeam(): Promise<IncidentResponseTeamMember[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.incident_response_team')
      .select('*')
      .eq('is_on_call', true)
      .eq('is_active', true);

    if (error) {
      throw new BadRequestException(`Failed to get on-call team: ${error.message}`);
    }

    return (data || []).map(this.mapToTeamMember);
  }

  async getTeamByEscalationLevel(level: number): Promise<IncidentResponseTeamMember[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.incident_response_team')
      .select('*')
      .eq('escalation_level', level)
      .eq('is_active', true);

    if (error) {
      throw new BadRequestException(`Failed to get team: ${error.message}`);
    }

    return (data || []).map(this.mapToTeamMember);
  }

  private async autoAssignOnCallTeam(incidentId: string): Promise<void> {
    const onCallTeam = await this.getOnCallTeam();
    
    if (onCallTeam.length === 0) {
      this.logger.warn('No on-call team members available for auto-assignment');
      return;
    }

    // Find commander
    const commander = onCallTeam.find((m) => m.canBeCommander);
    if (!commander) {
      this.logger.warn('No commander available in on-call team');
      return;
    }

    await this.supabase
      .from('ctdisr.security_incidents')
      .update({
        incident_commander: commander.userId,
        assigned_team: onCallTeam.map((m) => m.userId),
      })
      .eq('id', incidentId);

    this.logger.log(`Auto-assigned incident ${incidentId} to on-call team`);
  }

  // ============ PTA Reporting ============

  async reportToPta(dto: ReportToPtaDto, reportedBy: string): Promise<PtaIncidentReport> {
    const incident = await this.getIncident(dto.incidentId);

    // Build PTA report
    const ptaReport: PtaIncidentReport = {
      incidentNumber: incident.incidentNumber,
      reportType: dto.reportType,
      submittedAt: new Date(),
      severity: incident.severity,
      category: incident.category,
      affectedCustomers: incident.affectedUsers.length,
      dataBreachScope: incident.dataCompromised ? dto.details.dataBreachScope as string : undefined,
      containmentStatus: incident.status,
      remediationPlan: dto.summary,
      timeline: {
        detected: incident.detectedAt,
        contained: incident.containedAt,
        reported: new Date(),
      },
      contactPerson: dto.details.contactPerson as PtaIncidentReport['contactPerson'],
    };

    // Update incident with PTA reporting info
    await this.supabase
      .from('ctdisr.security_incidents')
      .update({
        pta_reported: true,
        pta_report_date: new Date().toISOString(),
        pta_reference: `PTA-${incident.incidentNumber}`,
      })
      .eq('id', dto.incidentId);

    // Add timeline event
    await this.addTimelineEvent({
      incidentId: dto.incidentId,
      eventType: 'pta_reported',
      description: `${dto.reportType} report submitted to PTA`,
      details: { reportType: dto.reportType, reference: `PTA-${incident.incidentNumber}` },
    }, reportedBy);

    // Log communication
    await this.logCommunication({
      incidentId: dto.incidentId,
      communicationType: 'notification',
      direction: 'outbound',
      fromParty: 'WANCOM Security Team',
      toParties: ['PTA'],
      subject: `Incident Report: ${incident.incidentNumber}`,
      summary: dto.summary,
      isRegulatory: true,
      regulatoryBody: 'PTA',
    }, reportedBy);

    this.logger.log(`Reported incident ${incident.incidentNumber} to PTA`);
    return ptaReport;
  }

  async getUnreportedCriticalIncidents(): Promise<SecurityIncident[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.security_incidents')
      .select('*')
      .in('severity', [IncidentSeverity.CRITICAL, IncidentSeverity.HIGH])
      .eq('pta_reported', false)
      .neq('status', IncidentStatus.CLOSED);

    if (error) {
      throw new BadRequestException(`Failed to get unreported incidents: ${error.message}`);
    }

    return (data || []).map(this.mapToIncident);
  }

  // ============ Communications ============

  async logCommunication(
    data: Omit<IncidentCommunication, 'id' | 'createdAt' | 'hasAttachments' | 'attachmentCount'>,
    createdBy: string,
  ): Promise<IncidentCommunication> {
    const { data: result, error } = await this.supabase
      .from('ctdisr.incident_communications')
      .insert({
        incident_id: data.incidentId,
        communication_type: data.communicationType,
        direction: data.direction,
        from_party: data.fromParty,
        to_parties: data.toParties,
        subject: data.subject,
        summary: data.summary,
        sent_at: data.sentAt || new Date().toISOString(),
        is_regulatory: data.isRegulatory,
        regulatory_body: data.regulatoryBody,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to log communication: ${error.message}`);
    }

    return this.mapToCommunication(result);
  }

  async getIncidentCommunications(incidentId: string): Promise<IncidentCommunication[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.incident_communications')
      .select('*')
      .eq('incident_id', incidentId)
      .order('sent_at', { ascending: false });

    if (error) {
      throw new BadRequestException(`Failed to get communications: ${error.message}`);
    }

    return (data || []).map(this.mapToCommunication);
  }

  // ============ Statistics & Reporting ============

  async getIncidentStatistics(fromDate?: Date, toDate?: Date): Promise<IncidentStatistics> {
    let query = this.supabase.from('ctdisr.security_incidents').select('*');

    if (fromDate) {
      query = query.gte('detected_at', fromDate.toISOString());
    }
    if (toDate) {
      query = query.lte('detected_at', toDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      throw new BadRequestException(`Failed to get statistics: ${error.message}`);
    }

    const incidents = data || [];

    const stats: IncidentStatistics = {
      total: incidents.length,
      bySeverity: this.countBy(incidents, 'severity'),
      byStatus: this.countBy(incidents, 'status'),
      byCategory: this.countBy(incidents, 'category'),
      avgTimeToContain: this.calculateAvgTimeToContain(incidents),
      avgTimeToResolve: this.calculateAvgTimeToResolve(incidents),
      slaBreachRate: this.calculateSlaBreachRate(incidents),
      ptaReportingRate: this.calculatePtaReportingRate(incidents),
    };

    return stats;
  }

  async getIncidentTrends(months: number = 12): Promise<IncidentTrend[]> {
    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - months);

    const { data, error } = await this.supabase
      .from('ctdisr.security_incidents')
      .select('*')
      .gte('detected_at', fromDate.toISOString());

    if (error) {
      throw new BadRequestException(`Failed to get trends: ${error.message}`);
    }

    const trends: IncidentTrend[] = [];
    const incidentsByMonth = this.groupByMonth(data || []);

    for (const [period, incidents] of Object.entries(incidentsByMonth)) {
      trends.push({
        period,
        incidents: incidents.length,
        critical: incidents.filter((i) => i.severity === IncidentSeverity.CRITICAL).length,
        high: incidents.filter((i) => i.severity === IncidentSeverity.HIGH).length,
        medium: incidents.filter((i) => i.severity === IncidentSeverity.MEDIUM).length,
        low: incidents.filter((i) => i.severity === IncidentSeverity.LOW).length,
        avgResponseTime: this.calculateAvgResponseTime(incidents),
      });
    }

    return trends.sort((a, b) => a.period.localeCompare(b.period));
  }

  // ============ Private Helpers ============

  private validateStatusTransition(current: IncidentStatus, next: IncidentStatus): void {
    const validTransitions: Record<IncidentStatus, IncidentStatus[]> = {
      [IncidentStatus.DETECTED]: [IncidentStatus.TRIAGED, IncidentStatus.CONTAINED],
      [IncidentStatus.TRIAGED]: [IncidentStatus.CONTAINED, IncidentStatus.CLOSED],
      [IncidentStatus.CONTAINED]: [IncidentStatus.ERADICATED, IncidentStatus.REOPENED],
      [IncidentStatus.ERADICATED]: [IncidentStatus.RECOVERED, IncidentStatus.REOPENED],
      [IncidentStatus.RECOVERED]: [IncidentStatus.CLOSED, IncidentStatus.REOPENED],
      [IncidentStatus.CLOSED]: [IncidentStatus.REOPENED],
      [IncidentStatus.REOPENED]: [IncidentStatus.TRIAGED, IncidentStatus.CONTAINED],
    };

    if (!validTransitions[current]?.includes(next)) {
      throw new BadRequestException(
        `Invalid status transition from ${current} to ${next}`,
      );
    }
  }

  private calculateRecordHash(data: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  private countBy<T>(items: T[], key: keyof T): Record<string, number> {
    return items.reduce((acc, item) => {
      const value = String(item[key]);
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private calculateAvgTimeToContain(incidents: { detected_at: string; contained_at: string | null }[]): number {
    const containedIncidents = incidents.filter((i) => i.contained_at);
    if (containedIncidents.length === 0) return 0;

    const totalMinutes = containedIncidents.reduce((sum, i) => {
      const detected = new Date(i.detected_at).getTime();
      const contained = new Date(i.contained_at!).getTime();
      return sum + (contained - detected) / 60000;
    }, 0);

    return Math.round(totalMinutes / containedIncidents.length);
  }

  private calculateAvgTimeToResolve(incidents: { detected_at: string; closed_at: string | null }[]): number {
    const closedIncidents = incidents.filter((i) => i.closed_at);
    if (closedIncidents.length === 0) return 0;

    const totalMinutes = closedIncidents.reduce((sum, i) => {
      const detected = new Date(i.detected_at).getTime();
      const closed = new Date(i.closed_at!).getTime();
      return sum + (closed - detected) / 60000;
    }, 0);

    return Math.round(totalMinutes / closedIncidents.length);
  }

  private calculateSlaBreachRate(incidents: { sla_breached: boolean }[]): number {
    if (incidents.length === 0) return 0;
    const breached = incidents.filter((i) => i.sla_breached).length;
    return Math.round((breached / incidents.length) * 100);
  }

  private calculatePtaReportingRate(
    incidents: { severity: string; pta_reported: boolean }[],
  ): number {
    const reportable = incidents.filter((i) => 
      [IncidentSeverity.CRITICAL, IncidentSeverity.HIGH].includes(i.severity as IncidentSeverity),
    );
    if (reportable.length === 0) return 100;
    const reported = reportable.filter((i) => i.pta_reported).length;
    return Math.round((reported / reportable.length) * 100);
  }

  private calculateAvgResponseTime(incidents: { detected_at: string; triaged_at: string | null }[]): number {
    const triagedIncidents = incidents.filter((i) => i.triaged_at);
    if (triagedIncidents.length === 0) return 0;

    const totalMinutes = triagedIncidents.reduce((sum, i) => {
      const detected = new Date(i.detected_at).getTime();
      const triaged = new Date(i.triaged_at!).getTime();
      return sum + (triaged - detected) / 60000;
    }, 0);

    return Math.round(totalMinutes / triagedIncidents.length);
  }

  private groupByMonth(incidents: { detected_at: string }[]): Record<string, typeof incidents> {
    return incidents.reduce((acc, incident) => {
      const date = new Date(incident.detected_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(incident);
      return acc;
    }, {} as Record<string, typeof incidents>);
  }

  private async notifyEscalation(
    incident: SecurityIncident,
    dto: EscalateIncidentDto,
  ): Promise<void> {
    // In production, this would send notifications via email/SMS/Slack
    this.logger.log(`Notifying escalation for ${incident.incidentNumber} to: ${dto.notifyParties?.join(', ')}`);
  }

  // ============ Mappers ============

  private mapToIncident(data: Record<string, unknown>): SecurityIncident {
    return {
      id: data.id as string,
      incidentNumber: data.incident_number as string,
      severity: data.severity as IncidentSeverity,
      status: data.status as IncidentStatus,
      category: data.category as IncidentCategory,
      title: data.title as string,
      description: data.description as string,
      affectedAssets: data.affected_assets as string[] || [],
      affectedSystems: data.affected_systems as string[] || [],
      affectedUsers: data.affected_users as string[] || [],
      affectedDataTypes: data.affected_data_types as string[] || [],
      businessImpact: data.business_impact as string,
      dataCompromised: data.data_compromised as boolean,
      dataExfiltrated: data.data_exfiltrated as boolean,
      serviceDisruption: data.service_disruption as boolean,
      estimatedFinancialImpact: data.estimated_financial_impact as number,
      detectionMethod: data.detection_method as string,
      detectionSource: data.detection_source as string,
      initialIndicators: data.initial_indicators as Record<string, unknown>,
      detectedAt: new Date(data.detected_at as string),
      reportedAt: data.reported_at ? new Date(data.reported_at as string) : undefined,
      triagedAt: data.triaged_at ? new Date(data.triaged_at as string) : undefined,
      containedAt: data.contained_at ? new Date(data.contained_at as string) : undefined,
      eradicatedAt: data.eradicated_at ? new Date(data.eradicated_at as string) : undefined,
      recoveredAt: data.recovered_at ? new Date(data.recovered_at as string) : undefined,
      closedAt: data.closed_at ? new Date(data.closed_at as string) : undefined,
      responseSlaMinutes: data.response_sla_minutes as number,
      containmentSlaMinutes: data.containment_sla_minutes as number,
      slaBreached: data.sla_breached as boolean,
      threatActor: data.threat_actor as string,
      attackVector: data.attack_vector as string,
      ttps: data.ttps as string[] || [],
      iocs: data.iocs as IndicatorOfCompromise[] || [],
      incidentCommander: data.incident_commander as string,
      assignedTeam: data.assigned_team as string[] || [],
      escalationLevel: data.escalation_level as number,
      ptaReported: data.pta_reported as boolean,
      ptaReportDate: data.pta_report_date ? new Date(data.pta_report_date as string) : undefined,
      ptaReference: data.pta_reference as string,
      lawEnforcementNotified: data.law_enforcement_notified as boolean,
      customersNotified: data.customers_notified as boolean,
      rootCause: data.root_cause as string,
      lessonsLearned: data.lessons_learned as string,
      remediationActions: data.remediation_actions as RemediationAction[] || [],
      createdAt: new Date(data.created_at as string),
      createdBy: data.created_by as string,
      updatedAt: new Date(data.updated_at as string),
      recordHash: data.record_hash as string,
    };
  }

  private mapToTimelineEvent(data: Record<string, unknown>): IncidentTimelineEvent {
    return {
      id: data.id as string,
      incidentId: data.incident_id as string,
      eventTime: new Date(data.event_time as string),
      eventType: data.event_type as string,
      description: data.description as string,
      performedBy: data.performed_by as string,
      automated: data.automated as boolean,
      details: data.details as Record<string, unknown>,
      attachments: data.attachments as string[] || [],
      verified: data.verified as boolean,
      verifiedBy: data.verified_by as string,
      createdAt: new Date(data.created_at as string),
    };
  }

  private mapToPlaybook(data: Record<string, unknown>): ResponsePlaybook {
    return {
      id: data.id as string,
      name: data.name as string,
      description: data.description as string,
      category: data.category as IncidentCategory,
      severityLevels: data.severity_levels as IncidentSeverity[],
      steps: data.steps as ResponsePlaybook['steps'],
      automatedActions: data.automated_actions as Record<string, unknown>[],
      escalationMatrix: data.escalation_matrix as Record<string, unknown>,
      communicationTemplates: data.communication_templates as Record<string, string>,
      initialResponseMinutes: data.initial_response_minutes as number,
      containmentTargetMinutes: data.containment_target_minutes as number,
      resolutionTargetMinutes: data.resolution_target_minutes as number,
      requiredTools: data.required_tools as string[] || [],
      requiredSkills: data.required_skills as string[] || [],
      requiredApprovals: data.required_approvals as string[] || [],
      isActive: data.is_active as boolean,
      version: data.version as number,
      lastTestedAt: data.last_tested_at ? new Date(data.last_tested_at as string) : undefined,
      createdAt: new Date(data.created_at as string),
      createdBy: data.created_by as string,
      updatedAt: new Date(data.updated_at as string),
    };
  }

  private mapToTeamMember(data: Record<string, unknown>): IncidentResponseTeamMember {
    return {
      id: data.id as string,
      userId: data.user_id as string,
      role: data.role as string,
      skills: data.skills as string[] || [],
      certifications: data.certifications as string[] || [],
      isActive: data.is_active as boolean,
      isOnCall: data.is_on_call as boolean,
      contactPhone: data.contact_phone as string,
      contactEmail: data.contact_email as string,
      escalationLevel: data.escalation_level as number,
      canBeCommander: data.can_be_commander as boolean,
      incidentsHandled: data.incidents_handled as number,
      avgResponseTimeMinutes: data.avg_response_time_minutes as number,
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
    };
  }

  private mapToCommunication(data: Record<string, unknown>): IncidentCommunication {
    return {
      id: data.id as string,
      incidentId: data.incident_id as string,
      communicationType: data.communication_type as IncidentCommunication['communicationType'],
      direction: data.direction as IncidentCommunication['direction'],
      fromParty: data.from_party as string,
      toParties: data.to_parties as string[],
      subject: data.subject as string,
      summary: data.summary as string,
      fullContentHash: data.full_content_hash as string,
      sentAt: new Date(data.sent_at as string),
      acknowledgedAt: data.acknowledged_at ? new Date(data.acknowledged_at as string) : undefined,
      hasAttachments: data.has_attachments as boolean,
      attachmentCount: data.attachment_count as number,
      isRegulatory: data.is_regulatory as boolean,
      regulatoryBody: data.regulatory_body as string,
      createdBy: data.created_by as string,
      createdAt: new Date(data.created_at as string),
    };
  }
}
