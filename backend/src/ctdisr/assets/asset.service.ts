/**
 * NetAxis ISP - CTDISR-2025 Asset Management Service
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Asset,
  AssetClassificationRecord,
  AssetVulnerability,
  AssetSoftware,
  AssetNetworkInterface,
  AssetChange,
  AssetStatistics,
  AssetStatus,
  VulnerabilityStatus,
  CreateAssetDto,
  UpdateAssetDto,
  CreateVulnerabilityDto,
  AssetSearchFilters,
} from './types';
import { AssetClassification, CtdisrContext } from '../types';
import { SecurityEventsService } from '../security-events.service';
import { SecurityEventCategory, SecurityEventOutcome, IncidentSeverity } from '../types';

@Injectable()
export class AssetService {
  private readonly logger = new Logger(AssetService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  // ============================================
  // ASSET CRUD
  // ============================================

  /**
   * Create a new asset
   */
  async createAsset(dto: CreateAssetDto, context: CtdisrContext): Promise<Asset> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const assetData = {
      asset_name: dto.assetName,
      description: dto.description,
      classification: dto.classification,
      asset_type: dto.assetType,
      asset_subtype: dto.assetSubtype,
      owner_department: dto.ownerDepartment,
      owner_user_id: dto.ownerUserId,
      custodian_user_id: dto.custodianUserId,
      location_type: dto.locationType,
      location_details: dto.locationDetails || {},
      technical_details: dto.technicalDetails || {},
      network_zone: dto.networkZone,
      confidentiality_impact: dto.confidentialityImpact || 'MEDIUM',
      integrity_impact: dto.integrityImpact || 'MEDIUM',
      availability_impact: dto.availabilityImpact || 'MEDIUM',
      handles_pii: dto.handlesPii || false,
      handles_financial: dto.handlesFinancial || false,
      handles_li_data: dto.handlesLiData || false,
      status: AssetStatus.ACTIVE,
      acquisition_date: dto.acquisitionDate,
      go_live_date: dto.goLiveDate,
      depends_on: dto.dependsOn || [],
      created_by: context.userId,
      updated_by: context.userId,
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/assets`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(assetData),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Failed to create asset: ${error}`);
      throw new Error('Failed to create asset');
    }

    const [created] = await response.json();
    const asset = this.mapAssetFromDb(created);

    // Log the asset creation
    await this.securityEventsService.logEvent({
      eventType: 'ASSET_CREATED',
      category: SecurityEventCategory.CONFIG,
      severity: IncidentSeverity.P4_LOW,
      sourceSystem: 'BACKEND',
      sourceComponent: 'asset-management',
      context,
      targetType: 'ASSET',
      targetId: asset.id,
      action: 'CREATE_ASSET',
      outcome: SecurityEventOutcome.SUCCESS,
      details: {
        assetCode: asset.assetCode,
        assetType: asset.assetType,
        classification: asset.classification,
      },
    });

    this.logger.log(`Asset created: ${asset.assetCode}`, {
      assetId: asset.id,
      classification: asset.classification,
      createdBy: context.userId,
    });

    return asset;
  }

  /**
   * Get asset by ID
   */
  async getAssetById(assetId: string): Promise<Asset | null> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(`${supabaseUrl}/rest/v1/assets?id=eq.${assetId}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch asset');
    }

    const [asset] = await response.json();
    return asset ? this.mapAssetFromDb(asset) : null;
  }

  /**
   * Get asset by code
   */
  async getAssetByCode(assetCode: string): Promise<Asset | null> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(`${supabaseUrl}/rest/v1/assets?asset_code=eq.${assetCode}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch asset');
    }

    const [asset] = await response.json();
    return asset ? this.mapAssetFromDb(asset) : null;
  }

  /**
   * Search assets with filters
   */
  async searchAssets(filters: AssetSearchFilters): Promise<Asset[]> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    let query = 'status=neq.DISPOSED';

    if (filters.classification) query += `&classification=eq.${filters.classification}`;
    if (filters.assetType) query += `&asset_type=eq.${filters.assetType}`;
    if (filters.status) query += `&status=eq.${filters.status}`;
    if (filters.ownerDepartment) query += `&owner_department=eq.${filters.ownerDepartment}`;
    if (filters.handlesPii !== undefined) query += `&handles_pii=eq.${filters.handlesPii}`;
    if (filters.handlesLiData !== undefined) query += `&handles_li_data=eq.${filters.handlesLiData}`;
    if (filters.networkZone) query += `&network_zone=eq.${filters.networkZone}`;
    if (filters.minRiskScore !== undefined) query += `&risk_score=gte.${filters.minRiskScore}`;
    if (filters.maxRiskScore !== undefined) query += `&risk_score=lte.${filters.maxRiskScore}`;

    const response = await fetch(
      `${supabaseUrl}/rest/v1/assets?${query}&order=asset_code.asc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to search assets');
    }

    const assets = await response.json();
    return assets.map((a: Record<string, unknown>) => this.mapAssetFromDb(a));
  }

  /**
   * Update an asset
   */
  async updateAsset(
    assetId: string,
    dto: UpdateAssetDto,
    context: CtdisrContext,
  ): Promise<Asset> {
    const existing = await this.getAssetById(assetId);
    if (!existing) {
      throw new NotFoundException('Asset not found');
    }

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    };

    if (dto.assetName !== undefined) updateData.asset_name = dto.assetName;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.ownerDepartment !== undefined) updateData.owner_department = dto.ownerDepartment;
    if (dto.ownerUserId !== undefined) updateData.owner_user_id = dto.ownerUserId;
    if (dto.custodianUserId !== undefined) updateData.custodian_user_id = dto.custodianUserId;
    if (dto.locationType !== undefined) updateData.location_type = dto.locationType;
    if (dto.locationDetails !== undefined) updateData.location_details = dto.locationDetails;
    if (dto.technicalDetails !== undefined) updateData.technical_details = dto.technicalDetails;
    if (dto.networkZone !== undefined) updateData.network_zone = dto.networkZone;
    if (dto.confidentialityImpact !== undefined) updateData.confidentiality_impact = dto.confidentialityImpact;
    if (dto.integrityImpact !== undefined) updateData.integrity_impact = dto.integrityImpact;
    if (dto.availabilityImpact !== undefined) updateData.availability_impact = dto.availabilityImpact;
    if (dto.handlesPii !== undefined) updateData.handles_pii = dto.handlesPii;
    if (dto.handlesFinancial !== undefined) updateData.handles_financial = dto.handlesFinancial;
    if (dto.handlesLiData !== undefined) updateData.handles_li_data = dto.handlesLiData;
    if (dto.ptaRegistered !== undefined) updateData.pta_registered = dto.ptaRegistered;
    if (dto.ptaRegistrationRef !== undefined) updateData.pta_registration_ref = dto.ptaRegistrationRef;

    // Handle classification change separately (requires approval)
    if (dto.classification && dto.classification !== existing.classification) {
      await this.reclassifyAsset(assetId, dto.classification, 'Classification update', context);
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/assets?id=eq.${assetId}`, {
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
      throw new Error('Failed to update asset');
    }

    const [updated] = await response.json();
    return this.mapAssetFromDb(updated);
  }

  /**
   * Reclassify an asset
   */
  async reclassifyAsset(
    assetId: string,
    newClassification: AssetClassification,
    reason: string,
    context: CtdisrContext,
  ): Promise<void> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    // End current classification
    await fetch(
      `${supabaseUrl}/rest/v1/asset_classifications?asset_id=eq.${assetId}&effective_until=is.null`,
      {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          effective_until: new Date().toISOString(),
        }),
      },
    );

    // Create new classification record
    const classificationData = {
      asset_id: assetId,
      classification: newClassification,
      classification_reason: reason,
      classified_by: context.userId,
      classified_at: new Date().toISOString(),
      effective_from: new Date().toISOString(),
      review_required_by: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
    };

    await fetch(`${supabaseUrl}/rest/v1/asset_classifications`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(classificationData),
    });

    // Update asset classification
    await fetch(`${supabaseUrl}/rest/v1/assets?id=eq.${assetId}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        classification: newClassification,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      }),
    });

    // Log classification change
    await this.securityEventsService.logConfigChange({
      context,
      targetType: 'ASSET_CLASSIFICATION',
      targetId: assetId,
      action: 'RECLASSIFY_ASSET',
      newValue: { classification: newClassification, reason },
    });
  }

  /**
   * Decommission an asset
   */
  async decommissionAsset(
    assetId: string,
    reason: string,
    context: CtdisrContext,
  ): Promise<Asset> {
    const asset = await this.getAssetById(assetId);
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const updateData = {
      status: AssetStatus.DECOMMISSIONED,
      decommission_date: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/assets?id=eq.${assetId}`, {
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
      throw new Error('Failed to decommission asset');
    }

    // Log decommission
    await this.securityEventsService.logEvent({
      eventType: 'ASSET_DECOMMISSIONED',
      category: SecurityEventCategory.CONFIG,
      severity: IncidentSeverity.P4_LOW,
      sourceSystem: 'BACKEND',
      sourceComponent: 'asset-management',
      context,
      targetType: 'ASSET',
      targetId: assetId,
      action: 'DECOMMISSION_ASSET',
      outcome: SecurityEventOutcome.SUCCESS,
      details: { assetCode: asset.assetCode, reason },
    });

    const [updated] = await response.json();
    return this.mapAssetFromDb(updated);
  }

  // ============================================
  // VULNERABILITIES
  // ============================================

  /**
   * Add a vulnerability to an asset
   */
  async addVulnerability(
    dto: CreateVulnerabilityDto,
    context: CtdisrContext,
  ): Promise<AssetVulnerability> {
    const asset = await this.getAssetById(dto.assetId);
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const vulnData = {
      asset_id: dto.assetId,
      vulnerability_id: dto.vulnerabilityId,
      vulnerability_name: dto.vulnerabilityName,
      description: dto.description,
      cvss_score: dto.cvssScore,
      severity: dto.severity,
      status: VulnerabilityStatus.OPEN,
      discovered_at: new Date().toISOString(),
      discovered_by: dto.discoveredBy,
      scan_report_ref: dto.scanReportRef,
      remediation_deadline: dto.remediationDeadline,
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/asset_vulnerabilities`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(vulnData),
    });

    if (!response.ok) {
      throw new Error('Failed to add vulnerability');
    }

    const [created] = await response.json();

    // Log if critical/high vulnerability on critical asset
    if (
      ['CRITICAL', 'HIGH'].includes(dto.severity) &&
      asset.classification === AssetClassification.CRITICAL
    ) {
      await this.securityEventsService.logEvent({
        eventType: 'CRITICAL_VULNERABILITY_DISCOVERED',
        category: SecurityEventCategory.INCIDENT,
        severity: IncidentSeverity.P2_HIGH,
        sourceSystem: 'BACKEND',
        sourceComponent: 'asset-management',
        context,
        targetType: 'ASSET',
        targetId: dto.assetId,
        action: 'VULNERABILITY_DISCOVERED',
        outcome: SecurityEventOutcome.SUCCESS,
        details: {
          assetCode: asset.assetCode,
          vulnerabilityId: dto.vulnerabilityId,
          severity: dto.severity,
          cvssScore: dto.cvssScore,
        },
      });
    }

    return this.mapVulnerabilityFromDb(created);
  }

  /**
   * Get vulnerabilities for an asset
   */
  async getAssetVulnerabilities(
    assetId: string,
    status?: VulnerabilityStatus,
  ): Promise<AssetVulnerability[]> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    let query = `asset_id=eq.${assetId}`;
    if (status) query += `&status=eq.${status}`;

    const response = await fetch(
      `${supabaseUrl}/rest/v1/asset_vulnerabilities?${query}&order=severity.asc,discovered_at.desc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch vulnerabilities');
    }

    const vulnerabilities = await response.json();
    return vulnerabilities.map((v: Record<string, unknown>) => this.mapVulnerabilityFromDb(v));
  }

  /**
   * Update vulnerability status
   */
  async updateVulnerabilityStatus(
    vulnId: string,
    status: VulnerabilityStatus,
    context: CtdisrContext,
    notes?: string,
  ): Promise<AssetVulnerability> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === VulnerabilityStatus.PATCHED || status === VulnerabilityStatus.MITIGATED) {
      updateData.remediated_at = new Date().toISOString();
      updateData.remediated_by = context.userId;
    }

    if (status === VulnerabilityStatus.ACCEPTED) {
      updateData.accepted_at = new Date().toISOString();
      updateData.accepted_by = context.userId;
      updateData.acceptance_reason = notes;
      updateData.acceptance_expires_at = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/asset_vulnerabilities?id=eq.${vulnId}`, {
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
      throw new Error('Failed to update vulnerability');
    }

    const [updated] = await response.json();
    return this.mapVulnerabilityFromDb(updated);
  }

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Get asset statistics
   */
  async getStatistics(): Promise<AssetStatistics> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    // Fetch all assets
    const assetsResponse = await fetch(
      `${supabaseUrl}/rest/v1/assets?status=neq.DISPOSED&select=id,classification,asset_type,status,handles_pii,handles_li_data,risk_score`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!assetsResponse.ok) {
      throw new Error('Failed to fetch asset statistics');
    }

    const assets = await assetsResponse.json();

    // Fetch open vulnerabilities
    const vulnsResponse = await fetch(
      `${supabaseUrl}/rest/v1/asset_vulnerabilities?status=eq.OPEN&select=id,severity`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const vulns = await vulnsResponse.json();

    // Calculate statistics
    const stats: AssetStatistics = {
      total: assets.length,
      byClassification: {
        [AssetClassification.CRITICAL]: 0,
        [AssetClassification.SENSITIVE]: 0,
        [AssetClassification.CONFIDENTIAL]: 0,
        [AssetClassification.PUBLIC]: 0,
      },
      byType: {
        SERVER: 0,
        NETWORK: 0,
        APPLICATION: 0,
        DATA: 0,
        ENDPOINT: 0,
      },
      byStatus: {
        ACTIVE: 0,
        INACTIVE: 0,
        DECOMMISSIONED: 0,
        DISPOSED: 0,
      },
      handlingPii: 0,
      handlingLiData: 0,
      criticalRisk: 0,
      highRisk: 0,
      openVulnerabilities: vulns.length,
      criticalVulnerabilities: vulns.filter((v: { severity: string }) =>
        v.severity === 'CRITICAL'
      ).length,
    };

    for (const asset of assets) {
      stats.byClassification[asset.classification as AssetClassification]++;
      stats.byType[asset.asset_type as keyof typeof stats.byType]++;
      stats.byStatus[asset.status as keyof typeof stats.byStatus]++;
      
      if (asset.handles_pii) stats.handlingPii++;
      if (asset.handles_li_data) stats.handlingLiData++;
      if (asset.risk_score > 70) stats.criticalRisk++;
      else if (asset.risk_score >= 50) stats.highRisk++;
    }

    return stats;
  }

  // ============================================
  // SCHEDULED TASKS
  // ============================================

  /**
   * Recalculate risk scores for all assets
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async recalculateRiskScores(): Promise<void> {
    this.logger.log('Starting scheduled risk score recalculation');

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    // Call the database function to update all risk scores
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/update_all_asset_risk_scores`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (response.ok) {
      this.logger.log('Risk score recalculation completed');
    } else {
      this.logger.error('Risk score recalculation failed');
    }
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private mapAssetFromDb(row: Record<string, unknown>): Asset {
    return {
      id: row.id as string,
      assetCode: row.asset_code as string,
      assetName: row.asset_name as string,
      description: row.description as string,
      classification: row.classification as AssetClassification,
      assetType: row.asset_type as Asset['assetType'],
      assetSubtype: row.asset_subtype as string,
      ownerDepartment: row.owner_department as string,
      ownerUserId: row.owner_user_id as string,
      custodianUserId: row.custodian_user_id as string,
      locationType: row.location_type as Asset['locationType'],
      locationDetails: row.location_details as Record<string, unknown>,
      technicalDetails: row.technical_details as Record<string, unknown>,
      networkZone: row.network_zone as Asset['networkZone'],
      confidentialityImpact: row.confidentiality_impact as Asset['confidentialityImpact'],
      integrityImpact: row.integrity_impact as Asset['integrityImpact'],
      availabilityImpact: row.availability_impact as Asset['availabilityImpact'],
      handlesPii: row.handles_pii as boolean,
      handlesFinancial: row.handles_financial as boolean,
      handlesLiData: row.handles_li_data as boolean,
      ptaRegistered: row.pta_registered as boolean,
      ptaRegistrationRef: row.pta_registration_ref as string,
      status: row.status as AssetStatus,
      acquisitionDate: row.acquisition_date ? new Date(row.acquisition_date as string) : undefined,
      goLiveDate: row.go_live_date ? new Date(row.go_live_date as string) : undefined,
      endOfLifeDate: row.end_of_life_date ? new Date(row.end_of_life_date as string) : undefined,
      decommissionDate: row.decommission_date ? new Date(row.decommission_date as string) : undefined,
      disposalDate: row.disposal_date ? new Date(row.disposal_date as string) : undefined,
      disposalMethod: row.disposal_method as string,
      disposalCertificateRef: row.disposal_certificate_ref as string,
      dependsOn: row.depends_on as string[],
      dependedBy: row.depended_by as string[],
      riskScore: row.risk_score as number,
      lastRiskAssessmentAt: row.last_risk_assessment_at
        ? new Date(row.last_risk_assessment_at as string)
        : undefined,
      nextRiskAssessmentDue: row.next_risk_assessment_due
        ? new Date(row.next_risk_assessment_due as string)
        : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      createdBy: row.created_by as string,
      updatedBy: row.updated_by as string,
      version: row.version as number,
    };
  }

  private mapVulnerabilityFromDb(row: Record<string, unknown>): AssetVulnerability {
    return {
      id: row.id as string,
      assetId: row.asset_id as string,
      vulnerabilityId: row.vulnerability_id as string,
      vulnerabilityName: row.vulnerability_name as string,
      description: row.description as string,
      cvssScore: row.cvss_score as number,
      severity: row.severity as AssetVulnerability['severity'],
      status: row.status as VulnerabilityStatus,
      discoveredAt: new Date(row.discovered_at as string),
      discoveredBy: row.discovered_by as string,
      scanReportRef: row.scan_report_ref as string,
      remediationPlan: row.remediation_plan as string,
      remediationDeadline: row.remediation_deadline
        ? new Date(row.remediation_deadline as string)
        : undefined,
      remediatedAt: row.remediated_at ? new Date(row.remediated_at as string) : undefined,
      remediatedBy: row.remediated_by as string,
      acceptedBy: row.accepted_by as string,
      acceptedAt: row.accepted_at ? new Date(row.accepted_at as string) : undefined,
      acceptanceReason: row.acceptance_reason as string,
      acceptanceExpiresAt: row.acceptance_expires_at
        ? new Date(row.acceptance_expires_at as string)
        : undefined,
      evidence: row.evidence as Record<string, unknown>,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
