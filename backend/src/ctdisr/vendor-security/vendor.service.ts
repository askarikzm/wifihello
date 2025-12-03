/**
 * CTDISR-2025 Vendor Management Service
 * PTA Regulation: Chapter 9 - Third-Party Risk Management
 * 
 * Manages vendor lifecycle, contracts, and access permissions
 */

import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import {
  Vendor,
  VendorStatus,
  VendorRiskLevel,
  VendorAccessType,
  DataSensitivity,
  VendorContract,
  ContractStatus,
  VendorAccessPermission,
  VendorAccessLog,
  VendorSecurityIncident,
  VendorCertification,
  VendorPerformance,
  VendorStatistics,
  CreateVendorDto,
  UpdateVendorStatusDto,
  CreateContractDto,
  GrantAccessDto,
  RevokeAccessDto,
  LogAccessDto,
  ReportIncidentDto,
  RecordPerformanceDto,
} from './types';

@Injectable()
export class VendorService {
  private readonly logger = new Logger(VendorService.name);
  private readonly supabase: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // ============ Vendor Lifecycle ============

  /**
   * Register a new vendor
   */
  async createVendor(dto: CreateVendorDto, userId: string): Promise<Vendor> {
    this.logger.log(`Creating vendor: ${dto.name}`);

    const vendorCode = await this.generateVendorCode(dto.vendorType);

    const { data, error } = await this.supabase
      .from('ctdisr.vendors')
      .insert({
        vendor_code: vendorCode,
        name: dto.name,
        legal_name: dto.legalName,
        registration_number: dto.registrationNumber,
        status: VendorStatus.PROSPECT,
        vendor_type: dto.vendorType,
        country: dto.country,
        city: dto.city,
        address: dto.address,
        is_local_vendor: dto.isLocalVendor ?? dto.country === 'PK',
        primary_contact_name: dto.primaryContactName,
        primary_contact_email: dto.primaryContactEmail,
        primary_contact_phone: dto.primaryContactPhone,
        services_provided: dto.servicesProvided,
        service_criticality: dto.serviceCriticality,
        has_data_access: dto.hasDataAccess ?? false,
        data_types_accessed: dto.dataTypesAccessed ?? [],
        has_system_access: dto.hasSystemAccess ?? false,
        systems_accessed: dto.systemsAccessed ?? [],
        access_type: dto.accessType ?? VendorAccessType.NONE,
        certifications: dto.certifications ?? [],
        pta_registered: dto.ptaRegistered ?? false,
        risk_assessment_frequency_days: dto.riskAssessmentFrequencyDays ?? 365,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create vendor: ${error.message}`);
      throw new BadRequestException(`Failed to create vendor: ${error.message}`);
    }

    await this.logVendorAudit(data.id, 'vendor_created', userId, { vendor_code: vendorCode });

    return this.mapVendor(data);
  }

  /**
   * Get vendor by ID
   */
  async getVendor(vendorId: string): Promise<Vendor> {
    const { data, error } = await this.supabase
      .from('ctdisr.vendors')
      .select('*')
      .eq('id', vendorId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Vendor not found: ${vendorId}`);
    }

    return this.mapVendor(data);
  }

