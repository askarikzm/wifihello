/**
 * NetAxis ISP - CTDISR-2025 Zero-Trust Access Control Types
 */

import { AssetClassification, IncidentSeverity, AccessAction } from '../types';

// ============================================
// ENUMS
// ============================================

export enum RoleType {
  STANDARD = 'STANDARD',
  PRIVILEGED = 'PRIVILEGED',
  SERVICE = 'SERVICE',
  TEMPORARY = 'TEMPORARY',
}

export enum SessionEndReason {
  LOGOUT = 'LOGOUT',
  TIMEOUT = 'TIMEOUT',
  FORCED = 'FORCED',
  EXPIRED = 'EXPIRED',
  ERROR = 'ERROR',
}

export enum JitStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ACTIVATED = 'ACTIVATED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

export enum AnomalyType {
  IMPOSSIBLE_TRAVEL = 'IMPOSSIBLE_TRAVEL',
  UNUSUAL_TIME = 'UNUSUAL_TIME',
  NEW_DEVICE = 'NEW_DEVICE',
  NEW_LOCATION = 'NEW_LOCATION',
  BRUTE_FORCE = 'BRUTE_FORCE',
  MASS_DATA_ACCESS = 'MASS_DATA_ACCESS',
  PRIVILEGE_ABUSE = 'PRIVILEGE_ABUSE',
  SESSION_HIJACK = 'SESSION_HIJACK',
}

export enum AnomalyStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  FALSE_POSITIVE = 'FALSE_POSITIVE',
  CONFIRMED = 'CONFIRMED',
  RESOLVED = 'RESOLVED',
}

// ============================================
// INTERFACES
// ============================================

export interface Role {
  id: string;
  roleCode: string;
  roleName: string;
  description?: string;
  roleType: RoleType;
  maxClassification: AssetClassification;
  isPrivileged: boolean;
  requiresMfa: boolean;
  requiresApproval: boolean;
  maxSessionDurationMinutes: number;
  maxConcurrentSessions: number;
  sessionTimeoutMinutes: number;
  ipRestricted: boolean;
  allowedIpRanges?: string[];
  timeRestricted: boolean;
  allowedHoursStart?: string;
  allowedHoursEnd?: string;
  allowedDays?: number[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  permissionCode: string;
  permissionName: string;
  description?: string;
  resourceType: string;
  action: string;
  requiresClassification?: AssetClassification;
  auditAccess: boolean;
  isActive: boolean;
  createdAt: Date;
}

export interface RolePermission {
  id: string;
  roleId: string;
  permissionId: string;
  conditions?: Record<string, unknown>;
  grantedAt: Date;
  grantedBy?: string;
  expiresAt?: Date;
}

export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  assignedAt: Date;
  assignedBy: string;
  expiresAt?: Date;
  assignmentReason: string;
  requiresApproval: boolean;
  approvalRequestId?: string;
  isActive: boolean;
  revokedAt?: Date;
  revokedBy?: string;
  revocationReason?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Joined data
  role?: Role;
}

