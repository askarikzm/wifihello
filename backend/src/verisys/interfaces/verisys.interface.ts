/**
 * NADRA Verisys Integration - Interfaces
 * 
 * These interfaces define the contract for NADRA Verisys API
 * communication and internal data structures.
 * 
 * @module verisys/interfaces
 * @regulatory PTRA 1996, PTA KYC Rules, CTDISR
 */

/**
 * Verification status enum matching database enum
 */
export enum VerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

/**
 * Customer KYC status enum
 */
export enum KycStatus {
  UNVERIFIED = 'UNVERIFIED',
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
}

/**
 * NADRA Verisys API request payload
 * Structure based on NADRA's expected format
 */
export interface NadraVerisysRequest {
  /** Client ID provided by NADRA */
  clientId: string;
  
  /** Client secret/password */
  clientSecret: string;
  
  /** CNIC number (13 digits, no dashes) */
  cnic: string;
  
  /** Optional: CNIC issue date (YYYY-MM-DD) */
  issueDate?: string;
  
  /** Optional: CNIC expiry date (YYYY-MM-DD) */
  expiryDate?: string;
  
  /** Request timestamp */
  timestamp: string;
  
  /** Request signature for integrity */
  signature?: string;
  
  /** Transaction reference from our side */
  transactionRef: string;
}

/**
 * NADRA Verisys API response payload
 * Structure based on NADRA's response format
 */
export interface NadraVerisysResponse {
  /** Response code (00 = success, others = error) */
  responseCode: string;
  
  /** Response message/description */
  responseMessage: string;
  
  /** NADRA's transaction reference ID */
  referenceId: string;
  
  /** Verified citizen data (only present on success) */
  data?: NadraCitizenData;
  
  /** Timestamp of response */
  timestamp: string;
}

/**
 * Citizen data returned by NADRA on successful verification
 */
export interface NadraCitizenData {
  /** Full name as per CNIC */
  name: string;
  
  /** Father's or husband's name */
  fatherHusbandName: string;
  
  /** Date of birth (YYYY-MM-DD) */
  dateOfBirth: string;
  
  /** Gender (M/F) */
  gender: string;
  
  /** Permanent address as per CNIC */
  permanentAddress: string;
  
  /** Present/current address */
  presentAddress?: string;
  
  /** CNIC issue date */
  cnicIssueDate?: string;
  
  /** CNIC expiry date */
  cnicExpiryDate?: string;
  
  /** Photo match result (if biometric enabled) */
  photoMatch?: boolean;
}

/**
 * Internal verification record structure
 */
export interface KycVerificationRecord {
  id: string;
  userId: string;
  customerId?: string;
  cnicHash: string;
  cnicLast4: string;
  cnicIssueDate?: Date;
  cnicExpiryDate?: Date;
  verificationStatus: VerificationStatus;
  nadraName?: string;
  nadraFatherHusbandName?: string;
  nadraDob?: Date;
  nadraGender?: string;
  nadraPermanentAddress?: string;
  nadraPresentAddress?: string;
  nadraResponseCode?: string;
  nadraResponseMessage?: string;
  nadraReferenceId?: string;
  nadraRequestTimestamp?: Date;
  nadraResponseTimestamp?: Date;
  requestIp?: string;
  requestUserAgent?: string;
  requestSource: string;
  attemptNumber: number;
  consentGiven: boolean;
  consentTimestamp?: Date;
  consentIp?: string;
  createdAt: Date;
  updatedAt: Date;
  verifiedAt?: Date;
  expiresAt?: Date;
}

/**
 * Rate limit record structure
 */
export interface KycRateLimitRecord {
  id: string;
  userId: string;
  date: Date;
  attemptCount: number;
  lastAttemptAt: Date;
  blockedUntil?: Date;
}

/**
 * Audit log entry for KYC operations
 */
export interface KycAuditLogEntry {
  actorUserId: string;
  actorRole?: string;
  actorIp?: string;
  action: KycAuditAction;
  entityType: string;
  entityId?: string;
  targetUserId?: string;
  status: 'SUCCESS' | 'FAILURE' | 'ERROR';
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

/**
 * KYC audit actions
 */
export enum KycAuditAction {
  VERIFY_INITIATED = 'VERIFY_INITIATED',
  VERIFY_SUCCESS = 'VERIFY_SUCCESS',
  VERIFY_FAILED = 'VERIFY_FAILED',
  VERIFY_ERROR = 'VERIFY_ERROR',
  VIEW_KYC = 'VIEW_KYC',
  EXPORT_KYC = 'EXPORT_KYC',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  CONSENT_GIVEN = 'CONSENT_GIVEN',
}

/**
 * NADRA response codes mapping
 */
export const NADRA_RESPONSE_CODES: Record<string, string> = {
  '00': 'Success - CNIC verified',
  '01': 'Invalid CNIC format',
  '02': 'CNIC not found in database',
  '03': 'CNIC blocked/blacklisted',
  '04': 'CNIC expired',
  '05': 'Authentication failed',
  '06': 'Service unavailable',
  '07': 'Rate limit exceeded',
  '08': 'Invalid request signature',
  '09': 'Request timeout',
  '10': 'Internal server error',
  '99': 'Unknown error',
};

/**
 * Configuration interface for Verisys module
 */
export interface VerisysConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  timeoutMs: number;
  verifyEndpoint: string;
  maxRetries: number;
  retryDelayMs: number;
  maxAttemptsPerDay: number;
  kycRequiredForActivation: boolean;
  kycExpiryDays?: number;
}

/**
 * Verification result returned to caller
 */
export interface VerificationResult {
  success: boolean;
  status: VerificationStatus;
  verificationId: string;
  message: string;
  nadraReferenceId?: string;
  verifiedAt?: Date;
  attemptNumber: number;
  remainingAttempts: number;
}
