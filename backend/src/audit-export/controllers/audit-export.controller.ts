/**
 * Audit Export Public Controller
 * 
 * Public endpoints for viewing and downloading audit exports.
 * Supports VIEW_ONLY_AUDIT role.
 */

import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
  Response,
  StreamableFile,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/supabase-jwt.guard';
import {
  AuditExportRoleGuard,
  RequireAuditPermissions,
} from '../guards/audit-export-role.guard';
import { AuditExportService } from '../services/audit-export.service';
import { AuditExportStorageService } from '../services/storage.service';
import { AuditExportAccessLogService } from '../services/access-log.service';
import { ListExportRunsDto, ExportRunResponseDto } from '../dto';
import { AuditExportPermission } from '../types';

@ApiTags('Audit Export - View')
@ApiBearerAuth()
@Controller('audit-export')
@UseGuards(SupabaseJwtGuard, AuditExportRoleGuard)
export class AuditExportController {
  constructor(
    private readonly auditExportService: AuditExportService,
    private readonly storageService: AuditExportStorageService,
    private readonly accessLogService: AuditExportAccessLogService,
  ) {}

  @Get('runs')
  @RequireAuditPermissions(AuditExportPermission.VIEW_EXPORTS)
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
  @RequireAuditPermissions(AuditExportPermission.VIEW_EXPORTS)
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

  @Get('runs/:id/files')
  @RequireAuditPermissions(AuditExportPermission.VIEW_EXPORTS)
  @ApiOperation({ summary: 'List files for an export run' })
  @ApiResponse({ status: 200, description: 'List of files' })
  async listExportFiles(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.auditExportService.getExportFiles(id);
  }

  @Get('files/:fileId')
  @RequireAuditPermissions(AuditExportPermission.VIEW_EXPORTS)
  @ApiOperation({ summary: 'Get file metadata' })
  @ApiResponse({ status: 200, description: 'File metadata' })
  async getFileMetadata(
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.storageService.getFileMetadata(fileId);
  }

  @Get('files/:fileId/download')
  @RequireAuditPermissions(AuditExportPermission.DOWNLOAD_EXPORTS)
  @ApiOperation({ summary: 'Download an export file' })
  @ApiResponse({ status: 200, description: 'File download' })
  async downloadFile(
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Request() req: { user: { id: string }; ip: string; headers: Record<string, string> },
    @Response({ passthrough: true }) res: ExpressResponse,
  ): Promise<StreamableFile> {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    
    const { content, filename, mimeType } = await this.auditExportService.downloadFile(
      fileId,
      req.user.id,
      ipAddress as string,
    );

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': content.length,
    });

    return new StreamableFile(content);
  }

  @Get('files/:fileId/verify')
  @RequireAuditPermissions(AuditExportPermission.VIEW_EXPORTS)
  @ApiOperation({ summary: 'Verify file integrity' })
  @ApiResponse({ status: 200, description: 'Integrity verification result' })
  async verifyFileIntegrity(
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ): Promise<{ valid: boolean; message: string }> {
    return this.storageService.verifyFileIntegrity(fileId);
  }

  @Get('runs/:id/access-history')
  @RequireAuditPermissions(AuditExportPermission.VIEW_AUDIT_LOGS)
  @ApiOperation({ summary: 'Get access history for an export run' })
  @ApiResponse({ status: 200, description: 'Access history' })
  async getAccessHistory(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.accessLogService.getRunAccessHistory(id);
  }
}
