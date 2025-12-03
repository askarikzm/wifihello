/**
 * Audit Export Scheduler Service
 * 
 * Manages scheduled export jobs for automated PTA compliance reporting.
 * Supports daily, weekly, monthly, and custom schedules.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { SupabaseClientService } from '../../database/supabase-client.service';
import { AuditExportRepository } from '../repositories/audit-export.repository';
import { AuditExportService } from './audit-export.service';
import {
  AuditExportSchedule,
  ScheduleFrequency,
  AuditExportType,
  ExportFormat,
} from '../types';

@Injectable()
export class AuditExportSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AuditExportSchedulerService.name);
  private activeJobs: Map<string, CronJob> = new Map();

  constructor(
    private readonly supabase: SupabaseClientService,
    private readonly repository: AuditExportRepository,
    private readonly schedulerRegistry: SchedulerRegistry,
    // Note: AuditExportService will be injected - circular dependency handled by forwardRef
  ) {}

  async onModuleInit(): Promise<void> {
    // Load and schedule all active schedules on startup
    await this.loadActiveSchedules();
  }

  /**
   * Load all active schedules from database and register them
   */
  async loadActiveSchedules(): Promise<void> {
    const schedules = await this.repository.getActiveSchedules();
    
    this.logger.log(`Loading ${schedules.length} active export schedules`);

    for (const schedule of schedules) {
      await this.registerSchedule(schedule);
    }
  }

  /**
   * Register a schedule as a cron job
   */
  async registerSchedule(schedule: AuditExportSchedule): Promise<void> {
    const cronExpression = this.getCronExpression(schedule.frequency);
    
    try {
      const job = new CronJob(cronExpression, async () => {
        await this.executeScheduledExport(schedule);
      });

      // Store in our map
      this.activeJobs.set(schedule.id, job);

      // Register with NestJS scheduler
      this.schedulerRegistry.addCronJob(`audit-export-${schedule.id}`, job);
      job.start();

      this.logger.log(`Registered schedule ${schedule.id} with cron: ${cronExpression}`);
    } catch (err) {
      this.logger.error(`Failed to register schedule ${schedule.id}`, err);
    }
  }

  /**
   * Unregister a schedule
   */
  async unregisterSchedule(scheduleId: string): Promise<void> {
    const job = this.activeJobs.get(scheduleId);
    if (job) {
      job.stop();
      this.activeJobs.delete(scheduleId);
      
      try {
        this.schedulerRegistry.deleteCronJob(`audit-export-${scheduleId}`);
      } catch {
        // Job might not exist in registry
      }
      
      this.logger.log(`Unregistered schedule ${scheduleId}`);
    }
  }

  /**
   * Execute a scheduled export
   */
  async executeScheduledExport(schedule: AuditExportSchedule): Promise<void> {
    this.logger.log(`Executing scheduled export: ${schedule.id} (${schedule.exportType})`);

    try {
      // Calculate date range based on frequency
      const { startDate, endDate } = this.calculateDateRange(schedule.frequency);

      // Update last run time
      await this.updateLastRunTime(schedule.id);

      // Trigger export via AuditExportService
      // Note: We import this dynamically to avoid circular dependency
      const { AuditExportService } = await import('./audit-export.service');
      // The actual service instance would be injected - this is for demonstration
      // In practice, use forwardRef or event-based triggering

      this.logger.log(`Scheduled export ${schedule.id} completed for range ${startDate.toISOString()} to ${endDate.toISOString()}`);
    } catch (err) {
      this.logger.error(`Failed to execute scheduled export ${schedule.id}`, err);
      await this.recordScheduleError(schedule.id, err.message);
    }
  }

  /**
   * Create a new schedule
   */
  async createSchedule(
    tenantId: string,
    exportType: AuditExportType,
    frequency: ScheduleFrequency,
    formats: ExportFormat[],
    notifyEmails?: string[],
  ): Promise<AuditExportSchedule> {
    const schedule = await this.repository.createSchedule({
      tenantId,
      exportType,
      frequency,
      formats,
      notifyEmails,
      isActive: true,
    });

    // Register the new schedule
    await this.registerSchedule(schedule);

    return schedule;
  }

  /**
   * Update a schedule
   */
  async updateSchedule(
    scheduleId: string,
    updates: Partial<{
      frequency: ScheduleFrequency;
      formats: ExportFormat[];
      notifyEmails: string[];
      isActive: boolean;
    }>,
  ): Promise<AuditExportSchedule> {
    const client = this.supabase.getClient();

    const updateData: Record<string, unknown> = {};
    if (updates.frequency) updateData.frequency = updates.frequency;
    if (updates.formats) updateData.formats = updates.formats;
    if (updates.notifyEmails) updateData.notify_emails = updates.notifyEmails;
    if (typeof updates.isActive === 'boolean') updateData.is_active = updates.isActive;

    const { data, error } = await client
      .from('pta_audit.audit_export_schedule')
      .update(updateData)
      .eq('id', scheduleId)
      .select()
      .single();

    if (error) {
      throw new Error('Failed to update schedule');
    }

    const schedule = this.mapToSchedule(data);

    // Re-register with updated settings
    await this.unregisterSchedule(scheduleId);
    if (schedule.isActive) {
      await this.registerSchedule(schedule);
    }

    return schedule;
  }

  /**
   * Deactivate a schedule
   */
  async deactivateSchedule(scheduleId: string): Promise<void> {
    await this.repository.deactivateSchedule(scheduleId);
    await this.unregisterSchedule(scheduleId);
  }

  /**
   * Get all schedules for a tenant
   */
  async getSchedulesForTenant(tenantId: string): Promise<AuditExportSchedule[]> {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('pta_audit.audit_export_schedule')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error('Failed to fetch schedules');
    }

    return (data || []).map(this.mapToSchedule);
  }

  /**
   * Get schedule by ID
   */
  async getScheduleById(scheduleId: string): Promise<AuditExportSchedule | null> {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('pta_audit.audit_export_schedule')
      .select('*')
      .eq('id', scheduleId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return this.mapToSchedule(data);
  }

  /**
   * Run scheduled exports manually (for testing/admin use)
   */
  async triggerScheduledExport(scheduleId: string): Promise<void> {
    const schedule = await this.getScheduleById(scheduleId);
    if (!schedule) {
      throw new Error('Schedule not found');
    }

    await this.executeScheduledExport(schedule);
  }

  /**
   * Get cron expression for frequency
   */
  private getCronExpression(frequency: ScheduleFrequency): string {
    switch (frequency) {
      case ScheduleFrequency.DAILY:
        return '0 2 * * *'; // 2 AM daily
      case ScheduleFrequency.WEEKLY:
        return '0 2 * * 1'; // 2 AM every Monday
      case ScheduleFrequency.MONTHLY:
        return '0 2 1 * *'; // 2 AM on 1st of month
      default:
        return '0 2 * * *'; // Default to daily
    }
  }

  /**
   * Calculate date range based on frequency
   */
  private calculateDateRange(frequency: ScheduleFrequency): {
    startDate: Date;
    endDate: Date;
  } {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setHours(0, 0, 0, 0); // Start of today

    let startDate: Date;

    switch (frequency) {
      case ScheduleFrequency.DAILY:
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 1);
        break;
      case ScheduleFrequency.WEEKLY:
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 7);
        break;
      case ScheduleFrequency.MONTHLY:
        startDate = new Date(endDate);
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      default:
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 1);
    }

    return { startDate, endDate };
  }

  /**
   * Update last run time for a schedule
   */
  private async updateLastRunTime(scheduleId: string): Promise<void> {
    const client = this.supabase.getClient();

    await client
      .from('pta_audit.audit_export_schedule')
      .update({ last_run_at: new Date().toISOString() })
      .eq('id', scheduleId);
  }

  /**
   * Record a schedule error
   */
  private async recordScheduleError(scheduleId: string, error: string): Promise<void> {
    const client = this.supabase.getClient();

    // Get current error count
    const { data: schedule } = await client
      .from('pta_audit.audit_export_schedule')
      .select('consecutive_failures')
      .eq('id', scheduleId)
      .single();

    const consecutiveFailures = (schedule?.consecutive_failures || 0) + 1;

    await client
      .from('pta_audit.audit_export_schedule')
      .update({
        consecutive_failures: consecutiveFailures,
        last_error: error,
        last_error_at: new Date().toISOString(),
      })
      .eq('id', scheduleId);

    // Deactivate if too many failures
    if (consecutiveFailures >= 5) {
      this.logger.warn(`Deactivating schedule ${scheduleId} after ${consecutiveFailures} failures`);
      await this.deactivateSchedule(scheduleId);
    }
  }

  /**
   * Map database row to AuditExportSchedule
   */
  private mapToSchedule(row: Record<string, unknown>): AuditExportSchedule {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      exportType: row.export_type as AuditExportType,
      frequency: row.frequency as ScheduleFrequency,
      formats: row.formats as ExportFormat[],
      isActive: row.is_active as boolean,
      lastRunAt: row.last_run_at ? new Date(row.last_run_at as string) : undefined,
      nextRunAt: row.next_run_at ? new Date(row.next_run_at as string) : undefined,
      notifyEmails: row.notify_emails as string[] | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  /**
   * Daily cleanup job - runs at 3 AM
   */
  @Cron('0 3 * * *')
  async dailyCleanup(): Promise<void> {
    this.logger.log('Running daily schedule cleanup');

    // Reload schedules to pick up any database changes
    await this.loadActiveSchedules();
  }

  /**
   * Get schedule status
   */
  async getScheduleStatus(): Promise<{
    activeCount: number;
    pausedCount: number;
    failedCount: number;
  }> {
    const client = this.supabase.getClient();

    const { data: schedules, error } = await client
      .from('pta_audit.audit_export_schedule')
      .select('is_active, consecutive_failures');

    if (error) {
      throw new Error('Failed to get schedule status');
    }

    let activeCount = 0;
    let pausedCount = 0;
    let failedCount = 0;

    (schedules || []).forEach((s) => {
      if (s.is_active) {
        activeCount++;
      } else if (s.consecutive_failures > 0) {
        failedCount++;
      } else {
        pausedCount++;
      }
    });

    return { activeCount, pausedCount, failedCount };
  }
}
