/**
 * Audit Export Repository
 * 
 * Data access layer for audit export operations.
 * Uses Supabase client for PostgreSQL operations.
 */

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseClientService } from '../../database/supabase-client.service';
import {
  AuditExportTemplate,
  AuditExportRun,
  AuditExportFile,
  AuditExportAccessLog,
  AuditExportSchedule,
  RegionCode,
  ExportStatus,
  ScheduleType,
  ExportFormat,
  AccessAction,
  ExportRunFilters,
  PaginationOptions,
  PaginatedResult,
  ExportManifest,
} from '../types';

@Injectable()
export class AuditExportRepository {
  private readonly logger = new Logger(AuditExportRepository.name);

  constructor(private readonly supabase: SupabaseClientService) {}

  // ============================================
  // Template Operations
  // ============================================

  async findAllTemplates(enabledOnly = true): Promise<AuditExportTemplate[]> {
    const client = this.supabase.getClient();
    let query = client
      .from('audit_export.templates')
      .select('*')
      .order('code');

    if (enabledOnly) {
      query = query.eq('enabled', true);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error('Failed to fetch templates', error);
      throw error;
    }

    return this.mapTemplates(data || []);
  }

  async findTemplateByCode(code: string): Promise<AuditExportTemplate | null> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('audit_export.templates')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to fetch template ${code}`, error);
      throw error;
    }

    return data ? this.mapTemplate(data) : null;
  }

  async findTemplateById(id: string): Promise<AuditExportTemplate | null> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('audit_export.templates')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to fetch template ${id}`, error);
      throw error;
    }

    return data ? this.mapTemplate(data) : null;
  }

  async createTemplate(template: Partial<AuditExportTemplate>): Promise<AuditExportTemplate> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('audit_export.templates')
      .insert(this.unmapTemplate(template))
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to create template', error);
      throw error;
    }

    return this.mapTemplate(data);
  }

  async updateTemplate(id: string, updates: Partial<AuditExportTemplate>): Promise<AuditExportTemplate> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('audit_export.templates')
      .update(this.unmapTemplate(updates))
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update template ${id}`, error);
      throw error;
    }

    return this.mapTemplate(data);
  }

  // ============================================
  // Run Operations
  // ============================================

  async createRun(run: {
    templateId: string;
    requestedByUserId: string;
    regionCode: string;
    typeCode: string;
    dateFrom: Date | null;
    dateTo: Date | null;
    scheduleType: ScheduleType;
    scheduleId?: string;
  }): Promise<AuditExportRun> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('audit_export.runs')
      .insert({
        template_id: run.templateId,
        requested_by_user_id: run.requestedByUserId,
        region_code: run.regionCode,
        type_code: run.typeCode,
        date_from: run.dateFrom?.toISOString(),
        date_to: run.dateTo?.toISOString(),
        schedule_type: run.scheduleType,
        schedule_id: run.scheduleId,
        status: ExportStatus.PENDING,
      })
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to create run', error);
      throw error;
    }

    return this.mapRun(data);
  }

  async findRunById(id: string): Promise<AuditExportRun | null> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('audit_export.runs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to fetch run ${id}`, error);
      throw error;
    }

    return data ? this.mapRun(data) : null;
  }

  async findRuns(
    filters: ExportRunFilters,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<AuditExportRun>> {
    const client = this.supabase.getClient();
    const { page, limit, sortBy = 'requested_at', sortOrder = 'desc' } = pagination;
    const offset = (page - 1) * limit;

    let query = client
      .from('audit_export.runs')
      .select('*', { count: 'exact' });

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.templateCode) {
      query = query.eq('type_code', filters.templateCode);
    }
    if (filters.regionCode) {
      query = query.eq('region_code', filters.regionCode);
    }
    if (filters.scheduleType) {
      query = query.eq('schedule_type', filters.scheduleType);
    }
    if (filters.requestedByUserId) {
      query = query.eq('requested_by_user_id', filters.requestedByUserId);
    }
    if (filters.dateFrom) {
      query = query.gte('requested_at', filters.dateFrom.toISOString());
    }
    if (filters.dateTo) {
      query = query.lte('requested_at', filters.dateTo.toISOString());
    }

    // Apply sorting and pagination
    const dbSortBy = this.camelToSnake(sortBy);
    query = query
      .order(dbSortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      this.logger.error('Failed to fetch runs', error);
      throw error;
    }

    return {
      data: (data || []).map(r => this.mapRun(r)),
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  async findPendingRuns(limit = 10): Promise<AuditExportRun[]> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('audit_export.runs')
      .select('*')
      .eq('status', ExportStatus.PENDING)
      .order('requested_at', { ascending: true })
      .limit(limit);

    if (error) {
      this.logger.error('Failed to fetch pending runs', error);
      throw error;
    }

    return (data || []).map(r => this.mapRun(r));
  }

  async updateRunStatus(
    id: string,
    status: ExportStatus,
    updates?: Partial<{
      startedAt: Date;
      completedAt: Date;
      errorMessage: string;
      errorCode: string;
      totalRows: number;
      fileCount: number;
      totalSizeBytes: number;
      zipFileName: string;
      zipStoragePath: string;
      zipSha256Hash: string;
      manifest: ExportManifest;
      retryCount: number;
    }>,
  ): Promise<AuditExportRun> {
    const client = this.supabase.getClient();
    
    const updateData: Record<string, unknown> = { status };
    
    if (updates) {
      if (updates.startedAt) updateData.started_at = updates.startedAt.toISOString();
      if (updates.completedAt) updateData.completed_at = updates.completedAt.toISOString();
      if (updates.errorMessage !== undefined) updateData.error_message = updates.errorMessage;
      if (updates.errorCode !== undefined) updateData.error_code = updates.errorCode;
      if (updates.totalRows !== undefined) updateData.total_rows = updates.totalRows;
      if (updates.fileCount !== undefined) updateData.file_count = updates.fileCount;
      if (updates.totalSizeBytes !== undefined) updateData.total_size_bytes = updates.totalSizeBytes;
      if (updates.zipFileName) updateData.zip_file_name = updates.zipFileName;
      if (updates.zipStoragePath) updateData.zip_storage_path = updates.zipStoragePath;
      if (updates.zipSha256Hash) updateData.zip_sha256_hash = updates.zipSha256Hash;
      if (updates.manifest) updateData.manifest = updates.manifest;
      if (updates.retryCount !== undefined) updateData.retry_count = updates.retryCount;
    }

    const { data, error } = await client
      .from('audit_export.runs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update run ${id}`, error);
      throw error;
    }

    return this.mapRun(data);
  }

  // ============================================
  // File Operations
  // ============================================

  async createFile(file: {
    runId: string;
    fileName: string;
    storagePath: string;
    format: ExportFormat;
    sha256Hash: string;
    sizeBytes: number;
    rowCount: number;
    metadata?: Record<string, unknown>;
  }): Promise<AuditExportFile> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('audit_export.files')
      .insert({
        run_id: file.runId,
        file_name: file.fileName,
        storage_path: file.storagePath,
        format: file.format,
        sha256_hash: file.sha256Hash,
        size_bytes: file.sizeBytes,
        row_count: file.rowCount,
        metadata: file.metadata || {},
      })
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to create file record', error);
      throw error;
    }

    return this.mapFile(data);
  }

  async findFilesByRunId(runId: string): Promise<AuditExportFile[]> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('audit_export.files')
      .select('*')
      .eq('run_id', runId)
      .order('created_at');

    if (error) {
      this.logger.error(`Failed to fetch files for run ${runId}`, error);
      throw error;
    }

    return (data || []).map(f => this.mapFile(f));
  }

  async findFileById(id: string): Promise<AuditExportFile | null> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('audit_export.files')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to fetch file ${id}`, error);
      throw error;
    }

    return data ? this.mapFile(data) : null;
  }

  // ============================================
  // Access Log Operations
  // ============================================

  async logAccess(log: {
    runId: string;
    fileId?: string;
    accessedByUserId: string;
    accessedByRole?: string;
    action: AccessAction;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    errorMessage?: string;
  }): Promise<AuditExportAccessLog> {
    const client = this.supabase.getClient();
    
    // Calculate hash chain (simple implementation)
    const prevLog = await this.getLastAccessLog();
    const prevHash = prevLog?.recordHash || 'GENESIS';
    
    const recordData = JSON.stringify({
      runId: log.runId,
      fileId: log.fileId,
      accessedByUserId: log.accessedByUserId,
      action: log.action,
      timestamp: new Date().toISOString(),
      prevHash,
    });
    
    // Note: In production, use crypto.createHash('sha256')
    const recordHash = Buffer.from(recordData).toString('base64').slice(0, 64);

    const { data, error } = await client
      .from('audit_export.access_logs')
      .insert({
        run_id: log.runId,
        file_id: log.fileId,
        accessed_by_user_id: log.accessedByUserId,
        accessed_by_role: log.accessedByRole,
        action: log.action,
        ip_address: log.ipAddress,
        user_agent: log.userAgent,
        success: log.success,
        error_message: log.errorMessage,
        prev_hash: prevHash,
        record_hash: recordHash,
      })
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to create access log', error);
      throw error;
    }

    return this.mapAccessLog(data);
  }

  async findAccessLogs(
    runId?: string,
    pagination: PaginationOptions = { page: 1, limit: 50 },
  ): Promise<PaginatedResult<AuditExportAccessLog>> {
    const client = this.supabase.getClient();
    const { page, limit } = pagination;
    const offset = (page - 1) * limit;

    let query = client
      .from('audit_export.access_logs')
      .select('*', { count: 'exact' });

    if (runId) {
      query = query.eq('run_id', runId);
    }

    query = query
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      this.logger.error('Failed to fetch access logs', error);
      throw error;
    }

    return {
      data: (data || []).map(l => this.mapAccessLog(l)),
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  private async getLastAccessLog(): Promise<AuditExportAccessLog | null> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('audit_export.access_logs')
      .select('*')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      this.logger.warn('Failed to fetch last access log', error);
      return null;
    }

    return data ? this.mapAccessLog(data) : null;
  }

  // ============================================
  // Schedule Operations
  // ============================================

  async findAllSchedules(enabledOnly = false): Promise<AuditExportSchedule[]> {
    const client = this.supabase.getClient();
    let query = client
      .from('audit_export.schedules')
      .select('*')
      .order('next_run_at');

    if (enabledOnly) {
      query = query.eq('enabled', true);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error('Failed to fetch schedules', error);
      throw error;
    }

    return (data || []).map(s => this.mapSchedule(s));
  }

  async findDueSchedules(): Promise<AuditExportSchedule[]> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('audit_export.schedules')
      .select('*')
      .eq('enabled', true)
      .lte('next_run_at', new Date().toISOString())
      .order('next_run_at');

    if (error) {
      this.logger.error('Failed to fetch due schedules', error);
      throw error;
    }

    return (data || []).map(s => this.mapSchedule(s));
  }

  async findScheduleById(id: string): Promise<AuditExportSchedule | null> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('audit_export.schedules')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to fetch schedule ${id}`, error);
      throw error;
    }

    return data ? this.mapSchedule(data) : null;
  }

  async createSchedule(schedule: Partial<AuditExportSchedule>): Promise<AuditExportSchedule> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('audit_export.schedules')
      .insert({
        template_id: schedule.templateId,
        region_code: schedule.regionCode,
        schedule_type: schedule.scheduleType,
        time_of_day: schedule.timeOfDay,
        day_of_week: schedule.dayOfWeek,
        day_of_month: schedule.dayOfMonth,
        timezone: schedule.timezone || 'Asia/Karachi',
        enabled: schedule.enabled ?? true,
        notify_on_success: schedule.notifyOnSuccess ?? true,
        notify_on_failure: schedule.notifyOnFailure ?? true,
        notification_emails: schedule.notificationEmails || [],
        created_by: schedule.createdBy,
      })
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to create schedule', error);
      throw error;
    }

    return this.mapSchedule(data);
  }

  async updateSchedule(id: string, updates: Partial<AuditExportSchedule>): Promise<AuditExportSchedule> {
    const client = this.supabase.getClient();
    const updateData: Record<string, unknown> = {};

    if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
    if (updates.timeOfDay) updateData.time_of_day = updates.timeOfDay;
    if (updates.dayOfWeek !== undefined) updateData.day_of_week = updates.dayOfWeek;
    if (updates.dayOfMonth !== undefined) updateData.day_of_month = updates.dayOfMonth;
    if (updates.timezone) updateData.timezone = updates.timezone;
    if (updates.notifyOnSuccess !== undefined) updateData.notify_on_success = updates.notifyOnSuccess;
    if (updates.notifyOnFailure !== undefined) updateData.notify_on_failure = updates.notifyOnFailure;
    if (updates.notificationEmails) updateData.notification_emails = updates.notificationEmails;
    if (updates.lastRunAt) updateData.last_run_at = updates.lastRunAt.toISOString();
    if (updates.lastRunId) updateData.last_run_id = updates.lastRunId;
    if (updates.consecutiveFailures !== undefined) updateData.consecutive_failures = updates.consecutiveFailures;
    if (updates.lastError !== undefined) updateData.last_error = updates.lastError;

    const { data, error } = await client
      .from('audit_export.schedules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update schedule ${id}`, error);
      throw error;
    }

    return this.mapSchedule(data);
  }

  async deleteSchedule(id: string): Promise<void> {
    const client = this.supabase.getClient();
    const { error } = await client
      .from('audit_export.schedules')
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete schedule ${id}`, error);
      throw error;
    }
  }

  // ============================================
  // Region Operations
  // ============================================

  async findAllRegions(enabledOnly = true): Promise<RegionCode[]> {
    const client = this.supabase.getClient();
    let query = client
      .from('audit_export.region_codes')
      .select('*')
      .order('name');

    if (enabledOnly) {
      query = query.eq('enabled', true);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error('Failed to fetch regions', error);
      throw error;
    }

    return (data || []).map(r => this.mapRegion(r));
  }

  async findRegionByCode(code: string): Promise<RegionCode | null> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('audit_export.region_codes')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to fetch region ${code}`, error);
      throw error;
    }

    return data ? this.mapRegion(data) : null;
  }

  // ============================================
  // Data Source Queries
  // ============================================

  async queryDataSource(
    sourceSchema: string,
    sourceTable: string,
    dateFilterField: string,
    dateFrom: Date,
    dateTo: Date,
    regionFilterField?: string,
    regionCode?: string,
    limit?: number,
  ): Promise<{ data: Record<string, unknown>[]; count: number }> {
    const client = this.supabase.getClient();
    
    // Build the table reference
    const tableRef = sourceSchema === 'public' 
      ? sourceTable 
      : `${sourceSchema}.${sourceTable}`;

    let query = client
      .from(tableRef)
      .select('*', { count: 'exact' })
      .gte(dateFilterField, dateFrom.toISOString())
      .lte(dateFilterField, dateTo.toISOString());

    if (regionFilterField && regionCode && regionCode !== 'ALL') {
      query = query.eq(regionFilterField, regionCode);
    }

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error, count } = await query;

    if (error) {
      this.logger.error(`Failed to query ${tableRef}`, error);
      throw error;
    }

    return { data: data || [], count: count || 0 };
  }

  // ============================================
  // Mapping Helpers
  // ============================================

  private mapTemplate(row: Record<string, unknown>): AuditExportTemplate {
    return {
      id: row.id as string,
      code: row.code as string,
      name: row.name as string,
      description: row.description as string | null,
      enabled: row.enabled as boolean,
      defaultFormat: row.default_format as ExportFormat,
      columns: row.columns as unknown as AuditExportTemplate['columns'],
      sourceTable: row.source_table as string,
      sourceSchema: row.source_schema as string,
      dateFilterField: row.date_filter_field as string,
      regionFilterField: row.region_filter_field as string | null,
      maxRangeDays: row.max_range_days as number,
      maxRowsPerExport: row.max_rows_per_export as number | null,
      ptaCategory: row.pta_category as string | null,
      retentionDays: row.retention_days as number,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapTemplates(rows: Record<string, unknown>[]): AuditExportTemplate[] {
    return rows.map(r => this.mapTemplate(r));
  }

  private unmapTemplate(template: Partial<AuditExportTemplate>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (template.code !== undefined) result.code = template.code;
    if (template.name !== undefined) result.name = template.name;
    if (template.description !== undefined) result.description = template.description;
    if (template.enabled !== undefined) result.enabled = template.enabled;
    if (template.defaultFormat !== undefined) result.default_format = template.defaultFormat;
    if (template.columns !== undefined) result.columns = template.columns;
    if (template.sourceTable !== undefined) result.source_table = template.sourceTable;
    if (template.sourceSchema !== undefined) result.source_schema = template.sourceSchema;
    if (template.dateFilterField !== undefined) result.date_filter_field = template.dateFilterField;
    if (template.regionFilterField !== undefined) result.region_filter_field = template.regionFilterField;
    if (template.maxRangeDays !== undefined) result.max_range_days = template.maxRangeDays;
    if (template.maxRowsPerExport !== undefined) result.max_rows_per_export = template.maxRowsPerExport;
    if (template.ptaCategory !== undefined) result.pta_category = template.ptaCategory;
    if (template.retentionDays !== undefined) result.retention_days = template.retentionDays;
    return result;
  }

  private mapRun(row: Record<string, unknown>): AuditExportRun {
    return {
      id: row.id as string,
      templateId: row.template_id as string,
      requestedByUserId: row.requested_by_user_id as string,
      regionCode: row.region_code as string,
      typeCode: row.type_code as string,
      status: row.status as ExportStatus,
      dateFrom: row.date_from ? new Date(row.date_from as string) : null,
      dateTo: row.date_to ? new Date(row.date_to as string) : null,
      scheduleType: row.schedule_type as ScheduleType,
      scheduleId: row.schedule_id as string | null,
      requestedAt: new Date(row.requested_at as string),
      startedAt: row.started_at ? new Date(row.started_at as string) : null,
      completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
      totalRows: row.total_rows as number,
      fileCount: row.file_count as number,
      totalSizeBytes: row.total_size_bytes as number,
      errorMessage: row.error_message as string | null,
      errorCode: row.error_code as string | null,
      retryCount: row.retry_count as number,
      zipFileName: row.zip_file_name as string | null,
      zipStoragePath: row.zip_storage_path as string | null,
      zipSha256Hash: row.zip_sha256_hash as string | null,
      manifest: row.manifest as ExportManifest | null,
      isArchived: row.is_archived as boolean,
      archivedAt: row.archived_at ? new Date(row.archived_at as string) : null,
      archivedBy: row.archived_by as string | null,
      archiveReason: row.archive_reason as string | null,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapFile(row: Record<string, unknown>): AuditExportFile {
    return {
      id: row.id as string,
      runId: row.run_id as string,
      fileName: row.file_name as string,
      storagePath: row.storage_path as string,
      format: row.format as ExportFormat,
      sha256Hash: row.sha256_hash as string,
      sizeBytes: row.size_bytes as number,
      rowCount: row.row_count as number,
      metadata: row.metadata as Record<string, unknown>,
      createdAt: new Date(row.created_at as string),
    };
  }

  private mapAccessLog(row: Record<string, unknown>): AuditExportAccessLog {
    return {
      id: row.id as number,
      runId: row.run_id as string,
      fileId: row.file_id as string | null,
      accessedByUserId: row.accessed_by_user_id as string,
      accessedByRole: row.accessed_by_role as string | null,
      action: row.action as AccessAction,
      ipAddress: row.ip_address as string | null,
      userAgent: row.user_agent as string | null,
      success: row.success as boolean,
      errorMessage: row.error_message as string | null,
      timestamp: new Date(row.timestamp as string),
      prevHash: row.prev_hash as string | null,
      recordHash: row.record_hash as string | null,
    };
  }

  private mapSchedule(row: Record<string, unknown>): AuditExportSchedule {
    return {
      id: row.id as string,
      templateId: row.template_id as string,
      regionCode: row.region_code as string,
      scheduleType: row.schedule_type as ScheduleType,
      timeOfDay: row.time_of_day as string,
      dayOfWeek: row.day_of_week as number | null,
      dayOfMonth: row.day_of_month as number | null,
      timezone: row.timezone as string,
      enabled: row.enabled as boolean,
      lastRunAt: row.last_run_at ? new Date(row.last_run_at as string) : null,
      lastRunId: row.last_run_id as string | null,
      nextRunAt: row.next_run_at ? new Date(row.next_run_at as string) : null,
      consecutiveFailures: row.consecutive_failures as number,
      lastError: row.last_error as string | null,
      notifyOnSuccess: row.notify_on_success as boolean,
      notifyOnFailure: row.notify_on_failure as boolean,
      notificationEmails: row.notification_emails as string[],
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      createdBy: row.created_by as string,
    };
  }

  private mapRegion(row: Record<string, unknown>): RegionCode {
    return {
      code: row.code as string,
      name: row.name as string,
      province: row.province as string | null,
      ptaRegion: row.pta_region as string | null,
      enabled: row.enabled as boolean,
      createdAt: new Date(row.created_at as string),
    };
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}
