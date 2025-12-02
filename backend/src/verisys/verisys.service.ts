import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { createHash } from 'crypto';
import { firstValueFrom, timeout, retry, catchError } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';
import { SupabaseClientService } from '../database/supabase-client.service';
import {
  VerificationStatus,
  KycStatus,
  NadraVerisysRequest,
  NadraVerisysResponse,
  VerificationResult,
  KycAuditAction,
  KycAuditLogEntry,
  VerisysConfig,
  NADRA_RESPONSE_CODES,
} from './interfaces';
import { VerifyCnicDto, KycListQueryDto } from './dto';

/**
 * NADRA Verisys Integration Service
 * 
 * Handles all communication with NADRA Verisys API for CNIC verification.
 * Implements security best practices and regulatory compliance requirements.
 * 
 * @regulatory PTRA 1996, PTA KYC Rules, CTDISR
 * @security No raw CNIC logging, SHA-256 hashing, audit trails
 */
@Injectable()
export class VerisysService implements OnModuleInit {
  private readonly logger = new Logger(VerisysService.name);
  private config: VerisysConfig;
  private isConfigured = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly supabase: SupabaseClientService,
  ) {}

  /**
   * Initialize and validate configuration on module load
   */
  onModuleInit() {
    this.config = {
      baseUrl: this.configService.get<string>('VERISYS_BASE_URL', ''),
      clientId: this.configService.get<string>('VERISYS_CLIENT_ID', ''),
      clientSecret: this.configService.get<string>('VERISYS_CLIENT_SECRET', ''),
      timeoutMs: this.configService.get<number>('VERISYS_TIMEOUT_MS', 10000),
      verifyEndpoint: this.configService.get<string>('VERISYS_VERIFY_ENDPOINT', '/cnic/verify'),
      maxRetries: this.configService.get<number>('VERISYS_MAX_RETRIES', 2),
      retryDelayMs: this.configService.get<number>('VERISYS_RETRY_DELAY_MS', 1000),
      maxAttemptsPerDay: this.configService.get<number>('VERISYS_MAX_ATTEMPTS_PER_DAY', 3),
      kycRequiredForActivation: this.configService.get<boolean>('KYC_REQUIRED_FOR_ACTIVATION', false),
      kycExpiryDays: this.configService.get<number>('KYC_EXPIRY_DAYS'),
    };

    // Check if Verisys is configured (optional module)
    this.isConfigured = !!(this.config.baseUrl && this.config.clientId && this.config.clientSecret);
    
    if (this.isConfigured) {
      this.logger.log('Verisys module initialized with NADRA endpoint configured');
    } else {
      this.logger.warn('Verisys module loaded but NADRA endpoint not configured. KYC verification disabled.');
    }
  }

  /**
   * Check if Verisys module is properly configured
   */
  isModuleEnabled(): boolean {
    return this.isConfigured;
  }

  /**
   * Get KYC configuration for feature flags
   */
  getKycConfig() {
    return {
      isEnabled: this.isConfigured,
      kycRequiredForActivation: this.config.kycRequiredForActivation,
      maxAttemptsPerDay: this.config.maxAttemptsPerDay,
    };
  }

  /**
   * Hash CNIC using SHA-256 (never store raw CNIC)
   */
  private hashCnic(cnic: string): string {
    const normalized = cnic.replace(/[-\s]/g, '');
    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Get last 4 digits of CNIC for reference
   */
  private getCnicLast4(cnic: string): string {
    const normalized = cnic.replace(/[-\s]/g, '');
    return normalized.slice(-4);
  }

  /**
   * Normalize CNIC to 13 digits without dashes
   */
  private normalizeCnic(cnic: string): string {
    return cnic.replace(/[-\s]/g, '');
  }

  /**
   * Generate unique transaction reference
   */
  private generateTransactionRef(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `WAN-${timestamp}-${random}`.toUpperCase();
  }

  /**
   * Check if user can attempt verification (rate limiting)
   */
  async canAttemptVerification(userId: string): Promise<{ allowed: boolean; remainingAttempts: number; blockedUntil?: Date }> {
    const client = this.supabase.getClient();
    
    const { data, error } = await client.rpc('kyc.can_attempt_verification', {
      p_user_id: userId,
      max_attempts: this.config.maxAttemptsPerDay,
    });

    if (error) {
      // Fallback: query directly
      const { data: rateLimit } = await client
        .from('kyc.rate_limits')
        .select('attempt_count, blocked_until')
        .eq('user_id', userId)
        .eq('date', new Date().toISOString().split('T')[0])
        .single();

      if (!rateLimit) {
        return { allowed: true, remainingAttempts: this.config.maxAttemptsPerDay };
      }

      const blocked = rateLimit.blocked_until && new Date(rateLimit.blocked_until) > new Date();
      const remaining = Math.max(0, this.config.maxAttemptsPerDay - rateLimit.attempt_count);

      return {
        allowed: !blocked && remaining > 0,
        remainingAttempts: remaining,
        blockedUntil: blocked ? new Date(rateLimit.blocked_until) : undefined,
      };
    }

    return {
      allowed: data === true,
      remainingAttempts: this.config.maxAttemptsPerDay,
    };
  }

  /**
   * Increment verification attempt count
   */
  private async incrementAttempt(userId: string): Promise<number> {
    const client = this.supabase.getClient();
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await client
      .from('kyc.rate_limits')
      .upsert(
        {
          user_id: userId,
          date: today,
          attempt_count: 1,
          last_attempt_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,date',
        }
      )
      .select('attempt_count')
      .single();

    if (error) {
      this.logger.error(`Failed to increment attempt: ${error.message}`);
      return 1;
    }

    // Update the count if record existed
    if (data) {
      await client
        .from('kyc.rate_limits')
        .update({ 
          attempt_count: data.attempt_count + 1,
          last_attempt_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('date', today);
      
      return data.attempt_count + 1;
    }

    return 1;
  }

  /**
   * Write audit log entry
   */
  private async writeAuditLog(entry: KycAuditLogEntry): Promise<void> {
    const client = this.supabase.getClient();

    try {
      await client.from('kyc.audit_logs').insert({
        actor_user_id: entry.actorUserId,
        actor_role: entry.actorRole,
        actor_ip: entry.actorIp,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        target_user_id: entry.targetUserId,
        status: entry.status,
        error_code: entry.errorCode,
        error_message: entry.errorMessage,
        metadata: entry.metadata || {},
      });
    } catch (error) {
      this.logger.error(`Failed to write audit log: ${error.message}`);
      // Don't throw - audit failure shouldn't break the flow
    }
  }

  /**
   * Get current KYC status for a user
   */
  async getKycStatus(userId: string): Promise<{
    kycStatus: KycStatus;
    cnicLast4?: string;
    verifiedAt?: Date;
    canVerify: boolean;
    remainingAttempts: number;
  }> {
    const client = this.supabase.getClient();

    // Get customer KYC status
    const { data: customer } = await client
      .from('customers')
      .select('kyc_status, kyc_verified_at, kyc_verification_id')
      .eq('user_id', userId)
      .single();

    // Get last verification record
    const { data: lastVerification } = await client
      .from('kyc.verifications')
      .select('cnic_last4, verified_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Check rate limiting
    const rateCheck = await this.canAttemptVerification(userId);

    return {
      kycStatus: (customer?.kyc_status as KycStatus) || KycStatus.UNVERIFIED,
      cnicLast4: lastVerification?.cnic_last4,
      verifiedAt: customer?.kyc_verified_at ? new Date(customer.kyc_verified_at) : undefined,
      canVerify: rateCheck.allowed && this.isConfigured,
      remainingAttempts: rateCheck.remainingAttempts,
    };
  }

  /**
   * Verify CNIC through NADRA Verisys
   * 
   * @param userId - Authenticated user ID
   * @param dto - CNIC verification request
   * @param requestContext - Request metadata for audit
   */
  async verifyCnic(
    userId: string,
    dto: VerifyCnicDto,
    requestContext: { ip?: string; userAgent?: string; source?: string } = {},
  ): Promise<VerificationResult> {
    // Check if module is configured
    if (!this.isConfigured) {
      throw new HttpException(
        'KYC verification service is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Validate consent
    if (!dto.consent) {
      throw new HttpException(
        'Consent is required for CNIC verification',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check rate limiting
    const rateCheck = await this.canAttemptVerification(userId);
    if (!rateCheck.allowed) {
      await this.writeAuditLog({
        actorUserId: userId,
        actorIp: requestContext.ip,
        action: KycAuditAction.RATE_LIMIT_EXCEEDED,
        entityType: 'kyc_verification',
        status: 'FAILURE',
        metadata: { remainingAttempts: 0 },
      });

      throw new HttpException(
        {
          message: 'Daily verification limit exceeded. Please try again tomorrow.',
          blockedUntil: rateCheck.blockedUntil,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const client = this.supabase.getClient();
    const cnicHash = this.hashCnic(dto.cnic);
    const cnicLast4 = this.getCnicLast4(dto.cnic);
    const transactionRef = this.generateTransactionRef();

    // Get customer ID if exists
    const { data: customer } = await client
      .from('customers')
      .select('id')
      .eq('user_id', userId)
      .single();

    // Increment attempt count
    const attemptNumber = await this.incrementAttempt(userId);
    const remainingAttempts = Math.max(0, this.config.maxAttemptsPerDay - attemptNumber);

    // Create verification record with PENDING status
    const { data: verification, error: insertError } = await client
      .from('kyc.verifications')
      .insert({
        user_id: userId,
        customer_id: customer?.id,
        cnic_hash: cnicHash,
        cnic_last4: cnicLast4,
        cnic_issue_date: dto.cnicIssueDate,
        cnic_expiry_date: dto.cnicExpiryDate,
        verification_status: VerificationStatus.PENDING,
        request_ip: requestContext.ip,
        request_user_agent: requestContext.userAgent,
        request_source: requestContext.source || 'customer_portal',
        attempt_number: attemptNumber,
        consent_given: true,
        consent_timestamp: new Date().toISOString(),
        consent_ip: requestContext.ip,
        nadra_request_timestamp: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      this.logger.error(`Failed to create verification record: ${insertError.message}`);
      throw new HttpException(
        'Failed to initiate verification',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Log verification initiation
    await this.writeAuditLog({
      actorUserId: userId,
      actorIp: requestContext.ip,
      action: KycAuditAction.VERIFY_INITIATED,
      entityType: 'kyc_verification',
      entityId: verification.id,
      status: 'SUCCESS',
      metadata: {
        cnicLast4,
        attemptNumber,
        transactionRef,
      },
    });

    try {
      // Call NADRA Verisys API
      const nadraResponse = await this.callNadraApi(dto.cnic, transactionRef);

      // Process response
      const isVerified = nadraResponse.responseCode === '00';
      const status = isVerified ? VerificationStatus.VERIFIED : VerificationStatus.FAILED;

      // Update verification record
      const updateData: any = {
        verification_status: status,
        nadra_response_code: nadraResponse.responseCode,
        nadra_response_message: nadraResponse.responseMessage,
        nadra_reference_id: nadraResponse.referenceId,
        nadra_response_timestamp: new Date().toISOString(),
      };

      if (isVerified && nadraResponse.data) {
        updateData.nadra_name = nadraResponse.data.name;
        updateData.nadra_father_husband_name = nadraResponse.data.fatherHusbandName;
        updateData.nadra_dob = nadraResponse.data.dateOfBirth;
        updateData.nadra_gender = nadraResponse.data.gender;
        updateData.nadra_permanent_address = nadraResponse.data.permanentAddress;
        updateData.nadra_present_address = nadraResponse.data.presentAddress;
        updateData.verified_at = new Date().toISOString();
      }

      await client
        .from('kyc.verifications')
        .update(updateData)
        .eq('id', verification.id);

      // Update customer KYC status
      if (customer?.id) {
        await client
          .from('customers')
          .update({
            kyc_status: isVerified ? KycStatus.VERIFIED : KycStatus.FAILED,
            kyc_verified_at: isVerified ? new Date().toISOString() : null,
            kyc_verification_id: isVerified ? verification.id : null,
          })
          .eq('id', customer.id);
      }

      // Log result
      await this.writeAuditLog({
        actorUserId: userId,
        actorIp: requestContext.ip,
        action: isVerified ? KycAuditAction.VERIFY_SUCCESS : KycAuditAction.VERIFY_FAILED,
        entityType: 'kyc_verification',
        entityId: verification.id,
        status: isVerified ? 'SUCCESS' : 'FAILURE',
        errorCode: isVerified ? undefined : nadraResponse.responseCode,
        errorMessage: isVerified ? undefined : nadraResponse.responseMessage,
        metadata: {
          nadraReferenceId: nadraResponse.referenceId,
          responseCode: nadraResponse.responseCode,
        },
      });

      return {
        success: isVerified,
        status,
        verificationId: verification.id,
        message: isVerified
          ? 'Your CNIC has been successfully verified'
          : this.getFailureMessage(nadraResponse.responseCode),
        nadraReferenceId: nadraResponse.referenceId,
        verifiedAt: isVerified ? new Date() : undefined,
        attemptNumber,
        remainingAttempts,
      };
    } catch (error) {
      // Update verification record with error
      await client
        .from('kyc.verifications')
        .update({
          verification_status: VerificationStatus.FAILED,
          nadra_response_code: 'ERROR',
          nadra_response_message: error.message,
          nadra_response_timestamp: new Date().toISOString(),
        })
        .eq('id', verification.id);

      // Log error
      await this.writeAuditLog({
        actorUserId: userId,
        actorIp: requestContext.ip,
        action: KycAuditAction.VERIFY_ERROR,
        entityType: 'kyc_verification',
        entityId: verification.id,
        status: 'ERROR',
        errorCode: 'API_ERROR',
        errorMessage: error.message,
        metadata: { transactionRef },
      });

      throw new HttpException(
        {
          message: 'Verification service temporarily unavailable. Please try again later.',
          verificationId: verification.id,
          attemptNumber,
          remainingAttempts,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Call NADRA Verisys API
   */
  private async callNadraApi(cnic: string, transactionRef: string): Promise<NadraVerisysResponse> {
    const normalizedCnic = this.normalizeCnic(cnic);
    const timestamp = new Date().toISOString();

    const requestPayload: NadraVerisysRequest = {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      cnic: normalizedCnic,
      timestamp,
      transactionRef,
    };

    // Generate request signature if needed
    // requestPayload.signature = this.generateSignature(requestPayload);

    const url = `${this.config.baseUrl}${this.config.verifyEndpoint}`;

    try {
      const response = await firstValueFrom(
        this.httpService.post<NadraVerisysResponse>(url, requestPayload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Client-ID': this.config.clientId,
            'X-Transaction-Ref': transactionRef,
          },
          timeout: this.config.timeoutMs,
        }).pipe(
          timeout(this.config.timeoutMs),
          retry({
            count: this.config.maxRetries,
            delay: this.config.retryDelayMs,
          }),
          catchError((error: AxiosError) => {
            this.logger.error(`NADRA API error: ${error.message}`, {
              status: error.response?.status,
              transactionRef,
            });
            throw error;
          }),
        ),
      );

      return (response as AxiosResponse<NadraVerisysResponse>).data;
    } catch (error: any) {
      // Log without sensitive data
      this.logger.error(`NADRA API call failed: ${error.message}`, {
        transactionRef,
        cnicLast4: normalizedCnic.slice(-4),
      });

      // Return error response
      return {
        responseCode: '09',
        responseMessage: 'Request timeout or connection error',
        referenceId: transactionRef,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get user-friendly failure message
   */
  private getFailureMessage(responseCode: string): string {
    const messages: Record<string, string> = {
      '01': 'Invalid CNIC format. Please check and try again.',
      '02': 'CNIC could not be verified. Please ensure the details are correct.',
      '03': 'This CNIC cannot be verified at this time.',
      '04': 'CNIC has expired. Please update your CNIC and try again.',
      '05': 'Verification service error. Please try again later.',
      '06': 'Verification service temporarily unavailable.',
      '07': 'Too many attempts. Please try again later.',
      '09': 'Connection timeout. Please try again.',
      '10': 'System error. Please try again later.',
    };

    return messages[responseCode] || 'Verification failed. Please try again or contact support.';
  }

  /**
   * Check if KYC is required and verified for a user
   * Used by other services to gate operations
   */
  async isKycVerified(userId: string): Promise<boolean> {
    if (!this.config.kycRequiredForActivation) {
      return true; // KYC not required
    }

    const client = this.supabase.getClient();
    const { data: customer } = await client
      .from('customers')
      .select('kyc_status')
      .eq('user_id', userId)
      .single();

    return customer?.kyc_status === KycStatus.VERIFIED;
  }

  /**
   * Get verification history for a user (for customer portal)
   */
  async getVerificationHistory(userId: string): Promise<any[]> {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('kyc.verifications')
      .select(`
        id,
        cnic_last4,
        verification_status,
        created_at,
        verified_at,
        attempt_number,
        nadra_response_code
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      this.logger.error(`Failed to get verification history: ${error.message}`);
      return [];
    }

    return data || [];
  }

  /**
   * Get all KYC verifications for admin (with pagination)
   */
  async getAdminKycList(query: KycListQueryDto): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const client = this.supabase.getClient();
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const offset = (page - 1) * limit;

    let queryBuilder = client
      .from('kyc.verification_summary')
      .select('*', { count: 'exact' });

    // Apply filters
    if (query.status) {
      queryBuilder = queryBuilder.eq('verification_status', query.status);
    }

    if (query.search) {
      queryBuilder = queryBuilder.or(
        `customer_name.ilike.%${query.search}%,account_no.ilike.%${query.search}%,cnic_last4.eq.${query.search}`
      );
    }

    if (query.startDate) {
      queryBuilder = queryBuilder.gte('created_at', query.startDate);
    }

    if (query.endDate) {
      queryBuilder = queryBuilder.lte('created_at', query.endDate);
    }

    const { data, error, count } = await queryBuilder
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      this.logger.error(`Failed to get admin KYC list: ${error.message}`);
      throw new HttpException('Failed to retrieve KYC records', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      data: data || [],
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Get detailed KYC record for admin
   */
  async getAdminKycDetail(verificationId: string, adminUserId: string): Promise<any> {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('kyc.verification_summary')
      .select('*')
      .eq('id', verificationId)
      .single();

    if (error || !data) {
      throw new HttpException('KYC record not found', HttpStatus.NOT_FOUND);
    }

    // Log admin access for audit
    await this.writeAuditLog({
      actorUserId: adminUserId,
      actorRole: 'admin',
      action: KycAuditAction.VIEW_KYC,
      entityType: 'kyc_verification',
      entityId: verificationId,
      targetUserId: data.user_id,
      status: 'SUCCESS',
    });

    return data;
  }

  /**
   * Get KYC audit logs for compliance/PTA inspection
   */
  async getAuditLogs(
    filters: { userId?: string; startDate?: string; endDate?: string; action?: string },
    page = 1,
    limit = 50,
  ): Promise<{ data: any[]; total: number }> {
    const client = this.supabase.getClient();
    const offset = (page - 1) * limit;

    let queryBuilder = client
      .from('kyc.audit_logs')
      .select('*', { count: 'exact' });

    if (filters.userId) {
      queryBuilder = queryBuilder.or(
        `actor_user_id.eq.${filters.userId},target_user_id.eq.${filters.userId}`
      );
    }

    if (filters.action) {
      queryBuilder = queryBuilder.eq('action', filters.action);
    }

    if (filters.startDate) {
      queryBuilder = queryBuilder.gte('created_at', filters.startDate);
    }

    if (filters.endDate) {
      queryBuilder = queryBuilder.lte('created_at', filters.endDate);
    }

    const { data, error, count } = await queryBuilder
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      this.logger.error(`Failed to get audit logs: ${error.message}`);
      throw new HttpException('Failed to retrieve audit logs', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return {
      data: data || [],
      total: count || 0,
    };
  }
}
