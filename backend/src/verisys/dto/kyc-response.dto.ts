import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VerificationStatus, KycStatus } from '../interfaces';

/**
 * Response DTO for KYC verification result
 * 
 * @description Sanitized response - does NOT expose raw NADRA data to client
 */
export class KycVerificationResponseDto {
  @ApiProperty({
    description: 'Whether verification was successful',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Verification status',
    enum: VerificationStatus,
    example: 'VERIFIED',
  })
  status: VerificationStatus;

  @ApiProperty({
    description: 'Verification record ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  verificationId: string;

  @ApiProperty({
    description: 'Human-readable message',
    example: 'Your CNIC has been successfully verified',
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Verification timestamp',
    example: '2024-11-30T12:00:00Z',
  })
  verifiedAt?: Date;

  @ApiProperty({
    description: 'Attempt number for today',
    example: 1,
  })
  attemptNumber: number;

  @ApiProperty({
    description: 'Remaining verification attempts for today',
    example: 2,
  })
  remainingAttempts: number;
}

/**
 * Response DTO for KYC status check
 */
export class KycStatusResponseDto {
  @ApiProperty({
    description: 'Current KYC status',
    enum: KycStatus,
    example: 'VERIFIED',
  })
  kycStatus: KycStatus;

  @ApiPropertyOptional({
    description: 'Last 4 digits of verified CNIC',
    example: '1234',
  })
  cnicLast4?: string;

  @ApiPropertyOptional({
    description: 'Verification date',
    example: '2024-11-30T12:00:00Z',
  })
  verifiedAt?: Date;

  @ApiProperty({
    description: 'Whether KYC is required for service activation',
    example: true,
  })
  kycRequired: boolean;

  @ApiProperty({
    description: 'Whether user can submit verification',
    example: true,
  })
  canVerify: boolean;

  @ApiPropertyOptional({
    description: 'Remaining attempts today',
    example: 3,
  })
  remainingAttempts?: number;

  @ApiPropertyOptional({
    description: 'Message about KYC status',
    example: 'Your identity has been verified',
  })
  message?: string;
}

/**
 * Response DTO for admin KYC detail view
 */
export class AdminKycDetailResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiPropertyOptional()
  customerId?: string;

  @ApiPropertyOptional()
  accountNo?: string;

  @ApiPropertyOptional()
  customerName?: string;

  @ApiPropertyOptional()
  customerPhone?: string;

  @ApiProperty()
  cnicLast4: string;

  @ApiProperty({ enum: VerificationStatus })
  verificationStatus: VerificationStatus;

  // NADRA data - only visible to admins
  @ApiPropertyOptional()
  nadraName?: string;

  @ApiPropertyOptional()
  nadraFatherHusbandName?: string;

  @ApiPropertyOptional()
  nadraDob?: Date;

  @ApiPropertyOptional()
  nadraGender?: string;

  @ApiPropertyOptional()
  nadraPermanentAddress?: string;

  @ApiPropertyOptional()
  nadraPresentAddress?: string;

  @ApiPropertyOptional()
  nadraResponseCode?: string;

  @ApiPropertyOptional()
  nadraReferenceId?: string;

  @ApiProperty()
  consentGiven: boolean;

  @ApiPropertyOptional()
  consentTimestamp?: Date;

  @ApiProperty()
  attemptNumber: number;

  @ApiProperty()
  requestSource: string;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  verifiedAt?: Date;
}

/**
 * Response DTO for admin KYC list
 */
export class AdminKycListResponseDto {
  @ApiProperty({ type: [AdminKycDetailResponseDto] })
  data: AdminKycDetailResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

/**
 * Response DTO for KYC audit log entry
 */
export class KycAuditLogResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  actorUserId: string;

  @ApiPropertyOptional()
  actorRole?: string;

  @ApiProperty()
  action: string;

  @ApiProperty()
  status: string;

  @ApiPropertyOptional()
  targetUserId?: string;

  @ApiPropertyOptional()
  metadata?: Record<string, any>;

  @ApiProperty()
  createdAt: Date;
}
