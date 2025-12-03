/**
 * Audit Export DTOs
 * 
 * Data Transfer Objects for the PTA Audit Export API.
 * Uses class-validator for runtime validation.
 */

import {
  IsString,
  IsUUID,
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
  IsInt,
  IsArray,
  IsEmail,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  ExportRunStatus,
  ScheduleFrequency,
  ExportFormat,
  AuditExportType,
  ColumnDefinition,
} from '../types';

// ============================================
// Request DTOs
// ============================================

/**
 * Create a new export run request
 */
export class CreateAuditExportRunDto {
  @ApiProperty({
    description: 'Export type (e.g., IPDR_DAILY, RADIUS_AUTH_LOGS)',
    enum: AuditExportType,
    example: 'IPDR_DAILY',
  })
  @IsEnum(AuditExportType)
  exportType: AuditExportType;

  @ApiProperty({
    description: 'Export format',
    enum: ExportFormat,
    example: 'csv',
  })
  @IsEnum(ExportFormat)
  format: ExportFormat;

  @ApiProperty({
    description: 'Start date for export range (ISO 8601)',
    example: '2024-12-01T00:00:00.000Z',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'End date for export range (ISO 8601)',
    example: '2024-12-02T00:00:00.000Z',
  })
  @IsDateString()
  endDate: string;
}

/**
 * List export runs with filters
 */
export class ListExportRunsDto {
  @ApiPropertyOptional({ enum: AuditExportType })
  @IsOptional()
  @IsEnum(AuditExportType)
  exportType?: AuditExportType;

  @ApiPropertyOptional({ enum: ExportRunStatus })
  @IsOptional()
  @IsEnum(ExportRunStatus)
  status?: ExportRunStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;
}

/**
 * Create an export schedule
 */
export class CreateExportScheduleDto {
  @ApiProperty({
    description: 'Export type',
    enum: AuditExportType,
  })
  @IsEnum(AuditExportType)
  exportType: AuditExportType;

  @ApiProperty({
    description: 'Schedule frequency',
    enum: ScheduleFrequency,
  })
  @IsEnum(ScheduleFrequency)
  frequency: ScheduleFrequency;

  @ApiProperty({
    description: 'Export formats to generate',
    type: [String],
    enum: ExportFormat,
  })
  @IsArray()
  @IsEnum(ExportFormat, { each: true })
  formats: ExportFormat[];

  @ApiPropertyOptional({
    description: 'Email addresses for notifications',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  notifyEmails?: string[];
}

/**
 * Update an export schedule
 */
export class UpdateExportScheduleDto {
  @ApiPropertyOptional({ enum: ScheduleFrequency })
  @IsOptional()
  @IsEnum(ScheduleFrequency)
  frequency?: ScheduleFrequency;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsEnum(ExportFormat, { each: true })
  formats?: ExportFormat[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  notifyEmails?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ============================================
// Response DTOs
// ============================================

export class ExportRunResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty({ enum: AuditExportType })
  exportType: AuditExportType;

  @ApiProperty({ enum: ExportFormat })
  format: ExportFormat;

  @ApiProperty({ enum: ExportRunStatus })
  status: ExportRunStatus;

  @ApiProperty()
  startDate: string;

  @ApiProperty()
  endDate: string;

  @ApiProperty()
  requestedBy: string;

  @ApiPropertyOptional()
  rowCount?: number;

  @ApiPropertyOptional()
  errorMessage?: string;

  @ApiProperty()
  createdAt: string;

  @ApiPropertyOptional()
  completedAt?: string;

  @ApiPropertyOptional({ type: [Object] })
  files?: {
    id: string;
    filename: string;
    mimeType: string;
    fileSize: number;
    sha256Hash: string;
    rowCount: number;
  }[];
}

export class TemplateResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: AuditExportType })
  exportType: AuditExportType;

  @ApiProperty()
  displayName: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: [String] })
  supportedFormats: ExportFormat[];

  @ApiProperty()
  maxRangeDays: number;

  @ApiProperty()
  columnCount: number;
}

export class ScheduleResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty({ enum: AuditExportType })
  exportType: AuditExportType;

  @ApiProperty({ enum: ScheduleFrequency })
  frequency: ScheduleFrequency;

  @ApiProperty({ type: [String] })
  formats: ExportFormat[];

  @ApiProperty()
  isActive: boolean;

  @ApiPropertyOptional()
  lastRunAt?: string;

  @ApiPropertyOptional()
  nextRunAt?: string;

  @ApiPropertyOptional({ type: [String] })
  notifyEmails?: string[];

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

export class AccessLogResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  runId: string;

  @ApiPropertyOptional()
  fileId?: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  action: string;

  @ApiProperty()
  ipAddress: string;

  @ApiPropertyOptional()
  userAgent?: string;

  @ApiProperty()
  hash: string;

  @ApiProperty()
  createdAt: string;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ type: [Object] })
  data: T[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  offset: number;
}

// ============================================
// Error Response DTOs
// ============================================

export class ErrorResponseDto {
  @ApiProperty()
  statusCode: number;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  error?: string;

  @ApiPropertyOptional()
  details?: object;
}
