/**
 * WANCOM ISP - CTDISR-2025 Core Service
 * Handles policy evaluation, violation tracking, and compliance monitoring
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash, randomUUID } from 'crypto';
import {
  PolicyConfig,
  Violation,
  ViolationSeverity,
  ViolationStatus,
  PolicyEnforcementMode,
  PolicyCheckRequest,
  PolicyEvaluationResult,
  CtdisrContext,
  HashChainVerificationResult,
  ComplianceReport,
  ComplianceReportSection,
} from './types';

@Injectable()
export class CtdisrService implements OnModuleInit {
  private readonly logger = new Logger(CtdisrService.name);
  private policiesCache: Map<string, PolicyConfig> = new Map();
  private lastPolicyCacheRefresh: Date | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing CTDISR-2025 Compliance Service');
    await this.refreshPoliciesCache();
  }

  // ============================================
  // POLICY MANAGEMENT
  // ============================================

  /**
   * Refresh the in-memory policy cache from database
   */
  async refreshPoliciesCache(): Promise<void> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/policy_config?is_enabled=eq.true`, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch policies: ${response.statusText}`);
      }

      const policies = await response.json();
      this.policiesCache.clear();

      for (const policy of policies) {
        this.policiesCache.set(policy.policy_code, this.mapPolicyFromDb(policy));
      }

      this.lastPolicyCacheRefresh = new Date();
      this.logger.log(`Loaded ${policies.length} CTDISR policies into cache`);
    } catch (error) {
      this.logger.error('Failed to refresh policies cache', error);
    }
  }

  /**
   * Get a specific policy by code
   */
  async getPolicy(policyCode: string): Promise<PolicyConfig | null> {
    if (this.shouldRefreshCache()) {
      await this.refreshPoliciesCache();
    }
    return this.policiesCache.get(policyCode) || null;
  }

  /**
   * Get all active policies
   */
  async getAllPolicies(): Promise<PolicyConfig[]> {
    if (this.shouldRefreshCache()) {
      await this.refreshPoliciesCache();
    }
    return Array.from(this.policiesCache.values());
  }

  /**
   * Evaluate a request against applicable policies
   */
  async evaluatePolicy(request: PolicyCheckRequest): Promise<PolicyEvaluationResult[]> {
    const results: PolicyEvaluationResult[] = [];
    const policies = await this.getAllPolicies();

    for (const policy of policies) {
      const applicable = await this.isPolicyApplicable(policy, request);
      if (!applicable) continue;

      const result = await this.checkPolicyCompliance(policy, request);
      results.push(result);

      // If blocked in ENFORCE mode, stop processing further policies
      if (!result.allowed && policy.enforcementMode === PolicyEnforcementMode.ENFORCE) {
        break;
      }
    }

    return results;
  }

  // ============================================
  // VIOLATION MANAGEMENT
  // ============================================

  /**
   * Create a new violation record
   */
  async createViolation(params: {
    policyId?: string;
    severity: ViolationSeverity;
    context: CtdisrContext;
    resourceType?: string;
    resourceId?: string;
    actionAttempted?: string;
    description: string;
    evidence?: Record<string, unknown>;
    shouldBlock?: boolean;
    blockReason?: string;
  }): Promise<Violation> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    // Get the latest hash for chain continuity
    const previousHash = await this.getLatestViolationHash();

    const violationData = {
      violation_code: this.generateViolationCode(),
      policy_id: params.policyId,
      severity: params.severity,
      status: ViolationStatus.OPEN,
      actor_user_id: params.context.userId,
      actor_ip_address: params.context.ipAddress,
      actor_user_agent: params.context.userAgent,
      actor_session_id: params.context.sessionId,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      action_attempted: params.actionAttempted,
      violation_description: params.description,
      evidence_json: params.evidence || {},
      was_blocked: params.shouldBlock || false,
      block_reason: params.blockReason,
      detected_at: new Date().toISOString(),
      previous_hash: previousHash,
      record_hash: '', // Will be calculated
    };

    // Calculate record hash
    violationData.record_hash = this.calculateRecordHash(violationData, previousHash);

    const response = await fetch(`${supabaseUrl}/rest/v1/violations`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(violationData),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Failed to create violation: ${error}`);
      throw new Error('Failed to create violation record');
    }

    const [created] = await response.json();
    const violation = this.mapViolationFromDb(created);

    // Handle escalation based on severity
    await this.handleViolationEscalation(violation, params.severity);

    this.logger.warn(`Violation created: ${violation.violationCode} - ${params.severity}`, {
      violationId: violation.id,
      policyId: params.policyId,
      actor: params.context.userId,
      ip: params.context.ipAddress,
    });

    return violation;
  }

  /**
   * Update violation status
   */
  async updateViolationStatus(
    violationId: string,
    status: ViolationStatus,
    updatedBy: string,
    notes?: string,
  ): Promise<Violation> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === ViolationStatus.ACKNOWLEDGED) {
      updateData.acknowledged_at = new Date().toISOString();
      updateData.acknowledged_by = updatedBy;
    } else if (
      status === ViolationStatus.CLOSED ||
      status === ViolationStatus.REMEDIATION_VERIFIED
    ) {
      updateData.resolved_at = new Date().toISOString();
      updateData.resolved_by = updatedBy;
    }

    if (notes) {
      updateData.remediation_plan = notes;
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/violations?id=eq.${violationId}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      throw new Error('Failed to update violation');
    }

    const [updated] = await response.json();
    return this.mapViolationFromDb(updated);
  }

  /**
   * Get violations by status
   */
  async getViolationsByStatus(status: ViolationStatus): Promise<Violation[]> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(
      `${supabaseUrl}/rest/v1/violations?status=eq.${status}&order=detected_at.desc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch violations');
    }

    const violations = await response.json();
    return violations.map((v: Record<string, unknown>) => this.mapViolationFromDb(v));
  }

  /**
   * Get critical open violations
   */
  async getCriticalOpenViolations(): Promise<Violation[]> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(
      `${supabaseUrl}/rest/v1/violations?severity=in.(CRITICAL,HIGH)&status=in.(OPEN,ACKNOWLEDGED,INVESTIGATING)&order=detected_at.desc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch critical violations');
    }

    const violations = await response.json();
    return violations.map((v: Record<string, unknown>) => this.mapViolationFromDb(v));
  }

  // ============================================
  // HASH CHAIN INTEGRITY
  // ============================================

  /**
   * Verify hash chain integrity for violations table
   */
  async verifyViolationsHashChain(): Promise<HashChainVerificationResult> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(
      `${supabaseUrl}/rest/v1/violations?order=detected_at.asc&select=id,previous_hash,record_hash,violation_code,detected_at`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch violations for verification');
    }

    const violations = await response.json();
    let validRecords = 0;
    let invalidRecords = 0;
    let brokenChainAt: string | undefined;

    for (let i = 0; i < violations.length; i++) {
      const current = violations[i];
      const previous = i > 0 ? violations[i - 1] : null;

      // Verify the previous hash matches
      if (previous && current.previous_hash !== previous.record_hash) {
        invalidRecords++;
        if (!brokenChainAt) {
          brokenChainAt = current.id;
        }
      } else {
        validRecords++;
      }
    }

    const result: HashChainVerificationResult = {
      tableName: 'ctdisr.violations',
      totalRecords: violations.length,
      validRecords,
      invalidRecords,
      brokenChainAt,
      isValid: invalidRecords === 0,
      verifiedAt: new Date(),
    };

    if (!result.isValid) {
      this.logger.error('Hash chain integrity violation detected!', result);
      await this.createViolation({
        severity: ViolationSeverity.CRITICAL,
        context: {
          ipAddress: '127.0.0.1',
          correlationId: randomUUID(),
          roles: ['SYSTEM'],
        },
        resourceType: 'hash_chain',
        resourceId: 'ctdisr.violations',
        description: 'Hash chain integrity verification failed - possible tampering detected',
        evidence: result,
      });
    }

    return result;
  }

  /**
   * Scheduled hash chain verification
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledHashChainVerification(): Promise<void> {
    this.logger.log('Running scheduled hash chain verification');
    await this.verifyViolationsHashChain();
  }

  // ============================================
  // COMPLIANCE REPORTING
  // ============================================

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    fromDate: Date,
    toDate: Date,
    generatedBy: string,
  ): Promise<ComplianceReport> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    // Get all policies grouped by section
    const policies = await this.getAllPolicies();
    const sections: Map<string, ComplianceReportSection> = new Map();

    // Get violations in the period
    const violationsResponse = await fetch(
      `${supabaseUrl}/rest/v1/violations?detected_at=gte.${fromDate.toISOString()}&detected_at=lte.${toDate.toISOString()}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const violations = await violationsResponse.json();

    // Build sections
    for (const policy of policies) {
      const sectionCode = policy.ctdisrSection.split('.')[0];
      if (!sections.has(sectionCode)) {
        sections.set(sectionCode, {
          sectionCode,
          sectionName: this.getSectionName(sectionCode),
          totalPolicies: 0,
          enabledPolicies: 0,
          violations: { total: 0, open: 0, remediated: 0, escalatedPta: 0 },
          complianceScore: 100,
        });
      }

      const section = sections.get(sectionCode)!;
      section.totalPolicies++;
      if (policy.isEnabled) section.enabledPolicies++;
    }

    // Count violations per section
    for (const v of violations) {
      const policy = policies.find((p) => p.id === v.policy_id);
      if (!policy) continue;

      const sectionCode = policy.ctdisrSection.split('.')[0];
      const section = sections.get(sectionCode);
      if (!section) continue;

      section.violations.total++;
      if (v.status === ViolationStatus.OPEN) section.violations.open++;
      if (v.status === ViolationStatus.REMEDIATION_VERIFIED) section.violations.remediated++;
      if (v.escalated_to_pta) section.violations.escalatedPta++;
    }

    // Calculate compliance scores
    for (const section of sections.values()) {
      // Score based on violations (fewer is better) and remediation rate
      const violationPenalty = Math.min(section.violations.total * 5, 50);
      const remediationBonus =
        section.violations.total > 0
          ? (section.violations.remediated / section.violations.total) * 20
          : 20;
      section.complianceScore = Math.max(0, 100 - violationPenalty + remediationBonus);
    }

    // Get critical findings
    const criticalViolations = violations
      .filter((v: Record<string, unknown>) => v.severity === ViolationSeverity.CRITICAL)
      .map((v: Record<string, unknown>) => this.mapViolationFromDb(v));

    // Build remediation status
    const remediationStatus = {
      pending: violations.filter((v: { status: string }) => v.status === ViolationStatus.OPEN)
        .length,
      inProgress: violations.filter(
        (v: { status: string }) => v.status === ViolationStatus.REMEDIATION_IN_PROGRESS,
      ).length,
      completed: violations.filter(
        (v: { status: string }) => v.status === ViolationStatus.REMEDIATION_VERIFIED,
      ).length,
      overdue: violations.filter(
        (v: { remediation_deadline: string; status: string }) =>
          v.remediation_deadline &&
          new Date(v.remediation_deadline) < new Date() &&
          !['CLOSED', 'REMEDIATION_VERIFIED'].includes(v.status),
      ).length,
    };

    const sectionsArray = Array.from(sections.values());
    const overallScore =
      sectionsArray.length > 0
        ? sectionsArray.reduce((sum, s) => sum + s.complianceScore, 0) / sectionsArray.length
        : 100;

    return {
      reportId: randomUUID(),
      reportDate: new Date(),
      reportPeriod: { from: fromDate, to: toDate },
      overallScore,
      sections: sectionsArray,
      criticalFindings: criticalViolations,
      remediationStatus,
      generatedBy,
      generatedAt: new Date(),
    };
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private shouldRefreshCache(): boolean {
    if (!this.lastPolicyCacheRefresh) return true;
    return Date.now() - this.lastPolicyCacheRefresh.getTime() > this.CACHE_TTL_MS;
  }

  private async isPolicyApplicable(
    policy: PolicyConfig,
    request: PolicyCheckRequest,
  ): Promise<boolean> {
    // Check if policy applies to this action/resource type
    const config = policy.configJson as {
      actions?: string[];
      resourceTypes?: string[];
      roles?: string[];
    };

    if (config.actions && !config.actions.includes(request.action)) {
      return false;
    }

    if (config.resourceTypes && !config.resourceTypes.includes(request.resourceType)) {
      return false;
    }

    if (config.roles && !request.context.roles.some((r) => config.roles!.includes(r))) {
      return false;
    }

    return true;
  }

  private async checkPolicyCompliance(
    policy: PolicyConfig,
    request: PolicyCheckRequest,
  ): Promise<PolicyEvaluationResult> {
    // This is a simplified check - actual implementation would have
    // specific logic for each policy type
    const result: PolicyEvaluationResult = {
      policyCode: policy.policyCode,
      allowed: true,
      enforcementMode: policy.enforcementMode,
      violationCreated: false,
    };

    // Example checks based on policy configuration
    const config = policy.configJson as {
      requireMfa?: boolean;
      allowedIps?: string[];
      maxDataExport?: number;
      requireApproval?: boolean;
    };

    // MFA requirement check
    if (config.requireMfa && !request.context.mfaVerified) {
      result.allowed = false;
      result.blockReason = 'MFA verification required';
    }

    // IP allowlist check
    if (config.allowedIps && !config.allowedIps.includes(request.context.ipAddress)) {
      result.allowed = false;
      result.blockReason = 'IP address not in allowlist';
    }

    // If not allowed, create violation
    if (!result.allowed) {
      const violation = await this.createViolation({
        policyId: policy.id,
        severity: policy.violationSeverity,
        context: request.context,
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        actionAttempted: request.action,
        description: result.blockReason || 'Policy violation',
        evidence: {
          request: request.additionalData,
          policyConfig: policy.configJson,
        },
        shouldBlock: policy.enforcementMode === PolicyEnforcementMode.ENFORCE,
        blockReason: result.blockReason,
      });

      result.violationCreated = true;
      result.violationId = violation.id;
    }

    return result;
  }

  private async handleViolationEscalation(
    violation: Violation,
    severity: ViolationSeverity,
  ): Promise<void> {
    // Critical violations require immediate escalation
    if (severity === ViolationSeverity.CRITICAL) {
      // TODO: Send notification to CTO
      // TODO: If policy requires, notify PTA
      this.logger.error(`CRITICAL VIOLATION: ${violation.violationCode}`, {
        id: violation.id,
        description: violation.violationDescription,
      });
    } else if (severity === ViolationSeverity.HIGH) {
      // High violations notify CTO within 1 hour (handled by scheduler)
      this.logger.warn(`HIGH VIOLATION: ${violation.violationCode}`);
    }
  }

  private generateViolationCode(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seq = Math.floor(Math.random() * 999999 + 1)
      .toString()
      .padStart(6, '0');
    return `CTDISR-${date}-${seq}`;
  }

  private calculateRecordHash(data: Record<string, unknown>, previousHash?: string): string {
    const input = (previousHash || '') + JSON.stringify(data);
    return createHash('sha256').update(input).digest('hex');
  }

  private async getLatestViolationHash(): Promise<string | undefined> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(
      `${supabaseUrl}/rest/v1/violations?order=detected_at.desc&limit=1&select=record_hash`,
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
  }

  private getSectionName(sectionCode: string): string {
    const names: Record<string, string> = {
      '4': 'Asset Management',
      '5': 'Access Control',
      '6': 'Cryptography',
      '7': 'Operations Security',
      '8': 'Incident Response',
      '9': 'Business Continuity',
      '10': 'Supplier Security',
    };
    return names[sectionCode] || `Section ${sectionCode}`;
  }

  private mapPolicyFromDb(row: Record<string, unknown>): PolicyConfig {
    return {
      id: row.id as string,
      policyCode: row.policy_code as string,
      policyName: row.policy_name as string,
      policyDescription: row.policy_description as string,
      ctdisrSection: row.ctdisr_section as string,
      isEnabled: row.is_enabled as boolean,
      enforcementMode: row.enforcement_mode as PolicyEnforcementMode,
      configJson: (row.config_json as Record<string, unknown>) || {},
      violationSeverity: row.violation_severity as ViolationSeverity,
      autoBlock: row.auto_block as boolean,
      notifyComplianceOfficer: row.notify_compliance_officer as boolean,
      notifyCto: row.notify_cto as boolean,
      notifyPta: row.notify_pta as boolean,
      version: row.version as number,
      effectiveFrom: new Date(row.effective_from as string),
      effectiveUntil: row.effective_until ? new Date(row.effective_until as string) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      createdBy: row.created_by as string,
      updatedBy: row.updated_by as string,
    };
  }

  private mapViolationFromDb(row: Record<string, unknown>): Violation {
    return {
      id: row.id as string,
      violationCode: row.violation_code as string,
      policyId: row.policy_id as string,
      severity: row.severity as ViolationSeverity,
      status: row.status as ViolationStatus,
      actorUserId: row.actor_user_id as string,
      actorIpAddress: row.actor_ip_address as string,
      actorUserAgent: row.actor_user_agent as string,
      actorSessionId: row.actor_session_id as string,
      resourceType: row.resource_type as string,
      resourceId: row.resource_id as string,
      actionAttempted: row.action_attempted as string,
      violationDescription: row.violation_description as string,
      evidenceJson: (row.evidence_json as Record<string, unknown>) || {},
      wasBlocked: row.was_blocked as boolean,
      blockReason: row.block_reason as string,
      detectedAt: new Date(row.detected_at as string),
      acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at as string) : undefined,
      acknowledgedBy: row.acknowledged_by as string,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : undefined,
      resolvedBy: row.resolved_by as string,
      remediationPlan: row.remediation_plan as string,
      remediationDeadline: row.remediation_deadline
        ? new Date(row.remediation_deadline as string)
        : undefined,
      remediationCompletedAt: row.remediation_completed_at
        ? new Date(row.remediation_completed_at as string)
        : undefined,
      remediationVerifiedBy: row.remediation_verified_by as string,
      escalatedToCto: row.escalated_to_cto as boolean,
      escalatedToCtoAt: row.escalated_to_cto_at
        ? new Date(row.escalated_to_cto_at as string)
        : undefined,
      escalatedToPta: row.escalated_to_pta as boolean,
      escalatedToPtaAt: row.escalated_to_pta_at
        ? new Date(row.escalated_to_pta_at as string)
        : undefined,
      ptaReferenceNumber: row.pta_reference_number as string,
      previousHash: row.previous_hash as string,
      recordHash: row.record_hash as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
