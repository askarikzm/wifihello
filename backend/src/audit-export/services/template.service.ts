/**
 * Audit Export Template Service
 * 
 * Manages PTA-compliant export templates including column mappings,
 * date filter configurations, and validation rules.
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuditExportRepository } from '../repositories/audit-export.repository';
import {
  AuditExportTemplate,
  AuditExportType,
  ExportFormat,
  ColumnDefinition,
} from '../types';

@Injectable()
export class AuditExportTemplateService {
  private readonly logger = new Logger(AuditExportTemplateService.name);

  // Cache templates in memory (refreshed on demand)
  private templateCache: Map<string, AuditExportTemplate> = new Map();
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly repository: AuditExportRepository) {}

  /**
   * Get all available export templates
   */
  async getAllTemplates(tenantId?: string): Promise<AuditExportTemplate[]> {
    const client = this.repository['supabase'].getClient();
    
    let query = client
      .from('pta_audit.audit_export_template')
      .select('*')
      .eq('is_active', true)
      .order('export_type', { ascending: true });

    if (tenantId) {
      query = query.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error('Failed to fetch templates', error);
      throw new Error('Failed to fetch export templates');
    }

    return (data || []).map(this.mapToTemplate);
  }

  /**
   * Get template by export type code
   */
  async getTemplateByType(
    exportType: AuditExportType,
    tenantId?: string,
  ): Promise<AuditExportTemplate> {
    // Check cache first
    const cacheKey = `${exportType}_${tenantId || 'global'}`;
    if (this.isCacheValid() && this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey)!;
    }

    const template = await this.repository.getTemplateByCode(exportType, tenantId);
    
    if (!template) {
      throw new NotFoundException(`Template not found for type: ${exportType}`);
    }

    // Cache the template
    this.templateCache.set(cacheKey, template);
    this.cacheTimestamp = Date.now();

    return template;
  }

  /**
   * Get template by ID
   */
  async getTemplateById(templateId: string): Promise<AuditExportTemplate> {
    const client = this.repository['supabase'].getClient();
    
    const { data, error } = await client
      .from('pta_audit.audit_export_template')
      .select('*')
      .eq('id', templateId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Template not found: ${templateId}`);
    }

    return this.mapToTemplate(data);
  }

  /**
   * Validate export parameters against template constraints
   */
  async validateExportParams(
    exportType: AuditExportType,
    startDate: Date,
    endDate: Date,
    format: ExportFormat,
    tenantId?: string,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    const template = await this.getTemplateByType(exportType, tenantId);

    // Check format is supported
    if (!template.supportedFormats.includes(format)) {
      errors.push(
        `Format ${format} not supported for ${exportType}. Supported: ${template.supportedFormats.join(', ')}`,
      );
    }

    // Check date range is within limits
    const rangeMs = endDate.getTime() - startDate.getTime();
    const rangeDays = Math.ceil(rangeMs / (1000 * 60 * 60 * 24));

    if (rangeDays > template.maxRangeDays) {
      errors.push(
        `Date range ${rangeDays} days exceeds maximum of ${template.maxRangeDays} days for ${exportType}`,
      );
    }

    // Check start date is before end date
    if (startDate >= endDate) {
      errors.push('Start date must be before end date');
    }

    // Check end date is not in the future (with 1 hour buffer for timezone issues)
    const futureBuffer = new Date(Date.now() + 60 * 60 * 1000);
    if (endDate > futureBuffer) {
      errors.push('End date cannot be in the future');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get columns for export based on template
   */
  async getExportColumns(
    exportType: AuditExportType,
    tenantId?: string,
  ): Promise<ColumnDefinition[]> {
    const template = await this.getTemplateByType(exportType, tenantId);
    return template.columns;
  }

  /**
   * Get PTA-formatted column headers
   */
  async getPtaHeaders(
    exportType: AuditExportType,
    tenantId?: string,
  ): Promise<string[]> {
    const columns = await this.getExportColumns(exportType, tenantId);
    return columns.map((col) => col.pta_header);
  }

  /**
   * Create a custom template (tenant-specific override)
   */
  async createCustomTemplate(
    baseType: AuditExportType,
    tenantId: string,
    customColumns: ColumnDefinition[],
    displayName?: string,
  ): Promise<AuditExportTemplate> {
    const baseTemplate = await this.getTemplateByType(baseType);

    const client = this.repository['supabase'].getClient();
    
    const { data, error } = await client
      .from('pta_audit.audit_export_template')
      .insert({
        tenant_id: tenantId,
        export_type: baseType,
        display_name: displayName || `${baseTemplate.displayName} (Custom)`,
        description: `Custom template based on ${baseType}`,
        column_definitions: customColumns,
        date_filter_field: baseTemplate.dateFilterField,
        source_tables: baseTemplate.sourceTables,
        supported_formats: baseTemplate.supportedFormats,
        max_range_days: baseTemplate.maxRangeDays,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to create custom template', error);
      throw new BadRequestException('Failed to create custom template');
    }

    // Invalidate cache
    this.clearCache();

    return this.mapToTemplate(data);
  }

  /**
   * Deactivate a template (soft delete)
   */
  async deactivateTemplate(templateId: string): Promise<void> {
    const client = this.repository['supabase'].getClient();
    
    const { error } = await client
      .from('pta_audit.audit_export_template')
      .update({ is_active: false })
      .eq('id', templateId);

    if (error) {
      this.logger.error('Failed to deactivate template', error);
      throw new Error('Failed to deactivate template');
    }

    // Invalidate cache
    this.clearCache();
  }

  /**
   * Get available export types (enum values)
   */
  getAvailableExportTypes(): AuditExportType[] {
    return Object.values(AuditExportType);
  }

  /**
   * Get available export formats
   */
  getAvailableFormats(): ExportFormat[] {
    return Object.values(ExportFormat);
  }

  /**
   * Clear the template cache
   */
  clearCache(): void {
    this.templateCache.clear();
    this.cacheTimestamp = 0;
    this.logger.debug('Template cache cleared');
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    return Date.now() - this.cacheTimestamp < this.CACHE_TTL;
  }

  /**
   * Map database row to template interface
   */
  private mapToTemplate(row: Record<string, unknown>): AuditExportTemplate {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string | undefined,
      exportType: row.export_type as AuditExportType,
      displayName: row.display_name as string,
      description: row.description as string,
      columns: (row.column_definitions || []) as ColumnDefinition[],
      dateFilterField: row.date_filter_field as string,
      sourceTables: row.source_tables as string[],
      supportedFormats: row.supported_formats as ExportFormat[],
      maxRangeDays: row.max_range_days as number,
      isActive: row.is_active as boolean,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
