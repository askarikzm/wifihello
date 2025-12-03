/**
 * WANCOM ISP - CTDISR-2025 Asset Management Controller
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
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
import { AssetService } from './asset.service';
import {
  CtdisrPolicy,
  ConfigurationChange,
  SensitiveData,
} from '../ctdisr-policy.decorator';
import { AssetClassification, CtdisrContext } from '../types';
import {
  CreateAssetDto,
  UpdateAssetDto,
  CreateVulnerabilityDto,
  AssetSearchFilters,
  VulnerabilityStatus,
} from './types';

@ApiTags('Asset Management')
@ApiBearerAuth()
@Controller('api/admin/assets')
@UseGuards(SupabaseJwtGuard)
export class AssetController {
  constructor(private readonly assetService: AssetService) {}

  // ============================================
  // ASSETS
  // ============================================

  @Get()
  @ApiOperation({ summary: 'Search assets with filters' })
  @SensitiveData()
  async searchAssets(@Query() filters: AssetSearchFilters) {
    return this.assetService.searchAssets(filters);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get asset statistics' })
  async getStatistics() {
    return this.assetService.getStatistics();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get asset by ID' })
  @SensitiveData()
  async getAssetById(@Param('id') id: string) {
    return this.assetService.getAssetById(id);
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Get asset by code' })
  @SensitiveData()
  async getAssetByCode(@Param('code') code: string) {
    return this.assetService.getAssetByCode(code);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new asset' })
  @ConfigurationChange(AssetClassification.CONFIDENTIAL)
  @HttpCode(HttpStatus.CREATED)
  async createAsset(
    @Body() dto: CreateAssetDto,
    @Request() req: { ctdisrContext: CtdisrContext },
  ) {
    return this.assetService.createAsset(dto, req.ctdisrContext);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an asset' })
  @ConfigurationChange(AssetClassification.CONFIDENTIAL)
  async updateAsset(
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
    @Request() req: { ctdisrContext: CtdisrContext },
  ) {
    return this.assetService.updateAsset(id, dto, req.ctdisrContext);
  }

  @Post(':id/reclassify')
  @ApiOperation({ summary: 'Reclassify an asset' })
  @CtdisrPolicy({
    assetClass: AssetClassification.SENSITIVE,
    requireMfa: true,
    requireApproval: true,
    approvalWorkflow: 'ASSET_RECLASSIFICATION',
  })
  async reclassifyAsset(
    @Param('id') id: string,
    @Body() body: { classification: AssetClassification; reason: string },
    @Request() req: { ctdisrContext: CtdisrContext },
  ) {
    await this.assetService.reclassifyAsset(
      id,
      body.classification,
      body.reason,
      req.ctdisrContext,
    );
    return { success: true };
  }

  @Post(':id/decommission')
  @ApiOperation({ summary: 'Decommission an asset' })
  @CtdisrPolicy({
    assetClass: AssetClassification.SENSITIVE,
    requireMfa: true,
    requireApproval: true,
    approvalWorkflow: 'ASSET_DECOMMISSION',
  })
  async decommissionAsset(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @Request() req: { ctdisrContext: CtdisrContext },
  ) {
    return this.assetService.decommissionAsset(id, body.reason, req.ctdisrContext);
  }

  // ============================================
  // VULNERABILITIES
  // ============================================

  @Get(':id/vulnerabilities')
  @ApiOperation({ summary: 'Get vulnerabilities for an asset' })
  @SensitiveData()
  async getVulnerabilities(
    @Param('id') id: string,
    @Query('status') status?: VulnerabilityStatus,
  ) {
    return this.assetService.getAssetVulnerabilities(id, status);
  }

  @Post(':id/vulnerabilities')
  @ApiOperation({ summary: 'Add a vulnerability to an asset' })
  @ConfigurationChange(AssetClassification.SENSITIVE)
  @HttpCode(HttpStatus.CREATED)
  async addVulnerability(
    @Param('id') assetId: string,
    @Body() dto: Omit<CreateVulnerabilityDto, 'assetId'>,
    @Request() req: { ctdisrContext: CtdisrContext },
  ) {
    return this.assetService.addVulnerability(
      { ...dto, assetId },
      req.ctdisrContext,
    );
  }

  @Patch('vulnerabilities/:vulnId/status')
  @ApiOperation({ summary: 'Update vulnerability status' })
  @ConfigurationChange(AssetClassification.SENSITIVE)
  async updateVulnerabilityStatus(
    @Param('vulnId') vulnId: string,
    @Body() body: { status: VulnerabilityStatus; notes?: string },
    @Request() req: { ctdisrContext: CtdisrContext },
  ) {
    return this.assetService.updateVulnerabilityStatus(
      vulnId,
      body.status,
      req.ctdisrContext,
      body.notes,
    );
  }
}
