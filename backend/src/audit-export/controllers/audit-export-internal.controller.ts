/**
 * Audit Export Internal Controller
 * 
 * Internal endpoints for scheduled jobs and system operations.
 * Protected by API key authentication.
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Headers,
  UnauthorizedException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AuditExportSchedulerService } from '../services/scheduler.service';
import { AuditExportStorageService } from '../services/storage.service';
import { AuditExportAccessLogService } from '../services/access-log.service';

@ApiTags('Audit Export - Internal')
@Controller('internal/audit-export')
export class AuditExportInternalController {
  private readonly apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerService: AuditExportSchedulerService,
    private readonly storageService: AuditExportStorageService,
    private readonly accessLogService: AuditExportAccessLogService,
  ) {
    this.apiKey = this.configService.get<string>('INTERNAL_API_KEY', '');
  }

  /**
   * Validate internal API key
   */
  private validateApiKey(key: string): void {
    if (!this.apiKey || key !== this.apiKey) {
      throw new UnauthorizedException('Invalid internal API key');
    }
  }

  @Post('schedules/reload')
  @ApiOperation({ summary: 'Reload all active schedules' })
  @ApiHeader({ name: 'x-internal-api-key', required: true })
  @ApiResponse({ status: 200, description: 'Schedules reloaded' })
  async reloadSchedules(
    @Headers('x-internal-api-key') apiKey: string,
  ): Promise<{ message: string }> {
    this.validateApiKey(apiKey);
    
    await this.schedulerService.loadActiveSchedules();
    
    return { message: 'Schedules reloaded successfully' };
  }

  @Post('schedules/:id/execute')
  @ApiOperation({ summary: 'Execute a scheduled export' })
  @ApiHeader({ name: 'x-internal-api-key', required: true })
  @ApiResponse({ status: 200, description: 'Export executed' })
  async executeSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-internal-api-key') apiKey: string,
  ): Promise<{ message: string }> {
    this.validateApiKey(apiKey);
    
    await this.schedulerService.triggerScheduledExport(id);
    
    return { message: `Scheduled export ${id} executed` };
  }

  @Get('schedules/status')
  @ApiOperation({ summary: 'Get scheduler status' })
  @ApiHeader({ name: 'x-internal-api-key', required: true })
  @ApiResponse({ status: 200, description: 'Scheduler status' })
  async getSchedulerStatus(
    @Headers('x-internal-api-key') apiKey: string,
  ) {
    this.validateApiKey(apiKey);
    
    return this.schedulerService.getScheduleStatus();
  }

  @Post('storage/ensure-bucket')
  @ApiOperation({ summary: 'Ensure storage bucket exists' })
  @ApiHeader({ name: 'x-internal-api-key', required: true })
  @ApiResponse({ status: 200, description: 'Bucket ensured' })
  async ensureStorageBucket(
    @Headers('x-internal-api-key') apiKey: string,
  ): Promise<{ message: string }> {
    this.validateApiKey(apiKey);
    
    await this.storageService.ensureBucketExists();
    
    return { message: 'Storage bucket ensured' };
  }

  @Get('files/:fileId/verify')
  @ApiOperation({ summary: 'Verify file integrity' })
  @ApiHeader({ name: 'x-internal-api-key', required: true })
  @ApiResponse({ status: 200, description: 'Verification result' })
  async verifyFile(
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Headers('x-internal-api-key') apiKey: string,
  ) {
    this.validateApiKey(apiKey);
    
    return this.storageService.verifyFileIntegrity(fileId);
  }

  @Get('runs/:id/verify-chain')
  @ApiOperation({ summary: 'Verify hash chain integrity' })
  @ApiHeader({ name: 'x-internal-api-key', required: true })
  @ApiResponse({ status: 200, description: 'Chain verification result' })
  async verifyHashChain(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-internal-api-key') apiKey: string,
  ) {
    this.validateApiKey(apiKey);
    
    return this.accessLogService.verifyHashChainIntegrity(id);
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check for audit export service' })
  @ApiResponse({ status: 200, description: 'Service healthy' })
  async healthCheck(): Promise<{
    status: string;
    scheduler: { activeCount: number; pausedCount: number; failedCount: number };
  }> {
    const schedulerStatus = await this.schedulerService.getScheduleStatus();
    
    return {
      status: 'healthy',
      scheduler: schedulerStatus,
    };
  }
}
