/**
 * WANCOM ISP - CTDISR-2025 Compliance Types
 * Critical Telecom Data & Infrastructure Security Regulations 2025
 */

// ============================================
// ENUMS
// ============================================

export enum AssetClassification {
  CRITICAL = 'CRITICAL',       // Core infrastructure (RADIUS, OLT, BGP)
  SENSITIVE = 'SENSITIVE',     // Customer PII, billing, KYC
  CONFIDENTIAL = 'CONFIDENTIAL', // Internal operations
  PUBLIC = 'PUBLIC',           // Public-facing services
}

export enum IncidentSeverity {
  P1_CRITICAL = 'P1_CRITICAL', // Data breach, LI compromise, core infra down
  P2_HIGH = 'P2_HIGH',         // Significant security event
  P3_MEDIUM = 'P3_MEDIUM',     // Notable security event
  P4_LOW = 'P4_LOW',           // Minor security event
  P5_INFO = 'P5_INFO',         // Informational
}

export enum IncidentStatus {
  DETECTED = 'DETECTED',
  TRIAGED = 'TRIAGED',
  INVESTIGATING = 'INVESTIGATING',
  CONTAINING = 'CONTAINING',
  ERADICATING = 'ERADICATING',
  RECOVERING = 'RECOVERING',
  POST_INCIDENT = 'POST_INCIDENT',
  CLOSED = 'CLOSED',
  ESCALATED_PTA = 'ESCALATED_PTA',
}

export enum ViolationSeverity {
  CRITICAL = 'CRITICAL',   // Immediate PTA notification required
  HIGH = 'HIGH',           // CTO escalation within 1 hour
  MEDIUM = 'MEDIUM',       // Compliance officer review within 24h
  LOW = 'LOW',             // Routine review
  WARNING = 'WARNING',     // Advisory only
}

export enum ViolationStatus {
  OPEN = 'OPEN',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  INVESTIGATING = 'INVESTIGATING',
  REMEDIATION_PLANNED = 'REMEDIATION_PLANNED',
  REMEDIATION_IN_PROGRESS = 'REMEDIATION_IN_PROGRESS',
  REMEDIATION_VERIFIED = 'REMEDIATION_VERIFIED',
  CLOSED = 'CLOSED',
  FALSE_POSITIVE = 'FALSE_POSITIVE',
  ESCALATED_PTA = 'ESCALATED_PTA',
}

export enum AccessAction {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  MFA_CHALLENGE = 'MFA_CHALLENGE',
  MFA_SUCCESS = 'MFA_SUCCESS',
  MFA_FAILURE = 'MFA_FAILURE',
  PRIVILEGE_ESCALATION = 'PRIVILEGE_ESCALATION',
  PRIVILEGE_DEESCALATION = 'PRIVILEGE_DEESCALATION',
  SESSION_START = 'SESSION_START',
  SESSION_END = 'SESSION_END',
  SESSION_TIMEOUT = 'SESSION_TIMEOUT',
  ACCESS_DENIED = 'ACCESS_DENIED',
  RESOURCE_ACCESS = 'RESOURCE_ACCESS',
  DATA_EXPORT = 'DATA_EXPORT',
  CONFIG_CHANGE = 'CONFIG_CHANGE',
  SUBSCRIBER_DATA_ACCESS = 'SUBSCRIBER_DATA_ACCESS',
  LI_DATA_ACCESS = 'LI_DATA_ACCESS',
  AUDIT_LOG_ACCESS = 'AUDIT_LOG_ACCESS',
}

export enum VendorRiskRating {
  CRITICAL = 'CRITICAL',   // Access to critical infrastructure
  HIGH = 'HIGH',           // Access to sensitive data
  MEDIUM = 'MEDIUM',       // Limited access
  LOW = 'LOW',             // No sensitive access
  UNASSESSED = 'UNASSESSED',
}

export enum EncryptionAlgorithm {
  AES_256_GCM = 'AES_256_GCM',
  AES_256_CBC = 'AES_256_CBC',
  RSA_4096 = 'RSA_4096',
  RSA_2048 = 'RSA_2048',
  CHACHA20_POLY1305 = 'CHACHA20_POLY1305',
  ARGON2ID = 'ARGON2ID',
  BCRYPT = 'BCRYPT',
  SHA256 = 'SHA256',
  SHA384 = 'SHA384',
  SHA512 = 'SHA512',
}

export enum PolicyEnforcementMode {
  ENFORCE = 'ENFORCE',
  AUDIT_ONLY = 'AUDIT_ONLY',
  DISABLED = 'DISABLED',
}

