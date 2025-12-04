/**
 * NetAxis ISP - CTDISR-2025 Cryptography Controller
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/supabase-jwt.guard';
import { EncryptionService } from './encryption.service';
import { CertificateService } from './certificate.service';
import {
  CriticalInfrastructure,
  AuditLogAccess,
} from '../ctdisr-policy.decorator';
import {
  CreateKeyDto,
  RotateKeyDto,
  CertificateType,
  RevokeCertificateDto,
} from './types';

@ApiTags('Cryptography')
@ApiBearerAuth()
@Controller('api/admin/crypto')
@UseGuards(SupabaseJwtGuard)
export class CryptographyController {
  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly certificateService: CertificateService,
  ) {}

  // ============================================
  // KEY MANAGEMENT
  // ============================================

  @Post('keys')
  @ApiOperation({ summary: 'Generate a new encryption key' })
  @CriticalInfrastructure()
  @HttpCode(HttpStatus.CREATED)
  async generateKey(
    @Body() dto: CreateKeyDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.encryptionService.generateKey(dto, req.user?.id);
  }

  @Post('keys/rotate')
  @ApiOperation({ summary: 'Rotate an encryption key' })
  @CriticalInfrastructure()
  @HttpCode(HttpStatus.OK)
  async rotateKey(
    @Body() dto: RotateKeyDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.encryptionService.rotateKey(dto, req.user?.id);
  }

  @Delete('keys/:keyId')
  @ApiOperation({ summary: 'Destroy an encryption key' })
  @CriticalInfrastructure()
  @HttpCode(HttpStatus.NO_CONTENT)
  async destroyKey(
    @Param('keyId') keyId: string,
    @Body() body: { reason: string },
    @Request() req: { user: { id: string } },
  ) {
    await this.encryptionService.destroyKey(keyId, body.reason, req.user?.id);
  }

  @Get('keys/rotation-needed')
  @ApiOperation({ summary: 'Get keys needing rotation' })
  @AuditLogAccess()
  async getKeysNeedingRotation() {
    return this.encryptionService.getKeysNeedingRotation();
  }

  // ============================================
  // CERTIFICATES
  // ============================================

  @Get('certificates')
  @ApiOperation({ summary: 'Get all active certificates' })
  @AuditLogAccess()
  async getActiveCertificates() {
    return this.certificateService.getActiveCertificates();
  }

  @Get('certificates/alias/:alias')
  @ApiOperation({ summary: 'Get certificate by alias' })
  @AuditLogAccess()
  async getCertificateByAlias(@Param('alias') alias: string) {
    return this.certificateService.getCertificateByAlias(alias);
  }

  @Get('certificates/expiring')
  @ApiOperation({ summary: 'Get expiring certificates' })
  @AuditLogAccess()
  async getExpiringCertificates(@Query('days') days?: string) {
    const daysAhead = days ? parseInt(days, 10) : 30;
    return this.certificateService.getExpiringCertificates(daysAhead);
  }

  @Post('certificates/import')
  @ApiOperation({ summary: 'Import a certificate' })
  @CriticalInfrastructure()
  @HttpCode(HttpStatus.CREATED)
  async importCertificate(
    @Body() body: { certPem: string; alias: string; certType: CertificateType },
    @Request() req: { user: { id: string } },
  ) {
    return this.certificateService.importCertificate(
      body.certPem,
      body.alias,
      body.certType,
      req.user?.id,
    );
  }

  @Post('certificates/revoke')
  @ApiOperation({ summary: 'Revoke a certificate' })
  @CriticalInfrastructure()
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeCertificate(
    @Body() dto: RevokeCertificateDto,
    @Request() req: { user: { id: string } },
  ) {
    await this.certificateService.revokeCertificate(dto, req.user?.id);
  }

  @Post('certificates/:certId/renew')
  @ApiOperation({ summary: 'Initiate certificate renewal' })
  @CriticalInfrastructure()
  @HttpCode(HttpStatus.OK)
  async initiateCertificateRenewal(
    @Param('certId') certId: string,
    @Request() req: { user: { id: string } },
  ) {
    const renewalId = await this.certificateService.initiateCertificateRenewal(certId, req.user?.id);
    return { renewalId };
  }

  // ============================================
  // COMPLIANCE
  // ============================================

  @Get('compliance/summary')
  @ApiOperation({ summary: 'Get crypto compliance summary' })
  @AuditLogAccess()
  async getComplianceSummary() {
    return this.encryptionService.getComplianceSummary();
  }
}
