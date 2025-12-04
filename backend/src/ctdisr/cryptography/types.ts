/**
 * NetAxis ISP - CTDISR-2025 Cryptography Types
 */

// ============================================
// KEY MANAGEMENT TYPES
// ============================================

export enum KeyType {
  AES_256 = 'AES-256',
  RSA_4096 = 'RSA-4096',
  EC_P256 = 'EC-P256',
  HMAC_SHA256 = 'HMAC-SHA256',
}

export enum KeyStatus {
  ACTIVE = 'active',
  ROTATING = 'rotating',
  DEPRECATED = 'deprecated',
  DESTROYED = 'destroyed',
}

export enum KeyPurpose {
  DATA_ENCRYPTION = 'data_encryption',
  KEY_ENCRYPTION = 'key_encryption',
  SIGNING = 'signing',
  AUTHENTICATION = 'authentication',
  BACKUP = 'backup',
}

export enum RotationReason {
  SCHEDULED = 'scheduled',
  MANUAL = 'manual',
  COMPROMISE = 'compromise',
  POLICY = 'policy',
  EMERGENCY = 'emergency',
}

export interface EncryptionKey {
  id: string;
  keyAlias: string;
  keyType: KeyType;
  purpose: string;
  algorithm: string;
  keyLength: number;
  encryptedKeyMaterial: Buffer;
  keyVersion: number;
  status: KeyStatus;
  activationDate: Date;
  expirationDate?: Date;
  rotationIntervalDays?: number;
  lastRotatedAt?: Date;
  nextRotationAt?: Date;
  hsmBacked: boolean;
  keyMetadata: Record<string, unknown>;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateKeyDto {
  keyAlias: string;
  keyType: KeyType;
  purpose: string;
  keyLength?: number;
  rotationIntervalDays?: number;
  hsmBacked?: boolean;
  keyMetadata?: Record<string, unknown>;
}

export interface RotateKeyDto {
  keyId: string;
  reason: RotationReason;
  details?: Record<string, unknown>;
}

export interface KeyRotationHistory {
  id: string;
  keyId: string;
  oldVersion: number;
  newVersion: number;
  rotationReason: RotationReason;
  rotatedBy?: string;
  rotationDetails: Record<string, unknown>;
  createdAt: Date;
}

// ============================================
// CERTIFICATE TYPES
// ============================================

export enum CertificateType {
  SERVER = 'server',
  CLIENT = 'client',
  CODE_SIGNING = 'code-signing',
  CA = 'ca',
  INTERMEDIATE = 'intermediate',
}

export enum CertificateStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
  PENDING = 'pending',
}

