/**
 * Audit Export Generator Service
 * 
 * Generates PTA-compliant export files in CSV, XLSX, and PDF formats.
 * Creates tamper-evident ZIP bundles with SHA-256 manifests.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as ExcelJS from 'exceljs';
import * as PDFDocument from 'pdfkit';
import * as archiver from 'archiver';
import { Writable } from 'stream';
import { AuditExportRepository } from '../repositories/audit-export.repository';
import { AuditExportTemplateService } from './template.service';
import {
  AuditExportType,
  ExportFormat,
  AuditExportRun,
  ExportRunStatus,
  ColumnDefinition,
  FileManifest,
} from '../types';

export interface GeneratedFile {
  filename: string;
  content: Buffer;
  mimeType: string;
  hash: string;
  rowCount: number;
}

export interface ExportBundle {
  zipFilename: string;
  zipContent: Buffer;
  zipHash: string;
  manifest: FileManifest;
  files: GeneratedFile[];
  totalRows: number;
  generatedAt: Date;
}

@Injectable()
export class AuditExportGeneratorService {
  private readonly logger = new Logger(AuditExportGeneratorService.name);

  // Region code for file naming (configurable)
  private readonly regionCode: string = 'PK-ISB';

  constructor(
    private readonly repository: AuditExportRepository,
    private readonly templateService: AuditExportTemplateService,
  ) {}

  /**
   * Generate export files and bundle them into a ZIP
   */
  async generateExportBundle(
    run: AuditExportRun,
    data: Record<string, unknown>[],
  ): Promise<ExportBundle> {
    const template = await this.templateService.getTemplateById(run.templateId);
    const columns = template.columns;

    const files: GeneratedFile[] = [];
    const generatedAt = new Date();
    const timestamp = this.formatTimestamp(generatedAt);

    // Generate file in requested format
    switch (run.format) {
      case ExportFormat.CSV:
        files.push(await this.generateCsv(run.exportType, columns, data, timestamp));
        break;
      case ExportFormat.XLSX:
        files.push(await this.generateXlsx(run.exportType, columns, data, timestamp));
        break;
      case ExportFormat.PDF:
        files.push(await this.generatePdf(run.exportType, columns, data, timestamp));
        break;
      case ExportFormat.ALL:
        files.push(await this.generateCsv(run.exportType, columns, data, timestamp));
        files.push(await this.generateXlsx(run.exportType, columns, data, timestamp));
        files.push(await this.generatePdf(run.exportType, columns, data, timestamp));
        break;
    }

    // Generate manifest
    const manifest = this.generateManifest(run, files, generatedAt);

    // Create tamper-evident ZIP bundle
    const zipFilename = this.generateZipFilename(run.exportType, timestamp);
    const zipContent = await this.createZipBundle(files, manifest);
    const zipHash = this.calculateHash(zipContent);

    return {
      zipFilename,
      zipContent,
      zipHash,
      manifest,
      files,
      totalRows: data.length,
      generatedAt,
    };
  }

  /**
   * Generate CSV file
   */
  private async generateCsv(
    exportType: AuditExportType,
    columns: ColumnDefinition[],
    data: Record<string, unknown>[],
    timestamp: string,
  ): Promise<GeneratedFile> {
    const filename = this.generateFilename(exportType, 'csv', timestamp);
    
    // Create header row with PTA headers
    const headers = columns.map((col) => this.escapeCsvField(col.pta_header));
    const headerRow = headers.join(',');

    // Create data rows
    const dataRows = data.map((row) => {
      return columns
        .map((col) => {
          const value = row[col.db_field];
          return this.escapeCsvField(this.formatValue(value, col.data_type));
        })
        .join(',');
    });

    const content = [headerRow, ...dataRows].join('\r\n');
    const buffer = Buffer.from(content, 'utf-8');

    return {
      filename,
      content: buffer,
      mimeType: 'text/csv',
      hash: this.calculateHash(buffer),
      rowCount: data.length,
    };
  }

  /**
   * Generate XLSX file
   */
  private async generateXlsx(
    exportType: AuditExportType,
    columns: ColumnDefinition[],
    data: Record<string, unknown>[],
    timestamp: string,
  ): Promise<GeneratedFile> {
    const filename = this.generateFilename(exportType, 'xlsx', timestamp);
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'WANCOM ISP - PTA Audit Export';
    workbook.created = new Date();
    
    const sheet = workbook.addWorksheet('Audit Data');

    // Set up columns with PTA headers
    sheet.columns = columns.map((col) => ({
      header: col.pta_header,
      key: col.db_field,
      width: Math.max(col.pta_header.length + 2, 15),
    }));

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A5F' }, // Dark blue
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { horizontal: 'center' };

    // Add data rows
    data.forEach((row) => {
      const rowData: Record<string, unknown> = {};
      columns.forEach((col) => {
        rowData[col.db_field] = this.formatValue(row[col.db_field], col.data_type);
      });
      sheet.addRow(rowData);
    });

    // Add auto-filter
    sheet.autoFilter = {
      from: 'A1',
      to: `${String.fromCharCode(64 + columns.length)}1`,
    };

    // Add metadata sheet
    const metaSheet = workbook.addWorksheet('Export Metadata');
    metaSheet.addRow(['Property', 'Value']);
    metaSheet.addRow(['Export Type', exportType]);
    metaSheet.addRow(['Generated At', timestamp]);
    metaSheet.addRow(['Total Records', data.length]);
    metaSheet.addRow(['Region Code', this.regionCode]);
    metaSheet.addRow(['Generator', 'WANCOM ISP PTA Audit Exporter']);

    const buffer = await workbook.xlsx.writeBuffer();

    return {
      filename,
      content: Buffer.from(buffer),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      hash: this.calculateHash(Buffer.from(buffer)),
      rowCount: data.length,
    };
  }

  /**
   * Generate PDF file
   */
  private async generatePdf(
    exportType: AuditExportType,
    columns: ColumnDefinition[],
    data: Record<string, unknown>[],
    timestamp: string,
  ): Promise<GeneratedFile> {
    const filename = this.generateFilename(exportType, 'pdf', timestamp);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 30,
        bufferPages: true,
      });

      // Collect chunks
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          filename,
          content: buffer,
          mimeType: 'application/pdf',
          hash: this.calculateHash(buffer),
          rowCount: data.length,
        });
      });
      doc.on('error', reject);

      // Header
      doc.fontSize(16).fillColor('#1E3A5F').text('WANCOM ISP - PTA Audit Export', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).fillColor('#333').text(`Export Type: ${exportType}`, { align: 'center' });
      doc.fontSize(10).text(`Generated: ${timestamp} | Region: ${this.regionCode}`, { align: 'center' });
      doc.moveDown();

      // Summary
      doc.fontSize(10).fillColor('#666');
      doc.text(`Total Records: ${data.length}`);
      doc.moveDown();

      // Table header
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const colWidth = Math.min(pageWidth / columns.length, 100);
      
      // Draw header row
      doc.fillColor('#1E3A5F').fontSize(8);
      let x = doc.page.margins.left;
      const headerY = doc.y;
      
      // Header background
      doc.rect(x, headerY - 2, pageWidth, 14).fill('#1E3A5F');
      
      columns.forEach((col) => {
        doc.fillColor('#FFFFFF')
          .text(col.pta_header.substring(0, 15), x + 2, headerY, {
            width: colWidth - 4,
            align: 'left',
          });
        x += colWidth;
      });

      doc.moveDown();

      // Data rows (limit for PDF readability)
      const maxPdfRows = Math.min(data.length, 500); // Limit rows for PDF
      doc.fillColor('#333').fontSize(7);

      for (let i = 0; i < maxPdfRows; i++) {
        const row = data[i];
        x = doc.page.margins.left;
        const rowY = doc.y;

        // Alternate row background
        if (i % 2 === 0) {
          doc.rect(x, rowY - 2, pageWidth, 12).fill('#F5F5F5');
        }

        doc.fillColor('#333');
        columns.forEach((col) => {
          const value = this.formatValue(row[col.db_field], col.data_type);
          const displayValue = String(value || '').substring(0, 20);
          doc.text(displayValue, x + 2, rowY, {
            width: colWidth - 4,
            align: 'left',
          });
          x += colWidth;
        });

        // New page if needed
        if (doc.y > doc.page.height - 50) {
          doc.addPage();
        }
      }

      if (data.length > maxPdfRows) {
        doc.moveDown();
        doc.fontSize(10).fillColor('#666')
          .text(`Note: Showing first ${maxPdfRows} of ${data.length} records. See CSV/XLSX for complete data.`);
      }

      // Footer on each page
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).fillColor('#999')
          .text(
            `Page ${i + 1} of ${pages.count} | Confidential - PTA Audit Report | ${timestamp}`,
            doc.page.margins.left,
            doc.page.height - 30,
            { align: 'center' },
          );
      }

      doc.end();
    });
  }

  /**
   * Generate file manifest with SHA-256 hashes
   */
  private generateManifest(
    run: AuditExportRun,
    files: GeneratedFile[],
    generatedAt: Date,
  ): FileManifest {
    const manifest: FileManifest = {
      version: '1.0',
      generatedAt: generatedAt.toISOString(),
      generator: 'WANCOM ISP PTA Audit Exporter v1.0',
      exportRunId: run.id,
      exportType: run.exportType,
      dateRange: {
        start: run.startDate.toISOString(),
        end: run.endDate.toISOString(),
      },
      regionCode: this.regionCode,
      files: files.map((f) => ({
        filename: f.filename,
        size: f.content.length,
        sha256: f.hash,
        rowCount: f.rowCount,
        mimeType: f.mimeType,
      })),
      totalRecords: files.reduce((sum, f) => sum + f.rowCount, 0) / files.length,
      integrityHash: '', // Will be set below
    };

    // Calculate overall integrity hash
    const integrityData = files.map((f) => f.hash).sort().join(':');
    manifest.integrityHash = this.calculateHash(Buffer.from(integrityData));

    return manifest;
  }

  /**
   * Create ZIP bundle with files and manifest
   */
  private async createZipBundle(
    files: GeneratedFile[],
    manifest: FileManifest,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const archive = archiver('zip', {
        zlib: { level: 9 }, // Maximum compression
      });

      // Collect chunks
      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      // Add files
      files.forEach((file) => {
        archive.append(file.content, { name: file.filename });
      });

      // Add manifest
      archive.append(JSON.stringify(manifest, null, 2), {
        name: 'MANIFEST.json',
      });

      // Add README
      const readme = this.generateReadme(manifest);
      archive.append(readme, { name: 'README.txt' });

      archive.finalize();
    });
  }

  /**
   * Generate README file for the bundle
   */
  private generateReadme(manifest: FileManifest): string {
    return `
================================================================================
WANCOM ISP - PTA AUDIT EXPORT BUNDLE
================================================================================

Export Type:    ${manifest.exportType}
Generated At:   ${manifest.generatedAt}
Region Code:    ${manifest.regionCode}
Total Records:  ${manifest.totalRecords}

================================================================================
FILE INTEGRITY VERIFICATION
================================================================================

This bundle contains a MANIFEST.json file with SHA-256 hashes for each
included file. To verify file integrity:

1. Calculate the SHA-256 hash of each data file
2. Compare against the 'sha256' value in MANIFEST.json
3. The overall 'integrityHash' is calculated from all file hashes

Files Included:
${manifest.files.map((f) => `  - ${f.filename} (${f.size} bytes, ${f.rowCount} records)`).join('\n')}

================================================================================
LEGAL NOTICE
================================================================================

This export contains confidential subscriber data protected under Pakistani
telecommunications regulations and the Personal Data Protection Bill.

- Authorized access only for PTA regulatory compliance purposes
- Unauthorized disclosure is a criminal offense
- Maintain secure chain of custody
- Log all access to this file

================================================================================
GENERATOR: ${manifest.generator}
EXPORT RUN ID: ${manifest.exportRunId}
================================================================================
`.trim();
  }

  /**
   * Generate standardized filename
   * Format: WANCOM_<REGION>_AUDIT_<TYPE>_<YYYYMMDD>_<HHMMSS>.<ext>
   */
  private generateFilename(
    exportType: AuditExportType,
    extension: string,
    timestamp: string,
  ): string {
    return `WANCOM_${this.regionCode}_AUDIT_${exportType}_${timestamp}.${extension}`;
  }

  /**
   * Generate ZIP filename
   */
  private generateZipFilename(exportType: AuditExportType, timestamp: string): string {
    return `WANCOM_${this.regionCode}_AUDIT_${exportType}_${timestamp}.zip`;
  }

  /**
   * Format timestamp for filenames
   */
  private formatTimestamp(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  /**
   * Calculate SHA-256 hash
   */
  private calculateHash(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Escape CSV field value
   */
  private escapeCsvField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Format value based on data type
   */
  private formatValue(value: unknown, dataType: string): string {
    if (value === null || value === undefined) {
      return '';
    }

    switch (dataType) {
      case 'timestamp':
      case 'timestamptz':
        return new Date(value as string).toISOString();
      case 'date':
        return new Date(value as string).toISOString().split('T')[0];
      case 'boolean':
        return value ? 'Yes' : 'No';
      case 'inet':
      case 'macaddr':
        return String(value);
      case 'integer':
      case 'bigint':
        return String(value);
      case 'numeric':
        return Number(value).toFixed(2);
      case 'json':
      case 'jsonb':
        return typeof value === 'string' ? value : JSON.stringify(value);
      default:
        return String(value);
    }
  }
}
