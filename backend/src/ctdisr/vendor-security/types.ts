/**
 * CTDISR-2025 Vendor & Third-Party Security Types
 * PTA Regulation: Chapter 9 - Third-Party Risk Management
 */

// ============ Enums ============

export enum VendorRiskLevel {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  MINIMAL = 'minimal',
}

export enum VendorStatus {
  PROSPECT = 'prospect',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  TERMINATED = 'terminated',
  ARCHIVED = 'archived',
}

export enum AssessmentStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  PENDING_REVIEW = 'pending_review',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
}

export enum ContractStatus {
  DRAFT = 'draft',
  NEGOTIATION = 'negotiation',
  PENDING_APPROVAL = 'pending_approval',
  ACTIVE = 'active',
  EXPIRING_SOON = 'expiring_soon',
  EXPIRED = 'expired',
  TERMINATED = 'terminated',
  RENEWED = 'renewed',
}

export enum VendorAccessType {
  NONE = 'none',
  READ_ONLY = 'read_only',
  READ_WRITE = 'read_write',
  ADMIN = 'admin',
  API_ONLY = 'api_only',
  PHYSICAL = 'physical',
  REMOTE = 'remote',
}

export enum DataSensitivity {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  RESTRICTED = 'restricted',
  TOP_SECRET = 'top_secret',
}

// ============ Interfaces ============

export interface Vendor {
  id: string;
  vendorCode: string;
  name: string;
  legalName?: string;
  registrationNumber?: string;
  taxId?: string;
  status: VendorStatus;
  riskLevel?: VendorRiskLevel;
  vendorType: string;
  country: string;
  city?: string;
  address?: string;
  isLocalVendor: boolean;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  secondaryContactName?: string;
  secondaryContactEmail?: string;
  servicesProvided: string[];
  serviceCriticality?: VendorRiskLevel;
  hasDataAccess: boolean;
  dataTypesAccessed: string[];
  maxDataSensitivity?: DataSensitivity;
  hasSystemAccess: boolean;
  systemsAccessed: string[];
  accessType: VendorAccessType;
  certifications: string[];
  regulatoryCompliance: string[];
  ptaRegistered: boolean;
  lastRiskAssessmentAt?: Date;
  nextRiskAssessmentAt?: Date;
  riskAssessmentFrequencyDays: number;
  securityRequirements: Record<string, unknown>;
  requiredControls: string[];
  createdAt: Date;
  createdBy?: string;
  updatedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
}

export interface AssessmentFinding {
  id: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  recommendation: string;
  status: 'open' | 'in_progress' | 'resolved' | 'accepted';
  dueDate?: Date;
  resolvedAt?: Date;
}