export enum MfaType {
  TOTP = 'TOTP',
  SMS = 'SMS',
  EMAIL = 'EMAIL',
  HARDWARE_TOKEN = 'HARDWARE_TOKEN',
  BIOMETRIC = 'BIOMETRIC',
}

export enum SecurityEventCategory {
  AUTH = 'AUTH',
  ACCESS = 'ACCESS',
  CONFIG = 'CONFIG',
  NETWORK = 'NETWORK',
  DATA = 'DATA',
  INCIDENT = 'INCIDENT',
}

export enum SecurityEventOutcome {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  PARTIAL = 'PARTIAL',
  UNKNOWN = 'UNKNOWN',
}

// ============================================
// INTERFACES
// ============================================

export interface PolicyConfig {
  id: string;
  policyCode: string;
  policyName: string;
  policyDescription?: string;
  ctdisrSection: string;
  isEnabled: boolean;
  enforcementMode: PolicyEnforcementMode;
  configJson: Record<string, unknown>;
  violationSeverity: ViolationSeverity;
  autoBlock: boolean;
  notifyComplianceOfficer: boolean;
  notifyCto: boolean;
  notifyPta: boolean;
  version: number;
  effectiveFrom: Date;
  effectiveUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface Violation {
  id: string;
  violationCode: string;
  policyId?: string;
  severity: ViolationSeverity;
  status: ViolationStatus;
  actorUserId?: string;
  actorIpAddress?: string;
  actorUserAgent?: string;
  actorSessionId?: string;
  resourceType?: string;
  resourceId?: string;
  actionAttempted?: string;
  violationDescription: string;
  evidenceJson?: Record<string, unknown>;
  wasBlocked: boolean;
  blockReason?: string;
  detectedAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  remediationPlan?: string;
  remediationDeadline?: Date;
  remediationCompletedAt?: Date;
  remediationVerifiedBy?: string;
  escalatedToCto: boolean;
  escalatedToCtoAt?: Date;
  escalatedToPta: boolean;
  escalatedToPtaAt?: Date;
  ptaReferenceNumber?: string;
  previousHash?: string;
  recordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApprovalWorkflow {
  id: string;
  workflowCode: string;
  workflowName: string;
  description?: string;
  requiredApprovals: number;
  approverRoles: string[];
  approvalTimeoutHours: number;
  autoRejectOnTimeout: boolean;
  appliesToActions: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApprovalRequest {
  id: string;
  workflowId: string;
  requestCode: string;
  actionType: string;
  resourceType?: string;
  resourceId?: string;
  actionPayload?: Record<string, unknown>;
  requestedBy: string;
  requestedAt: Date;
  requestJustification: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  expiresAt: Date;
  resolvedAt?: Date;
  resolutionNotes?: string;
  executedAt?: Date;
  executionResult?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApprovalDecision {
  id: string;
  requestId: string;
  approverId: string;
  approverRole: string;
  decision: 'APPROVE' | 'REJECT';
  decisionNotes?: string;
  decidedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  mfaVerified: boolean;
  createdAt: Date;
}

export interface PrivilegedSession {
  id: string;
  sessionToken: string;
  userId: string;
  elevatedRole: string;
  originalRole: string;
  justification: string;
  approvalRequestId?: string;
  startedAt: Date;
  expiresAt: Date;
  endedAt?: Date;
  endReason?: 'EXPIRED' | 'MANUAL' | 'FORCED' | 'TIMEOUT';
  ipAddress: string;
  userAgent?: string;
  mfaMethod?: string;
  actionsPerformed: number;
  lastActivityAt?: Date;
  recordingEnabled: boolean;
  recordingPath?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrivilegedSessionLog {
  id: number;
  sessionId: string;
  actionType: AccessAction;
  actionTarget?: string;
  actionDetails?: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
  ipAddress?: string;
  performedAt: Date;
  previousHash?: string;
  recordHash: string;
}

export interface MfaEnrollment {
  id: string;
  userId: string;
  mfaType: MfaType;
  secretEncrypted?: string;
  deviceInfo?: Record<string, unknown>;
  isPrimary: boolean;
  isVerified: boolean;
  verifiedAt?: Date;
  lastUsedAt?: Date;
  useCount: number;
  recoveryCodesHash?: string;
  recoveryCodesRemaining: number;
  createdAt: Date;
  updatedAt: Date;
  revokedAt?: Date;
  revokedReason?: string;
}

export interface MfaChallenge {
  id: string;
  userId: string;
  enrollmentId?: string;
  challengeType: string;
  challengeCodeHash?: string;
  ipAddress: string;
  userAgent?: string;
  triggerAction?: string;
  status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'EXPIRED';
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  expiresAt: Date;
  verifiedAt?: Date;
  failureReason?: string;
}

export interface IpAllowlist {
  id: string;
  scopeType: 'GLOBAL' | 'ROLE' | 'USER' | 'RESOURCE';
  scopeId?: string;
  ipRange: string;
  description?: string;
  isActive: boolean;
  validFrom: Date;
  validUntil?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  requiresApproval: boolean;
  approvalId?: string;
}

export interface IpBlocklist {
  id: string;
  ipRange: string;
  blockReason: string;
  threatType?: 'BRUTE_FORCE' | 'SUSPICIOUS' | 'KNOWN_BAD' | 'GEO_RESTRICTED';
  autoBlocked: boolean;
  triggeredByViolationId?: string;
  blockedAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  unblockedAt?: Date;
  unblockedBy?: string;
  unblockReason?: string;
  createdAt: Date;
}

export interface SecurityEvent {
  id: number;
  eventId: string;
  eventType: string;
  eventCategory: SecurityEventCategory;
  severity: IncidentSeverity;
  sourceSystem: string;
  sourceComponent?: string;
  actorType?: 'USER' | 'SYSTEM' | 'EXTERNAL';
  actorId?: string;
  actorIp?: string;
  actorGeo?: {
    country?: string;
    city?: string;
    region?: string;
  };
  targetType?: string;
  targetId?: string;
  action: string;
  outcome: SecurityEventOutcome;
  details?: Record<string, unknown>;
  correlationId?: string;
  parentEventId?: number;
  eventTime: Date;
  receivedAt: Date;
  forwardedToSiem: boolean;
  forwardedAt?: Date;
  previousHash?: string;
  recordHash: string;
}

// ============================================
// REQUEST CONTEXT
// ============================================

export interface CtdisrContext {
  userId?: string;
  sessionId?: string;
  ipAddress: string;
  userAgent?: string;
  correlationId: string;
  mfaVerified?: boolean;
  privilegedSession?: PrivilegedSession;
  roles: string[];
  assetClassification?: AssetClassification;
}

// ============================================
// POLICY EVALUATION
// ============================================

export interface PolicyEvaluationResult {
  policyCode: string;
  allowed: boolean;
  enforcementMode: PolicyEnforcementMode;
  violationCreated: boolean;
  violationId?: string;
  blockReason?: string;
  auditMessage?: string;
}

export interface PolicyCheckRequest {
  action: string;
  resourceType: string;
  resourceId?: string;
  context: CtdisrContext;
  additionalData?: Record<string, unknown>;
}

// ============================================
// HASH CHAIN
// ============================================

export interface HashChainRecord {
  recordId: string;
  tableName: string;
  previousHash?: string;
  recordHash: string;
  data: Record<string, unknown>;
  createdAt: Date;
}

export interface HashChainVerificationResult {
  tableName: string;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  brokenChainAt?: string;
  isValid: boolean;
  verifiedAt: Date;
}

// ============================================
// SIEM INTEGRATION
// ============================================

export interface SiemEvent {
  timestamp: string;
  eventId: string;
  severity: string;
  category: string;
  source: {
    system: string;
    component?: string;
    ip?: string;
  };
  actor?: {
    type: string;
    id?: string;
    name?: string;
    ip?: string;
  };
  target?: {
    type: string;
    id?: string;
    name?: string;
  };
  action: {
    name: string;
    outcome: string;
  };
  details?: Record<string, unknown>;
  correlation?: {
    id: string;
    parentEventId?: string;
  };
  raw?: Record<string, unknown>;
}

// ============================================
// COMPLIANCE REPORT
// ============================================

export interface ComplianceReportSection {
  sectionCode: string;
  sectionName: string;
  totalPolicies: number;
  enabledPolicies: number;
  violations: {
    total: number;
    open: number;
    remediated: number;
    escalatedPta: number;
  };
  complianceScore: number; // 0-100
}

export interface ComplianceReport {
  reportId: string;
  reportDate: Date;
  reportPeriod: {
    from: Date;
    to: Date;
  };
  overallScore: number;
  sections: ComplianceReportSection[];
  criticalFindings: Violation[];
  remediationStatus: {
    pending: number;
    inProgress: number;
    completed: number;
    overdue: number;
  };
  generatedBy: string;
  generatedAt: Date;
}
