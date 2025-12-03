/**
 * Audit Export Types and Interfaces
 * 
 * Type definitions for the PTA Audit Export system.
 * These types map to the database schema defined in
 * 20241202001_pta_audit_export.sql
 */

// ============================================
// Enum Types (matching PostgreSQL enums)
// ============================================

export enum ExportRunStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

// Alias for backward compatibility
export const ExportStatus = ExportRunStatus;

export enum ScheduleFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

// Alias for backward compatibility
export const ScheduleType = ScheduleFrequency;

export enum ExportFormat {
  CSV = 'csv',
  XLSX = 'xlsx',
  PDF = 'pdf',
  ALL = 'all',
}

export enum AccessAction {
  CREATE = 'CREATE',
  VIEW = 'VIEW',
  DOWNLOAD = 'DOWNLOAD',
  SHARE = 'SHARE',
  DELETE = 'DELETE',
}

export enum AuditExportType {
  IPDR_DAILY = 'IPDR_DAILY',
  IPDR_RANGE = 'IPDR_RANGE',
  RADIUS_AUTH_LOGS = 'RADIUS_AUTH_LOGS',
  SUBSCRIBER_ACTIVATION_DEACTIVATION = 'SUBSCRIBER_ACTIVATION_DEACTIVATION',
  KYC_VERISYS_LOGS = 'KYC_VERISYS_LOGS',
  COMPLAINTS_SUMMARY = 'COMPLAINTS_SUMMARY',
  OLT_ALARMS = 'OLT_ALARMS',
  LI_ACCESS_LOGS = 'LI_ACCESS_LOGS',
}

// ============================================
// Column Definition Types
// ============================================

export type ColumnDataType = 
  | 'string' 
  | 'integer' 
  | 'bigint' 
  | 'numeric'
  | 'boolean' 
  | 'date' 
  | 'timestamp'
  | 'timestamptz'
  | 'inet' 
  | 'macaddr'
  | 'uuid' 
  | 'json'
  | 'jsonb';

export interface ColumnDefinition {
  /** Database field name */
  db_field: string;
  
  /** PTA-compliant header name for export */
  pta_header: string;
  
  /** Data type for formatting */
  data_type: string;
  
  /** Whether this column is required */
  required?: boolean;
}

// ============================================
// Entity Types
// ============================================

