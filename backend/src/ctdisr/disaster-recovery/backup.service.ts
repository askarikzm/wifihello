/**
 * CTDISR-2025 Backup Management Service
 * PTA Regulation: Chapter 8 - Backup & Recovery Operations
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  BackupSchedule,
  BackupExecution,
  RecoveryPoint,
  BackupType,
  BackupStatus,
  RecoveryPriority,
  CreateBackupScheduleDto,
  BackupStatistics,
} from './types';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly supabase: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.getOrThrow('SUPABASE_URL'),
      this.configService.getOrThrow('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // ============ Backup Schedules ============

  async createBackupSchedule(dto: CreateBackupScheduleDto, createdBy: string): Promise<BackupSchedule> {
    this.logger.log(`Creating backup schedule: ${dto.name}`);

    const scheduleData = {
      name: dto.name,
      description: dto.description,
      is_active: true,
      target_type: dto.targetType,
      target_identifier: dto.targetIdentifier,
      target_asset_id: dto.targetAssetId,
      backup_type: dto.backupType,
      cron_expression: dto.cronExpression,
      timezone: dto.timezone || 'Asia/Karachi',
      retention_days: dto.retentionDays,
      retention_copies: dto.retentionCopies,
      primary_storage: dto.primaryStorage,
      secondary_storage: dto.secondaryStorage,
      offsite_storage: dto.offsiteStorage,
      encryption_enabled: true,
      priority: dto.priority || RecoveryPriority.MEDIUM,
      verify_after_backup: dto.verifyAfterBackup ?? true,
      verification_method: dto.verificationMethod,
      next_run_at: this.calculateNextRun(dto.cronExpression, dto.timezone || 'Asia/Karachi'),
      created_by: createdBy,
    };

    const { data, error } = await this.supabase
      .from('ctdisr.backup_schedules')
      .insert(scheduleData)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create backup schedule: ${error.message}`);
    }

    this.logger.log(`Created backup schedule: ${dto.name}`);
    return this.mapToSchedule(data);
  }

  async getBackupSchedule(id: string): Promise<BackupSchedule> {
    const { data, error } = await this.supabase
      .from('ctdisr.backup_schedules')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Backup schedule not found: ${id}`);
    }

    return this.mapToSchedule(data);
  }

  async listBackupSchedules(filters?: {
    isActive?: boolean;
    targetType?: string;
    priority?: RecoveryPriority[];
  }): Promise<BackupSchedule[]> {
    let query = this.supabase.from('ctdisr.backup_schedules').select('*');

    if (filters?.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    }
    if (filters?.targetType) {
      query = query.eq('target_type', filters.targetType);
    }
    if (filters?.priority?.length) {
      query = query.in('priority', filters.priority);
    }

    const { data, error } = await query.order('priority').order('name');

    if (error) {
      throw new BadRequestException(`Failed to list backup schedules: ${error.message}`);
    }

    return (data || []).map(this.mapToSchedule);
  }

  async toggleSchedule(id: string, isActive: boolean): Promise<BackupSchedule> {
    const { data, error } = await this.supabase
      .from('ctdisr.backup_schedules')
      .update({ is_active: isActive })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to toggle schedule: ${error.message}`);
    }

    return this.mapToSchedule(data);
  }

  // ============ Backup Execution ============

  async startBackup(scheduleId: string): Promise<BackupExecution> {
    const schedule = await this.getBackupSchedule(scheduleId);

    this.logger.log(`Starting backup for schedule: ${schedule.name}`);

    const { data, error } = await this.supabase
      .from('ctdisr.backup_executions')
      .insert({
        schedule_id: scheduleId,
        backup_type: schedule.backupType,
        status: BackupStatus.RUNNING,
        encrypted: schedule.encryptionEnabled,
        expires_at: new Date(Date.now() + schedule.retentionDays * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to start backup: ${error.message}`);
    }

    // Update schedule
    await this.supabase
      .from('ctdisr.backup_schedules')
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: BackupStatus.RUNNING,
        total_runs: schedule.totalRuns + 1,
        next_run_at: this.calculateNextRun(schedule.cronExpression, schedule.timezone),
      })
      .eq('id', scheduleId);

    return this.mapToExecution(data);
  }

  async completeBackup(
    executionId: string,
    success: boolean,
    details: {
      sourceSizeBytes?: number;
      backupSizeBytes?: number;
      primaryLocation?: string;
      secondaryLocation?: string;
      offsiteLocation?: string;
      checksumValue?: string;
      errorMessage?: string;
      errorDetails?: Record<string, unknown>;
    },
  ): Promise<BackupExecution> {
    const execution = await this.getBackupExecution(executionId);
    const schedule = await this.getBackupSchedule(execution.scheduleId);

    const startedAt = execution.startedAt.getTime();
    const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
    const compressionRatio = details.sourceSizeBytes && details.backupSizeBytes
      ? Math.round((1 - details.backupSizeBytes / details.sourceSizeBytes) * 100) / 100
      : undefined;

    const status = success ? BackupStatus.COMPLETED : BackupStatus.FAILED;

    const { data, error } = await this.supabase
      .from('ctdisr.backup_executions')
      .update({
        status,
        completed_at: new Date().toISOString(),
        duration_seconds: durationSeconds,
        source_size_bytes: details.sourceSizeBytes,
        backup_size_bytes: details.backupSizeBytes,
        compression_ratio: compressionRatio,
        primary_location: details.primaryLocation,
        secondary_location: details.secondaryLocation,
        offsite_location: details.offsiteLocation,
        checksum_value: details.checksumValue,
        error_message: details.errorMessage,
        error_details: details.errorDetails,
      })
      .eq('id', executionId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to complete backup: ${error.message}`);
    }

    // Update schedule statistics
    const updateData: Record<string, unknown> = {
      last_run_status: status,
    };
    
    if (success) {
      updateData.successful_runs = schedule.successfulRuns + 1;
      updateData.avg_duration_seconds = Math.round(
        ((schedule.avgDurationSeconds || 0) * schedule.successfulRuns + durationSeconds) / 
        (schedule.successfulRuns + 1)
      );
      updateData.avg_size_bytes = Math.round(
        ((schedule.avgSizeBytes || 0) * schedule.successfulRuns + (details.backupSizeBytes || 0)) / 
        (schedule.successfulRuns + 1)
      );

      // Create recovery point
      if (details.primaryLocation) {
        await this.createRecoveryPoint(schedule, data, details);
      }
    } else {
      updateData.failed_runs = schedule.failedRuns + 1;
    }

    await this.supabase
      .from('ctdisr.backup_schedules')
      .update(updateData)
      .eq('id', execution.scheduleId);

    this.logger.log(`Backup ${executionId} completed with status: ${status}`);
    return this.mapToExecution(data);
  }

  async verifyBackup(executionId: string, verificationMethod: string, result: string): Promise<BackupExecution> {
    const { data, error } = await this.supabase
      .from('ctdisr.backup_executions')
      .update({
        verified: true,
        verified_at: new Date().toISOString(),
        verification_method: verificationMethod,
        verification_result: result,
        status: result.toLowerCase().includes('success') ? BackupStatus.VERIFIED : BackupStatus.FAILED,
      })
      .eq('id', executionId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to verify backup: ${error.message}`);
    }

    return this.mapToExecution(data);
  }

  async testRestore(
    executionId: string,
    restoreDurationSeconds: number,
  ): Promise<BackupExecution> {
    const { data, error } = await this.supabase
      .from('ctdisr.backup_executions')
      .update({
        restore_tested: true,
        restore_tested_at: new Date().toISOString(),
        restore_duration_seconds: restoreDurationSeconds,
      })
      .eq('id', executionId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to record restore test: ${error.message}`);
    }

    return this.mapToExecution(data);
  }

  async getBackupExecution(id: string): Promise<BackupExecution> {
    const { data, error } = await this.supabase
      .from('ctdisr.backup_executions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Backup execution not found: ${id}`);
    }

    return this.mapToExecution(data);
  }

  async listBackupExecutions(filters: {
    scheduleId?: string;
    status?: BackupStatus[];
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ executions: BackupExecution[]; total: number }> {
    let query = this.supabase
      .from('ctdisr.backup_executions')
      .select('*', { count: 'exact' });

    if (filters.scheduleId) {
      query = query.eq('schedule_id', filters.scheduleId);
    }
    if (filters.status?.length) {
      query = query.in('status', filters.status);
    }
    if (filters.fromDate) {
      query = query.gte('started_at', filters.fromDate.toISOString());
    }
    if (filters.toDate) {
      query = query.lte('started_at', filters.toDate.toISOString());
    }

    query = query
      .order('started_at', { ascending: false })
      .range(filters.offset || 0, (filters.offset || 0) + (filters.limit || 50) - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new BadRequestException(`Failed to list backup executions: ${error.message}`);
    }

    return {
      executions: (data || []).map(this.mapToExecution),
      total: count || 0,
    };
  }

  // ============ Recovery Points ============

  async createRecoveryPoint(
    schedule: BackupSchedule,
    execution: Record<string, unknown>,
    details: { primaryLocation?: string; checksumValue?: string },
  ): Promise<void> {
    // Mark previous recovery point as not current
    await this.supabase
      .from('ctdisr.recovery_points')
      .update({ is_current: false })
      .eq('system_identifier', schedule.targetIdentifier)
      .eq('is_current', true);

    // Create new recovery point
    await this.supabase
      .from('ctdisr.recovery_points')
      .insert({
        system_identifier: schedule.targetIdentifier,
        asset_id: schedule.targetAssetId,
        recovery_point_time: execution.started_at,
        backup_id: execution.id,
        is_valid: true,
        is_current: true,
        primary_location: details.primaryLocation,
        integrity_verified: execution.verified || false,
        checksum: details.checksumValue,
        size_bytes: execution.backup_size_bytes,
        retention_until: execution.expires_at,
        estimated_recovery_time_minutes: this.estimateRecoveryTime(schedule.priority),
      });
  }

  async listRecoveryPoints(systemIdentifier: string): Promise<RecoveryPoint[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.recovery_points')
      .select('*')
      .eq('system_identifier', systemIdentifier)
      .eq('is_valid', true)
      .order('recovery_point_time', { ascending: false });

    if (error) {
      throw new BadRequestException(`Failed to list recovery points: ${error.message}`);
    }

    return (data || []).map(this.mapToRecoveryPoint);
  }

  async getCurrentRecoveryPoint(systemIdentifier: string): Promise<RecoveryPoint | null> {
    const { data } = await this.supabase
      .from('ctdisr.recovery_points')
      .select('*')
      .eq('system_identifier', systemIdentifier)
      .eq('is_current', true)
      .eq('is_valid', true)
      .single();

    return data ? this.mapToRecoveryPoint(data) : null;
  }

  async protectRecoveryPoint(id: string, protect: boolean): Promise<RecoveryPoint> {
    const { data, error } = await this.supabase
      .from('ctdisr.recovery_points')
      .update({ is_protected: protect })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update protection: ${error.message}`);
    }

    return this.mapToRecoveryPoint(data);
  }

  // ============ Statistics ============

  async getBackupStatistics(): Promise<BackupStatistics> {
    const [schedules, executions] = await Promise.all([
      this.supabase.from('ctdisr.backup_schedules').select('*'),
      this.supabase.from('ctdisr.backup_executions')
        .select('*')
        .gte('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const scheduleData = schedules.data || [];
    const executionData = executions.data || [];

    const completedBackups = executionData.filter((e) => e.status === BackupStatus.COMPLETED);
    const failedBackups = executionData.filter((e) => e.status === BackupStatus.FAILED);
    const pendingVerification = executionData.filter((e) => 
      e.status === BackupStatus.COMPLETED && !e.verified
    );

    // Get backups expiring in next 7 days
    const { count: expiringCount } = await this.supabase
      .from('ctdisr.backup_executions')
      .select('id', { count: 'exact', head: true })
      .eq('is_expired', false)
      .lte('expires_at', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());

    const avgSize = completedBackups.length > 0
      ? completedBackups.reduce((sum, e) => sum + (e.backup_size_bytes || 0), 0) / completedBackups.length
      : 0;

    const { data: totalStorage } = await this.supabase
      .from('ctdisr.backup_executions')
      .select('backup_size_bytes')
      .eq('is_expired', false);

    const totalStorageBytes = (totalStorage || []).reduce((sum, e) => sum + (e.backup_size_bytes || 0), 0);

    return {
      totalSchedules: scheduleData.length,
      activeSchedules: scheduleData.filter((s) => s.is_active).length,
      totalBackups: executionData.length,
      successRate: executionData.length > 0 
        ? Math.round((completedBackups.length / executionData.length) * 100) 
        : 100,
      avgBackupSizeGb: Math.round((avgSize / (1024 * 1024 * 1024)) * 100) / 100,
      totalStorageUsedGb: Math.round((totalStorageBytes / (1024 * 1024 * 1024)) * 100) / 100,
      failedBackupsLast24h: failedBackups.length,
      pendingVerifications: pendingVerification.length,
      expiringNext7Days: expiringCount || 0,
    };
  }

  // ============ Scheduled Tasks ============

  @Cron(CronExpression.EVERY_HOUR)
  async markExpiredBackups(): Promise<void> {
    try {
      const { data } = await this.supabase.rpc('mark_expired_backups');
      if (data > 0) {
        this.logger.log(`Marked ${data} backups as expired`);
      }
    } catch (error) {
      this.logger.error('Failed to mark expired backups', error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredBackups(): Promise<void> {
    // This would trigger actual cleanup of expired backup files
    // Implementation depends on storage backend
    this.logger.log('Running expired backup cleanup check');
  }

  // ============ Private Helpers ============

  private calculateNextRun(cronExpression: string, timezone: string): string {
    // Simplified next run calculation - in production use a proper cron parser
    // For now, just add an hour
    return new Date(Date.now() + 60 * 60 * 1000).toISOString();
  }

  private estimateRecoveryTime(priority: RecoveryPriority): number {
    const estimates: Record<RecoveryPriority, number> = {
      [RecoveryPriority.CRITICAL]: 30,
      [RecoveryPriority.HIGH]: 60,
      [RecoveryPriority.MEDIUM]: 240,
      [RecoveryPriority.LOW]: 480,
      [RecoveryPriority.NON_CRITICAL]: 1440,
    };
    return estimates[priority] || 240;
  }

  // ============ Mappers ============

  private mapToSchedule(data: Record<string, unknown>): BackupSchedule {
    return {
      id: data.id as string,
      name: data.name as string,
      description: data.description as string,
      isActive: data.is_active as boolean,
      targetType: data.target_type as string,
      targetIdentifier: data.target_identifier as string,
      targetAssetId: data.target_asset_id as string,
      backupType: data.backup_type as BackupType,
      cronExpression: data.cron_expression as string,
      timezone: data.timezone as string,
      retentionDays: data.retention_days as number,
      retentionCopies: data.retention_copies as number,
      primaryStorage: data.primary_storage as string,
      secondaryStorage: data.secondary_storage as string,
      offsiteStorage: data.offsite_storage as string,
      encryptionEnabled: data.encryption_enabled as boolean,
      encryptionKeyId: data.encryption_key_id as string,
      priority: data.priority as RecoveryPriority,
      verifyAfterBackup: data.verify_after_backup as boolean,
      verificationMethod: data.verification_method as string,
      lastRunAt: data.last_run_at ? new Date(data.last_run_at as string) : undefined,
      lastRunStatus: data.last_run_status as BackupStatus,
      nextRunAt: data.next_run_at ? new Date(data.next_run_at as string) : undefined,
      totalRuns: data.total_runs as number,
      successfulRuns: data.successful_runs as number,
      failedRuns: data.failed_runs as number,
      avgDurationSeconds: data.avg_duration_seconds as number,
      avgSizeBytes: data.avg_size_bytes as number,
      createdAt: new Date(data.created_at as string),
      createdBy: data.created_by as string,
      updatedAt: new Date(data.updated_at as string),
    };
  }

  private mapToExecution(data: Record<string, unknown>): BackupExecution {
    return {
      id: data.id as string,
      scheduleId: data.schedule_id as string,
      backupType: data.backup_type as BackupType,
      status: data.status as BackupStatus,
      startedAt: new Date(data.started_at as string),
      completedAt: data.completed_at ? new Date(data.completed_at as string) : undefined,
      durationSeconds: data.duration_seconds as number,
      sourceSizeBytes: data.source_size_bytes as number,
      backupSizeBytes: data.backup_size_bytes as number,
      compressionRatio: data.compression_ratio as number,
      primaryLocation: data.primary_location as string,
      secondaryLocation: data.secondary_location as string,
      offsiteLocation: data.offsite_location as string,
      checksumAlgorithm: data.checksum_algorithm as string,
      checksumValue: data.checksum_value as string,
      encrypted: data.encrypted as boolean,
      verified: data.verified as boolean,
      verifiedAt: data.verified_at ? new Date(data.verified_at as string) : undefined,
      verificationMethod: data.verification_method as string,
      verificationResult: data.verification_result as string,
      restoreTested: data.restore_tested as boolean,
      restoreTestedAt: data.restore_tested_at ? new Date(data.restore_tested_at as string) : undefined,
      restoreDurationSeconds: data.restore_duration_seconds as number,
      errorMessage: data.error_message as string,
      errorDetails: data.error_details as Record<string, unknown>,
      retryCount: data.retry_count as number,
      expiresAt: data.expires_at ? new Date(data.expires_at as string) : undefined,
      isExpired: data.is_expired as boolean,
      createdAt: new Date(data.created_at as string),
    };
  }

  private mapToRecoveryPoint(data: Record<string, unknown>): RecoveryPoint {
    return {
      id: data.id as string,
      systemIdentifier: data.system_identifier as string,
      assetId: data.asset_id as string,
      recoveryPointTime: new Date(data.recovery_point_time as string),
      backupId: data.backup_id as string,
      isValid: data.is_valid as boolean,
      isCurrent: data.is_current as boolean,
      primaryLocation: data.primary_location as string,
      replicaLocations: data.replica_locations as string[] || [],
      integrityVerified: data.integrity_verified as boolean,
      lastVerification: data.last_verification ? new Date(data.last_verification as string) : undefined,
      checksum: data.checksum as string,
      sizeBytes: data.size_bytes as number,
      retentionUntil: data.retention_until ? new Date(data.retention_until as string) : undefined,
      isProtected: data.is_protected as boolean,
      estimatedRecoveryTimeMinutes: data.estimated_recovery_time_minutes as number,
      recoveryTested: data.recovery_tested as boolean,
      lastRecoveryTest: data.last_recovery_test ? new Date(data.last_recovery_test as string) : undefined,
      createdAt: new Date(data.created_at as string),
    };
  }
}
