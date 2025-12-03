/**
 * WANCOM ISP - CTDISR-2025 Encryption Service
 * AES-256-GCM encryption with key management
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  KeyType,
  KeyStatus,
  RotationReason,
  EncryptionMode,
  DataType,
  CryptoOperationType,
  CryptoAuditStatus,
  EncryptionResult,
  DecryptionResult,
  EncryptionKey,
  CreateKeyDto,
  RotateKeyDto,
  CryptoComplianceSummary,
} from './types';

@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private supabase: SupabaseClient;
  private masterKey: Buffer;
  private keyCache: Map<string, { key: Buffer; version: number; expiresAt: Date }> = new Map();
  private readonly KEY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL'),
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.initializeMasterKey();
    this.logger.log('Encryption service initialized with CTDISR-2025 compliance');
  }

  /**
   * Initialize master key from environment or KMS
   */
  private async initializeMasterKey(): Promise<void> {
    const masterKeyHex = this.configService.get<string>('CTDISR_MASTER_KEY');
    
    if (masterKeyHex) {
      this.masterKey = Buffer.from(masterKeyHex, 'hex');
    } else {
      // Generate ephemeral master key for development
      this.logger.warn('Using ephemeral master key - NOT FOR PRODUCTION');
      this.masterKey = crypto.randomBytes(32);
    }
    
    if (this.masterKey.length !== 32) {
      throw new Error('Master key must be 256 bits (32 bytes)');
    }
  }

  // ============================================
  // KEY MANAGEMENT
  // ============================================

  /**
   * Generate a new encryption key
   */
  async generateKey(dto: CreateKeyDto, userId?: string): Promise<EncryptionKey> {
    const keyMaterial = crypto.randomBytes(dto.keyLength || 32);
    const encryptedKeyMaterial = this.encryptWithMasterKey(keyMaterial);
    
    const algorithm = this.getAlgorithmForKeyType(dto.keyType);
    
    const { data, error } = await this.supabase
      .from('ctdisr.encryption_keys')
      .insert({
        key_alias: dto.keyAlias,
        key_type: dto.keyType,
        purpose: dto.purpose,
        algorithm,
        key_length: dto.keyLength || 256,
        encrypted_key_material: encryptedKeyMaterial,
        key_version: 1,
        status: KeyStatus.ACTIVE,
        rotation_interval_days: dto.rotationIntervalDays || 90,
        hsm_backed: dto.hsmBacked || false,
        key_metadata: dto.keyMetadata || {},
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      await this.logCryptoOperation(CryptoOperationType.KEY_GENERATE, {
        status: CryptoAuditStatus.FAILED,
        userId,
        failureReason: error.message,
        operationDetails: { keyAlias: dto.keyAlias },
      });
      throw new Error(`Failed to generate key: ${error.message}`);
    }

    await this.logCryptoOperation(CryptoOperationType.KEY_GENERATE, {
      keyId: data.id,
      status: CryptoAuditStatus.SUCCESS,
      userId,
      operationDetails: { keyAlias: dto.keyAlias, keyType: dto.keyType },
    });

    this.logger.log(`Generated new ${dto.keyType} key: ${dto.keyAlias}`);
    return this.mapKeyFromDb(data);
  }

  /**
   * Rotate an encryption key
   */
  async rotateKey(dto: RotateKeyDto, userId?: string): Promise<EncryptionKey> {
    const existingKey = await this.getKeyById(dto.keyId);
    if (!existingKey) {
      throw new Error('Key not found');
    }

    // Generate new key material
    const newKeyMaterial = crypto.randomBytes(existingKey.keyLength / 8);
    const encryptedNewKeyMaterial = this.encryptWithMasterKey(newKeyMaterial);
    const newVersion = existingKey.keyVersion + 1;

    // Update key with new material
    const { data, error } = await this.supabase
      .from('ctdisr.encryption_keys')
      .update({
        encrypted_key_material: encryptedNewKeyMaterial,
        key_version: newVersion,
        last_rotated_at: new Date().toISOString(),
        status: KeyStatus.ACTIVE,
      })
      .eq('id', dto.keyId)
      .select()
      .single();

    if (error) {
      await this.logCryptoOperation(CryptoOperationType.KEY_ROTATE, {
        keyId: dto.keyId,
        status: CryptoAuditStatus.FAILED,
        userId,
        failureReason: error.message,
      });
      throw new Error(`Failed to rotate key: ${error.message}`);
    }

    // Record rotation history
    await this.supabase.from('ctdisr.key_rotation_history').insert({
      key_id: dto.keyId,
      old_version: existingKey.keyVersion,
      new_version: newVersion,
      rotation_reason: dto.reason,
      rotated_by: userId,
      rotation_details: dto.details || {},
    });

    // Invalidate cache
    this.keyCache.delete(existingKey.keyAlias);

    await this.logCryptoOperation(CryptoOperationType.KEY_ROTATE, {
      keyId: dto.keyId,
      status: CryptoAuditStatus.SUCCESS,
      userId,
      operationDetails: { reason: dto.reason, newVersion },
    });

    this.logger.log(`Rotated key ${existingKey.keyAlias} to version ${newVersion}`);
    return this.mapKeyFromDb(data);
  }

  /**
   * Destroy a key (mark as destroyed, keep for audit)
   */
  async destroyKey(keyId: string, reason: string, userId?: string): Promise<void> {
    const { error } = await this.supabase
      .from('ctdisr.encryption_keys')
      .update({
        status: KeyStatus.DESTROYED,
        key_metadata: { destroyedReason: reason, destroyedAt: new Date().toISOString() },
      })
      .eq('id', keyId);

    if (error) {
      throw new Error(`Failed to destroy key: ${error.message}`);
    }

    await this.logCryptoOperation(CryptoOperationType.KEY_DESTROY, {
      keyId,
      status: CryptoAuditStatus.SUCCESS,
      userId,
      operationDetails: { reason },
    });

    this.logger.warn(`Key ${keyId} marked as destroyed: ${reason}`);
  }

  // ============================================
  // ENCRYPTION OPERATIONS
  // ============================================

  /**
   * Encrypt data using AES-256-GCM
   */
  async encrypt(
    plaintext: Buffer | string,
    keyAlias: string,
    additionalData?: Buffer,
    userId?: string,
  ): Promise<EncryptionResult> {
    const key = await this.getDecryptedKey(keyAlias);
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    
    const cipher = crypto.createCipheriv('aes-256-gcm', key.material, iv);
    
    if (additionalData) {
      cipher.setAAD(additionalData);
    }

    const plaintextBuffer = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    await this.logCryptoOperation(CryptoOperationType.ENCRYPT, {
      keyId: key.id,
      status: CryptoAuditStatus.SUCCESS,
      userId,
      operationDetails: { keyAlias, dataSize: plaintextBuffer.length },
    });

    return {
      ciphertext,
      iv,
      authTag,
      keyId: key.id,
      keyVersion: key.version,
      algorithm: 'AES-256-GCM',
      mode: EncryptionMode.GCM,
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  async decrypt(
    ciphertext: Buffer,
    iv: Buffer,
    authTag: Buffer,
    keyAlias: string,
    keyVersion?: number,
    additionalData?: Buffer,
    userId?: string,
  ): Promise<DecryptionResult> {
    const key = await this.getDecryptedKey(keyAlias, keyVersion);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key.material, iv);
    decipher.setAuthTag(authTag);
    
    if (additionalData) {
      decipher.setAAD(additionalData);
    }

    try {
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      await this.logCryptoOperation(CryptoOperationType.DECRYPT, {
        keyId: key.id,
        status: CryptoAuditStatus.SUCCESS,
        userId,
        operationDetails: { keyAlias },
      });

      return {
        plaintext,
        keyId: key.id,
        keyVersion: key.version,
      };
    } catch (err) {
      await this.logCryptoOperation(CryptoOperationType.DECRYPT, {
        keyId: key.id,
        status: CryptoAuditStatus.FAILED,
        userId,
        failureReason: 'Authentication failed',
      });
      throw new Error('Decryption failed: authentication tag mismatch');
    }
  }

  /**
   * Encrypt a field for database storage
   */
  async encryptField(
    value: string,
    keyAlias: string,
    fieldPath: string,
  ): Promise<string> {
    const result = await this.encrypt(value, keyAlias);
    
    // Format: base64(iv):base64(ciphertext):base64(authTag):keyVersion
    return `${result.iv.toString('base64')}:${result.ciphertext.toString('base64')}:${result.authTag.toString('base64')}:${result.keyVersion}`;
  }

  /**
   * Decrypt a field from database storage
   */
  async decryptField(
    encryptedValue: string,
    keyAlias: string,
  ): Promise<string> {
    const [ivB64, ciphertextB64, authTagB64, versionStr] = encryptedValue.split(':');
    
    const result = await this.decrypt(
      Buffer.from(ciphertextB64, 'base64'),
      Buffer.from(ivB64, 'base64'),
      Buffer.from(authTagB64, 'base64'),
      keyAlias,
      parseInt(versionStr, 10),
    );

    return result.plaintext.toString('utf8');
  }

  // ============================================
  // HASHING & HMAC
  // ============================================

  /**
   * Generate HMAC-SHA256
   */
  async generateHmac(data: Buffer | string, keyAlias: string): Promise<Buffer> {
    const key = await this.getDecryptedKey(keyAlias);
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    return crypto.createHmac('sha256', key.material).update(dataBuffer).digest();
  }

  /**
   * Verify HMAC-SHA256
   */
  async verifyHmac(data: Buffer | string, hmac: Buffer, keyAlias: string): Promise<boolean> {
    const computed = await this.generateHmac(data, keyAlias);
    return crypto.timingSafeEqual(computed, hmac);
  }

  /**
   * Hash with SHA-256
   */
  hashSha256(data: Buffer | string): Buffer {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    return crypto.createHash('sha256').update(dataBuffer).digest();
  }

  /**
   * Hash with SHA-512
   */
  hashSha512(data: Buffer | string): Buffer {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    return crypto.createHash('sha512').update(dataBuffer).digest();
  }

  // ============================================
  // KEY HELPERS
  // ============================================

  private async getKeyById(keyId: string): Promise<EncryptionKey | null> {
    const { data, error } = await this.supabase
      .from('ctdisr.encryption_keys')
      .select('*')
      .eq('id', keyId)
      .single();

    if (error || !data) return null;
    return this.mapKeyFromDb(data);
  }

  private async getDecryptedKey(
    keyAlias: string,
    version?: number,
  ): Promise<{ id: string; material: Buffer; version: number }> {
    // Check cache first
    const cached = this.keyCache.get(keyAlias);
    if (cached && cached.expiresAt > new Date() && (!version || cached.version === version)) {
      return { id: keyAlias, material: cached.key, version: cached.version };
    }

    // Fetch from database
    let query = this.supabase
      .from('ctdisr.encryption_keys')
      .select('*')
      .eq('key_alias', keyAlias)
      .eq('status', KeyStatus.ACTIVE);

    if (version) {
      query = query.eq('key_version', version);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      throw new Error(`Key not found or inactive: ${keyAlias}`);
    }

    const decryptedMaterial = this.decryptWithMasterKey(data.encrypted_key_material);

    // Cache the key
    this.keyCache.set(keyAlias, {
      key: decryptedMaterial,
      version: data.key_version,
      expiresAt: new Date(Date.now() + this.KEY_CACHE_TTL_MS),
    });

    return {
      id: data.id,
      material: decryptedMaterial,
      version: data.key_version,
    };
  }

  private encryptWithMasterKey(data: Buffer): Buffer {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]);
  }

  private decryptWithMasterKey(encryptedData: Buffer): Buffer {
    const iv = encryptedData.subarray(0, 12);
    const authTag = encryptedData.subarray(12, 28);
    const ciphertext = encryptedData.subarray(28);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(authTag);
    
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  private getAlgorithmForKeyType(keyType: KeyType): string {
    switch (keyType) {
      case KeyType.AES_256:
        return 'AES-256-GCM';
      case KeyType.RSA_4096:
        return 'RSA-OAEP-SHA256';
      case KeyType.EC_P256:
        return 'ECDSA-P256-SHA256';
      case KeyType.HMAC_SHA256:
        return 'HMAC-SHA256';
      default:
        return 'AES-256-GCM';
    }
  }

  private mapKeyFromDb(data: any): EncryptionKey {
    return {
      id: data.id,
      keyAlias: data.key_alias,
      keyType: data.key_type,
      purpose: data.purpose,
      algorithm: data.algorithm,
      keyLength: data.key_length,
      encryptedKeyMaterial: data.encrypted_key_material,
      keyVersion: data.key_version,
      status: data.status,
      activationDate: new Date(data.activation_date),
      expirationDate: data.expiration_date ? new Date(data.expiration_date) : undefined,
      rotationIntervalDays: data.rotation_interval_days,
      lastRotatedAt: data.last_rotated_at ? new Date(data.last_rotated_at) : undefined,
      nextRotationAt: data.next_rotation_at ? new Date(data.next_rotation_at) : undefined,
      hsmBacked: data.hsm_backed,
      keyMetadata: data.key_metadata,
      createdBy: data.created_by,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  // ============================================
  // COMPLIANCE & AUDIT
  // ============================================

  private async logCryptoOperation(
    operationType: CryptoOperationType,
    params: {
      keyId?: string;
      certificateId?: string;
      userId?: string;
      sessionId?: string;
      ipAddress?: string;
      dataReference?: string;
      status: CryptoAuditStatus;
      failureReason?: string;
      operationDetails?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await this.supabase.from('ctdisr.crypto_audit_log').insert({
        operation_type: operationType,
        key_id: params.keyId,
        certificate_id: params.certificateId,
        user_id: params.userId,
        session_id: params.sessionId,
        ip_address: params.ipAddress,
        data_reference: params.dataReference,
        status: params.status,
        failure_reason: params.failureReason,
        operation_details: params.operationDetails || {},
      });
    } catch (err) {
      this.logger.error(`Failed to log crypto operation: ${err.message}`);
    }
  }

  /**
   * Get keys needing rotation
   */
  async getKeysNeedingRotation(): Promise<EncryptionKey[]> {
    const { data, error } = await this.supabase
      .rpc('ctdisr.get_keys_needing_rotation');

    if (error) {
      throw new Error(`Failed to get keys needing rotation: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get crypto compliance summary
   */
  async getComplianceSummary(): Promise<CryptoComplianceSummary> {
    const { data, error } = await this.supabase
      .rpc('ctdisr.get_crypto_compliance_summary');

    if (error) {
      throw new Error(`Failed to get compliance summary: ${error.message}`);
    }

    return {
      totalActiveKeys: data.total_active_keys,
      keysNeedingRotation: data.keys_needing_rotation,
      totalActiveCertificates: data.total_active_certificates,
      certificatesExpiring30Days: data.certificates_expiring_30_days,
      hsmOperationsToday: data.hsm_operations_today,
      cryptoOperationsToday: data.crypto_operations_today,
      failedOperationsToday: data.failed_operations_today,
      activePolicies: data.active_policies,
      escrowedKeys: data.escrowed_keys,
      generatedAt: new Date(data.generated_at),
    };
  }
}
