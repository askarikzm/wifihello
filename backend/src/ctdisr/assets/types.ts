/**
 * NetAxis ISP - CTDISR-2025 Asset Management Types
 */

import { AssetClassification } from '../types';

// ============================================
// ENUMS
// ============================================

export enum AssetType {
  SERVER = 'SERVER',
  NETWORK = 'NETWORK',
  APPLICATION = 'APPLICATION',
  DATA = 'DATA',
  ENDPOINT = 'ENDPOINT',
}

export enum AssetSubtype {
  // Network
  OLT = 'OLT',
  ONU = 'ONU',
  ROUTER = 'ROUTER',
  SWITCH = 'SWITCH',
  FIREWALL = 'FIREWALL',
  ACCESS_POINT = 'ACCESS_POINT',
  
  // Server
  DATABASE_SERVER = 'DATABASE_SERVER',
  APPLICATION_SERVER = 'APPLICATION_SERVER',
  WEB_SERVER = 'WEB_SERVER',
  RADIUS_SERVER = 'RADIUS_SERVER',
  DNS_SERVER = 'DNS_SERVER',
  
  // Application
  CUSTOMER_PORTAL = 'CUSTOMER_PORTAL',
  ADMIN_PORTAL = 'ADMIN_PORTAL',
  BILLING_SYSTEM = 'BILLING_SYSTEM',
  RADIUS_SERVICE = 'RADIUS_SERVICE',
  
  // Data
  CUSTOMER_DATABASE = 'CUSTOMER_DATABASE',
  BILLING_DATABASE = 'BILLING_DATABASE',
  AUDIT_DATABASE = 'AUDIT_DATABASE',
  
  // Endpoint
  WORKSTATION = 'WORKSTATION',
  LAPTOP = 'LAPTOP',
  MOBILE = 'MOBILE',
}

export enum AssetStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DECOMMISSIONED = 'DECOMMISSIONED',
  DISPOSED = 'DISPOSED',
}

export enum LocationType {
  DATACENTER = 'DATACENTER',
  OFFICE = 'OFFICE',
  CLOUD = 'CLOUD',
  REMOTE = 'REMOTE',
}

export enum NetworkZone {
  DMZ = 'DMZ',
  INTERNAL = 'INTERNAL',
  MANAGEMENT = 'MANAGEMENT',
  INTERNET = 'INTERNET',
}

export enum ImpactLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum VulnerabilitySeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  INFO = 'INFO',
}

export enum VulnerabilityStatus {
  OPEN = 'OPEN',
  ACCEPTED = 'ACCEPTED',
  MITIGATED = 'MITIGATED',
  PATCHED = 'PATCHED',
  FALSE_POSITIVE = 'FALSE_POSITIVE',
}

// ============================================
// INTERFACES
// ============================================

export interface Asset {
  id: string;
  assetCode: string;
  assetName: string;
  description?: string;
  classification: AssetClassification;
  assetType: AssetType;
  assetSubtype?: AssetSubtype | string;
  
  // Ownership
  ownerDepartment: string;
  ownerUserId?: string;
  custodianUserId?: string;
  
  // Location
  locationType?: LocationType;
  locationDetails?: Record<string, unknown>;
  
  // Technical
  technicalDetails?: Record<string, unknown>;
  networkZone?: NetworkZone;
  
  // Impact assessment
  confidentialityImpact: ImpactLevel;
  integrityImpact: ImpactLevel;
  availabilityImpact: ImpactLevel;
  
  // Compliance
  handlesPii: boolean;
  handlesFinancial: boolean;
  handlesLiData: boolean;
  ptaRegistered: boolean;
  ptaRegistrationRef?: string;
  
  // Lifecycle
  status: AssetStatus;
  acquisitionDate?: Date;
  goLiveDate?: Date;
  endOfLifeDate?: Date;
  decommissionDate?: Date;
  disposalDate?: Date;
  disposalMethod?: string;
  disposalCertificateRef?: string;
  
  // Dependencies
  dependsOn?: string[];
  dependedBy?: string[];
  
  // Risk
  riskScore: number;
  lastRiskAssessmentAt?: Date;
  nextRiskAssessmentDue?: Date;
  
  // Audit
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
  version: number;
}

export interface AssetClassificationRecord {
  id: string;
  assetId: string;
  classification: AssetClassification;
  classificationReason: string;
  classifiedBy: string;
  classifiedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  effectiveFrom: Date;
  effectiveUntil?: Date;
  reviewRequiredBy?: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  createdAt: Date;
}