  /**
   * List vendors with filtering
   */
  async listVendors(filters: {
    status?: VendorStatus;
    riskLevel?: VendorRiskLevel;
    vendorType?: string;
    hasDataAccess?: boolean;
    hasSystemAccess?: boolean;
    country?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ vendors: Vendor[]; total: number }> {
    let query = this.supabase
      .from('ctdisr.vendors')
      .select('*', { count: 'exact' });

    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.riskLevel) {
      query = query.eq('risk_level', filters.riskLevel);
    }
    if (filters.vendorType) {
      query = query.eq('vendor_type', filters.vendorType);
    }
    if (filters.hasDataAccess !== undefined) {
      query = query.eq('has_data_access', filters.hasDataAccess);
    }
    if (filters.hasSystemAccess !== undefined) {
      query = query.eq('has_system_access', filters.hasSystemAccess);
    }
    if (filters.country) {
      query = query.eq('country', filters.country);
    }
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,legal_name.ilike.%${filters.search}%`);
    }

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      this.logger.error(`Failed to list vendors: ${error.message}`);
      throw new BadRequestException(`Failed to list vendors: ${error.message}`);
    }

    return {
      vendors: data.map(v => this.mapVendor(v)),
      total: count ?? 0,
    };
  }

  /**
   * Update vendor status
   */
  async updateVendorStatus(
    vendorId: string,
    dto: UpdateVendorStatusDto,
    userId: string,
  ): Promise<Vendor> {
    const vendor = await this.getVendor(vendorId);

    // Validate status transitions
    this.validateStatusTransition(vendor.status, dto.status);

    const updateData: Record<string, unknown> = {
      status: dto.status,
      updated_at: new Date().toISOString(),
    };

    if (dto.status === VendorStatus.APPROVED) {
      updateData.approved_by = userId;
      updateData.approved_at = new Date().toISOString();
    }

    const { data, error } = await this.supabase
      .from('ctdisr.vendors')
      .update(updateData)
      .eq('id', vendorId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update vendor status: ${error.message}`);
    }

    await this.logVendorAudit(vendorId, 'status_changed', userId, {
      old_status: vendor.status,
      new_status: dto.status,
      reason: dto.reason,
    });

    return this.mapVendor(data);
  }

  /**
   * Update vendor risk level after assessment
   */
  async updateVendorRiskLevel(
    vendorId: string,
    riskLevel: VendorRiskLevel,
    userId: string,
  ): Promise<void> {
    const nextAssessmentDate = new Date();
    nextAssessmentDate.setMonth(nextAssessmentDate.getMonth() + 
      (riskLevel === VendorRiskLevel.CRITICAL ? 3 : 
       riskLevel === VendorRiskLevel.HIGH ? 6 : 12));

    const { error } = await this.supabase
      .from('ctdisr.vendors')
      .update({
        risk_level: riskLevel,
        last_risk_assessment_at: new Date().toISOString(),
        next_risk_assessment_at: nextAssessmentDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId);

    if (error) {
      throw new BadRequestException(`Failed to update risk level: ${error.message}`);
    }

    await this.logVendorAudit(vendorId, 'risk_level_updated', userId, { risk_level: riskLevel });
  }

  // ============ Contract Management ============

  /**
   * Create a vendor contract
   */
  async createContract(dto: CreateContractDto, userId: string): Promise<VendorContract> {
    this.logger.log(`Creating contract for vendor: ${dto.vendorId}`);

    const contractNumber = await this.generateContractNumber();

    // Validate vendor exists and is approved
    const vendor = await this.getVendor(dto.vendorId);
    if (vendor.status !== VendorStatus.APPROVED && vendor.status !== VendorStatus.ACTIVE) {
      throw new BadRequestException('Vendor must be approved before creating contracts');
    }

    const { data, error } = await this.supabase
      .from('ctdisr.vendor_contracts')
      .insert({
        contract_number: contractNumber,
        vendor_id: dto.vendorId,
        title: dto.title,
        description: dto.description,
        status: ContractStatus.DRAFT,
        contract_type: dto.contractType,
        effective_date: dto.effectiveDate,
        expiration_date: dto.expirationDate,
        auto_renewal: dto.autoRenewal ?? false,
        renewal_notice_days: dto.renewalNoticeDays ?? 30,
        total_value: dto.totalValue,
        currency: dto.currency ?? 'PKR',
        payment_terms: dto.paymentTerms,
        sla_terms: dto.slaTerms ?? [],
        uptime_requirement: dto.uptimeRequirement ?? 99.5,
        response_time_sla_hours: dto.responseTimeSlaHours ?? 4,
        resolution_time_sla_hours: dto.resolutionTimeSlaHours ?? 24,
        security_requirements: dto.securityRequirements ?? {},
        data_protection_clause: true,
        audit_rights: true,
        breach_notification_hours: dto.breachNotificationHours ?? 24,
        liability_cap: dto.liabilityCap,
        regulatory_compliance_required: dto.regulatoryComplianceRequired ?? ['CTDISR-2025'],
        ctdisr_compliance_required: true,
        termination_notice_days: dto.terminationNoticeDays ?? 30,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create contract: ${error.message}`);
    }

    await this.logVendorAudit(dto.vendorId, 'contract_created', userId, {
      contract_id: data.id,
      contract_number: contractNumber,
    });

    return this.mapContract(data);
  }

  /**
   * Get contract by ID
   */
  async getContract(contractId: string): Promise<VendorContract> {
    const { data, error } = await this.supabase
      .from('ctdisr.vendor_contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Contract not found: ${contractId}`);
    }

    return this.mapContract(data);
  }

  /**
   * List contracts for a vendor
   */
  async listVendorContracts(vendorId: string): Promise<VendorContract[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.vendor_contracts')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(`Failed to list contracts: ${error.message}`);
    }

    return data.map(c => this.mapContract(c));
  }

  /**
   * Activate a contract
   */
  async activateContract(contractId: string, userId: string): Promise<VendorContract> {
    const contract = await this.getContract(contractId);

    if (contract.status !== ContractStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Contract must be pending approval to activate');
    }

    const { data, error } = await this.supabase
      .from('ctdisr.vendor_contracts')
      .update({
        status: ContractStatus.ACTIVE,
        approved_by: userId,
        approved_at: new Date().toISOString(),
        legal_review_completed: true,
        security_review_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contractId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to activate contract: ${error.message}`);
    }

    // Also activate the vendor if not already
    await this.supabase
      .from('ctdisr.vendors')
      .update({ status: VendorStatus.ACTIVE, updated_at: new Date().toISOString() })
      .eq('id', contract.vendorId)
      .eq('status', VendorStatus.APPROVED);

    await this.logVendorAudit(contract.vendorId, 'contract_activated', userId, {
      contract_id: contractId,
    });

    return this.mapContract(data);
  }

  /**
   * Get contracts expiring soon
   */
  async getExpiringContracts(daysAhead: number = 30): Promise<VendorContract[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const { data, error } = await this.supabase
      .from('ctdisr.vendor_contracts')
      .select('*')
      .eq('status', ContractStatus.ACTIVE)
      .lte('expiration_date', futureDate.toISOString())
      .gte('expiration_date', new Date().toISOString())
      .order('expiration_date', { ascending: true });

    if (error) {
      throw new BadRequestException(`Failed to get expiring contracts: ${error.message}`);
    }

    return data.map(c => this.mapContract(c));
  }

  // ============ Access Management ============

  /**
   * Grant access permission to vendor
   */
  async grantAccess(dto: GrantAccessDto, userId: string): Promise<VendorAccessPermission> {
    this.logger.log(`Granting access to vendor: ${dto.vendorId}`);

    // Validate vendor is active
    const vendor = await this.getVendor(dto.vendorId);
    if (vendor.status !== VendorStatus.ACTIVE) {
      throw new ForbiddenException('Access can only be granted to active vendors');
    }

    // Check for high-sensitivity data access - requires additional approval
    if (dto.dataSensitivity === DataSensitivity.RESTRICTED || 
        dto.dataSensitivity === DataSensitivity.TOP_SECRET) {
      this.logger.warn(`High sensitivity access requested for vendor ${dto.vendorId}`);
    }

    const { data, error } = await this.supabase
      .from('ctdisr.third_party_access')
      .insert({
        vendor_id: dto.vendorId,
        contract_id: dto.contractId,
        permission_name: dto.permissionName,
        access_type: dto.accessType,
        resource_type: dto.resourceType,
        resource_identifier: dto.resourceIdentifier,
        data_sensitivity: dto.dataSensitivity,
        data_types: dto.dataTypes ?? [],
        ip_whitelist: dto.ipWhitelist ?? [],
        time_restrictions: dto.timeRestrictions,
        geo_restrictions: dto.geoRestrictions ?? ['PK'],
        granted_at: new Date().toISOString(),
        expires_at: dto.expiresAt,
        granted_by: userId,
        is_active: true,
        next_review_at: this.calculateNextReview(dto.dataSensitivity),
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to grant access: ${error.message}`);
    }

    await this.logVendorAudit(dto.vendorId, 'access_granted', userId, {
      permission_id: data.id,
      access_type: dto.accessType,
      resource: dto.resourceIdentifier,
    });

    return this.mapAccessPermission(data);
  }

  /**
   * Revoke access permission
   */
  async revokeAccess(dto: RevokeAccessDto, userId: string): Promise<void> {
    const { data: permission, error: fetchError } = await this.supabase
      .from('ctdisr.third_party_access')
      .select('*')
      .eq('id', dto.permissionId)
      .single();

    if (fetchError || !permission) {
      throw new NotFoundException(`Permission not found: ${dto.permissionId}`);
    }

    const { error } = await this.supabase
      .from('ctdisr.third_party_access')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
        revoked_by: userId,
        revocation_reason: dto.reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dto.permissionId);

    if (error) {
      throw new BadRequestException(`Failed to revoke access: ${error.message}`);
    }

    await this.logVendorAudit(permission.vendor_id, 'access_revoked', userId, {
      permission_id: dto.permissionId,
      reason: dto.reason,
    });
  }

  /**
   * List active access permissions for vendor
   */
  async listVendorAccess(vendorId: string): Promise<VendorAccessPermission[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.third_party_access')
      .select('*')
      .eq('vendor_id', vendorId)
      .eq('is_active', true)
      .order('granted_at', { ascending: false });

    if (error) {
      throw new BadRequestException(`Failed to list access: ${error.message}`);
    }

    return data.map(a => this.mapAccessPermission(a));
  }

  /**
   * Log vendor access activity
   */
  async logAccess(dto: LogAccessDto): Promise<void> {
    // Calculate risk score based on access patterns
    const riskScore = this.calculateAccessRiskScore(dto);
    const anomalyDetected = riskScore > 70;

    await this.supabase
      .from('ctdisr.vendor_access_logs')
      .insert({
        vendor_id: dto.vendorId,
        permission_id: dto.permissionId,
        access_time: new Date().toISOString(),
        access_type: dto.accessType,
        resource_accessed: dto.resourceAccessed,
        source_ip: dto.sourceIp,
        action: dto.action,
        success: dto.success,
        data_accessed: dto.dataAccessed ?? [],
        records_affected: dto.recordsAffected,
        risk_score: riskScore,
        anomaly_detected: anomalyDetected,
        anomaly_details: anomalyDetected ? 'High risk score detected' : null,
      });

    if (anomalyDetected) {
      this.logger.warn(`Anomaly detected in vendor access: ${dto.vendorId}`, { riskScore, dto });
    }
  }

  /**
   * Suspend all vendor access
   */
  async suspendVendorAccess(vendorId: string, reason: string, userId: string): Promise<void> {
    this.logger.warn(`Suspending all access for vendor: ${vendorId}`);

    const { data: permissions } = await this.supabase
      .from('ctdisr.third_party_access')
      .select('id')
      .eq('vendor_id', vendorId)
      .eq('is_active', true);

    if (permissions && permissions.length > 0) {
      await this.supabase
        .from('ctdisr.third_party_access')
        .update({
          is_active: false,
          revoked_at: new Date().toISOString(),
          revoked_by: userId,
          revocation_reason: `Vendor suspended: ${reason}`,
          updated_at: new Date().toISOString(),
        })
        .eq('vendor_id', vendorId)
        .eq('is_active', true);
    }

    await this.supabase
      .from('ctdisr.vendors')
      .update({
        status: VendorStatus.SUSPENDED,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId);

    await this.logVendorAudit(vendorId, 'vendor_suspended', userId, {
      reason,
      permissions_revoked: permissions?.length ?? 0,
    });
  }

  // ============ Incident Management ============

  /**
   * Report a vendor security incident
   */
  async reportIncident(dto: ReportIncidentDto, userId: string): Promise<VendorSecurityIncident> {
    this.logger.warn(`Vendor security incident reported: ${dto.vendorId}`, dto);

    const { data, error } = await this.supabase
      .from('ctdisr.vendor_security_incidents')
      .insert({
        vendor_id: dto.vendorId,
        incident_type: dto.incidentType,
        severity: dto.severity,
        description: dto.description,
        occurred_at: dto.occurredAt,
        reported_at: new Date().toISOString(),
        data_impacted: dto.dataImpacted ?? false,
        data_types_affected: dto.dataTypesAffected ?? [],
        systems_affected: dto.systemsAffected ?? [],
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to report incident: ${error.message}`);
    }

    // For critical/high severity, auto-suspend vendor access
    if (dto.severity === VendorRiskLevel.CRITICAL || dto.severity === VendorRiskLevel.HIGH) {
      if (dto.dataImpacted) {
        await this.suspendVendorAccess(dto.vendorId, `Security incident: ${dto.incidentType}`, userId);
      }
    }

    await this.logVendorAudit(dto.vendorId, 'incident_reported', userId, {
      incident_id: data.id,
      severity: dto.severity,
    });

    return this.mapIncident(data);
  }

  /**
   * List vendor incidents
   */
  async listVendorIncidents(vendorId: string): Promise<VendorSecurityIncident[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.vendor_security_incidents')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('occurred_at', { ascending: false });

    if (error) {
      throw new BadRequestException(`Failed to list incidents: ${error.message}`);
    }

    return data.map(i => this.mapIncident(i));
  }

  // ============ Performance Tracking ============

  /**
   * Record vendor performance metrics
   */
  async recordPerformance(dto: RecordPerformanceDto, userId: string): Promise<VendorPerformance> {
    const { data, error } = await this.supabase
      .from('ctdisr.vendor_performance')
      .insert({
        vendor_id: dto.vendorId,
        contract_id: dto.contractId,
        period_start: dto.periodStart,
        period_end: dto.periodEnd,
        uptime_percentage: dto.uptimePercentage,
        incidents_count: dto.incidentsCount ?? 0,
        critical_incidents: dto.criticalIncidents ?? 0,
        avg_response_time_hours: dto.avgResponseTimeHours,
        avg_resolution_time_hours: dto.avgResolutionTimeHours,
        sla_compliance_percentage: dto.slaCompliancePercentage,
        security_incidents: dto.securityIncidents ?? 0,
        quality_score: dto.qualityScore,
        notes: dto.notes,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to record performance: ${error.message}`);
    }

    return this.mapPerformance(data);
  }

  /**
   * Get vendor performance history
   */
  async getPerformanceHistory(vendorId: string, months: number = 12): Promise<VendorPerformance[]> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const { data, error } = await this.supabase
      .from('ctdisr.vendor_performance')
      .select('*')
      .eq('vendor_id', vendorId)
      .gte('period_start', startDate.toISOString())
      .order('period_start', { ascending: false });

    if (error) {
      throw new BadRequestException(`Failed to get performance history: ${error.message}`);
    }

    return data.map(p => this.mapPerformance(p));
  }

  // ============ Certifications ============

  /**
   * Add vendor certification
   */
  async addCertification(
    vendorId: string,
    certification: {
      certificationName: string;
      certificationBody?: string;
      certificationNumber?: string;
      issuedAt: Date;
      expiresAt?: Date;
      scope?: string;
    },
    userId: string,
  ): Promise<VendorCertification> {
    const { data, error } = await this.supabase
      .from('ctdisr.vendor_certifications')
      .insert({
        vendor_id: vendorId,
        certification_name: certification.certificationName,
        certification_body: certification.certificationBody,
        certification_number: certification.certificationNumber,
        issued_at: certification.issuedAt,
        expires_at: certification.expiresAt,
        is_valid: true,
        scope: certification.scope,
        verified: false,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to add certification: ${error.message}`);
    }

    await this.logVendorAudit(vendorId, 'certification_added', userId, {
      certification_id: data.id,
      name: certification.certificationName,
    });

    return this.mapCertification(data);
  }

  /**
   * Verify a certification
   */
  async verifyCertification(certificationId: string, userId: string): Promise<void> {
    const { data: cert, error: fetchError } = await this.supabase
      .from('ctdisr.vendor_certifications')
      .select('*')
      .eq('id', certificationId)
      .single();

    if (fetchError || !cert) {
      throw new NotFoundException(`Certification not found: ${certificationId}`);
    }

    await this.supabase
      .from('ctdisr.vendor_certifications')
      .update({
        verified: true,
        verified_at: new Date().toISOString(),
        verified_by: userId,
      })
      .eq('id', certificationId);

    await this.logVendorAudit(cert.vendor_id, 'certification_verified', userId, {
      certification_id: certificationId,
    });
  }

  // ============ Statistics ============

  /**
   * Get vendor statistics
   */
  async getStatistics(): Promise<VendorStatistics> {
    const { data: vendors } = await this.supabase
      .from('ctdisr.vendors')
      .select('status, risk_level, vendor_type, is_local_vendor, has_data_access, has_system_access');

    const now = new Date();

    // Get overdue assessments
    const { count: overdueAssessments } = await this.supabase
      .from('ctdisr.vendors')
      .select('id', { count: 'exact' })
      .lt('next_risk_assessment_at', now.toISOString());

    // Get expiring contracts (next 30 days)
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    const { count: expiringContracts } = await this.supabase
      .from('ctdisr.vendor_contracts')
      .select('id', { count: 'exact' })
      .eq('status', ContractStatus.ACTIVE)
      .lte('expiration_date', thirtyDaysLater.toISOString())
      .gte('expiration_date', now.toISOString());

    const byStatus: Record<VendorStatus, number> = {} as Record<VendorStatus, number>;
    const byRiskLevel: Record<VendorRiskLevel, number> = {} as Record<VendorRiskLevel, number>;
    const byType: Record<string, number> = {};

    let localVendors = 0;
    let withDataAccess = 0;
    let withSystemAccess = 0;

    vendors?.forEach(v => {
      byStatus[v.status as VendorStatus] = (byStatus[v.status as VendorStatus] ?? 0) + 1;
      if (v.risk_level) {
        byRiskLevel[v.risk_level as VendorRiskLevel] = (byRiskLevel[v.risk_level as VendorRiskLevel] ?? 0) + 1;
      }
      byType[v.vendor_type] = (byType[v.vendor_type] ?? 0) + 1;
      if (v.is_local_vendor) localVendors++;
      if (v.has_data_access) withDataAccess++;
      if (v.has_system_access) withSystemAccess++;
    });

    return {
      totalVendors: vendors?.length ?? 0,
      byStatus,
      byRiskLevel,
      byType,
      localVendors,
      withDataAccess,
      withSystemAccess,
      overdueAssessments: overdueAssessments ?? 0,
      expiringContracts: expiringContracts ?? 0,
    };
  }

  // ============ Private Helpers ============

  private async generateVendorCode(vendorType: string): Promise<string> {
    const prefix = vendorType.substring(0, 3).toUpperCase();
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `VND-${prefix}-${timestamp}-${random}`;
  }

  private async generateContractNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `CTR-${year}-${timestamp}-${random}`;
  }

  private validateStatusTransition(current: VendorStatus, target: VendorStatus): void {
    const validTransitions: Record<VendorStatus, VendorStatus[]> = {
      [VendorStatus.PROSPECT]: [VendorStatus.UNDER_REVIEW, VendorStatus.ARCHIVED],
      [VendorStatus.UNDER_REVIEW]: [VendorStatus.APPROVED, VendorStatus.ARCHIVED],
      [VendorStatus.APPROVED]: [VendorStatus.ACTIVE, VendorStatus.SUSPENDED, VendorStatus.ARCHIVED],
      [VendorStatus.ACTIVE]: [VendorStatus.SUSPENDED, VendorStatus.TERMINATED],
      [VendorStatus.SUSPENDED]: [VendorStatus.ACTIVE, VendorStatus.TERMINATED],
      [VendorStatus.TERMINATED]: [VendorStatus.ARCHIVED],
      [VendorStatus.ARCHIVED]: [],
    };

    if (!validTransitions[current]?.includes(target)) {
      throw new BadRequestException(
        `Invalid status transition from ${current} to ${target}`,
      );
    }
  }

  private calculateNextReview(sensitivity?: DataSensitivity): string {
    const days = sensitivity === DataSensitivity.TOP_SECRET ? 7
      : sensitivity === DataSensitivity.RESTRICTED ? 30
      : sensitivity === DataSensitivity.CONFIDENTIAL ? 90
      : 180;

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + days);
    return nextReview.toISOString();
  }

  private calculateAccessRiskScore(dto: LogAccessDto): number {
    let score = 0;

    // Failed access attempts
    if (!dto.success) score += 30;

    // Large data access
    if (dto.recordsAffected && dto.recordsAffected > 1000) score += 20;

    // Sensitive data types
    const sensitiveTypes = ['pii', 'financial', 'credentials', 'audit'];
    if (dto.dataAccessed?.some(d => sensitiveTypes.includes(d.toLowerCase()))) {
      score += 25;
    }

    // Write operations
    if (['write', 'update', 'delete', 'admin'].includes(dto.accessType.toLowerCase())) {
      score += 15;
    }

    return Math.min(score, 100);
  }

  private async logVendorAudit(
    vendorId: string,
    action: string,
    userId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.supabase.from('ctdisr.audit_logs').insert({
      action,
      resource_type: 'vendor',
      resource_id: vendorId,
      actor_id: userId,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  // ============ Mappers ============

  private mapVendor(data: Record<string, unknown>): Vendor {
    return {
      id: data.id as string,
      vendorCode: data.vendor_code as string,
      name: data.name as string,
      legalName: data.legal_name as string,
      registrationNumber: data.registration_number as string,
      taxId: data.tax_id as string,
      status: data.status as VendorStatus,
      riskLevel: data.risk_level as VendorRiskLevel,
      vendorType: data.vendor_type as string,
      country: data.country as string,
      city: data.city as string,
      address: data.address as string,
      isLocalVendor: data.is_local_vendor as boolean,
      primaryContactName: data.primary_contact_name as string,
      primaryContactEmail: data.primary_contact_email as string,
      primaryContactPhone: data.primary_contact_phone as string,
      secondaryContactName: data.secondary_contact_name as string,
      secondaryContactEmail: data.secondary_contact_email as string,
      servicesProvided: data.services_provided as string[],
      serviceCriticality: data.service_criticality as VendorRiskLevel,
      hasDataAccess: data.has_data_access as boolean,
      dataTypesAccessed: data.data_types_accessed as string[],
      maxDataSensitivity: data.max_data_sensitivity as DataSensitivity,
      hasSystemAccess: data.has_system_access as boolean,
      systemsAccessed: data.systems_accessed as string[],
      accessType: data.access_type as VendorAccessType,
      certifications: data.certifications as string[],
      regulatoryCompliance: data.regulatory_compliance as string[],
      ptaRegistered: data.pta_registered as boolean,
      lastRiskAssessmentAt: data.last_risk_assessment_at ? new Date(data.last_risk_assessment_at as string) : undefined,
      nextRiskAssessmentAt: data.next_risk_assessment_at ? new Date(data.next_risk_assessment_at as string) : undefined,
      riskAssessmentFrequencyDays: data.risk_assessment_frequency_days as number,
      securityRequirements: data.security_requirements as Record<string, unknown>,
      requiredControls: data.required_controls as string[],
      createdAt: new Date(data.created_at as string),
      createdBy: data.created_by as string,
      updatedAt: new Date(data.updated_at as string),
      approvedBy: data.approved_by as string,
      approvedAt: data.approved_at ? new Date(data.approved_at as string) : undefined,
    };
  }

  private mapContract(data: Record<string, unknown>): VendorContract {
    return {
      id: data.id as string,
      contractNumber: data.contract_number as string,
      vendorId: data.vendor_id as string,
      title: data.title as string,
      description: data.description as string,
      status: data.status as ContractStatus,
      contractType: data.contract_type as string,
      effectiveDate: new Date(data.effective_date as string),
      expirationDate: new Date(data.expiration_date as string),
      autoRenewal: data.auto_renewal as boolean,
      renewalNoticeDays: data.renewal_notice_days as number,
      totalValue: data.total_value as number,
      currency: data.currency as string,
      paymentTerms: data.payment_terms as string,
      slaTerms: data.sla_terms as VendorContract['slaTerms'],
      uptimeRequirement: data.uptime_requirement as number,
      responseTimeSlaHours: data.response_time_sla_hours as number,
      resolutionTimeSlaHours: data.resolution_time_sla_hours as number,
      securityRequirements: data.security_requirements as Record<string, unknown>,
      dataProtectionClause: data.data_protection_clause as boolean,
      auditRights: data.audit_rights as boolean,
      breachNotificationHours: data.breach_notification_hours as number,
      liabilityCap: data.liability_cap as number,
      regulatoryComplianceRequired: data.regulatory_compliance_required as string[],
      ctdisrComplianceRequired: data.ctdisr_compliance_required as boolean,
      terminationNoticeDays: data.termination_notice_days as number,
      terminationForConvenience: data.termination_for_convenience as boolean,
      terminationForCauseConditions: data.termination_for_cause_conditions as string[],
      contractDocumentUrl: data.contract_document_url as string,
      contractDocumentHash: data.contract_document_hash as string,
      amendments: data.amendments as VendorContract['amendments'],
      approvedBy: data.approved_by as string,
      approvedAt: data.approved_at ? new Date(data.approved_at as string) : undefined,
      legalReviewCompleted: data.legal_review_completed as boolean,
      securityReviewCompleted: data.security_review_completed as boolean,
      createdAt: new Date(data.created_at as string),
      createdBy: data.created_by as string,
      updatedAt: new Date(data.updated_at as string),
    };
  }

  private mapAccessPermission(data: Record<string, unknown>): VendorAccessPermission {
    return {
      id: data.id as string,
      vendorId: data.vendor_id as string,
      contractId: data.contract_id as string,
      permissionName: data.permission_name as string,
      accessType: data.access_type as VendorAccessType,
      resourceType: data.resource_type as string,
      resourceIdentifier: data.resource_identifier as string,
      dataSensitivity: data.data_sensitivity as DataSensitivity,
      dataTypes: data.data_types as string[],
      ipWhitelist: data.ip_whitelist as string[],
      timeRestrictions: data.time_restrictions as VendorAccessPermission['timeRestrictions'],
      geoRestrictions: data.geo_restrictions as string[],
      grantedAt: new Date(data.granted_at as string),
      expiresAt: data.expires_at ? new Date(data.expires_at as string) : undefined,
      grantedBy: data.granted_by as string,
      approvedBy: data.approved_by as string,
      isActive: data.is_active as boolean,
      revokedAt: data.revoked_at ? new Date(data.revoked_at as string) : undefined,
      revokedBy: data.revoked_by as string,
      revocationReason: data.revocation_reason as string,
      lastReviewedAt: data.last_reviewed_at ? new Date(data.last_reviewed_at as string) : undefined,
      nextReviewAt: data.next_review_at ? new Date(data.next_review_at as string) : undefined,
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
    };
  }

  private mapIncident(data: Record<string, unknown>): VendorSecurityIncident {
    return {
      id: data.id as string,
      vendorId: data.vendor_id as string,
      incidentId: data.incident_id as string,
      incidentType: data.incident_type as string,
      severity: data.severity as VendorRiskLevel,
      description: data.description as string,
      occurredAt: new Date(data.occurred_at as string),
      reportedAt: new Date(data.reported_at as string),
      resolvedAt: data.resolved_at ? new Date(data.resolved_at as string) : undefined,
      dataImpacted: data.data_impacted as boolean,
      dataTypesAffected: data.data_types_affected as string[],
      systemsAffected: data.systems_affected as string[],
      vendorResponse: data.vendor_response as string,
      vendorResponseTimeHours: data.vendor_response_time_hours as number,
      ourResponse: data.our_response as string,
      rootCause: data.root_cause as string,
      vendorResponsible: data.vendor_responsible as boolean,
      remediationActions: data.remediation_actions as VendorSecurityIncident['remediationActions'],
      remediationVerified: data.remediation_verified as boolean,
      slaBreached: data.sla_breached as boolean,
      penaltiesApplied: data.penalties_applied as number,
      ptaNotified: data.pta_notified as boolean,
      ptaNotificationDate: data.pta_notification_date ? new Date(data.pta_notification_date as string) : undefined,
      createdAt: new Date(data.created_at as string),
      createdBy: data.created_by as string,
      updatedAt: new Date(data.updated_at as string),
    };
  }

  private mapPerformance(data: Record<string, unknown>): VendorPerformance {
    return {
      id: data.id as string,
      vendorId: data.vendor_id as string,
      contractId: data.contract_id as string,
      periodStart: new Date(data.period_start as string),
      periodEnd: new Date(data.period_end as string),
      uptimePercentage: data.uptime_percentage as number,
      incidentsCount: data.incidents_count as number,
      criticalIncidents: data.critical_incidents as number,
      avgResponseTimeHours: data.avg_response_time_hours as number,
      avgResolutionTimeHours: data.avg_resolution_time_hours as number,
      slaCompliancePercentage: data.sla_compliance_percentage as number,
      securityIncidents: data.security_incidents as number,
      vulnerabilitiesReported: data.vulnerabilities_reported as number,
      vulnerabilitiesResolved: data.vulnerabilities_resolved as number,
      patchCompliancePercentage: data.patch_compliance_percentage as number,
      qualityScore: data.quality_score as number,
      customerSatisfactionScore: data.customer_satisfaction_score as number,
      notes: data.notes as string,
      createdAt: new Date(data.created_at as string),
      createdBy: data.created_by as string,
    };
  }

  private mapCertification(data: Record<string, unknown>): VendorCertification {
    return {
      id: data.id as string,
      vendorId: data.vendor_id as string,
      certificationName: data.certification_name as string,
      certificationBody: data.certification_body as string,
      certificationNumber: data.certification_number as string,
      issuedAt: new Date(data.issued_at as string),
      expiresAt: data.expires_at ? new Date(data.expires_at as string) : undefined,
      isValid: data.is_valid as boolean,
      scope: data.scope as string,
      verified: data.verified as boolean,
      verifiedAt: data.verified_at ? new Date(data.verified_at as string) : undefined,
      verifiedBy: data.verified_by as string,
      certificateUrl: data.certificate_url as string,
      certificateHash: data.certificate_hash as string,
      createdAt: new Date(data.created_at as string),
    };
  }
}