export interface UserSession {
  id: string;
  sessionId: string;
  userId: string;
  startedAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
  endedAt?: Date;
  endReason?: SessionEndReason;
  ipAddress: string;
  userAgent?: string;
  deviceFingerprint?: string;
  geoCountry?: string;
  geoRegion?: string;
  geoCity?: string;
  authMethod: string;
  mfaVerified: boolean;
  mfaMethod?: string;
  riskScore: number;
  riskFactors: string[];
  actionsCount: number;
  sensitiveAccessCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionAction {
  id: number;
  sessionId: string;
  actionType: AccessAction;
  resourceType?: string;
  resourceId?: string;
  actionDetails?: Record<string, unknown>;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  ipAddress?: string;
  permissionCode?: string;
  performedAt: Date;
  durationMs?: number;
  previousHash?: string;
  recordHash: string;
}

export interface JitPrivilegeRequest {
  id: string;
  requestCode: string;
  userId: string;
  requestedRoleId: string;
  requestedPermissions?: string[];
  requestedDurationMinutes: number;
  maxDurationMinutes: number;
  justification: string;
  ticketReference?: string;
  targetResources?: Record<string, unknown>;
  approvalRequestId?: string;
  status: JitStatus;
  activatedAt?: Date;
  expiresAt?: Date;
  deactivatedAt?: Date;
  deactivationReason?: string;
  ipAddress: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Joined data
  requestedRole?: Role;
}

export interface AccessAnomaly {
  id: string;
  anomalyType: AnomalyType;
  severity: IncidentSeverity;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  description: string;
  evidence: Record<string, unknown>;
  baselineValue?: Record<string, unknown>;
  actualValue?: Record<string, unknown>;
  deviationScore?: number;
  autoBlocked: boolean;
  autoLogout: boolean;
  notificationSent: boolean;
  status: AnomalyStatus;
  investigatedBy?: string;
  investigationNotes?: string;
  resolvedAt?: Date;
  detectedAt: Date;
  createdAt: Date;
}

export interface UserAccessBaseline {
  id: string;
  userId: string;
  typicalLoginHours?: { start: string; end: string };
  typicalLoginDays?: number[];
  typicalIpRanges?: string[];
  typicalLocations?: Array<{ country: string; city?: string }>;
  knownDevices?: string[];
  typicalResources?: string[];
  typicalActionsPerHour?: number;
  typicalSensitiveAccessPerDay?: number;
  totalLogins: number;
  failedLoginStreak: number;
  lastLoginAt?: Date;
  lastIpAddress?: string;
  lastLocation?: Record<string, unknown>;
  baselineEstablishedAt?: Date;
  learningDataPoints: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// DTOs
// ============================================

export interface CreateRoleDto {
  roleCode: string;
  roleName: string;
  description?: string;
  roleType?: RoleType;
  maxClassification: AssetClassification;
  isPrivileged?: boolean;
  requiresMfa?: boolean;
  requiresApproval?: boolean;
  maxSessionDurationMinutes?: number;
  maxConcurrentSessions?: number;
  sessionTimeoutMinutes?: number;
  ipRestricted?: boolean;
  allowedIpRanges?: string[];
  timeRestricted?: boolean;
  allowedHoursStart?: string;
  allowedHoursEnd?: string;
  allowedDays?: number[];
}

export interface AssignRoleDto {
  userId: string;
  roleCode: string;
  assignmentReason: string;
  expiresAt?: string;
}

export interface CreateJitRequestDto {
  requestedRoleCode: string;
  requestedDurationMinutes: number;
  justification: string;
  ticketReference?: string;
  targetResources?: Record<string, unknown>;
}

export interface SessionStartDto {
  userId: string;
  ipAddress: string;
  userAgent?: string;
  deviceFingerprint?: string;
  authMethod: string;
  geoData?: {
    country?: string;
    region?: string;
    city?: string;
  };
}

// ============================================
// PERMISSION CHECKING
// ============================================

export interface PermissionCheck {
  userId: string;
  permissionCode: string;
  resourceType?: string;
  resourceId?: string;
  conditions?: Record<string, unknown>;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiresMfa?: boolean;
  requiresApproval?: boolean;
  maxClassification?: AssetClassification;
}

// ============================================
// ANOMALY DETECTION
// ============================================

export interface AnomalyCheckContext {
  userId: string;
  sessionId: string;
  ipAddress: string;
  geoData?: {
    country?: string;
    region?: string;
    city?: string;
  };
  deviceFingerprint?: string;
  action?: string;
  resourceType?: string;
}

export interface AnomalyDetectionResult {
  isAnomalous: boolean;
  anomalies: Array<{
    type: AnomalyType;
    severity: IncidentSeverity;
    description: string;
    evidence: Record<string, unknown>;
    deviationScore: number;
  }>;
  riskScore: number;
  recommendedAction?: 'ALLOW' | 'CHALLENGE' | 'BLOCK' | 'LOGOUT';
}