export interface Certificate {
  id: string;
  certAlias: string;
  subjectCn: string;
  subjectDn: string;
  issuerDn: string;
  serialNumber: string;
  certType: CertificateType;
  keyAlgorithm: string;
  signatureAlgorithm: string;
  keySize: number;
  notBefore: Date;
  notAfter: Date;
  certificatePem: string;
  fingerprintSha256: string;
  status: CertificateStatus;
  revocationReason?: string;
  revokedAt?: Date;
  autoRenew: boolean;
  renewalDaysBefore: number;
  associatedDomains?: string[];
  certificateMetadata: Record<string, unknown>;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCertificateDto {
  certAlias: string;
  certType: CertificateType;
  subjectCn: string;
  keySize?: number;
  validityDays?: number;
  autoRenew?: boolean;
  associatedDomains?: string[];
}

export interface RevokeCertificateDto {
  certificateId: string;
  reason: string;
}

// ============================================
// ENCRYPTION TYPES
// ============================================

export enum EncryptionMode {
  GCM = 'GCM',
  CBC = 'CBC',
  CTR = 'CTR',
}

export enum DataType {
  PII = 'pii',
  FINANCIAL = 'financial',
  CDR = 'cdr',
  CREDENTIALS = 'credentials',
  CONFIG = 'config',
  BACKUP = 'backup',
}

export interface EncryptedDataRegistry {
  id: string;
  dataReference: string;
  dataType: DataType;
  encryptionKeyId: string;
  encryptionAlgorithm: string;
  encryptionMode: EncryptionMode;
  ivNonceSize: number;
  tagSize?: number;
  isActive: boolean;
  lastReEncryptedAt?: Date;
  dataMetadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface EncryptionResult {
  ciphertext: Buffer;
  iv: Buffer;
  authTag?: Buffer;
  keyId: string;
  keyVersion: number;
  algorithm: string;
  mode: EncryptionMode;
}

export interface DecryptionResult {
  plaintext: Buffer;
  keyId: string;
  keyVersion: number;
}

// ============================================
// HSM TYPES
// ============================================

export enum HsmOperationType {
  ENCRYPT = 'encrypt',
  DECRYPT = 'decrypt',
  SIGN = 'sign',
  VERIFY = 'verify',
  WRAP = 'wrap',
  UNWRAP = 'unwrap',
  GENERATE = 'generate',
}

export enum HsmOperationStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
}

export interface HsmOperation {
  id: string;
  hsmId: string;
  operationType: HsmOperationType;
  keyHandle: string;
  status: HsmOperationStatus;
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
  requestMetadata: Record<string, unknown>;
  createdAt: Date;
}

// ============================================
// CRYPTO POLICY TYPES
// ============================================

export interface CryptoPolicy {
  id: string;
  policyName: string;
  description?: string;
  minKeyLength: number;
  allowedAlgorithms: string[];
  allowedModes: string[];
  requireHsm: boolean;
  maxKeyAgeDays: number;
  requireKeyRotation: boolean;
  rotationIntervalDays: number;
  requireDualControl: boolean;
  policyMetadata: Record<string, unknown>;
  isActive: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// AUDIT TYPES
// ============================================

export enum CryptoOperationType {
  ENCRYPT = 'encrypt',
  DECRYPT = 'decrypt',
  SIGN = 'sign',
  VERIFY = 'verify',
  KEY_GENERATE = 'key_generate',
  KEY_ROTATE = 'key_rotate',
  KEY_DESTROY = 'key_destroy',
  CERT_ISSUE = 'cert_issue',
  CERT_REVOKE = 'cert_revoke',
}

export enum CryptoAuditStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  DENIED = 'denied',
}

export interface CryptoAuditLog {
  id: string;
  operationType: CryptoOperationType;
  keyId?: string;
  certificateId?: string;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  dataReference?: string;
  status: CryptoAuditStatus;
  failureReason?: string;
  operationDetails: Record<string, unknown>;
  createdAt: Date;
}

// ============================================
// KEY ESCROW TYPES
// ============================================

export enum EscrowHolder {
  PTA = 'pta',
  FIA = 'fia',
  INTERNAL = 'internal',
  BACKUP = 'backup',
}

export interface KeyEscrow {
  id: string;
  keyId: string;
  escrowHolder: EscrowHolder;
  encryptedEscrowKey: Buffer;
  escrowPublicKeyFingerprint: string;
  escrowDate: Date;
  expirationDate?: Date;
  accessCount: number;
  lastAccessedAt?: Date;
  escrowMetadata: Record<string, unknown>;
  createdBy?: string;
  createdAt: Date;
}

export interface EscrowAccessRequest {
  escrowId: string;
  accessedBy: string;
  accessReason: string;
  authorizationReference?: string;
  ipAddress?: string;
}

// ============================================
// COMPLIANCE SUMMARY
// ============================================

export interface CryptoComplianceSummary {
  totalActiveKeys: number;
  keysNeedingRotation: number;
  totalActiveCertificates: number;
  certificatesExpiring30Days: number;
  hsmOperationsToday: number;
  cryptoOperationsToday: number;
  failedOperationsToday: number;
  activePolicies: number;
  escrowedKeys: number;
  generatedAt: Date;
}
