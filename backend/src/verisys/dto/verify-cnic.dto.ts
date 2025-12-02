import {
  IsString,
  IsNotEmpty,
  Matches,
  IsOptional,
  IsDateString,
  IsBoolean,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

/**
 * DTO for CNIC verification request from frontend
 * 
 * @description Validates and sanitizes CNIC input before processing
 * @regulatory PTRA 1996 - Proper subscriber identification
 */
export class VerifyCnicDto {
  @ApiProperty({
    description: 'Pakistani CNIC number (13 digits)',
    example: '42101-1234567-1',
    pattern: '^[0-9]{5}-[0-9]{7}-[0-9]$|^[0-9]{13}$',
  })
  @IsString()
  @IsNotEmpty({ message: 'CNIC is required' })
  @Matches(/^[0-9]{5}-[0-9]{7}-[0-9]$|^[0-9]{13}$/, {
    message: 'CNIC must be in format XXXXX-XXXXXXX-X or 13 digits',
  })
  @Transform(({ value }) => value?.toString().replace(/[-\s]/g, ''))
  cnic: string;

  @ApiPropertyOptional({
    description: 'CNIC issue date',
    example: '2020-01-15',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Issue date must be a valid date (YYYY-MM-DD)' })
  cnicIssueDate?: string;

  @ApiPropertyOptional({
    description: 'CNIC expiry date',
    example: '2030-01-15',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Expiry date must be a valid date (YYYY-MM-DD)' })
  cnicExpiryDate?: string;

  @ApiProperty({
    description: 'User consent for NADRA verification',
    example: true,
  })
  @IsBoolean({ message: 'Consent must be a boolean value' })
  @IsNotEmpty({ message: 'Consent is required for verification' })
  consent: boolean;
}

/**
 * DTO for admin KYC lookup request
 */
export class AdminKycLookupDto {
  @ApiPropertyOptional({
    description: 'User ID to look up',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Customer ID to look up',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Last 4 digits of CNIC',
    example: '1234',
  })
  @IsOptional()
  @IsString()
  @Length(4, 4, { message: 'CNIC last 4 must be exactly 4 digits' })
  @Matches(/^[0-9]{4}$/, { message: 'CNIC last 4 must be numeric' })
  cnicLast4?: string;

  @ApiPropertyOptional({
    description: 'Account number',
    example: 'WAN-00001',
  })
  @IsOptional()
  @IsString()
  accountNo?: string;
}

/**
 * DTO for KYC list query parameters
 */
export class KycListQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by verification status',
    enum: ['PENDING', 'VERIFIED', 'FAILED', 'EXPIRED'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    example: 1,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 20,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Search term (name, account, CNIC last 4)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Start date for filtering',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for filtering',
    example: '2024-12-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