export interface VendorRiskAssessment {
  id: string;
  assessmentNumber: string;
  vendorId: string;
  assessmentType: string;
  status: AssessmentStatus;
  initiatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  validUntil?: Date;
  assessorId?: string;
  reviewerId?: string;
  questionnaireResponses: Record<string, unknown>;
  questionnaireVersion?: string;
  inherentRiskScore?: number;
  controlEffectivenessScore?: number;
  residualRiskScore?: number;
  calculatedRiskLevel?: VendorRiskLevel;
  financialRiskScore?: number;
  operationalRiskScore?: number;
  securityRiskScore?: number;
  complianceRiskScore?: number;
  reputationalRiskScore?: number;
  findings: AssessmentFinding[];
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  recommendations: string[];
  requiredActions: string[];
  evidenceDocuments: string[];
  decision?: 'approve' | 'conditional_approve' | 'reject';
  decisionRationale?: string;
  conditions: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SlaTerm {
  metric: string;
  target: number;
  unit: string;
  penalty?: number;
  penaltyType?: 'percentage' | 'fixed';
}

export interface VendorContract {
  id: string;
  contractNumber: string;
  vendorId: string;
  title: string;
  description?: string;
  status: ContractStatus;
  contractType: string;
  effectiveDate: Date;
  expirationDate: Date;
  autoRenewal: boolean;
  renewalNoticeDays: number;
  totalValue?: number;
  currency: string;
  paymentTerms?: string;
  slaTerms: SlaTerm[];
  uptimeRequirement?: number;
  responseTimeSlaHours?: number;
  resolutionTimeSlaHours?: number;
  securityRequirements: Record<string, unknown>;
  dataProtectionClause: boolean;
  auditRights: boolean;
  breachNotificationHours: number;
  liabilityCap?: number;
  regulatoryComplianceRequired: string[];
  ctdisrComplianceRequired: boolean;
  terminationNoticeDays: number;
  terminationForConvenience: boolean;
  terminationForCauseConditions: string[];
  contractDocumentUrl?: string;
  contractDocumentHash?: string;
  amendments: ContractAmendment[];
  approvedBy?: string;
  approvedAt?: Date;
  legalReviewCompleted: boolean;
  securityReviewCompleted: boolean;
  createdAt: Date;
  createdBy?: string;
  updatedAt: Date;
}

export interface ContractAmendment {
  id: string;
  date: Date;
  description: string;
  documentUrl?: string;
  approvedBy: string;
}

export interface TimeRestriction {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  timezone: string;
}

export interface VendorAccessPermission {
  id: string;
  vendorId: string;
  contractId?: string;
  permissionName: string;
  accessType: VendorAccessType;
  resourceType: string;
  resourceIdentifier: string;
  dataSensitivity?: DataSensitivity;
  dataTypes: string[];
  ipWhitelist: string[];
  timeRestrictions?: TimeRestriction;
  geoRestrictions: string[];
  grantedAt: Date;
  expiresAt?: Date;
  grantedBy: string;
  approvedBy?: string;
  isActive: boolean;
  revokedAt?: Date;
  revokedBy?: string;
  revocationReason?: string;
  lastReviewedAt?: Date;
  nextReviewAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface VendorAccessLog {
  id: string;
  vendorId: string;
  permissionId?: string;
  accessTime: Date;
  accessType: string;
  resourceAccessed?: string;
  sourceIp?: string;
  sourceLocation?: string;
  userAgent?: string;
  credentialsUsed?: string;
  action: string;
  success: boolean;
  dataAccessed: string[];
  recordsAffected?: number;
  riskScore?: number;
  anomalyDetected: boolean;
  anomalyDetails?: string;
  requestId?: string;
  sessionId?: string;
  createdAt: Date;
}

export interface VendorSecurityIncident {
  id: string;
  vendorId: string;
  incidentId?: string;
  incidentType: string;
  severity: VendorRiskLevel;
  description: string;
  occurredAt: Date;
  reportedAt: Date;
  resolvedAt?: Date;
  dataImpacted: boolean;
  dataTypesAffected: string[];
  systemsAffected: string[];
  vendorResponse?: string;
  vendorResponseTimeHours?: number;
  ourResponse?: string;
  rootCause?: string;
  vendorResponsible: boolean;
  remediationActions: RemediationAction[];
  remediationVerified: boolean;
  slaBreached: boolean;
  penaltiesApplied?: number;
  ptaNotified: boolean;
  ptaNotificationDate?: Date;
  createdAt: Date;
  createdBy?: string;
  updatedAt: Date;
}

export interface RemediationAction {
  action: string;
  assignedTo: string;
  dueDate: Date;
  completedAt?: Date;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface VendorCertification {
  id: string;
  vendorId: string;
  certificationName: string;
  certificationBody?: string;
  certificationNumber?: string;
  issuedAt: Date;
  expiresAt?: Date;
  isValid: boolean;
  scope?: string;
  verified: boolean;
  verifiedAt?: Date;
  verifiedBy?: string;
  certificateUrl?: string;
  certificateHash?: string;
  createdAt: Date;
}

export interface VendorPerformance {
  id: string;
  vendorId: string;
  contractId?: string;
  periodStart: Date;
  periodEnd: Date;
  uptimePercentage?: number;
  incidentsCount: number;
  criticalIncidents: number;
  avgResponseTimeHours?: number;
  avgResolutionTimeHours?: number;
  slaCompliancePercentage?: number;
  securityIncidents: number;
  vulnerabilitiesReported: number;
  vulnerabilitiesResolved: number;
  patchCompliancePercentage?: number;
  qualityScore?: number;
  customerSatisfactionScore?: number;
  notes?: string;
  createdAt: Date;
  createdBy?: string;
}

// ============ DTOs ============

export interface CreateVendorDto {
  name: string;
  legalName?: string;
  registrationNumber?: string;
  vendorType: string;
  country: string;
  city?: string;
  address?: string;
  isLocalVendor?: boolean;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  servicesProvided: string[];
  serviceCriticality?: VendorRiskLevel;
  hasDataAccess?: boolean;
  dataTypesAccessed?: string[];
  hasSystemAccess?: boolean;
  systemsAccessed?: string[];
  accessType?: VendorAccessType;
  certifications?: string[];
  ptaRegistered?: boolean;
  riskAssessmentFrequencyDays?: number;
}

export interface UpdateVendorStatusDto {
  status: VendorStatus;
  reason?: string;
}

export interface InitiateAssessmentDto {
  vendorId: string;
  assessmentType: 'initial' | 'periodic' | 'triggered';
  assessorId: string;
}

export interface SubmitAssessmentDto {
  questionnaireResponses: Record<string, unknown>;
  findings: AssessmentFinding[];
  recommendations: string[];
  decision: 'approve' | 'conditional_approve' | 'reject';
  decisionRationale?: string;
  conditions?: string[];
}

export interface CreateContractDto {
  vendorId: string;
  title: string;
  description?: string;
  contractType: string;
  effectiveDate: Date;
  expirationDate: Date;
  autoRenewal?: boolean;
  renewalNoticeDays?: number;
  totalValue?: number;
  currency?: string;
  paymentTerms?: string;
  slaTerms?: SlaTerm[];
  uptimeRequirement?: number;
  responseTimeSlaHours?: number;
  resolutionTimeSlaHours?: number;
  securityRequirements?: Record<string, unknown>;
  breachNotificationHours?: number;
  liabilityCap?: number;
  regulatoryComplianceRequired?: string[];
  terminationNoticeDays?: number;
}

export interface GrantAccessDto {
  vendorId: string;
  contractId?: string;
  permissionName: string;
  accessType: VendorAccessType;
  resourceType: string;
  resourceIdentifier: string;
  dataSensitivity?: DataSensitivity;
  dataTypes?: string[];
  ipWhitelist?: string[];
  timeRestrictions?: TimeRestriction;
  geoRestrictions?: string[];
  expiresAt?: Date;
}

export interface RevokeAccessDto {
  permissionId: string;
  reason: string;
}

export interface LogAccessDto {
  vendorId: string;
  permissionId?: string;
  accessType: string;
  resourceAccessed?: string;
  sourceIp?: string;
  action: string;
  success: boolean;
  dataAccessed?: string[];
  recordsAffected?: number;
}

export interface ReportIncidentDto {
  vendorId: string;
  incidentType: string;
  severity: VendorRiskLevel;
  description: string;
  occurredAt: Date;
  dataImpacted?: boolean;
  dataTypesAffected?: string[];
  systemsAffected?: string[];
}

export interface RecordPerformanceDto {
  vendorId: string;
  contractId?: string;
  periodStart: Date;
  periodEnd: Date;
  uptimePercentage?: number;
  incidentsCount?: number;
  criticalIncidents?: number;
  avgResponseTimeHours?: number;
  avgResolutionTimeHours?: number;
  slaCompliancePercentage?: number;
  securityIncidents?: number;
  qualityScore?: number;
  notes?: string;
}

// ============ Statistics ============

export interface VendorStatistics {
  totalVendors: number;
  byStatus: Record<VendorStatus, number>;
  byRiskLevel: Record<VendorRiskLevel, number>;
  byType: Record<string, number>;
  localVendors: number;
  withDataAccess: number;
  withSystemAccess: number;
  overdueAssessments: number;
  expiringContracts: number;
}

export interface VendorRiskSummary {
  vendorId: string;
  vendorName: string;
  riskLevel: VendorRiskLevel;
  lastAssessmentDate?: Date;
  assessmentStatus?: AssessmentStatus;
  openFindings: number;
  activeContracts: number;
  recentIncidents: number;
  accessPermissions: number;
  complianceScore: number;
}

export interface ThirdPartyRiskDashboard {
  summary: VendorStatistics;
  highRiskVendors: VendorRiskSummary[];
  expiringContracts: { vendor: string; contract: string; expiresAt: Date }[];
  overdueAssessments: { vendor: string; dueDate: Date }[];
  recentIncidents: VendorSecurityIncident[];
  accessAnomalies: VendorAccessLog[];
}