export interface AssetVulnerability {
  id: string;
  assetId: string;
  vulnerabilityId: string;
  vulnerabilityName: string;
  description?: string;
  cvssScore?: number;
  severity: VulnerabilitySeverity;
  status: VulnerabilityStatus;
  discoveredAt: Date;
  discoveredBy?: string;
  scanReportRef?: string;
  remediationPlan?: string;
  remediationDeadline?: Date;
  remediatedAt?: Date;
  remediatedBy?: string;
  acceptedBy?: string;
  acceptedAt?: Date;
  acceptanceReason?: string;
  acceptanceExpiresAt?: Date;
  evidence?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssetSoftware {
  id: string;
  assetId: string;
  softwareName: string;
  vendor?: string;
  version: string;
  licenseType?: 'COMMERCIAL' | 'OPEN_SOURCE' | 'PROPRIETARY';
  licenseKeyHash?: string;
  licenseExpiresAt?: Date;
  isApproved: boolean;
  approvalRef?: string;
  isEol: boolean;
  eolDate?: Date;
  installedAt?: Date;
  installedBy?: string;
  uninstalledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssetNetworkInterface {
  id: string;
  assetId: string;
  interfaceName: string;
  interfaceType: 'ETHERNET' | 'FIBER' | 'WIRELESS' | 'VIRTUAL';
  macAddress?: string;
  ipAddresses?: string[];
  subnet?: string;
  gateway?: string;
  vlanId?: number;
  isActive: boolean;
  isManagement: boolean;
  firewallZone?: string;
  aclApplied?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssetChange {
  id: string;
  assetId: string;
  changeType: 'CREATE' | 'UPDATE' | 'CLASSIFICATION' | 'DECOMMISSION' | 'DISPOSAL';
  changeDescription: string;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  changeRequestRef?: string;
  changeReason: string;
  changedBy: string;
  changedAt: Date;
  requiresApproval: boolean;
  approvedBy?: string;
  approvedAt?: Date;
}

// ============================================
// DTOs
// ============================================

export interface CreateAssetDto {
  assetName: string;
  description?: string;
  classification: AssetClassification;
  assetType: AssetType;
  assetSubtype?: string;
  ownerDepartment: string;
  ownerUserId?: string;
  custodianUserId?: string;
  locationType?: LocationType;
  locationDetails?: Record<string, unknown>;
  technicalDetails?: Record<string, unknown>;
  networkZone?: NetworkZone;
  confidentialityImpact?: ImpactLevel;
  integrityImpact?: ImpactLevel;
  availabilityImpact?: ImpactLevel;
  handlesPii?: boolean;
  handlesFinancial?: boolean;
  handlesLiData?: boolean;
  acquisitionDate?: string;
  goLiveDate?: string;
  dependsOn?: string[];
}

export interface UpdateAssetDto {
  assetName?: string;
  description?: string;
  classification?: AssetClassification;
  ownerDepartment?: string;
  ownerUserId?: string;
  custodianUserId?: string;
  locationType?: LocationType;
  locationDetails?: Record<string, unknown>;
  technicalDetails?: Record<string, unknown>;
  networkZone?: NetworkZone;
  confidentialityImpact?: ImpactLevel;
  integrityImpact?: ImpactLevel;
  availabilityImpact?: ImpactLevel;
  handlesPii?: boolean;
  handlesFinancial?: boolean;
  handlesLiData?: boolean;
  ptaRegistered?: boolean;
  ptaRegistrationRef?: string;
}

export interface CreateVulnerabilityDto {
  assetId: string;
  vulnerabilityId: string;
  vulnerabilityName: string;
  description?: string;
  cvssScore?: number;
  severity: VulnerabilitySeverity;
  discoveredBy?: string;
  scanReportRef?: string;
  remediationDeadline?: string;
}

export interface AssetSearchFilters {
  classification?: AssetClassification;
  assetType?: AssetType;
  status?: AssetStatus;
  ownerDepartment?: string;
  handlesPii?: boolean;
  handlesLiData?: boolean;
  networkZone?: NetworkZone;
  minRiskScore?: number;
  maxRiskScore?: number;
}

// ============================================
// STATISTICS
// ============================================

export interface AssetStatistics {
  total: number;
  byClassification: Record<AssetClassification, number>;
  byType: Record<AssetType, number>;
  byStatus: Record<AssetStatus, number>;
  handlingPii: number;
  handlingLiData: number;
  criticalRisk: number;  // Risk score > 70
  highRisk: number;      // Risk score 50-70
  openVulnerabilities: number;
  criticalVulnerabilities: number;
}
