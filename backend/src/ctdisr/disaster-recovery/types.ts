/**
 * CTDISR-2025 Disaster Recovery & Business Continuity Types
 * PTA Regulation: Chapter 8 - Business Continuity & Disaster Recovery
 */

// ============ Enums ============

export enum DrPlanStatus {
  DRAFT = 'draft',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  ARCHIVED = 'archived',
}

export enum RecoveryPriority {
  CRITICAL = 'critical',    // RTO < 1 hour
  HIGH = 'high',            // RTO < 4 hours
  MEDIUM = 'medium',        // RTO < 24 hours
  LOW = 'low',              // RTO < 72 hours
  NON_CRITICAL = 'non_critical', // RTO > 72 hours
}

export enum BackupType {
  FULL = 'full',
  INCREMENTAL = 'incremental',
  DIFFERENTIAL = 'differential',
  SNAPSHOT = 'snapshot',
  CONTINUOUS = 'continuous',
}

export enum BackupStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  VERIFIED = 'verified',
  EXPIRED = 'expired',
}

export enum DrTestType {
  TABLETOP = 'tabletop',
  WALKTHROUGH = 'walkthrough',
  SIMULATION = 'simulation',
  PARALLEL = 'parallel',
  FULL_INTERRUPTION = 'full_interruption',
}

export enum DrTestResult {
  PASSED = 'passed',
  PASSED_WITH_ISSUES = 'passed_with_issues',
  FAILED = 'failed',
  ABORTED = 'aborted',
}

export enum FailoverStatus {
  STANDBY = 'standby',
  INITIATING = 'initiating',
  IN_PROGRESS = 'in_progress',
  ACTIVE = 'active',
  FAILING_BACK = 'failing_back',
  FAILED = 'failed',
}

// ============ Interfaces ============

export interface ContactInfo {
  name: string;
  role: string;
  phone: string;
  email: string;
  alternatePhone?: string;
}

export interface RecoveryStep {
  stepNumber: number;
  title: string;
  description: string;
  responsible: string;
  estimatedMinutes: number;
  dependencies?: number[];
  verificationCriteria?: string;
  automationScript?: string;
}

export interface BusinessContinuityPlan {
  id: string;
  planNumber: string;
  name: string;
  description?: string;
  version: string;
  status: DrPlanStatus;
  ownerId?: string;
  department?: string;
  scope?: string;
  coveredSystems: string[];
  coveredProcesses: string[];
  rtoHours: number;
  rpoHours: number;
  mtpdHours?: number;
  planDocumentUrl?: string;
  planDocumentHash?: string;
  lastReviewedAt?: Date;
  nextReviewAt?: Date;
  reviewFrequencyDays: number;
  approvedBy?: string;
  approvedAt?: Date;
  lastActivatedAt?: Date;
  activationCount: number;
  createdAt: Date;
  createdBy?: string;
  updatedAt: Date;
}

export interface DisasterRecoveryPlan {
  id: string;
  planNumber: string;
  bcpId?: string;
  name: string;
  description?: string;
  version: string;
  status: DrPlanStatus;
  priority: RecoveryPriority;
  targetSystems: string[];
  targetAssets: string[];
  primarySite: string;
  secondarySite?: string;
  tertiarySite?: string;
  rtoMinutes: number;
  rpoMinutes: number;
  recoveryProcedures: RecoveryStep[];
  rollbackProcedures: RecoveryStep[];
  dependencies: Record<string, unknown>;
  upstreamSystems: string[];
  downstreamSystems: string[];
  primaryContact?: ContactInfo;
  escalationContacts: ContactInfo[];
  vendorContacts: ContactInfo[];
  lastTestedAt?: Date;
  lastTestResult?: DrTestResult;
  nextTestDate?: Date;
  testFrequencyDays: number;
  runbookUrl?: string;
  architectureDiagramUrl?: string;
  createdAt: Date;
  createdBy?: string;
  updatedAt: Date;
}

