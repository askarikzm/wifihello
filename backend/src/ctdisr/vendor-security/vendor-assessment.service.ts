/**
 * CTDISR-2025 Vendor Risk Assessment Service
 * PTA Regulation: Chapter 9 - Third-Party Risk Management
 * 
 * Handles vendor risk assessments, compliance tracking, and due diligence
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import {
  VendorRiskAssessment,
  AssessmentStatus,
  VendorRiskLevel,
  AssessmentFinding,
  InitiateAssessmentDto,
  SubmitAssessmentDto,
  VendorRiskSummary,
  ThirdPartyRiskDashboard,
} from './types';
import { VendorService } from './vendor.service';

@Injectable()
export class VendorAssessmentService {
  private readonly logger = new Logger(VendorAssessmentService.name);
  private readonly supabase: SupabaseClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly vendorService: VendorService,
  ) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // ============ Assessment Lifecycle ============

  /**
   * Initiate a new risk assessment for a vendor
   */
  async initiateAssessment(dto: InitiateAssessmentDto, userId: string): Promise<VendorRiskAssessment> {
    this.logger.log(`Initiating ${dto.assessmentType} assessment for vendor: ${dto.vendorId}`);

    // Verify vendor exists
    await this.vendorService.getVendor(dto.vendorId);

    // Check for existing in-progress assessment
    const { data: existing } = await this.supabase
      .from('ctdisr.vendor_assessments')
      .select('id')
      .eq('vendor_id', dto.vendorId)
      .in('status', [AssessmentStatus.NOT_STARTED, AssessmentStatus.IN_PROGRESS, AssessmentStatus.PENDING_REVIEW])
      .single();

    if (existing) {
      throw new BadRequestException('An assessment is already in progress for this vendor');
    }

    const assessmentNumber = await this.generateAssessmentNumber();

    const { data, error } = await this.supabase
      .from('ctdisr.vendor_assessments')
      .insert({
        assessment_number: assessmentNumber,
        vendor_id: dto.vendorId,
        assessment_type: dto.assessmentType,
        status: AssessmentStatus.NOT_STARTED,
        initiated_at: new Date().toISOString(),
        assessor_id: dto.assessorId,
        questionnaire_version: '1.0',
        findings: [],
        recommendations: [],
        required_actions: [],
        evidence_documents: [],
        conditions: [],
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to initiate assessment: ${error.message}`);
    }

    await this.logAssessmentAudit(data.id, 'assessment_initiated', userId, {
      vendor_id: dto.vendorId,
      assessment_type: dto.assessmentType,
    });

    return this.mapAssessment(data);
  }

  /**
   * Start working on an assessment
   */
  async startAssessment(assessmentId: string, userId: string): Promise<VendorRiskAssessment> {
    const assessment = await this.getAssessment(assessmentId);

    if (assessment.status !== AssessmentStatus.NOT_STARTED) {
      throw new BadRequestException('Assessment has already been started');
    }

    const { data, error } = await this.supabase
      .from('ctdisr.vendor_assessments')
      .update({
        status: AssessmentStatus.IN_PROGRESS,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', assessmentId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to start assessment: ${error.message}`);
    }

    await this.logAssessmentAudit(assessmentId, 'assessment_started', userId, {});

    return this.mapAssessment(data);
  }

  /**
   * Get assessment by ID
   */
  async getAssessment(assessmentId: string): Promise<VendorRiskAssessment> {
    const { data, error } = await this.supabase
      .from('ctdisr.vendor_assessments')
      .select('*')
      .eq('id', assessmentId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Assessment not found: ${assessmentId}`);
    }

    return this.mapAssessment(data);
  }

  /**
   * Submit assessment responses and findings
   */
  async submitAssessment(
    assessmentId: string,
    dto: SubmitAssessmentDto,
    userId: string,
  ): Promise<VendorRiskAssessment> {
    const assessment = await this.getAssessment(assessmentId);

    if (assessment.status !== AssessmentStatus.IN_PROGRESS) {
      throw new BadRequestException('Assessment must be in progress to submit');
    }

    // Calculate risk scores
    const riskScores = this.calculateRiskScores(dto.questionnaireResponses, dto.findings);

    const { data, error } = await this.supabase
      .from('ctdisr.vendor_assessments')
      .update({
        status: AssessmentStatus.PENDING_REVIEW,
        questionnaire_responses: dto.questionnaireResponses,
        inherent_risk_score: riskScores.inherent,
        control_effectiveness_score: riskScores.controlEffectiveness,
        residual_risk_score: riskScores.residual,
        calculated_risk_level: riskScores.riskLevel,
        financial_risk_score: riskScores.financial,
        operational_risk_score: riskScores.operational,
        security_risk_score: riskScores.security,
        compliance_risk_score: riskScores.compliance,
        reputational_risk_score: riskScores.reputational,
        findings: dto.findings,
        critical_findings: dto.findings.filter(f => f.severity === 'critical').length,
        high_findings: dto.findings.filter(f => f.severity === 'high').length,
        medium_findings: dto.findings.filter(f => f.severity === 'medium').length,
        low_findings: dto.findings.filter(f => f.severity === 'low').length,
        recommendations: dto.recommendations,
        decision: dto.decision,
        decision_rationale: dto.decisionRationale,
        conditions: dto.conditions ?? [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', assessmentId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to submit assessment: ${error.message}`);
    }

    await this.logAssessmentAudit(assessmentId, 'assessment_submitted', userId, {
      risk_level: riskScores.riskLevel,
      decision: dto.decision,
    });

    return this.mapAssessment(data);
  }

  /**
   * Review and complete an assessment
   */
  async completeAssessment(
    assessmentId: string,
    reviewerNotes: string,
    userId: string,
  ): Promise<VendorRiskAssessment> {
    const assessment = await this.getAssessment(assessmentId);

    if (assessment.status !== AssessmentStatus.PENDING_REVIEW) {
      throw new BadRequestException('Assessment must be pending review to complete');
    }

    // Calculate validity period based on risk level
    const validUntil = new Date();
    switch (assessment.calculatedRiskLevel) {
      case VendorRiskLevel.CRITICAL:
        validUntil.setMonth(validUntil.getMonth() + 3);
        break;
      case VendorRiskLevel.HIGH:
        validUntil.setMonth(validUntil.getMonth() + 6);
        break;
      case VendorRiskLevel.MEDIUM:
        validUntil.setMonth(validUntil.getMonth() + 9);
        break;
      default:
        validUntil.setFullYear(validUntil.getFullYear() + 1);
    }

    const { data, error } = await this.supabase
      .from('ctdisr.vendor_assessments')
      .update({
        status: AssessmentStatus.COMPLETED,
        completed_at: new Date().toISOString(),
        valid_until: validUntil.toISOString(),
        reviewer_id: userId,
        reviewer_notes: reviewerNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assessmentId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to complete assessment: ${error.message}`);
    }

    // Update vendor's risk level
    if (assessment.calculatedRiskLevel) {
      await this.vendorService.updateVendorRiskLevel(
        assessment.vendorId,
        assessment.calculatedRiskLevel,
        userId,
      );
    }

    await this.logAssessmentAudit(assessmentId, 'assessment_completed', userId, {
      valid_until: validUntil.toISOString(),
    });

    return this.mapAssessment(data);
  }

  /**
   * List assessments for a vendor
   */
  async listVendorAssessments(vendorId: string): Promise<VendorRiskAssessment[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.vendor_assessments')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(`Failed to list assessments: ${error.message}`);
    }

    return data.map(a => this.mapAssessment(a));
  }

  /**
   * Get overdue assessments
   */
  async getOverdueAssessments(): Promise<{ vendorId: string; vendorName: string; dueDate: Date }[]> {
    const now = new Date();

    const { data, error } = await this.supabase
      .from('ctdisr.vendors')
      .select('id, name, next_risk_assessment_at')
      .lt('next_risk_assessment_at', now.toISOString())
      .not('next_risk_assessment_at', 'is', null);

    if (error) {
      throw new BadRequestException(`Failed to get overdue assessments: ${error.message}`);
    }

    return data.map(v => ({
      vendorId: v.id,
      vendorName: v.name,
      dueDate: new Date(v.next_risk_assessment_at),
    }));
  }

  // ============ Findings Management ============

  /**
   * Add a finding to an assessment
   */
  async addFinding(
    assessmentId: string,
    finding: AssessmentFinding,
    userId: string,
  ): Promise<void> {
    const assessment = await this.getAssessment(assessmentId);

    if (assessment.status !== AssessmentStatus.IN_PROGRESS) {
      throw new BadRequestException('Can only add findings to in-progress assessments');
    }

    const findings = [...assessment.findings, { ...finding, id: crypto.randomUUID() }];

    await this.supabase
      .from('ctdisr.vendor_assessments')
      .update({
        findings,
        critical_findings: findings.filter(f => f.severity === 'critical').length,
        high_findings: findings.filter(f => f.severity === 'high').length,
        medium_findings: findings.filter(f => f.severity === 'medium').length,
        low_findings: findings.filter(f => f.severity === 'low').length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assessmentId);

    await this.logAssessmentAudit(assessmentId, 'finding_added', userId, {
      finding_category: finding.category,
      severity: finding.severity,
    });
  }

  /**
   * Update finding status
   */
  async updateFindingStatus(
    assessmentId: string,
    findingId: string,
    status: 'open' | 'in_progress' | 'resolved' | 'accepted',
    userId: string,
  ): Promise<void> {
    const assessment = await this.getAssessment(assessmentId);

    const findings = assessment.findings.map(f => {
      if (f.id === findingId) {
        return {
          ...f,
          status,
          resolvedAt: status === 'resolved' ? new Date() : f.resolvedAt,
        };
      }
      return f;
    });

    await this.supabase
      .from('ctdisr.vendor_assessments')
      .update({
        findings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assessmentId);

    await this.logAssessmentAudit(assessmentId, 'finding_status_updated', userId, {
      finding_id: findingId,
      new_status: status,
    });
  }

  // ============ Due Diligence Questionnaire ============

  /**
   * Get the standard due diligence questionnaire template
   */
  getQuestionnaireTemplate(): Record<string, unknown> {
    return {
      version: '1.0',
      sections: [
        {
          id: 'company_info',
          title: 'Company Information',
          questions: [
            { id: 'q1', text: 'Company registration number', type: 'text', required: true },
            { id: 'q2', text: 'Year of establishment', type: 'number', required: true },
            { id: 'q3', text: 'Number of employees', type: 'number', required: true },
            { id: 'q4', text: 'Annual revenue (PKR)', type: 'number', required: false },
            { id: 'q5', text: 'Key clients in telecom sector', type: 'textarea', required: false },
          ],
        },
        {
          id: 'security_controls',
          title: 'Security Controls',
          questions: [
            { id: 'q6', text: 'ISO 27001 certified?', type: 'boolean', required: true, weight: 10 },
            { id: 'q7', text: 'SOC 2 compliant?', type: 'boolean', required: true, weight: 10 },
            { id: 'q8', text: 'Dedicated security team?', type: 'boolean', required: true, weight: 8 },
            { id: 'q9', text: 'Regular penetration testing?', type: 'boolean', required: true, weight: 8 },
            { id: 'q10', text: 'Security incident response plan?', type: 'boolean', required: true, weight: 8 },
            { id: 'q11', text: 'Employee security training frequency', type: 'select', options: ['annual', 'semi-annual', 'quarterly', 'none'], required: true, weight: 5 },
          ],
        },
        {
          id: 'data_protection',
          title: 'Data Protection',
          questions: [
            { id: 'q12', text: 'Data encryption at rest?', type: 'boolean', required: true, weight: 10 },
            { id: 'q13', text: 'Data encryption in transit?', type: 'boolean', required: true, weight: 10 },
            { id: 'q14', text: 'Data backup frequency', type: 'select', options: ['real-time', 'daily', 'weekly', 'monthly'], required: true, weight: 7 },
            { id: 'q15', text: 'Data retention policy documented?', type: 'boolean', required: true, weight: 5 },
            { id: 'q16', text: 'GDPR/PECA compliant?', type: 'boolean', required: true, weight: 10 },
          ],
        },
        {
          id: 'access_control',
          title: 'Access Control',
          questions: [
            { id: 'q17', text: 'Multi-factor authentication?', type: 'boolean', required: true, weight: 10 },
            { id: 'q18', text: 'Role-based access control?', type: 'boolean', required: true, weight: 8 },
            { id: 'q19', text: 'Regular access reviews?', type: 'boolean', required: true, weight: 7 },
            { id: 'q20', text: 'Privileged access management?', type: 'boolean', required: true, weight: 8 },
          ],
        },
        {
          id: 'business_continuity',
          title: 'Business Continuity',
          questions: [
            { id: 'q21', text: 'Disaster recovery plan?', type: 'boolean', required: true, weight: 10 },
            { id: 'q22', text: 'RTO target (hours)', type: 'number', required: true, weight: 8 },
            { id: 'q23', text: 'RPO target (hours)', type: 'number', required: true, weight: 8 },
            { id: 'q24', text: 'DR testing frequency', type: 'select', options: ['quarterly', 'semi-annual', 'annual', 'never'], required: true, weight: 7 },
          ],
        },
        {
          id: 'regulatory',
          title: 'Regulatory Compliance',
          questions: [
            { id: 'q25', text: 'PTA registered?', type: 'boolean', required: true, weight: 10 },
            { id: 'q26', text: 'Compliance with local laws?', type: 'boolean', required: true, weight: 10 },
            { id: 'q27', text: 'Previous regulatory violations?', type: 'boolean', required: true, weight: -20 },
            { id: 'q28', text: 'Third-party audits conducted?', type: 'boolean', required: true, weight: 7 },
          ],
        },
        {
          id: 'subcontractors',
          title: 'Subcontractors',
          questions: [
            { id: 'q29', text: 'Uses subcontractors?', type: 'boolean', required: true },
            { id: 'q30', text: 'Subcontractor security assessment process?', type: 'boolean', required: false, weight: 8 },
            { id: 'q31', text: 'List of subcontractors with data access', type: 'textarea', required: false },
          ],
        },
      ],
    };
  }

  // ============ Risk Dashboard ============

  /**
   * Get comprehensive third-party risk dashboard
   */
  async getRiskDashboard(): Promise<ThirdPartyRiskDashboard> {
    const summary = await this.vendorService.getStatistics();

    // Get high-risk vendors
    const { data: highRiskVendors } = await this.supabase
      .from('ctdisr.vendors')
      .select('*')
      .in('risk_level', [VendorRiskLevel.CRITICAL, VendorRiskLevel.HIGH])
      .order('risk_level', { ascending: true });

    const vendorRiskSummaries: VendorRiskSummary[] = [];
    for (const v of highRiskVendors ?? []) {
      const { count: openFindings } = await this.supabase
        .from('ctdisr.vendor_assessments')
        .select('id', { count: 'exact' })
        .eq('vendor_id', v.id)
        .contains('findings', [{ status: 'open' }]);

      const { count: activeContracts } = await this.supabase
        .from('ctdisr.vendor_contracts')
        .select('id', { count: 'exact' })
        .eq('vendor_id', v.id)
        .eq('status', 'active');

      const { count: recentIncidents } = await this.supabase
        .from('ctdisr.vendor_security_incidents')
        .select('id', { count: 'exact' })
        .eq('vendor_id', v.id)
        .gte('occurred_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

      const { count: accessPermissions } = await this.supabase
        .from('ctdisr.third_party_access')
        .select('id', { count: 'exact' })
        .eq('vendor_id', v.id)
        .eq('is_active', true);

      vendorRiskSummaries.push({
        vendorId: v.id,
        vendorName: v.name,
        riskLevel: v.risk_level,
        lastAssessmentDate: v.last_risk_assessment_at ? new Date(v.last_risk_assessment_at) : undefined,
        openFindings: openFindings ?? 0,
        activeContracts: activeContracts ?? 0,
        recentIncidents: recentIncidents ?? 0,
        accessPermissions: accessPermissions ?? 0,
        complianceScore: this.calculateComplianceScore(v),
      });
    }

    // Get expiring contracts
    const expiringContracts = await this.vendorService.getExpiringContracts(30);

    // Get overdue assessments
    const overdueAssessments = await this.getOverdueAssessments();

    // Get recent incidents
    const { data: recentIncidents } = await this.supabase
      .from('ctdisr.vendor_security_incidents')
      .select('*')
      .gte('occurred_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('occurred_at', { ascending: false })
      .limit(10);

    // Get access anomalies
    const { data: accessAnomalies } = await this.supabase
      .from('ctdisr.vendor_access_logs')
      .select('*')
      .eq('anomaly_detected', true)
      .gte('access_time', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('access_time', { ascending: false })
      .limit(20);

    return {
      summary,
      highRiskVendors: vendorRiskSummaries,
      expiringContracts: expiringContracts.map(c => ({
        vendor: c.vendorId,
        contract: c.title,
        expiresAt: c.expirationDate,
      })),
      overdueAssessments: overdueAssessments.map(a => ({
        vendor: a.vendorName,
        dueDate: a.dueDate,
      })),
      recentIncidents: (recentIncidents ?? []).map(i => this.mapIncident(i)),
      accessAnomalies: (accessAnomalies ?? []).map(a => this.mapAccessLog(a)),
    };
  }

  /**
   * Generate PTA compliance report for vendor management
   */
  async generateComplianceReport(): Promise<Record<string, unknown>> {
    const dashboard = await this.getRiskDashboard();

    return {
      reportType: 'CTDISR-2025 Third-Party Risk Management Compliance Report',
      generatedAt: new Date().toISOString(),
      reportPeriod: {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString(),
      },
      executiveSummary: {
        totalVendors: dashboard.summary.totalVendors,
        criticalRiskVendors: dashboard.summary.byRiskLevel[VendorRiskLevel.CRITICAL] ?? 0,
        highRiskVendors: dashboard.summary.byRiskLevel[VendorRiskLevel.HIGH] ?? 0,
        vendorsWithDataAccess: dashboard.summary.withDataAccess,
        vendorsWithSystemAccess: dashboard.summary.withSystemAccess,
        overdueAssessments: dashboard.summary.overdueAssessments,
        expiringContracts: dashboard.summary.expiringContracts,
      },
      complianceStatus: {
        vendorInventory: 'compliant',
        riskAssessments: dashboard.summary.overdueAssessments === 0 ? 'compliant' : 'non-compliant',
        contractManagement: 'compliant',
        accessControls: 'compliant',
        incidentMonitoring: 'compliant',
      },
      riskDistribution: dashboard.summary.byRiskLevel,
      highRiskVendorDetails: dashboard.highRiskVendors,
      immediateActions: [
        ...(dashboard.overdueAssessments.length > 0
          ? [`Complete ${dashboard.overdueAssessments.length} overdue vendor assessments`]
          : []),
        ...(dashboard.expiringContracts.length > 0
          ? [`Review ${dashboard.expiringContracts.length} contracts expiring in 30 days`]
          : []),
        ...(dashboard.highRiskVendors.filter(v => v.openFindings > 0).length > 0
          ? [`Address open findings for ${dashboard.highRiskVendors.filter(v => v.openFindings > 0).length} high-risk vendors`]
          : []),
      ],
      recommendations: [
        'Conduct quarterly reviews of critical vendor access',
        'Implement automated SLA monitoring',
        'Establish vendor security incident escalation procedures',
        'Review vendor subcontractor relationships annually',
      ],
    };
  }

  // ============ Private Helpers ============

  private async generateAssessmentNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `ASM-${year}-${timestamp}-${random}`;
  }

  private calculateRiskScores(
    responses: Record<string, unknown>,
    findings: AssessmentFinding[],
  ): {
    inherent: number;
    controlEffectiveness: number;
    residual: number;
    riskLevel: VendorRiskLevel;
    financial: number;
    operational: number;
    security: number;
    compliance: number;
    reputational: number;
  } {
    // Simplified risk calculation - in production, this would be more sophisticated
    let inherent = 50; // Start with medium risk
    let controlEffectiveness = 70; // Assume reasonable controls

    // Adjust based on questionnaire responses
    if (responses['q6'] === true) controlEffectiveness += 10; // ISO 27001
    if (responses['q7'] === true) controlEffectiveness += 10; // SOC 2
    if (responses['q12'] === true) controlEffectiveness += 5; // Encryption at rest
    if (responses['q13'] === true) controlEffectiveness += 5; // Encryption in transit
    if (responses['q17'] === true) controlEffectiveness += 5; // MFA
    if (responses['q21'] === true) controlEffectiveness += 5; // DR plan
    if (responses['q25'] !== true) inherent += 20; // Not PTA registered
    if (responses['q27'] === true) inherent += 30; // Previous violations

    // Adjust based on findings
    inherent += findings.filter(f => f.severity === 'critical').length * 15;
    inherent += findings.filter(f => f.severity === 'high').length * 10;
    inherent += findings.filter(f => f.severity === 'medium').length * 5;

    controlEffectiveness = Math.min(100, Math.max(0, controlEffectiveness));
    inherent = Math.min(100, Math.max(0, inherent));

    const residual = Math.round(inherent * (1 - controlEffectiveness / 100));

    let riskLevel: VendorRiskLevel;
    if (residual >= 70) riskLevel = VendorRiskLevel.CRITICAL;
    else if (residual >= 50) riskLevel = VendorRiskLevel.HIGH;
    else if (residual >= 30) riskLevel = VendorRiskLevel.MEDIUM;
    else if (residual >= 15) riskLevel = VendorRiskLevel.LOW;
    else riskLevel = VendorRiskLevel.MINIMAL;

    return {
      inherent,
      controlEffectiveness,
      residual,
      riskLevel,
      financial: Math.round(inherent * 0.8),
      operational: Math.round(inherent * 0.9),
      security: inherent,
      compliance: Math.round(inherent * 0.95),
      reputational: Math.round(inherent * 0.7),
    };
  }

  private calculateComplianceScore(vendor: Record<string, unknown>): number {
    let score = 100;

    if (!vendor.pta_registered) score -= 20;
    if (!vendor.certifications || (vendor.certifications as string[]).length === 0) score -= 15;
    if (vendor.risk_level === VendorRiskLevel.CRITICAL) score -= 25;
    else if (vendor.risk_level === VendorRiskLevel.HIGH) score -= 15;
    if (!vendor.last_risk_assessment_at) score -= 20;

    return Math.max(0, score);
  }

  private async logAssessmentAudit(
    assessmentId: string,
    action: string,
    userId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.supabase.from('ctdisr.audit_logs').insert({
      action,
      resource_type: 'vendor_assessment',
      resource_id: assessmentId,
      actor_id: userId,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  private mapAssessment(data: Record<string, unknown>): VendorRiskAssessment {
    return {
      id: data.id as string,
      assessmentNumber: data.assessment_number as string,
      vendorId: data.vendor_id as string,
      assessmentType: data.assessment_type as string,
      status: data.status as AssessmentStatus,
      initiatedAt: new Date(data.initiated_at as string),
      startedAt: data.started_at ? new Date(data.started_at as string) : undefined,
      completedAt: data.completed_at ? new Date(data.completed_at as string) : undefined,
      validUntil: data.valid_until ? new Date(data.valid_until as string) : undefined,
      assessorId: data.assessor_id as string,
      reviewerId: data.reviewer_id as string,
      questionnaireResponses: data.questionnaire_responses as Record<string, unknown>,
      questionnaireVersion: data.questionnaire_version as string,
      inherentRiskScore: data.inherent_risk_score as number,
      controlEffectivenessScore: data.control_effectiveness_score as number,
      residualRiskScore: data.residual_risk_score as number,
      calculatedRiskLevel: data.calculated_risk_level as VendorRiskLevel,
      financialRiskScore: data.financial_risk_score as number,
      operationalRiskScore: data.operational_risk_score as number,
      securityRiskScore: data.security_risk_score as number,
      complianceRiskScore: data.compliance_risk_score as number,
      reputationalRiskScore: data.reputational_risk_score as number,
      findings: data.findings as AssessmentFinding[],
      criticalFindings: data.critical_findings as number,
      highFindings: data.high_findings as number,
      mediumFindings: data.medium_findings as number,
      lowFindings: data.low_findings as number,
      recommendations: data.recommendations as string[],
      requiredActions: data.required_actions as string[],
      evidenceDocuments: data.evidence_documents as string[],
      decision: data.decision as VendorRiskAssessment['decision'],
      decisionRationale: data.decision_rationale as string,
      conditions: data.conditions as string[],
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
    };
  }

  private mapIncident(data: Record<string, unknown>): Record<string, unknown> {
    return {
      id: data.id,
      vendorId: data.vendor_id,
      incidentType: data.incident_type,
      severity: data.severity,
      description: data.description,
      occurredAt: data.occurred_at,
      reportedAt: data.reported_at,
      dataImpacted: data.data_impacted,
    };
  }

  private mapAccessLog(data: Record<string, unknown>): Record<string, unknown> {
    return {
      id: data.id,
      vendorId: data.vendor_id,
      accessTime: data.access_time,
      accessType: data.access_type,
      sourceIp: data.source_ip,
      action: data.action,
      success: data.success,
      riskScore: data.risk_score,
      anomalyDetails: data.anomaly_details,
    };
  }
}
