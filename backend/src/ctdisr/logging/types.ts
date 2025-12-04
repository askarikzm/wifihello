/**
 * NetAxis ISP - CTDISR-2025 Logging Types
 */

// ============================================
// AUDIT LOG TYPES
// ============================================

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export enum EventCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  DATA_ACCESS = 'data_access',
  DATA_MODIFICATION = 'data_modification',
  CONFIGURATION = 'configuration',
  NETWORK = 'network',
  SECURITY = 'security',
  SYSTEM = 'system',
  COMPLIANCE = 'compliance',
  USER_ACTIVITY = 'user_activity',
}

export enum ActorType {
  USER = 'user',
  ADMIN = 'admin',
  SYSTEM = 'system',
  SERVICE = 'service',
  API = 'api',
}

export enum AuditOutcome {
  SUCCESS = 'success',
  FAILURE = 'failure',
  PARTIAL = 'partial',
  PENDING = 'pending',
}

export interface GeoLocation {
  country?: string;
  region?: string;
  city?: string;
  lat?: number;
  lon?: number;
}

export interface AuditLogEntry {
  id: string;
  logId: string;
  timestamp: Date;
  logLevel: LogLevel;
  eventType: string;
  eventCategory: EventCategory;
  domain: string;
  sourceSystem: string;
  sourceComponent?: string;
  actorId?: string;
  actorType?: ActorType;
  actorEmail?: string;
  actorIp?: string;
  actorUserAgent?: string;
  sessionId?: string;
  requestId?: string;
  resourceType?: string;
  resourceId?: string;
  action: string;
  outcome: AuditOutcome;
  outcomeReason?: string;
  affectedCount?: number;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  geoLocation?: GeoLocation;
  riskScore?: number;
  tags?: string[];
  correlationId?: string;
  parentEventId?: string;
  hashChain?: string;
  forwardedToSiem?: boolean;
  siemForwardedAt?: Date;
  retentionDays?: number;
  createdAt: Date;
}

export interface CreateAuditLogDto {
  eventType: string;
  eventCategory: EventCategory;
  domain: string;
  sourceSystem?: string;
  sourceComponent?: string;
  actorId?: string;
  actorType?: ActorType;
  actorEmail?: string;
  actorIp?: string;
  actorUserAgent?: string;
  sessionId?: string;
  requestId?: string;
  resourceType?: string;
  resourceId?: string;
  action: string;
  outcome: AuditOutcome;
  outcomeReason?: string;
  affectedCount?: number;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  geoLocation?: GeoLocation;
  riskScore?: number;
  tags?: string[];
  correlationId?: string;
  parentEventId?: string;
}

// ============================================
// SIEM TYPES
// ============================================

export enum SiemTarget {
  SPLUNK = 'splunk',
  ELASTICSEARCH = 'elasticsearch',
  SENTINEL = 'sentinel',
  QRADAR = 'qradar',
  SYSLOG = 'syslog',
}

export enum SiemQueueStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SENT = 'sent',
  FAILED = 'failed',
  DEAD_LETTER = 'dead_letter',
}

export interface SiemQueueEntry {
  id: string;
  auditLogId: string;
  siemTarget: SiemTarget;
  payload: Record<string, unknown>;
  priority: number;
  retryCount: number;
  maxRetries: number;
  status: SiemQueueStatus;
  lastError?: string;
  scheduledAt: Date;
  processedAt?: Date;
  createdAt: Date;
}

export interface SiemConfig {
  target: SiemTarget;
  enabled: boolean;
  endpoint: string;
  apiKey?: string;
  username?: string;
  password?: string;
  index?: string;
  batchSize: number;
  flushIntervalMs: number;
  retryDelayMs: number;
  maxRetries: number;
}

// ============================================
// ALERT TYPES
// ============================================

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum AlertChannel {
  EMAIL = 'email',
  SMS = 'sms',
  SLACK = 'slack',
  PAGERDUTY = 'pagerduty',
  WEBHOOK = 'webhook',
}

export interface AlertRule {
  id: string;
  ruleName: string;
  description?: string;
  eventPattern: Record<string, unknown>;
  thresholdCount: number;
  thresholdWindowMinutes: number;
  severity: AlertSeverity;
  alertChannels: AlertChannel[];
  recipients: {
    email?: string[];
    phone?: string[];
    webhook?: string[];
  };
  isActive: boolean;
  cooldownMinutes: number;
  lastTriggeredAt?: Date;
  triggerCount: number;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAlertRuleDto {
  ruleName: string;
  description?: string;
  eventPattern: Record<string, unknown>;
  thresholdCount?: number;
  thresholdWindowMinutes?: number;
  severity: AlertSeverity;
  alertChannels: AlertChannel[];
  recipients: {
    email?: string[];
    phone?: string[];
    webhook?: string[];
  };
  cooldownMinutes?: number;
}

export interface AlertHistoryEntry {
  id: string;
  ruleId: string;
  alertTitle: string;
  alertBody: string;
  severity: AlertSeverity;
  triggeringEvents: string[];
  channelsNotified: AlertChannel[];
  notificationStatus: Record<string, unknown>;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionNotes?: string;
  createdAt: Date;
}

// ============================================
// DATA ACCESS LOG TYPES
// ============================================

export enum DataClassification {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  RESTRICTED = 'restricted',
  TOP_SECRET = 'top_secret',
}

export enum DataAccessType {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  EXPORT = 'export',
  BULK_READ = 'bulk_read',
}

export interface DataAccessLogEntry {
  id: string;
  timestamp: Date;
  accessorId: string;
  accessorType: string;
  dataClassification: DataClassification;
  dataCategory: string;
  tableName?: string;
  recordIds?: string[];
  fieldsAccessed?: string[];
  accessType: DataAccessType;
  purpose?: string;
  accessGranted: boolean;
  denialReason?: string;
  ipAddress?: string;
  sessionId?: string;
  dataVolumeBytes?: number;
  recordCount?: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateDataAccessLogDto {
  accessorId: string;
  accessorType: string;
  dataClassification: DataClassification;
  dataCategory: string;
  tableName?: string;
  recordIds?: string[];
  fieldsAccessed?: string[];
  accessType: DataAccessType;
  purpose?: string;
  accessGranted: boolean;
  denialReason?: string;
  ipAddress?: string;
  sessionId?: string;
  dataVolumeBytes?: number;
  recordCount?: number;
  metadata?: Record<string, unknown>;
}

// ============================================
// LOG SEARCH TYPES
// ============================================

export interface AuditLogSearchParams {
  startTime?: Date;
  endTime?: Date;
  eventTypes?: string[];
  categories?: EventCategory[];
  actors?: string[];
  outcomes?: AuditOutcome[];
  minRiskScore?: number;
  searchText?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogSummary {
  totalEvents: number;
  eventsByLevel: Record<string, number>;
  eventsByCategory: Record<string, number>;
  failureCount: number;
  highRiskEvents: number;
  uniqueActors: number;
  pendingSiemQueue: number;
  unacknowledgedAlerts: number;
  generatedAt: Date;
}

// ============================================
// RETENTION TYPES
// ============================================

export interface RetentionPolicy {
  id: string;
  policyName: string;
  tableName: string;
  retentionDays: number;
  archiveBeforeDelete: boolean;
  archiveDestination?: string;
  deleteCondition?: string;
  isActive: boolean;
  lastRunAt?: Date;
  recordsArchived: number;
  recordsDeleted: number;
  createdAt: Date;
  updatedAt: Date;
}
