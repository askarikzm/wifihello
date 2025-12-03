/**
 * Audit Export Service
 * 
 * Main orchestrator for PTA-compliant audit log exports.
 * Coordinates template selection, data fetching, file generation,
 * storage, and access logging.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseClientService } from '../../database/supabase-client.service';
import { AuditExportRepository } from '../repositories/audit-export.repository';
import { AuditExportTemplateService } from './template.service';
import { AuditExportGeneratorService, ExportBundle } from './generator.service';
import { AuditExportStorageService, StoredFileInfo } from './storage.service';
import { AuditExportAccessLogService } from './access-log.service';
import {
  AuditExportType,
  ExportFormat,
  AuditExportRun,
  ExportRunStatus,
  AuditExportTemplate,
  AuditExportFile,
  AuditExportRole,
  AuditExportPermission,
  ROLE_PERMISSIONS,
} from '../types';
import {
  CreateAuditExportRunDto,
  ListExportRunsDto,
  ExportRunResponseDto,
} from '../dto';

export interface ExportResult {
  run: AuditExportRun;
  files: StoredFileInfo[];
  bundle: ExportBundle;
}

@Injectable()
export class AuditExportService {
  private readonly logger = new Logger(AuditExportService.name);

  constructor(
    private readonly supabase: SupabaseClientService,
    private readonly repository: AuditExportRepository,
    private readonly templateService: AuditExportTemplateService,
    private readonly generatorService: AuditExportGeneratorService,
    private readonly storageService: AuditExportStorageService,
    private readonly accessLogService: AuditExportAccessLogService,
  ) {}

  /**
   * Create and execute an export run
   */
  async createExportRun(
    dto: CreateAuditExportRunDto,
    userId: string,
    tenantId: string,
    ipAddress: string,
  ): Promise<ExportResult> {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    // Validate parameters against template
    const validation = await this.templateService.validateExportParams(
      dto.exportType,
      startDate,
      endDate,
      dto.format,
      tenantId,
    );

    if (!validation.valid) {
      throw new BadRequestException(validation.errors.join('; '));
    }

    // Get template
    const template = await this.templateService.getTemplateByType(dto.exportType, tenantId);

    // Create run record
    const run = await this.repository.createRun({
      tenantId,
      templateId: template.id,
      exportType: dto.exportType,
      format: dto.format,
      startDate,
      endDate,
      requestedBy: userId,
      status: ExportRunStatus.PENDING,
    });

    this.logger.log(`Created export run ${run.id} for ${dto.exportType}`);

    // Log the creation
    await this.accessLogService.logExportCreated(run.id, userId, ipAddress);

    try {
      // Update status to processing
      await this.repository.updateRunStatus(run.id, ExportRunStatus.PROCESSING);

      // Fetch data based on export type
      const data = await this.fetchExportData(dto.exportType, startDate, endDate, tenantId);

      if (data.length === 0) {
        await this.repository.updateRunStatus(run.id, ExportRunStatus.COMPLETED, {
          rowCount: 0,
          message: 'No data found for the specified date range',
        });

        return {
          run: { ...run, status: ExportRunStatus.COMPLETED, rowCount: 0 },
          files: [],
          bundle: null as unknown as ExportBundle,
        };
      }

      // Generate export files
      const bundle = await this.generatorService.generateExportBundle(
        { ...run, templateId: template.id },
        data,
      );

      // Store files
      const storedFiles = await this.storageService.storeExportBundle(run, bundle);

      // Update run with completion status
      await this.repository.updateRunStatus(run.id, ExportRunStatus.COMPLETED, {
        rowCount: bundle.totalRows,
        fileCount: storedFiles.length,
        completedAt: new Date(),
      });

      this.logger.log(`Export run ${run.id} completed with ${bundle.totalRows} rows`);

      return {
        run: {
          ...run,
          status: ExportRunStatus.COMPLETED,
          rowCount: bundle.totalRows,
        },
        files: storedFiles,
        bundle,
      };
    } catch (err) {
      this.logger.error(`Export run ${run.id} failed`, err);

      await this.repository.updateRunStatus(run.id, ExportRunStatus.FAILED, {
        errorMessage: err.message,
      });

      throw err;
    }
  }

  /**
   * Fetch data based on export type
   */
  private async fetchExportData(
    exportType: AuditExportType,
    startDate: Date,
    endDate: Date,
    tenantId: string,
  ): Promise<Record<string, unknown>[]> {
    const client = this.supabase.getClient();

    switch (exportType) {
      case AuditExportType.IPDR_DAILY:
      case AuditExportType.IPDR_RANGE:
        return this.fetchIpdrData(client, startDate, endDate, tenantId);

      case AuditExportType.RADIUS_AUTH_LOGS:
        return this.fetchRadiusLogs(client, startDate, endDate, tenantId);

      case AuditExportType.SUBSCRIBER_ACTIVATION_DEACTIVATION:
        return this.fetchSubscriberChanges(client, startDate, endDate, tenantId);

      case AuditExportType.KYC_VERISYS_LOGS:
        return this.fetchKycLogs(client, startDate, endDate, tenantId);

      case AuditExportType.COMPLAINTS_SUMMARY:
        return this.fetchComplaints(client, startDate, endDate, tenantId);

      case AuditExportType.OLT_ALARMS:
        return this.fetchOltAlarms(client, startDate, endDate, tenantId);

      case AuditExportType.LI_ACCESS_LOGS:
        return this.fetchLiAccessLogs(client, startDate, endDate, tenantId);

      default:
        throw new BadRequestException(`Unsupported export type: ${exportType}`);
    }
  }

  /**
   * Fetch IPDR (IP Detail Record) data
   */
  private async fetchIpdrData(
    client: ReturnType<typeof this.supabase.getClient>,
    startDate: Date,
    endDate: Date,
    tenantId: string,
  ): Promise<Record<string, unknown>[]> {
    // Join usage_records with subscribers for IPDR format
    const { data, error } = await client
      .from('usage_records')
      .select(`
        id,
        session_id,
        subscriber_id,
        bytes_in,
        bytes_out,
        session_start,
        session_end,
        nas_ip,
        framed_ip,
        calling_station_id,
        created_at,
        subscribers!inner(
          id,
          username,
          full_name,
          cnic,
          phone,
          address
        )
      `)
      .eq('tenant_id', tenantId)
      .gte('session_start', startDate.toISOString())
      .lte('session_start', endDate.toISOString())
      .order('session_start', { ascending: true });

    if (error) {
      this.logger.error('Failed to fetch IPDR data', error);
      throw new Error('Failed to fetch IPDR data');
    }

    // Flatten for export
    return (data || []).map((row) => ({
      record_id: row.id,
      session_id: row.session_id,
      subscriber_id: row.subscriber_id,
      username: (row.subscribers as Record<string, unknown>)?.username,
      full_name: (row.subscribers as Record<string, unknown>)?.full_name,
      cnic: (row.subscribers as Record<string, unknown>)?.cnic,
      phone: (row.subscribers as Record<string, unknown>)?.phone,
      address: (row.subscribers as Record<string, unknown>)?.address,
      bytes_in: row.bytes_in,
      bytes_out: row.bytes_out,
      total_bytes: (row.bytes_in || 0) + (row.bytes_out || 0),
      session_start: row.session_start,
      session_end: row.session_end,
      session_duration_seconds: row.session_end && row.session_start
        ? Math.floor((new Date(row.session_end).getTime() - new Date(row.session_start).getTime()) / 1000)
        : null,
      nas_ip: row.nas_ip,
      framed_ip: row.framed_ip,
      mac_address: row.calling_station_id,
      created_at: row.created_at,
    }));
  }

  /**
   * Fetch RADIUS authentication logs
   */
  private async fetchRadiusLogs(
    client: ReturnType<typeof this.supabase.getClient>,
    startDate: Date,
    endDate: Date,
    tenantId: string,
  ): Promise<Record<string, unknown>[]> {
    const { data, error } = await client
      .from('radius_auth_logs')
      .select(`
        id,
        username,
        auth_type,
        result,
        reply_message,
        nas_ip,
        nas_port,
        calling_station_id,
        framed_ip,
        created_at,
        subscribers(
          id,
          full_name,
          cnic
        )
      `)
      .eq('tenant_id', tenantId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error('Failed to fetch RADIUS logs', error);
      throw new Error('Failed to fetch RADIUS authentication logs');
    }

    return (data || []).map((row) => ({
      log_id: row.id,
      username: row.username,
      subscriber_name: (row.subscribers as Record<string, unknown>)?.full_name,
      subscriber_cnic: (row.subscribers as Record<string, unknown>)?.cnic,
      auth_type: row.auth_type,
      result: row.result,
      reply_message: row.reply_message,
      nas_ip: row.nas_ip,
      nas_port: row.nas_port,
      mac_address: row.calling_station_id,
      assigned_ip: row.framed_ip,
      timestamp: row.created_at,
    }));
  }

  /**
   * Fetch subscriber activation/deactivation events
   */
  private async fetchSubscriberChanges(
    client: ReturnType<typeof this.supabase.getClient>,
    startDate: Date,
    endDate: Date,
    tenantId: string,
  ): Promise<Record<string, unknown>[]> {
    const { data, error } = await client
      .from('subscriber_status_history')
      .select(`
        id,
        subscriber_id,
        previous_status,
        new_status,
        reason,
        changed_by,
        created_at,
        subscribers(
          id,
          username,
          full_name,
          cnic,
          phone,
          address,
          package_id,
          packages(name)
        )
      `)
      .eq('tenant_id', tenantId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error('Failed to fetch subscriber changes', error);
      throw new Error('Failed to fetch subscriber activation/deactivation data');
    }

    return (data || []).map((row) => ({
      event_id: row.id,
      subscriber_id: row.subscriber_id,
      username: (row.subscribers as Record<string, unknown>)?.username,
      full_name: (row.subscribers as Record<string, unknown>)?.full_name,
      cnic: (row.subscribers as Record<string, unknown>)?.cnic,
      phone: (row.subscribers as Record<string, unknown>)?.phone,
      address: (row.subscribers as Record<string, unknown>)?.address,
      package_name: ((row.subscribers as Record<string, unknown>)?.packages as Record<string, unknown>)?.name,
      previous_status: row.previous_status,
      new_status: row.new_status,
      change_reason: row.reason,
      changed_by: row.changed_by,
      change_timestamp: row.created_at,
    }));
  }

  /**
   * Fetch KYC/Verisys verification logs
   */
  private async fetchKycLogs(
    client: ReturnType<typeof this.supabase.getClient>,
    startDate: Date,
    endDate: Date,
    tenantId: string,
  ): Promise<Record<string, unknown>[]> {
    const { data, error } = await client
      .from('kyc_verifications')
      .select(`
        id,
        subscriber_id,
        verification_type,
        verisys_request_id,
        status,
        match_score,
        cnic_verified,
        biometric_verified,
        address_verified,
        failure_reason,
        verified_by,
        created_at,
        completed_at,
        subscribers(
          username,
          full_name,
          cnic
        )
      `)
      .eq('tenant_id', tenantId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error('Failed to fetch KYC logs', error);
      throw new Error('Failed to fetch KYC/Verisys verification logs');
    }

    return (data || []).map((row) => ({
      verification_id: row.id,
      subscriber_id: row.subscriber_id,
      username: (row.subscribers as Record<string, unknown>)?.username,
      full_name: (row.subscribers as Record<string, unknown>)?.full_name,
      cnic: (row.subscribers as Record<string, unknown>)?.cnic,
      verification_type: row.verification_type,
      verisys_request_id: row.verisys_request_id,
      status: row.status,
      match_score: row.match_score,
      cnic_verified: row.cnic_verified,
      biometric_verified: row.biometric_verified,
      address_verified: row.address_verified,
      failure_reason: row.failure_reason,
      verified_by: row.verified_by,
      initiated_at: row.created_at,
      completed_at: row.completed_at,
    }));
  }

  /**
   * Fetch complaint/ticket summary
   */
  private async fetchComplaints(
    client: ReturnType<typeof this.supabase.getClient>,
    startDate: Date,
    endDate: Date,
    tenantId: string,
  ): Promise<Record<string, unknown>[]> {
    const { data, error } = await client
      .from('tickets')
      .select(`
        id,
        ticket_number,
        subscriber_id,
        category,
        priority,
        status,
        subject,
        description,
        assigned_to,
        resolution,
        created_at,
        resolved_at,
        subscribers(
          username,
          full_name,
          cnic,
          phone
        )
      `)
      .eq('tenant_id', tenantId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error('Failed to fetch complaints', error);
      throw new Error('Failed to fetch complaint data');
    }

    return (data || []).map((row) => ({
      ticket_id: row.id,
      ticket_number: row.ticket_number,
      subscriber_id: row.subscriber_id,
      subscriber_name: (row.subscribers as Record<string, unknown>)?.full_name,
      subscriber_cnic: (row.subscribers as Record<string, unknown>)?.cnic,
      subscriber_phone: (row.subscribers as Record<string, unknown>)?.phone,
      category: row.category,
      priority: row.priority,
      status: row.status,
      subject: row.subject,
      description: row.description,
      assigned_to: row.assigned_to,
      resolution: row.resolution,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
      resolution_time_hours: row.resolved_at && row.created_at
        ? Math.round((new Date(row.resolved_at).getTime() - new Date(row.created_at).getTime()) / (1000 * 60 * 60) * 10) / 10
        : null,
    }));
  }

  /**
   * Fetch OLT/network alarms
   */
  private async fetchOltAlarms(
    client: ReturnType<typeof this.supabase.getClient>,
    startDate: Date,
    endDate: Date,
    tenantId: string,
  ): Promise<Record<string, unknown>[]> {
    const { data, error } = await client
      .from('network_alarms')
      .select(`
        id,
        device_id,
        device_type,
        alarm_type,
        severity,
        message,
        affected_subscribers,
        acknowledged,
        acknowledged_by,
        acknowledged_at,
        resolved,
        resolved_at,
        created_at,
        network_devices(
          name,
          ip_address,
          location
        )
      `)
      .eq('tenant_id', tenantId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error('Failed to fetch OLT alarms', error);
      throw new Error('Failed to fetch OLT alarm data');
    }

    return (data || []).map((row) => ({
      alarm_id: row.id,
      device_id: row.device_id,
      device_name: (row.network_devices as Record<string, unknown>)?.name,
      device_ip: (row.network_devices as Record<string, unknown>)?.ip_address,
      device_location: (row.network_devices as Record<string, unknown>)?.location,
      device_type: row.device_type,
      alarm_type: row.alarm_type,
      severity: row.severity,
      message: row.message,
      affected_subscribers: row.affected_subscribers,
      acknowledged: row.acknowledged,
      acknowledged_by: row.acknowledged_by,
      acknowledged_at: row.acknowledged_at,
      resolved: row.resolved,
      resolved_at: row.resolved_at,
      alarm_timestamp: row.created_at,
    }));
  }

  /**
   * Fetch Lawful Interception access logs
   */
  private async fetchLiAccessLogs(
    client: ReturnType<typeof this.supabase.getClient>,
    startDate: Date,
    endDate: Date,
    tenantId: string,
  ): Promise<Record<string, unknown>[]> {
    const { data, error } = await client
      .from('li_access_logs')
      .select(`
        id,
        warrant_id,
        target_subscriber_id,
        action,
        accessed_by,
        access_reason,
        data_accessed,
        created_at,
        subscribers(
          username,
          full_name,
          cnic
        )
      `)
      .eq('tenant_id', tenantId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error('Failed to fetch LI access logs', error);
      throw new Error('Failed to fetch LI access logs');
    }

    return (data || []).map((row) => ({
      log_id: row.id,
      warrant_id: row.warrant_id,
      target_subscriber_id: row.target_subscriber_id,
      target_username: (row.subscribers as Record<string, unknown>)?.username,
      target_name: (row.subscribers as Record<string, unknown>)?.full_name,
      target_cnic: (row.subscribers as Record<string, unknown>)?.cnic,
      action: row.action,
      accessed_by: row.accessed_by,
      access_reason: row.access_reason,
      data_accessed: row.data_accessed,
      access_timestamp: row.created_at,
    }));
  }

  /**
   * Get export run by ID
   */
  async getExportRun(runId: string, userId: string): Promise<AuditExportRun | null> {
    return this.repository.getRunById(runId);
  }

  /**
   * List export runs with filtering
   */
  async listExportRuns(
    dto: ListExportRunsDto,
    tenantId: string,
  ): Promise<{ runs: AuditExportRun[]; total: number }> {
    return this.repository.listRuns({
      tenantId,
      exportType: dto.exportType,
      status: dto.status,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      limit: dto.limit,
      offset: dto.offset,
    });
  }

  /**
   * Get files for an export run
   */
  async getExportFiles(runId: string): Promise<AuditExportFile[]> {
    return this.storageService.listFilesForRun(runId);
  }

  /**
   * Download a file
   */
  async downloadFile(
    fileId: string,
    userId: string,
    ipAddress: string,
  ): Promise<{ content: Buffer; filename: string; mimeType: string }> {
    return this.storageService.downloadFile(fileId, userId, ipAddress);
  }

  /**
   * Get signed download URL
   */
  async getDownloadUrl(
    fileId: string,
    userId: string,
    expiresInSeconds?: number,
  ): Promise<{ url: string; expiresAt: Date }> {
    return this.storageService.getSignedDownloadUrl(fileId, userId, expiresInSeconds);
  }

  /**
   * Cancel a pending export run
   */
  async cancelExportRun(runId: string, userId: string): Promise<void> {
    const run = await this.repository.getRunById(runId);

    if (!run) {
      throw new NotFoundException('Export run not found');
    }

    if (run.status !== ExportRunStatus.PENDING && run.status !== ExportRunStatus.PROCESSING) {
      throw new BadRequestException('Only pending or processing exports can be cancelled');
    }

    await this.repository.updateRunStatus(runId, ExportRunStatus.CANCELLED, {
      cancelledBy: userId,
      cancelledAt: new Date(),
    });
  }

  /**
   * Retry a failed export run
   */
  async retryExportRun(
    runId: string,
    userId: string,
    tenantId: string,
    ipAddress: string,
  ): Promise<ExportResult> {
    const run = await this.repository.getRunById(runId);

    if (!run) {
      throw new NotFoundException('Export run not found');
    }

    if (run.status !== ExportRunStatus.FAILED) {
      throw new BadRequestException('Only failed exports can be retried');
    }

    // Create a new run with same parameters
    return this.createExportRun(
      {
        exportType: run.exportType,
        format: run.format,
        startDate: run.startDate.toISOString(),
        endDate: run.endDate.toISOString(),
      },
      userId,
      tenantId,
      ipAddress,
    );
  }

  /**
   * Get export statistics
   */
  async getExportStatistics(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalRuns: number;
    completedRuns: number;
    failedRuns: number;
    totalRowsExported: number;
    byType: Record<AuditExportType, number>;
  }> {
    const { runs } = await this.repository.listRuns({
      tenantId,
      startDate,
      endDate,
      limit: 10000,
    });

    const byType: Record<string, number> = {};
    let completedRuns = 0;
    let failedRuns = 0;
    let totalRowsExported = 0;

    runs.forEach((run) => {
      byType[run.exportType] = (byType[run.exportType] || 0) + 1;

      if (run.status === ExportRunStatus.COMPLETED) {
        completedRuns++;
        totalRowsExported += run.rowCount || 0;
      } else if (run.status === ExportRunStatus.FAILED) {
        failedRuns++;
      }
    });

    return {
      totalRuns: runs.length,
      completedRuns,
      failedRuns,
      totalRowsExported,
      byType: byType as Record<AuditExportType, number>,
    };
  }

  /**
   * Convert run to response DTO
   */
  toResponseDto(run: AuditExportRun, files?: AuditExportFile[]): ExportRunResponseDto {
    return {
      id: run.id,
      tenantId: run.tenantId,
      exportType: run.exportType,
      format: run.format,
      status: run.status,
      startDate: run.startDate.toISOString(),
      endDate: run.endDate.toISOString(),
      requestedBy: run.requestedBy,
      rowCount: run.rowCount,
      errorMessage: run.errorMessage,
      createdAt: run.createdAt.toISOString(),
      completedAt: run.completedAt?.toISOString(),
      files: files?.map((f) => ({
        id: f.id,
        filename: f.filename,
        mimeType: f.mimeType,
        fileSize: f.fileSize,
        sha256Hash: f.sha256Hash,
        rowCount: f.rowCount,
      })),
    };
  }
}