export interface BackupSchedule {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  targetType: string;
  targetIdentifier: string;
  targetAssetId?: string;
  backupType: BackupType;
  cronExpression: string;
  timezone: string;
  retentionDays: number;
  retentionCopies?: number;
  primaryStorage: string;
  secondaryStorage?: string;
  offsiteStorage?: string;
  encryptionEnabled: boolean;
  encryptionKeyId?: string;
  priority: RecoveryPriority;
  verifyAfterBackup: boolean;
  verificationMethod?: string;
  lastRunAt?: Date;
  lastRunStatus?: BackupStatus;
  nextRunAt?: Date;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  avgDurationSeconds?: number;
  avgSizeBytes?: number;
  createdAt: Date;
  createdBy?: string;
  updatedAt: Date;
}

export interface BackupExecution {
  id: string;
  scheduleId: string;
  backupType: BackupType;
  status: BackupStatus;
  startedAt: Date;
  completedAt?: Date;
  durationSeconds?: number;
  sourceSizeBytes?: number;
  backupSizeBytes?: number;
  compressionRatio?: number;
  primaryLocation?: string;
  secondaryLocation?: string;
  offsiteLocation?: string;
  checksumAlgorithm: string;
  checksumValue?: string;
  encrypted: boolean;
  verified: boolean;
  verifiedAt?: Date;
  verificationMethod?: string;
  verificationResult?: string;
  restoreTested: boolean;
  restoreTestedAt?: Date;
  restoreDurationSeconds?: number;
  errorMessage?: string;
  errorDetails?: Record<string, unknown>;
  retryCount: number;
  expiresAt?: Date;
  isExpired: boolean;
  createdAt: Date;
}

export interface DrTest {
  id: string;
  testNumber: string;
  drPlanId: string;
  testType: DrTestType;
  name: string;
  description?: string;
  objectives: string[];
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  durationMinutes?: number;
  testLead?: string;
  participants: string[];
  observers: string[];
  scenarioDescription: string;
  simulatedDisasterType?: string;
  affectedSystems: string[];
  result?: DrTestResult;
  actualRtoMinutes?: number;
  actualRpoMinutes?: number;
  rtoMet?: boolean;
  rpoMet?: boolean;
  findings?: string;
  issuesFound: DrTestIssue[];
  recommendations: string[];
  actionItems: DrTestActionItem[];
  testReportUrl?: string;
  evidenceUrls: string[];
  followUpDate?: Date;
  followUpCompleted: boolean;
  createdAt: Date;
  createdBy?: string;
  updatedAt: Date;
}

export interface DrTestIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  system?: string;
  rootCause?: string;
  resolution?: string;
  resolved: boolean;
}

export interface DrTestActionItem {
  id: string;
  title: string;
  description: string;
  assignedTo: string;
  dueDate: Date;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
}

