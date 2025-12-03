/**
 * Audit Export Admin Controller
 * 
 * Admin endpoints for managing PTA audit exports.
 * Requires PTA_COMPLIANCE_OFFICER or SUPER_ADMIN role.
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/supabase-jwt.guard';
import { PtaComplianceGuard } from '../guards/pta-compliance.guard';
import {
  AuditExportRoleGuard,
  RequireAuditPermissions,
  AllowAuditRoles,
} from '../guards/audit-export-role.guard';
import { AuditExportService } from '../services/audit-export.service';
import { AuditExportTemplateService } from '../services/template.service';
import { AuditExportSchedulerService } from '../services/scheduler.service';
import { AuditExportAccessLogService } from '../services/access-log.service';
import {
  CreateAuditExportRunDto,
  ListExportRunsDto,
  ExportRunResponseDto,
  CreateExportScheduleDto,
  UpdateExportScheduleDto,
  TemplateResponseDto,
} from '../dto';
import {
  AuditExportRole,
  AuditExportPermission,
  AuditExportType,
  ExportFormat,
} from '../types';

@ApiTags('Audit Export - Admin')
@ApiBearerAuth()
@Controller('admin/audit-export')
@UseGuards(SupabaseJwtGuard, PtaComplianceGuard)
export class AuditExportAdminController {
  constructor(
    private readonly auditExportService: AuditExportService,
    private readonly templateService: AuditExportTemplateService,
    private readonly schedulerService: AuditExportSchedulerService,
    private readonly accessLogService: AuditExportAccessLogService,
  ) {}

  // ========================================
  // EXPORT RUNS
  // ========================================

  @Post('runs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new audit export run' })
  @ApiResponse({ status: 201, description: 'Export run created and processing started' })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  async createExportRun(
    @Body() dto: CreateAuditExportRunDto,
    @Request() req: { user: { id: string; tenantId: string } },
  ): Promise<ExportRunResponseDto> {
    const ipAddress = req['ip'] || req['connection']?.remoteAddress || 'unknown';
    
    const result = await this.auditExportService.createExportRun(
      dto,
      req.user.id,
      req.user.tenantId,
      ipAddress,
    );

    return this.auditExportService.toResponseDto(result.run);
  }

  @Get('runs')
  @ApiOperation({ summary: 'List audit export runs' })
  @ApiResponse({ status: 200, description: 'List of export runs' })
  async listExportRuns(
    @Query() dto: ListExportRunsDto,
    @Request() req: { user: { tenantId: string } },
  ): Promise<{ runs: ExportRunResponseDto[]; total: number }> {
    const { runs, total } = await this.auditExportService.listExportRuns(
      dto,
      req.user.tenantId,
    );

    return {
      runs: runs.map((run) => this.auditExportService.toResponseDto(run)),
      total,
    };
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Get export run details' })
  @ApiResponse({ status: 200, description: 'Export run details' })
  @ApiResponse({ status: 404, description: 'Export run not found' })
  async getExportRun(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { id: string } },
  ): Promise<ExportRunResponseDto> {
    const run = await this.auditExportService.getExportRun(id, req.user.id);
    
    if (!run) {
      throw new Error('Export run not found');
    }

    const files = await this.auditExportService.getExportFiles(id);
    return this.auditExportService.toResponseDto(run, files);
  }

  @Delete('runs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a pending export run' })
  @ApiResponse({ status: 204, description: 'Export run cancelled' })
  async cancelExportRun(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { id: string } },
  ): Promise<void> {
    await this.auditExportService.cancelExportRun(id, req.user.id);
  }

  @Post('runs/:id/retry')
  @ApiOperation({ summary: 'Retry a failed export run' })
  @ApiResponse({ status: 201, description: 'New export run created' })
  async retryExportRun(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { id: string; tenantId: string } },
  ): Promise<ExportRunResponseDto> {
    const ipAddress = req['ip'] || 'unknown';
    
    const result = await this.auditExportService.retryExportRun(
      id,
      req.user.id,
      req.user.tenantId,
      ipAddress,
    );

    return this.auditExportService.toResponseDto(result.run);
  }

  // ========================================
  // FILES
  // ========================================

  @Get('runs/:id/files')
  @ApiOperation({ summary: 'List files for an export run' })
  @ApiResponse({ status: 200, description: 'List of files' })
  async listExportFiles(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.auditExportService.getExportFiles(id);
  }

  @Get('files/:fileId/download-url')
  @ApiOperation({ summary: 'Get signed download URL for a file' })
  @ApiResponse({ status: 200, description: 'Signed download URL' })
  async getDownloadUrl(
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Query('expiresIn') expiresIn: number,
    @Request() req: { user: { id: string } },
  ): Promise<{ url: string; expiresAt: string }> {
    const result = await this.auditExportService.getDownloadUrl(
      fileId,
      req.user.id,
      expiresIn || 3600,
    );

    return {
      url: result.url,
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  // ========================================
  // TEMPLATES
  // ========================================

  @Get('templates')
  @ApiOperation({ summary: 'List all export templates' })
  @ApiResponse({ status: 200, description: 'List of templates' })
  async listTemplates(
    @Request() req: { user: { tenantId: string } },
  ): Promise<TemplateResponseDto[]> {
    const templates = await this.templateService.getAllTemplates(req.user.tenantId);
    
    return templates.map((t) => ({
      id: t.id,
      exportType: t.exportType,
      displayName: t.displayName,
      description: t.description,
      supportedFormats: t.supportedFormats,
      maxRangeDays: t.maxRangeDays,
      columnCount: t.columns.length,
    }));
  }

  @Get('templates/:type')
  @ApiOperation({ summary: 'Get template by export type' })
  @ApiResponse({ status: 200, description: 'Template details' })
  async getTemplate(
    @Param('type') type: AuditExportType,
    @Request() req: { user: { tenantId: string } },
  ) {
    return this.templateService.getTemplateByType(type, req.user.tenantId);
  }

  @Get('templates/:type/columns')
  @ApiOperation({ summary: 'Get column definitions for a template' })
  @ApiResponse({ status: 200, description: 'Column definitions' })
  async getTemplateColumns(
    @Param('type') type: AuditExportType,
    @Request() req: { user: { tenantId: string } },
  ) {
    return this.templateService.getExportColumns(type, req.user.tenantId);
  }

  // ========================================
  // SCHEDULES
  // ========================================

  @Get('schedules')
  @ApiOperation({ summary: 'List export schedules' })
  @ApiResponse({ status: 200, description: 'List of schedules' })
  async listSchedules(
    @Request() req: { user: { tenantId: string } },
  ) {
    return this.schedulerService.getSchedulesForTenant(req.user.tenantId);
  }

  @Post('schedules')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an export schedule' })
  @ApiResponse({ status: 201, description: 'Schedule created' })
  async createSchedule(
    @Body() dto: CreateExportScheduleDto,
    @Request() req: { user: { tenantId: string } },
  ) {
    return this.schedulerService.createSchedule(
      req.user.tenantId,
      dto.exportType,
      dto.frequency,
      dto.formats,
      dto.notifyEmails,
    );
  }

  @Get('schedules/:id')
  @ApiOperation({ summary: 'Get schedule details' })
  @ApiResponse({ status: 200, description: 'Schedule details' })
  async getSchedule(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.schedulerService.getScheduleById(id);
  }

  @Delete('schedules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate a schedule' })
  @ApiResponse({ status: 204, description: 'Schedule deactivated' })
  async deactivateSchedule(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.schedulerService.deactivateSchedule(id);
  }

  @Post('schedules/:id/trigger')
  @ApiOperation({ summary: 'Manually trigger a scheduled export' })
  @ApiResponse({ status: 200, description: 'Export triggered' })
  async triggerSchedule(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.schedulerService.triggerScheduledExport(id);
    return { message: 'Scheduled export triggered' };
  }

  // ========================================
  // ACCESS LOGS
  // ========================================

  @Get('runs/:id/access-logs')
  @ApiOperation({ summary: 'Get access logs for an export run' })
  @ApiResponse({ status: 200, description: 'Access logs' })
  async getRunAccessLogs(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.accessLogService.getRunAccessHistory(id);
  }

  @Get('access-logs')
  @ApiOperation({ summary: 'Query access logs' })
  @ApiResponse({ status: 200, description: 'Access logs' })
  async queryAccessLogs(
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.accessLogService.queryLogs({
      userId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit,
      offset,
    });
  }

  @Get('runs/:id/verify-chain')
  @ApiOperation({ summary: 'Verify hash chain integrity for an export run' })
  @ApiResponse({ status: 200, description: 'Chain verification result' })
  async verifyHashChain(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.accessLogService.verifyHashChainIntegrity(id);
  }

  // ========================================
  // STATISTICS
  // ========================================

  @Get('statistics')
  @ApiOperation({ summary: 'Get export statistics' })
  @ApiResponse({ status: 200, description: 'Export statistics' })
  async getStatistics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Request() req: { user: { tenantId: string } },
  ) {
    return this.auditExportService.getExportStatistics(
      req.user.tenantId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('access-statistics')
  @ApiOperation({ summary: 'Get access statistics' })
  @ApiResponse({ status: 200, description: 'Access statistics' })
  async getAccessStatistics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Request() req: { user: { tenantId: string } },
  ) {
    return this.accessLogService.getAccessStatistics(
      new Date(startDate),
      new Date(endDate),
      req.user.tenantId,
    );
  }

  // ========================================
  // ENUMS/OPTIONS
  // ========================================

  @Get('export-types')
  @ApiOperation({ summary: 'Get available export types' })
  @ApiResponse({ status: 200, description: 'List of export types' })
  getExportTypes(): AuditExportType[] {
    return this.templateService.getAvailableExportTypes();
  }

  @Get('formats')
  @ApiOperation({ summary: 'Get available export formats' })
  @ApiResponse({ status: 200, description: 'List of formats' })
  getFormats(): ExportFormat[] {
    return this.templateService.getAvailableFormats();
  }

  @Get('schedule-status')
  @ApiOperation({ summary: 'Get scheduler status' })
  @ApiResponse({ status: 200, description: 'Scheduler status' })
  async getSchedulerStatus() {
    return this.schedulerService.getScheduleStatus();
  }
}
