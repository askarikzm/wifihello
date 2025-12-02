import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';
import { SupabaseJwtGuard } from '../common/guards/supabase-jwt.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { VerisysService } from './verisys.service';
import {
  VerifyCnicDto,
  KycListQueryDto,
  KycVerificationResponseDto,
  KycStatusResponseDto,
  AdminKycListResponseDto,
  AdminKycDetailResponseDto,
} from './dto';

/**
 * KYC Controller
 * 
 * Handles CNIC verification endpoints for customer portal and admin.
 * All endpoints require authentication.
 * 
 * @regulatory PTRA 1996, PTA KYC Rules
 */
@ApiTags('KYC')
@Controller('kyc')
export class KycController {
  constructor(private readonly verisysService: VerisysService) {}

  /**
   * Get current user's KYC status
   */
  @Get('status')
  @UseGuards(SupabaseJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current KYC status' })
  @ApiResponse({ status: 200, type: KycStatusResponseDto })
  async getKycStatus(
    @CurrentUser() user: any,
  ): Promise<KycStatusResponseDto> {
    const status = await this.verisysService.getKycStatus(user.id);
    const config = this.verisysService.getKycConfig();

    return {
      kycStatus: status.kycStatus,
      cnicLast4: status.cnicLast4,
      verifiedAt: status.verifiedAt,
      kycRequired: config.kycRequiredForActivation,
      canVerify: status.canVerify,
      remainingAttempts: status.remainingAttempts,
      message: this.getStatusMessage(status.kycStatus),
    };
  }

  /**
   * Get KYC module configuration
   */
  @Get('config')
  @UseGuards(SupabaseJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get KYC configuration' })
  async getKycConfig() {
    return this.verisysService.getKycConfig();
  }

  /**
   * Verify CNIC through NADRA Verisys
   */
  @Post('verify-cnic')
  @UseGuards(SupabaseJwtGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify CNIC through NADRA' })
  @ApiResponse({ status: 200, type: KycVerificationResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid CNIC or missing consent' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({ status: 503, description: 'Service unavailable' })
  async verifyCnic(
    @CurrentUser() user: any,
    @Body() dto: VerifyCnicDto,
    @Req() req: Request,
  ): Promise<KycVerificationResponseDto> {
    const result = await this.verisysService.verifyCnic(user.id, dto, {
      ip: this.getClientIp(req),
      userAgent: req.headers['user-agent'],
      source: 'customer_portal',
    });

    return {
      success: result.success,
      status: result.status,
      verificationId: result.verificationId,
      message: result.message,
      verifiedAt: result.verifiedAt,
      attemptNumber: result.attemptNumber,
      remainingAttempts: result.remainingAttempts,
    };
  }

  /**
   * Get user's verification history
   */
  @Get('history')
  @UseGuards(SupabaseJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get verification history' })
  async getVerificationHistory(@CurrentUser() user: any) {
    return this.verisysService.getVerificationHistory(user.id);
  }

  // ==================== ADMIN ENDPOINTS ====================

  /**
   * Get all KYC verifications (admin only)
   */
  @Get('admin/list')
  @UseGuards(SupabaseJwtGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all KYC verifications (admin)' })
  @ApiResponse({ status: 200, type: AdminKycListResponseDto })
  async getAdminKycList(
    @Query() query: KycListQueryDto,
  ): Promise<AdminKycListResponseDto> {
    return this.verisysService.getAdminKycList(query);
  }

  /**
   * Get KYC detail for a specific verification (admin only)
   */
  @Get('admin/detail/:id')
  @UseGuards(SupabaseJwtGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get KYC verification detail (admin)' })
  @ApiParam({ name: 'id', description: 'Verification ID' })
  @ApiResponse({ status: 200, type: AdminKycDetailResponseDto })
  async getAdminKycDetail(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<AdminKycDetailResponseDto> {
    return this.verisysService.getAdminKycDetail(id, user.id);
  }

  /**
   * Get KYC audit logs (admin only - for PTA compliance)
   */
  @Get('admin/audit-logs')
  @UseGuards(SupabaseJwtGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get KYC audit logs (admin)' })
  async getAuditLogs(
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    return this.verisysService.getAuditLogs(
      { userId, action, startDate, endDate },
      page,
      limit,
    );
  }

  /**
   * Admin: Verify CNIC on behalf of customer
   */
  @Post('admin/verify/:userId')
  @UseGuards(SupabaseJwtGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify CNIC for a customer (admin)' })
  @ApiParam({ name: 'userId', description: 'Customer user ID' })
  async adminVerifyCnic(
    @Param('userId') userId: string,
    @Body() dto: VerifyCnicDto,
    @CurrentUser() admin: any,
    @Req() req: Request,
  ): Promise<KycVerificationResponseDto> {
    const result = await this.verisysService.verifyCnic(userId, dto, {
      ip: this.getClientIp(req),
      userAgent: req.headers['user-agent'],
      source: 'admin_portal',
    });

    return {
      success: result.success,
      status: result.status,
      verificationId: result.verificationId,
      message: result.message,
      verifiedAt: result.verifiedAt,
      attemptNumber: result.attemptNumber,
      remainingAttempts: result.remainingAttempts,
    };
  }

  // ==================== HELPER METHODS ====================

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || '';
  }

  private getStatusMessage(status: string): string {
    const messages: Record<string, string> = {
      UNVERIFIED: 'Your identity has not been verified yet. Please verify your CNIC.',
      PENDING: 'Your verification is being processed.',
      VERIFIED: 'Your identity has been verified.',
      FAILED: 'Your last verification attempt failed. Please try again.',
    };
    return messages[status] || '';
  }
}
