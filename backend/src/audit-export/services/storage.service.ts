/**
 * Audit Export Storage Service
 * 
 * Handles secure storage and retrieval of export files.
 * Uses Supabase Storage for file persistence.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { SupabaseClientService } from '../../database/supabase-client.service';
import { AuditExportRepository } from '../repositories/audit-export.repository';
import { ExportBundle, GeneratedFile } from './generator.service';
import { AuditExportFile, AuditExportRun } from '../types';

export interface StoredFileInfo {
  fileId: string;
  storagePath: string;
  publicUrl?: string;
  encryptionKey?: string;
  expiresAt?: Date;
}

@Injectable()
export class AuditExportStorageService {
  private readonly logger = new Logger(AuditExportStorageService.name);

  // Storage bucket name
  private readonly bucketName = 'pta-audit-exports';
  
  // Encryption settings
  private readonly encryptionAlgorithm = 'aes-256-cbc';
  private readonly encryptionEnabled: boolean;

  constructor(
    private readonly supabase: SupabaseClientService,
    private readonly repository: AuditExportRepository,
    private readonly configService: ConfigService,
  ) {
    this.encryptionEnabled = this.configService.get<boolean>('AUDIT_EXPORT_ENCRYPTION_ENABLED', false);
  }

  /**
   * Store export bundle in secure storage
   */
  async storeExportBundle(
    run: AuditExportRun,
    bundle: ExportBundle,
  ): Promise<StoredFileInfo[]> {
    const storedFiles: StoredFileInfo[] = [];

    // Store the ZIP bundle
    const zipInfo = await this.storeFile(
      run,
      bundle.zipFilename,
      bundle.zipContent,
      'application/zip',
      bundle.totalRows,
    );
    storedFiles.push(zipInfo);

    // Optionally store individual files for direct access
    if (bundle.files.length === 1) {
      // For single-format exports, also store the individual file
      const file = bundle.files[0];
      const fileInfo = await this.storeFile(
        run,
        file.filename,
        file.content,
        file.mimeType,
        file.rowCount,
      );
      storedFiles.push(fileInfo);
    }

    return storedFiles;
  }

  /**
   * Store a single file
   */
  private async storeFile(
    run: AuditExportRun,
    filename: string,
    content: Buffer,
    mimeType: string,
    rowCount: number,
  ): Promise<StoredFileInfo> {
    // Generate storage path
    const storagePath = this.generateStoragePath(run, filename);

    // Optionally encrypt content
    let finalContent = content;
    let encryptionKey: string | undefined;
    let encryptionIv: string | undefined;

    if (this.encryptionEnabled) {
      const encrypted = this.encryptContent(content);
      finalContent = encrypted.encryptedData;
      encryptionKey = encrypted.key;
      encryptionIv = encrypted.iv;
    }

    // Upload to Supabase Storage
    const client = this.supabase.getClient();
    
    const { error: uploadError } = await client.storage
      .from(this.bucketName)
      .upload(storagePath, finalContent, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      this.logger.error('Failed to upload file to storage', uploadError);
      throw new Error(`Failed to store file: ${uploadError.message}`);
    }

    // Record in database
    const fileRecord = await this.repository.createFile(run.id, {
      filename,
      storagePath,
      fileSize: content.length,
      sha256Hash: createHash('sha256').update(content).digest('hex'),
      mimeType,
      rowCount,
      encryptionKeyHash: encryptionKey
        ? createHash('sha256').update(encryptionKey).digest('hex')
        : undefined,
      encryptionIv,
    });

    return {
      fileId: fileRecord.id,
      storagePath,
      encryptionKey,
    };
  }

  /**
   * Generate signed download URL
   */
  async getSignedDownloadUrl(
    fileId: string,
    userId: string,
    expiresInSeconds: number = 3600,
  ): Promise<{ url: string; expiresAt: Date }> {
    // Get file record
    const client = this.supabase.getClient();
    
    const { data: file, error: fileError } = await client
      .from('pta_audit.audit_export_file')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError || !file) {
      throw new NotFoundException('Export file not found');
    }

    // Log access
    await this.repository.logAccess({
      runId: file.run_id,
      fileId,
      userId,
      action: 'DOWNLOAD',
      ipAddress: '', // Should be provided by controller
    });

    // Generate signed URL
    const { data: signedUrl, error: signError } = await client.storage
      .from(this.bucketName)
      .createSignedUrl(file.storage_path, expiresInSeconds);

    if (signError || !signedUrl) {
      throw new Error('Failed to generate download URL');
    }

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    return {
      url: signedUrl.signedUrl,
      expiresAt,
    };
  }

  /**
   * Download file content directly
   */
  async downloadFile(
    fileId: string,
    userId: string,
    ipAddress: string,
  ): Promise<{ content: Buffer; filename: string; mimeType: string }> {
    // Get file record
    const client = this.supabase.getClient();
    
    const { data: file, error: fileError } = await client
      .from('pta_audit.audit_export_file')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError || !file) {
      throw new NotFoundException('Export file not found');
    }

    // Log access
    await this.repository.logAccess({
      runId: file.run_id,
      fileId,
      userId,
      action: 'DOWNLOAD',
      ipAddress,
    });

    // Download from storage
    const { data: downloadData, error: downloadError } = await client.storage
      .from(this.bucketName)
      .download(file.storage_path);

    if (downloadError || !downloadData) {
      throw new Error('Failed to download file');
    }

    const buffer = Buffer.from(await downloadData.arrayBuffer());

    // Verify integrity
    const currentHash = createHash('sha256').update(buffer).digest('hex');
    if (currentHash !== file.sha256_hash) {
      this.logger.error('File integrity check failed', {
        fileId,
        expectedHash: file.sha256_hash,
        actualHash: currentHash,
      });
      throw new Error('File integrity verification failed');
    }

    return {
      content: buffer,
      filename: file.filename,
      mimeType: file.mime_type,
    };
  }

  /**
   * Delete export files (for cleanup jobs)
   */
  async deleteExportFiles(runId: string): Promise<void> {
    const client = this.supabase.getClient();

    // Get all files for this run
    const { data: files, error: listError } = await client
      .from('pta_audit.audit_export_file')
      .select('storage_path')
      .eq('run_id', runId);

    if (listError) {
      throw new Error('Failed to list files for deletion');
    }

    // Delete from storage
    const paths = files?.map((f) => f.storage_path) || [];
    if (paths.length > 0) {
      const { error: deleteError } = await client.storage
        .from(this.bucketName)
        .remove(paths);

      if (deleteError) {
        this.logger.error('Failed to delete files from storage', deleteError);
      }
    }

    // Update database records (soft delete by setting deleted_at)
    await client
      .from('pta_audit.audit_export_file')
      .update({ deleted_at: new Date().toISOString() })
      .eq('run_id', runId);
  }

  /**
   * Get file metadata without downloading
   */
  async getFileMetadata(fileId: string): Promise<AuditExportFile> {
    const client = this.supabase.getClient();
    
    const { data: file, error } = await client
      .from('pta_audit.audit_export_file')
      .select('*')
      .eq('id', fileId)
      .single();

    if (error || !file) {
      throw new NotFoundException('Export file not found');
    }

    return this.mapToFile(file);
  }

  /**
   * List files for an export run
   */
  async listFilesForRun(runId: string): Promise<AuditExportFile[]> {
    const client = this.supabase.getClient();
    
    const { data: files, error } = await client
      .from('pta_audit.audit_export_file')
      .select('*')
      .eq('run_id', runId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error('Failed to list files');
    }

    return (files || []).map(this.mapToFile);
  }

  /**
   * Verify file integrity
   */
  async verifyFileIntegrity(fileId: string): Promise<{ valid: boolean; message: string }> {
    try {
      const client = this.supabase.getClient();
      
      const { data: file, error: fileError } = await client
        .from('pta_audit.audit_export_file')
        .select('*')
        .eq('id', fileId)
        .single();

      if (fileError || !file) {
        return { valid: false, message: 'File not found' };
      }

      // Download and verify
      const { data: downloadData, error: downloadError } = await client.storage
        .from(this.bucketName)
        .download(file.storage_path);

      if (downloadError || !downloadData) {
        return { valid: false, message: 'File not accessible in storage' };
      }

      const buffer = Buffer.from(await downloadData.arrayBuffer());
      const currentHash = createHash('sha256').update(buffer).digest('hex');

      if (currentHash !== file.sha256_hash) {
        return {
          valid: false,
          message: `Hash mismatch. Expected: ${file.sha256_hash}, Actual: ${currentHash}`,
        };
      }

      return { valid: true, message: 'File integrity verified' };
    } catch (err) {
      return { valid: false, message: `Verification error: ${err.message}` };
    }
  }

  /**
   * Ensure storage bucket exists
   */
  async ensureBucketExists(): Promise<void> {
    const client = this.supabase.getClient();
    
    const { data: buckets, error: listError } = await client.storage.listBuckets();

    if (listError) {
      this.logger.error('Failed to list storage buckets', listError);
      return;
    }

    const bucketExists = buckets?.some((b) => b.name === this.bucketName);

    if (!bucketExists) {
      const { error: createError } = await client.storage.createBucket(this.bucketName, {
        public: false,
        fileSizeLimit: 500 * 1024 * 1024, // 500MB limit
      });

      if (createError) {
        this.logger.error('Failed to create storage bucket', createError);
      } else {
        this.logger.log(`Created storage bucket: ${this.bucketName}`);
      }
    }
  }

  /**
   * Generate storage path
   */
  private generateStoragePath(run: AuditExportRun, filename: string): string {
    const year = run.startDate.getFullYear();
    const month = String(run.startDate.getMonth() + 1).padStart(2, '0');
    
    return `${run.tenantId}/${year}/${month}/${run.id}/${filename}`;
  }

  /**
   * Encrypt content using AES-256-CBC
   */
  private encryptContent(content: Buffer): {
    encryptedData: Buffer;
    key: string;
    iv: string;
  } {
    const key = randomBytes(32);
    const iv = randomBytes(16);
    
    const cipher = createCipheriv(this.encryptionAlgorithm, key, iv);
    const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);

    return {
      encryptedData: encrypted,
      key: key.toString('hex'),
      iv: iv.toString('hex'),
    };
  }

  /**
   * Decrypt content
   */
  private decryptContent(
    encryptedContent: Buffer,
    keyHex: string,
    ivHex: string,
  ): Buffer {
    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    
    const decipher = createDecipheriv(this.encryptionAlgorithm, key, iv);
    return Buffer.concat([decipher.update(encryptedContent), decipher.final()]);
  }

  /**
   * Map database row to AuditExportFile
   */
  private mapToFile(row: Record<string, unknown>): AuditExportFile {
    return {
      id: row.id as string,
      runId: row.run_id as string,
      filename: row.filename as string,
      storagePath: row.storage_path as string,
      fileSize: row.file_size as number,
      sha256Hash: row.sha256_hash as string,
      mimeType: row.mime_type as string,
      rowCount: row.row_count as number,
      createdAt: new Date(row.created_at as string),
    };
  }
}
