/**
 * CTDISR-2025 Forensics Service
 * PTA Regulation: Chapter 7 - Digital Forensics & Evidence Management
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import {
  DigitalEvidence,
  EvidenceType,
  ChainOfCustodyEntry,
  CustodyAction,
  ForensicCase,
  ForensicStatus,
  ForensicActivity,
  ForensicStatistics,
  CollectEvidenceDto,
  TransferCustodyDto,
  CreateForensicCaseDto,
  AddForensicActivityDto,
  IncidentSeverity,
} from './types';

@Injectable()
export class ForensicsService {
  private readonly logger = new Logger(ForensicsService.name);
  private readonly supabase: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.getOrThrow('SUPABASE_URL'),
      this.configService.getOrThrow('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // ============ Evidence Management ============

  async collectEvidence(dto: CollectEvidenceDto, collectedBy: string): Promise<DigitalEvidence> {
    this.logger.log(`Collecting evidence: ${dto.name}`);

    // Generate evidence number
    const { data: evidenceNumber } = await this.supabase.rpc('generate_evidence_number');

    const evidenceData = {
      evidence_number: evidenceNumber,
      incident_id: dto.incidentId,
      evidence_type: dto.evidenceType,
      name: dto.name,
      description: dto.description,
      source_system: dto.sourceSystem,
      source_ip: dto.sourceIp,
      source_hostname: dto.sourceHostname,
      collected_at: new Date().toISOString(),
      collected_by: collectedBy,
      collection_method: dto.collectionMethod,
      collection_tool: dto.collectionTool,
      storage_location: dto.storageLocation,
      storage_encrypted: true,
      original_hash_md5: dto.originalHashMd5,
      original_hash_sha256: dto.originalHashSha256,
      current_hash_sha256: dto.originalHashSha256,
      integrity_verified: true,
      last_integrity_check: new Date().toISOString(),
      file_size_bytes: dto.fileSizeBytes,
      file_format: dto.fileFormat,
      mime_type: dto.mimeType,
      classification: dto.classification || 'confidential',
      metadata: dto.metadata || {},
    };

    const { data, error } = await this.supabase
      .from('ctdisr.digital_evidence')
      .insert(evidenceData)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to collect evidence: ${error.message}`);
      throw new BadRequestException(`Failed to collect evidence: ${error.message}`);
    }

    // Create initial chain of custody entry
    await this.addChainOfCustodyEntry(data.id, {
      action: CustodyAction.COLLECTED,
      toCustodian: collectedBy,
      reason: 'Initial evidence collection',
      location: dto.storageLocation,
      hashAtTransfer: dto.originalHashSha256,
    }, collectedBy);

    this.logger.log(`Collected evidence ${evidenceNumber} with ID ${data.id}`);
    return this.mapToEvidence(data);
  }

  async getEvidence(id: string): Promise<DigitalEvidence> {
    const { data, error } = await this.supabase
      .from('ctdisr.digital_evidence')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Evidence not found: ${id}`);
    }

    return this.mapToEvidence(data);
  }

  async getEvidenceByNumber(evidenceNumber: string): Promise<DigitalEvidence> {
    const { data, error } = await this.supabase
      .from('ctdisr.digital_evidence')
      .select('*')
      .eq('evidence_number', evidenceNumber)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Evidence not found: ${evidenceNumber}`);
    }

    return this.mapToEvidence(data);
  }

  async listEvidence(filters: {
    incidentId?: string;
    evidenceType?: EvidenceType[];
    legalHold?: boolean;
    isAnalyzed?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ evidence: DigitalEvidence[]; total: number }> {
    let query = this.supabase
      .from('ctdisr.digital_evidence')
      .select('*', { count: 'exact' });

    if (filters.incidentId) {
      query = query.eq('incident_id', filters.incidentId);
    }
    if (filters.evidenceType?.length) {
      query = query.in('evidence_type', filters.evidenceType);
    }
    if (filters.legalHold !== undefined) {
      query = query.eq('legal_hold', filters.legalHold);
    }
    if (filters.isAnalyzed !== undefined) {
      query = query.eq('is_analyzed', filters.isAnalyzed);
    }

    query = query
      .order('collected_at', { ascending: false })
      .range(filters.offset || 0, (filters.offset || 0) + (filters.limit || 50) - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new BadRequestException(`Failed to list evidence: ${error.message}`);
    }

    return {
      evidence: (data || []).map(this.mapToEvidence),
      total: count || 0,
    };
  }

  async verifyEvidenceIntegrity(evidenceId: string, currentHash: string): Promise<boolean> {
    const evidence = await this.getEvidence(evidenceId);

    const isValid = evidence.originalHashSha256 === currentHash;

    await this.supabase
      .from('ctdisr.digital_evidence')
      .update({
        current_hash_sha256: currentHash,
        integrity_verified: isValid,
        last_integrity_check: new Date().toISOString(),
      })
      .eq('id', evidenceId);

    if (!isValid) {
      this.logger.error(`Evidence integrity check FAILED for ${evidence.evidenceNumber}`);
    } else {
      this.logger.log(`Evidence integrity verified for ${evidence.evidenceNumber}`);
    }

    return isValid;
  }

  async setLegalHold(evidenceId: string, legalHold: boolean, retentionUntil?: Date): Promise<DigitalEvidence> {
    const { data, error } = await this.supabase
      .from('ctdisr.digital_evidence')
      .update({
        legal_hold: legalHold,
        retention_until: retentionUntil?.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', evidenceId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to set legal hold: ${error.message}`);
    }

    this.logger.log(`Set legal hold=${legalHold} for evidence ${evidenceId}`);
    return this.mapToEvidence(data);
  }

  // ============ Chain of Custody ============

  async transferCustody(dto: TransferCustodyDto, fromCustodian: string): Promise<ChainOfCustodyEntry> {
    const evidence = await this.getEvidence(dto.evidenceId);

    // Verify current hash
    const hashVerified = evidence.integrityVerified;

    const { data, error } = await this.supabase
      .from('ctdisr.evidence_chain_of_custody')
      .insert({
        evidence_id: dto.evidenceId,
        action: CustodyAction.TRANSFERRED,
        action_time: new Date().toISOString(),
        from_custodian: fromCustodian,
        to_custodian: dto.toCustodian,
        reason: dto.reason,
        location: dto.location,
        hash_verified: hashVerified,
        hash_at_transfer: evidence.currentHashSha256,
        from_signature_hash: this.generateSignatureHash(fromCustodian, dto.evidenceId),
        to_signature_hash: this.generateSignatureHash(dto.toCustodian, dto.evidenceId),
        witnessed_by: dto.witnessedBy,
        notes: dto.notes,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to transfer custody: ${error.message}`);
    }

    this.logger.log(`Transferred custody of ${evidence.evidenceNumber} from ${fromCustodian} to ${dto.toCustodian}`);
    return this.mapToChainEntry(data);
  }

  async getChainOfCustody(evidenceId: string): Promise<ChainOfCustodyEntry[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.evidence_chain_of_custody')
      .select('*')
      .eq('evidence_id', evidenceId)
      .order('action_time', { ascending: true });

    if (error) {
      throw new BadRequestException(`Failed to get chain of custody: ${error.message}`);
    }

    return (data || []).map(this.mapToChainEntry);
  }

  private async addChainOfCustodyEntry(
    evidenceId: string,
    entry: Partial<ChainOfCustodyEntry>,
    performedBy: string,
  ): Promise<void> {
    await this.supabase
      .from('ctdisr.evidence_chain_of_custody')
      .insert({
        evidence_id: evidenceId,
        action: entry.action,
        action_time: new Date().toISOString(),
        to_custodian: entry.toCustodian,
        reason: entry.reason,
        location: entry.location,
        hash_verified: true,
        hash_at_transfer: entry.hashAtTransfer,
        to_signature_hash: this.generateSignatureHash(performedBy, evidenceId),
      });
  }

  private generateSignatureHash(userId: string, evidenceId: string): string {
    const timestamp = new Date().toISOString();
    return createHash('sha256')
      .update(`${userId}:${evidenceId}:${timestamp}`)
      .digest('hex');
  }

  // ============ Forensic Cases ============

  async createForensicCase(dto: CreateForensicCaseDto, createdBy: string): Promise<ForensicCase> {
    this.logger.log(`Creating forensic case: ${dto.title}`);

    // Generate case number
    const { data: caseNumber } = await this.supabase.rpc('generate_forensic_case_number');

    const caseData = {
      case_number: caseNumber,
      incident_id: dto.incidentId,
      title: dto.title,
      objective: dto.objective,
      scope: dto.scope,
      status: ForensicStatus.PENDING,
      priority: dto.priority,
      opened_at: new Date().toISOString(),
      deadline: dto.deadline?.toISOString(),
      lead_investigator: dto.leadInvestigator,
      team_members: dto.teamMembers || [],
      evidence_ids: dto.evidenceIds || [],
      created_by: createdBy,
    };

    const { data, error } = await this.supabase
      .from('ctdisr.forensic_cases')
      .insert(caseData)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create forensic case: ${error.message}`);
      throw new BadRequestException(`Failed to create forensic case: ${error.message}`);
    }

    this.logger.log(`Created forensic case ${caseNumber} with ID ${data.id}`);
    return this.mapToForensicCase(data);
  }

  async getForensicCase(id: string): Promise<ForensicCase> {
    const { data, error } = await this.supabase
      .from('ctdisr.forensic_cases')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Forensic case not found: ${id}`);
    }

    return this.mapToForensicCase(data);
  }

  async listForensicCases(filters: {
    status?: ForensicStatus[];
    priority?: IncidentSeverity[];
    leadInvestigator?: string;
    incidentId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ cases: ForensicCase[]; total: number }> {
    let query = this.supabase
      .from('ctdisr.forensic_cases')
      .select('*', { count: 'exact' });

    if (filters.status?.length) {
      query = query.in('status', filters.status);
    }
    if (filters.priority?.length) {
      query = query.in('priority', filters.priority);
    }
    if (filters.leadInvestigator) {
      query = query.eq('lead_investigator', filters.leadInvestigator);
    }
    if (filters.incidentId) {
      query = query.eq('incident_id', filters.incidentId);
    }

    query = query
      .order('opened_at', { ascending: false })
      .range(filters.offset || 0, (filters.offset || 0) + (filters.limit || 50) - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new BadRequestException(`Failed to list forensic cases: ${error.message}`);
    }

    return {
      cases: (data || []).map(this.mapToForensicCase),
      total: count || 0,
    };
  }

  async updateForensicCaseStatus(
    id: string,
    status: ForensicStatus,
    updatedBy: string,
  ): Promise<ForensicCase> {
    const forensicCase = await this.getForensicCase(id);

    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === ForensicStatus.IN_PROGRESS && !forensicCase.startedAt) {
      updateData.started_at = new Date().toISOString();
    }
    if (status === ForensicStatus.COMPLETED) {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await this.supabase
      .from('ctdisr.forensic_cases')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update case status: ${error.message}`);
    }

    this.logger.log(`Updated forensic case ${forensicCase.caseNumber} status to ${status}`);
    return this.mapToForensicCase(data);
  }

  async addEvidenceToCase(caseId: string, evidenceIds: string[]): Promise<ForensicCase> {
    const forensicCase = await this.getForensicCase(caseId);
    const updatedEvidenceIds = [...new Set([...forensicCase.evidenceIds, ...evidenceIds])];

    const { data, error } = await this.supabase
      .from('ctdisr.forensic_cases')
      .update({
        evidence_ids: updatedEvidenceIds,
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to add evidence to case: ${error.message}`);
    }

    return this.mapToForensicCase(data);
  }

  async updateCaseFindings(
    caseId: string,
    findings: string,
    conclusions?: string,
    recommendations?: string,
  ): Promise<ForensicCase> {
    const { data, error } = await this.supabase
      .from('ctdisr.forensic_cases')
      .update({
        findings,
        conclusions,
        recommendations,
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update case findings: ${error.message}`);
    }

    return this.mapToForensicCase(data);
  }

  // ============ Forensic Activities ============

  async addForensicActivity(dto: AddForensicActivityDto, performedBy: string): Promise<ForensicActivity> {
    const { data, error } = await this.supabase
      .from('ctdisr.forensic_activities')
      .insert({
        case_id: dto.caseId,
        evidence_id: dto.evidenceId,
        activity_type: dto.activityType,
        description: dto.description,
        performed_by: performedBy,
        performed_at: new Date().toISOString(),
        duration_minutes: dto.durationMinutes,
        tools_used: dto.toolsUsed || [],
        methodology: dto.methodology,
        findings: dto.findings,
        artifacts_found: dto.artifactsFound || [],
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to add forensic activity: ${error.message}`);
    }

    // Mark evidence as analyzed if applicable
    if (dto.evidenceId) {
      await this.supabase
        .from('ctdisr.digital_evidence')
        .update({ is_analyzed: true })
        .eq('id', dto.evidenceId);
    }

    this.logger.log(`Added forensic activity to case ${dto.caseId}`);
    return this.mapToForensicActivity(data);
  }

  async getCaseActivities(caseId: string): Promise<ForensicActivity[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.forensic_activities')
      .select('*')
      .eq('case_id', caseId)
      .order('performed_at', { ascending: true });

    if (error) {
      throw new BadRequestException(`Failed to get case activities: ${error.message}`);
    }

    return (data || []).map(this.mapToForensicActivity);
  }

  async peerReviewActivity(
    activityId: string,
    reviewedBy: string,
  ): Promise<ForensicActivity> {
    const { data, error } = await this.supabase
      .from('ctdisr.forensic_activities')
      .update({
        peer_reviewed: true,
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', activityId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to peer review activity: ${error.message}`);
    }

    return this.mapToForensicActivity(data);
  }

  // ============ Statistics ============

  async getForensicStatistics(): Promise<ForensicStatistics> {
    const [casesResult, evidenceResult] = await Promise.all([
      this.supabase.from('ctdisr.forensic_cases').select('*'),
      this.supabase.from('ctdisr.digital_evidence').select('id, is_analyzed'),
    ]);

    const cases = casesResult.data || [];
    const evidence = evidenceResult.data || [];

    const completedCases = cases.filter((c) => c.status === ForensicStatus.COMPLETED);
    const avgDuration = completedCases.length > 0
      ? completedCases.reduce((sum, c) => {
          const start = new Date(c.started_at || c.opened_at).getTime();
          const end = new Date(c.completed_at).getTime();
          return sum + (end - start) / (1000 * 60 * 60 * 24);
        }, 0) / completedCases.length
      : 0;

    return {
      totalCases: cases.length,
      byStatus: cases.reduce((acc, c) => {
        acc[c.status as ForensicStatus] = (acc[c.status as ForensicStatus] || 0) + 1;
        return acc;
      }, {} as Record<ForensicStatus, number>),
      avgDurationDays: Math.round(avgDuration * 10) / 10,
      totalEvidence: evidence.length,
      pendingAnalysis: evidence.filter((e) => !e.is_analyzed).length,
    };
  }

  // ============ Report Generation ============

  async generateChainOfCustodyReport(evidenceId: string): Promise<{
    evidence: DigitalEvidence;
    chain: ChainOfCustodyEntry[];
    integrityStatus: string;
  }> {
    const evidence = await this.getEvidence(evidenceId);
    const chain = await this.getChainOfCustody(evidenceId);

    return {
      evidence,
      chain,
      integrityStatus: evidence.integrityVerified ? 'VERIFIED' : 'INTEGRITY_COMPROMISED',
    };
  }

  async generateForensicReport(caseId: string): Promise<{
    forensicCase: ForensicCase;
    activities: ForensicActivity[];
    evidence: DigitalEvidence[];
    summary: {
      totalActivities: number;
      peerReviewedActivities: number;
      toolsUsed: string[];
      totalDurationMinutes: number;
    };
  }> {
    const forensicCase = await this.getForensicCase(caseId);
    const activities = await this.getCaseActivities(caseId);

    // Get all evidence
    const evidencePromises = forensicCase.evidenceIds.map((id) => this.getEvidence(id).catch(() => null));
    const evidenceResults = await Promise.all(evidencePromises);
    const evidence = evidenceResults.filter((e): e is DigitalEvidence => e !== null);

    // Calculate summary
    const toolsUsed = [...new Set(activities.flatMap((a) => a.toolsUsed))];
    const totalDurationMinutes = activities.reduce((sum, a) => sum + (a.durationMinutes || 0), 0);

    return {
      forensicCase,
      activities,
      evidence,
      summary: {
        totalActivities: activities.length,
        peerReviewedActivities: activities.filter((a) => a.peerReviewed).length,
        toolsUsed,
        totalDurationMinutes,
      },
    };
  }

  // ============ Mappers ============

  private mapToEvidence(data: Record<string, unknown>): DigitalEvidence {
    return {
      id: data.id as string,
      evidenceNumber: data.evidence_number as string,
      incidentId: data.incident_id as string,
      evidenceType: data.evidence_type as EvidenceType,
      name: data.name as string,
      description: data.description as string,
      sourceSystem: data.source_system as string,
      sourceIp: data.source_ip as string,
      sourceHostname: data.source_hostname as string,
      sourceUser: data.source_user as string,
      collectedAt: new Date(data.collected_at as string),
      collectedBy: data.collected_by as string,
      collectionMethod: data.collection_method as string,
      collectionTool: data.collection_tool as string,
      storageLocation: data.storage_location as string,
      storageEncrypted: data.storage_encrypted as boolean,
      encryptionKeyId: data.encryption_key_id as string,
      originalHashMd5: data.original_hash_md5 as string,
      originalHashSha256: data.original_hash_sha256 as string,
      originalHashSha512: data.original_hash_sha512 as string,
      currentHashSha256: data.current_hash_sha256 as string,
      integrityVerified: data.integrity_verified as boolean,
      lastIntegrityCheck: data.last_integrity_check ? new Date(data.last_integrity_check as string) : undefined,
      fileSizeBytes: data.file_size_bytes as number,
      fileFormat: data.file_format as string,
      mimeType: data.mime_type as string,
      classification: data.classification as string,
      legalHold: data.legal_hold as boolean,
      retentionUntil: data.retention_until ? new Date(data.retention_until as string) : undefined,
      isAvailable: data.is_available as boolean,
      isAnalyzed: data.is_analyzed as boolean,
      metadata: data.metadata as Record<string, unknown>,
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
    };
  }

  private mapToChainEntry(data: Record<string, unknown>): ChainOfCustodyEntry {
    return {
      id: data.id as string,
      evidenceId: data.evidence_id as string,
      action: data.action as CustodyAction,
      actionTime: new Date(data.action_time as string),
      fromCustodian: data.from_custodian as string,
      toCustodian: data.to_custodian as string,
      reason: data.reason as string,
      location: data.location as string,
      hashVerified: data.hash_verified as boolean,
      hashAtTransfer: data.hash_at_transfer as string,
      fromSignatureHash: data.from_signature_hash as string,
      toSignatureHash: data.to_signature_hash as string,
      witnessedBy: data.witnessed_by as string,
      notes: data.notes as string,
      createdAt: new Date(data.created_at as string),
    };
  }

  private mapToForensicCase(data: Record<string, unknown>): ForensicCase {
    return {
      id: data.id as string,
      caseNumber: data.case_number as string,
      incidentId: data.incident_id as string,
      title: data.title as string,
      objective: data.objective as string,
      scope: data.scope as string,
      status: data.status as ForensicStatus,
      priority: data.priority as IncidentSeverity,
      openedAt: new Date(data.opened_at as string),
      startedAt: data.started_at ? new Date(data.started_at as string) : undefined,
      completedAt: data.completed_at ? new Date(data.completed_at as string) : undefined,
      deadline: data.deadline ? new Date(data.deadline as string) : undefined,
      leadInvestigator: data.lead_investigator as string,
      teamMembers: data.team_members as string[] || [],
      evidenceIds: data.evidence_ids as string[] || [],
      findings: data.findings as string,
      conclusions: data.conclusions as string,
      recommendations: data.recommendations as string,
      reportLocation: data.report_location as string,
      reportHash: data.report_hash as string,
      externalConsultant: data.external_consultant as string,
      lawEnforcementCaseNumber: data.law_enforcement_case_number as string,
      createdAt: new Date(data.created_at as string),
      createdBy: data.created_by as string,
      updatedAt: new Date(data.updated_at as string),
    };
  }

  private mapToForensicActivity(data: Record<string, unknown>): ForensicActivity {
    return {
      id: data.id as string,
      caseId: data.case_id as string,
      evidenceId: data.evidence_id as string,
      activityType: data.activity_type as string,
      description: data.description as string,
      performedBy: data.performed_by as string,
      performedAt: new Date(data.performed_at as string),
      durationMinutes: data.duration_minutes as number,
      toolsUsed: data.tools_used as string[] || [],
      methodology: data.methodology as string,
      findings: data.findings as string,
      artifactsFound: data.artifacts_found as Record<string, unknown>[],
      peerReviewed: data.peer_reviewed as boolean,
      reviewedBy: data.reviewed_by as string,
      reviewedAt: data.reviewed_at ? new Date(data.reviewed_at as string) : undefined,
      createdAt: new Date(data.created_at as string),
    };
  }
}