export interface AuditExportTemplate {
  id: string;
  tenantId?: string;
  exportType: AuditExportType;
  displayName: string;
  description: string;
  columns: ColumnDefinition[];
  dateFilterField: string;
  sourceTables: string[];
  supportedFormats: ExportFormat[];
  maxRangeDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditExportRun {
  id: string;
  tenantId: string;
  templateId: string;
  exportType: AuditExportType;
  format: ExportFormat;
  status: ExportRunStatus;
  startDate: Date;
  endDate: Date;
  requestedBy: string;
  rowCount?: number;
  errorMessage?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface AuditExportFile {
  id: string;
  runId: string;
  filename: string;
  storagePath: string;
  fileSize: number;
  sha256Hash: string;
  mimeType: string;
  rowCount: number;
  createdAt: Date;
}

export interface AuditExportAccessLog {
  id: string;
  runId: string;
  fileId?: string;
  userId: string;
  action: AccessAction;
  ipAddress: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  hash: string;
  previousHash?: string;
  createdAt: Date;
}

export interface AuditExportSchedule {
  id: string;
  tenantId: string;
  exportType: AuditExportType;
  frequency: ScheduleFrequency;
  formats: ExportFormat[];
  isActive: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  notifyEmails?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Manifest Types
// ============================================

export interface FileManifestEntry {
  filename: string;
  size: number;
  sha256: string;
  rowCount: number;
  mimeType: string;
}

export interface FileManifest {
  version: string;
  generatedAt: string;
  generator: string;
  exportRunId: string;
  exportType: AuditExportType;
  dateRange: {
    start: string;
    end: string;
  };
  regionCode: string;
  files: FileManifestEntry[];
  totalRecords: number;
  integrityHash: string;
}

// ============================================
// Query/Filter Types
// ============================================

export interface ExportRunFilters {
  tenantId?: string;
  exportType?: AuditExportType;
  status?: ExportRunStatus;
  startDate?: Date;
  endDate?: Date;
  requestedBy?: string;
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================
// RBAC Types
// ============================================

export enum AuditExportRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  PTA_COMPLIANCE_OFFICER = 'PTA_COMPLIANCE_OFFICER',
  NOC_MANAGER = 'NOC_MANAGER',
  VIEW_ONLY_AUDIT = 'VIEW_ONLY_AUDIT',
}

export enum AuditExportPermission {
  CREATE_EXPORTS = 'CREATE_EXPORTS',
  VIEW_EXPORTS = 'VIEW_EXPORTS',
  DOWNLOAD_EXPORTS = 'DOWNLOAD_EXPORTS',
  MANAGE_TEMPLATES = 'MANAGE_TEMPLATES',
  MANAGE_SCHEDULES = 'MANAGE_SCHEDULES',
  VIEW_AUDIT_LOGS = 'VIEW_AUDIT_LOGS',
  DELETE_EXPORTS = 'DELETE_EXPORTS',
}

// For backward compatibility
export interface AuditExportPermissions {
  canCreateRuns: boolean;
  canViewRuns: boolean;
  canDownloadFiles: boolean;
  canManageTemplates: boolean;
  canManageSchedules: boolean;
  canViewAccessLogs: boolean;
  canArchiveRuns: boolean;
}

export const ROLE_PERMISSIONS: Record<AuditExportRole, AuditExportPermission[]> = {
  [AuditExportRole.SUPER_ADMIN]: [
    AuditExportPermission.CREATE_EXPORTS,
    AuditExportPermission.VIEW_EXPORTS,
    AuditExportPermission.DOWNLOAD_EXPORTS,
    AuditExportPermission.MANAGE_TEMPLATES,
    AuditExportPermission.MANAGE_SCHEDULES,
    AuditExportPermission.VIEW_AUDIT_LOGS,
    AuditExportPermission.DELETE_EXPORTS,
  ],
  [AuditExportRole.PTA_COMPLIANCE_OFFICER]: [
    AuditExportPermission.CREATE_EXPORTS,
    AuditExportPermission.VIEW_EXPORTS,
    AuditExportPermission.DOWNLOAD_EXPORTS,
    AuditExportPermission.MANAGE_TEMPLATES,
    AuditExportPermission.MANAGE_SCHEDULES,
    AuditExportPermission.VIEW_AUDIT_LOGS,
  ],
  [AuditExportRole.NOC_MANAGER]: [
    AuditExportPermission.VIEW_EXPORTS,
    AuditExportPermission.DOWNLOAD_EXPORTS,
  ],
  [AuditExportRole.VIEW_ONLY_AUDIT]: [
    AuditExportPermission.VIEW_EXPORTS,
  ],
};

// ============================================
// Constants
// ============================================

export const WANCOM_LICENSEE = {
  name: 'WANCOM (Pvt) Ltd',
  licenseNumber: 'PTA/FLL/XXXX', // Replace with actual license
  region: 'Pakistan',
};

export const PTA_COMPLIANCE = {
  framework: 'CTDISR 2020 / PTRA 1996',
  defaultRetentionDays: 365,
};

export const GENERATOR_VERSION = '1.0.0';

export const SUPPORTED_TIMEZONES = ['Asia/Karachi', 'UTC'];

export const DEFAULT_TIMEZONE = 'Asia/Karachi';

export const ZIP_FILE_NAME_PATTERN = 'WANCOM_{regionCode}_AUDIT_{typeCode}_{date}_{time}.zip';