export interface FailoverEvent {
  id: string;
  eventNumber: string;
  drPlanId?: string;
  incidentId?: string;
  eventType: 'planned' | 'unplanned' | 'test';
  status: FailoverStatus;
  sourceSite: string;
  targetSite: string;
  initiatedAt?: Date;
  activatedAt?: Date;
  completedAt?: Date;
  failbackAt?: Date;
  triggerType: 'manual' | 'automatic' | 'scheduled';
  triggeredBy?: string;
  triggerReason?: string;
  systemsAffected: string[];
  servicesAffected: string[];
  actualDowntimeSeconds?: number;
  dataLossSeconds?: number;
  statusUpdates: FailoverStatusUpdate[];
  issuesEncountered: FailoverIssue[];
  resolutionSteps: string[];
  postMortemUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FailoverStatusUpdate {
  timestamp: Date;
  status: FailoverStatus;
  message: string;
  updatedBy?: string;
}

export interface FailoverIssue {
  timestamp: Date;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  resolved: boolean;
  resolution?: string;
}

export interface RecoveryPoint {
  id: string;
  systemIdentifier: string;
  assetId?: string;
  recoveryPointTime: Date;
  backupId?: string;
  isValid: boolean;
  isCurrent: boolean;
  primaryLocation: string;
  replicaLocations: string[];
  integrityVerified: boolean;
  lastVerification?: Date;
  checksum?: string;
  sizeBytes?: number;
  retentionUntil?: Date;
  isProtected: boolean;
  estimatedRecoveryTimeMinutes?: number;
  recoveryTested: boolean;
  lastRecoveryTest?: Date;
  createdAt: Date;
}

export interface BcpActivation {
  id: string;
  bcpId: string;
  activationReason: string;
  severity: RecoveryPriority;
  activatedAt: Date;
  deactivatedAt?: Date;
  durationHours?: number;
  activatedBy: string;
  deactivatedBy?: string;
  affectedDepartments: string[];
  affectedProcesses: string[];
  estimatedImpact?: string;
  actualImpact?: string;
  actionsTaken: BcpAction[];
  lessonsLearned?: string;
  improvementsIdentified: string[];
  ptaNotified: boolean;
  ptaNotificationTime?: Date;
  createdAt: Date;
}

export interface BcpAction {
  timestamp: Date;
  action: string;
  performedBy: string;
  result?: string;
}

// ============ DTOs ============

export interface CreateBcpDto {
  name: string;
  description?: string;
  department?: string;
  scope?: string;
  coveredSystems?: string[];
  coveredProcesses?: string[];
  rtoHours: number;
  rpoHours: number;
  mtpdHours?: number;
  reviewFrequencyDays?: number;
}

export interface CreateDrpDto {
  bcpId?: string;
  name: string;
  description?: string;
  priority: RecoveryPriority;
  targetSystems: string[];
  targetAssets?: string[];
  primarySite: string;
  secondarySite?: string;
  rtoMinutes: number;
  rpoMinutes: number;
  recoveryProcedures: RecoveryStep[];
  rollbackProcedures?: RecoveryStep[];
  primaryContact?: ContactInfo;
  escalationContacts?: ContactInfo[];
  testFrequencyDays?: number;
}

export interface CreateBackupScheduleDto {
  name: string;
  description?: string;
  targetType: string;
  targetIdentifier: string;
  targetAssetId?: string;
  backupType: BackupType;
  cronExpression: string;
  timezone?: string;
  retentionDays: number;
  retentionCopies?: number;
  primaryStorage: string;
  secondaryStorage?: string;
  offsiteStorage?: string;
  priority?: RecoveryPriority;
  verifyAfterBackup?: boolean;
  verificationMethod?: string;
}

export interface ScheduleDrTestDto {
  drPlanId: string;
  testType: DrTestType;
  name: string;
  description?: string;
  objectives: string[];
  scheduledAt: Date;
  testLead: string;
  participants?: string[];
  scenarioDescription: string;
  simulatedDisasterType?: string;
}

export interface InitiateFailoverDto {
  drPlanId: string;
  eventType: 'planned' | 'unplanned' | 'test';
  targetSite: string;
  triggerReason: string;
}

export interface ActivateBcpDto {
  bcpId: string;
  activationReason: string;
  severity: RecoveryPriority;
  affectedDepartments?: string[];
  affectedProcesses?: string[];
  estimatedImpact?: string;
}

// ============ Statistics ============

export interface DrStatistics {
  totalBcps: number;
  activeBcps: number;
  totalDrps: number;
  activeDrps: number;
  testsThisYear: number;
  testPassRate: number;
  avgRtoAchievement: number;
  avgRpoAchievement: number;
  overduePlansReview: number;
  overdueTests: number;
}

export interface BackupStatistics {
  totalSchedules: number;
  activeSchedules: number;
  totalBackups: number;
  successRate: number;
  avgBackupSizeGb: number;
  totalStorageUsedGb: number;
  failedBackupsLast24h: number;
  pendingVerifications: number;
  expiringNext7Days: number;
}

export interface RecoveryCapability {
  systemIdentifier: string;
  currentRpo: number;  // In minutes
  targetRpo: number;
  rpoCompliant: boolean;
  estimatedRto: number;
  targetRto: number;
  rtoCompliant: boolean;
  lastBackup: Date;
  lastSuccessfulTest?: Date;
  recoveryPointsAvailable: number;
}
