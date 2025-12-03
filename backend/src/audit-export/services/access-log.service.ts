/**
 * Audit Export Access Log Service
 * 
 * Provides immutable audit trail for all export access events.
 * Implements hash chain for tamper detection.
 */

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseClientService } from '../../database/supabase-client.service';
import { AuditExportRepository } from '../repositories/audit-export.repository';
import { AuditExportAccessLog, AccessAction } from '../types';

export interface AccessLogEntry {
  runId: string;
  fileId?: string;
  userId: string;
  action: AccessAction;
  ipAddress: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface AccessLogQuery {
  runId?: string;
  fileId?: string;
  userId?: string;
  action?: AccessAction;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditExportAccessLogService {
  private readonly logger = new Logger(AuditExportAccessLogService.name);

  constructor(
    private readonly supabase: SupabaseClientService,
    private readonly repository: AuditExportRepository,
  ) {}

  /**
   * Log an access event
   */
  async logAccess(entry: AccessLogEntry): Promise<AuditExportAccessLog> {
    return this.repository.logAccess(entry);
  }

  /**
   * Log export creation
   */
  async logExportCreated(
    runId: string,
    userId: string,
    ipAddress: string,
    userAgent?: string,
  ): Promise<void> {
    await this.logAccess({
      runId,
      userId,
      action: 'CREATE',
      ipAddress,
      userAgent,
    });
  }

  /**
   * Log file download
   */
  async logFileDownload(
    runId: string,
    fileId: string,
    userId: string,
    ipAddress: string,
    userAgent?: string,
  ): Promise<void> {
    await this.logAccess({
      runId,
      fileId,
      userId,
      action: 'DOWNLOAD',
      ipAddress,
      userAgent,
    });
  }

  /**
   * Log file view (metadata access)
   */
  async logFileView(
    runId: string,
    fileId: string,
    userId: string,
    ipAddress: string,
    userAgent?: string,
  ): Promise<void> {
    await this.logAccess({
      runId,
      fileId,
      userId,
      action: 'VIEW',
      ipAddress,
      userAgent,
    });
  }

  /**
   * Log file share event
   */
  async logFileShare(
    runId: string,
    fileId: string,
    userId: string,
    ipAddress: string,
    sharedWith: string[],
    userAgent?: string,
  ): Promise<void> {
    await this.logAccess({
      runId,
      fileId,
      userId,
      action: 'SHARE',
      ipAddress,
      userAgent,
      metadata: { sharedWith },
    });
  }

  /**
   * Log file deletion
   */
  async logFileDeletion(
    runId: string,
    userId: string,
    ipAddress: string,
    reason: string,
    userAgent?: string,
  ): Promise<void> {
    await this.logAccess({
      runId,
      userId,
      action: 'DELETE',
      ipAddress,
      userAgent,
      metadata: { reason },
    });
  }

  /**
   * Query access logs
   */
  async queryLogs(query: AccessLogQuery): Promise<{
    logs: AuditExportAccessLog[];
    total: number;
  }> {
    const client = this.supabase.getClient();
    
    let dbQuery = client
      .from('pta_audit.audit_export_access_log')
      .select('*', { count: 'exact' });

    if (query.runId) {
      dbQuery = dbQuery.eq('run_id', query.runId);
    }
    if (query.fileId) {
      dbQuery = dbQuery.eq('file_id', query.fileId);
    }
    if (query.userId) {
      dbQuery = dbQuery.eq('user_id', query.userId);
    }
    if (query.action) {
      dbQuery = dbQuery.eq('action', query.action);
    }
    if (query.startDate) {
      dbQuery = dbQuery.gte('created_at', query.startDate.toISOString());
    }
    if (query.endDate) {
      dbQuery = dbQuery.lte('created_at', query.endDate.toISOString());
    }

    // Order by created_at descending
    dbQuery = dbQuery.order('created_at', { ascending: false });

    // Pagination
    const limit = query.limit || 50;
    const offset = query.offset || 0;
    dbQuery = dbQuery.range(offset, offset + limit - 1);

    const { data, error, count } = await dbQuery;

    if (error) {
      this.logger.error('Failed to query access logs', error);
      throw new Error('Failed to query access logs');
    }

    return {
      logs: (data || []).map(this.mapToLog),
      total: count || 0,
    };
  }

  /**
   * Get access history for a specific export run
   */
  async getRunAccessHistory(runId: string): Promise<AuditExportAccessLog[]> {
    const { logs } = await this.queryLogs({ runId, limit: 1000 });
    return logs;
  }

  /**
   * Get access history for a specific file
   */
  async getFileAccessHistory(fileId: string): Promise<AuditExportAccessLog[]> {
    const { logs } = await this.queryLogs({ fileId, limit: 1000 });
    return logs;
  }

  /**
   * Get user's access history
   */
  async getUserAccessHistory(
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<AuditExportAccessLog[]> {
    const { logs } = await this.queryLogs({
      userId,
      startDate,
      endDate,
      limit: 1000,
    });
    return logs;
  }

  /**
   * Verify hash chain integrity for a run
   */
  async verifyHashChainIntegrity(runId: string): Promise<{
    valid: boolean;
    errors: string[];
    checkedCount: number;
  }> {
    const { logs } = await this.queryLogs({ runId, limit: 10000 });
    const errors: string[] = [];

    // Sort by created_at ascending for chain verification
    const sortedLogs = logs.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    for (let i = 1; i < sortedLogs.length; i++) {
      const current = sortedLogs[i];
      const previous = sortedLogs[i - 1];

      // The previous_hash should match the hash of the previous entry
      // (This is enforced by database triggers, but we verify here)
      if (current.previousHash && current.previousHash !== previous.hash) {
        errors.push(
          `Hash chain broken at log ${current.id}: expected ${previous.hash}, got ${current.previousHash}`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      checkedCount: sortedLogs.length,
    };
  }

  /**
   * Get access statistics for a time period
   */
  async getAccessStatistics(
    startDate: Date,
    endDate: Date,
    tenantId?: string,
  ): Promise<{
    totalAccesses: number;
    byAction: Record<AccessAction, number>;
    byUser: { userId: string; count: number }[];
    byRun: { runId: string; count: number }[];
  }> {
    const client = this.supabase.getClient();

    // Get all logs in period
    let query = client
      .from('pta_audit.audit_export_access_log')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    const { data: logs, error } = await query;

    if (error) {
      throw new Error('Failed to fetch access statistics');
    }

    const allLogs = logs || [];

    // Calculate statistics
    const byAction: Record<AccessAction, number> = {
      CREATE: 0,
      VIEW: 0,
      DOWNLOAD: 0,
      SHARE: 0,
      DELETE: 0,
    };

    const userCounts: Map<string, number> = new Map();
    const runCounts: Map<string, number> = new Map();

    allLogs.forEach((log) => {
      // By action
      const action = log.action as AccessAction;
      byAction[action] = (byAction[action] || 0) + 1;

      // By user
      const userId = log.user_id;
      userCounts.set(userId, (userCounts.get(userId) || 0) + 1);

      // By run
      const runId = log.run_id;
      runCounts.set(runId, (runCounts.get(runId) || 0) + 1);
    });

    // Convert maps to sorted arrays
    const byUser = Array.from(userCounts.entries())
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const byRun = Array.from(runCounts.entries())
      .map(([runId, count]) => ({ runId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalAccesses: allLogs.length,
      byAction,
      byUser,
      byRun,
    };
  }

  /**
   * Export access logs for compliance reporting
   */
  async exportAccessLogs(
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv' = 'json',
  ): Promise<string> {
    const { logs } = await this.queryLogs({
      startDate,
      endDate,
      limit: 100000,
    });

    if (format === 'csv') {
      const headers = [
        'Log ID',
        'Run ID',
        'File ID',
        'User ID',
        'Action',
        'IP Address',
        'User Agent',
        'Created At',
        'Hash',
      ];

      const rows = logs.map((log) => [
        log.id,
        log.runId,
        log.fileId || '',
        log.userId,
        log.action,
        log.ipAddress,
        log.userAgent || '',
        log.createdAt.toISOString(),
        log.hash,
      ]);

      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    return JSON.stringify(logs, null, 2);
  }

  /**
   * Map database row to AuditExportAccessLog
   */
  private mapToLog(row: Record<string, unknown>): AuditExportAccessLog {
    return {
      id: row.id as string,
      runId: row.run_id as string,
      fileId: row.file_id as string | undefined,
      userId: row.user_id as string,
      action: row.action as AccessAction,
      ipAddress: row.ip_address as string,
      userAgent: row.user_agent as string | undefined,
      metadata: row.metadata as Record<string, unknown> | undefined,
      hash: row.hash as string,
      previousHash: row.previous_hash as string | undefined,
      createdAt: new Date(row.created_at as string),
    };
  }
}
