/**
 * CTDISR-2025 Vendor & Third-Party Security Controller
 * PTA Regulation: Chapter 9 - Third-Party Risk Management
 * 
 * REST API endpoints for vendor management, risk assessments, and access control
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { VendorService } from './vendor.service';
import { VendorAssessmentService } from './vendor-assessment.service';
import {
  VendorStatus,
  VendorRiskLevel,
  CreateVendorDto,
  UpdateVendorStatusDto,
  CreateContractDto,
  GrantAccessDto,
  RevokeAccessDto,
  LogAccessDto,
  ReportIncidentDto,
  RecordPerformanceDto,
  InitiateAssessmentDto,
  SubmitAssessmentDto,
} from './types';

// ============ Vendor Controller ============

@ApiTags('CTDISR - Vendor Security')
@ApiBearerAuth()
@Controller('ctdisr/vendors')
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}

  // ============ Vendor CRUD ============

  @Post()
  @ApiOperation({ summary: 'Register a new vendor' })
  @ApiResponse({ status: 201, description: 'Vendor created successfully' })
  async createVendor(@Body() dto: CreateVendorDto, @Request() req: any) {
    return this.vendorService.createVendor(dto, req.user?.sub);
  }

  @Get()
  @ApiOperation({ summary: 'List vendors with filtering' })
  @ApiQuery({ name: 'status', required: false, enum: VendorStatus })
  @ApiQuery({ name: 'riskLevel', required: false, enum: VendorRiskLevel })
  @ApiQuery({ name: 'vendorType', required: false })
  @ApiQuery({ name: 'hasDataAccess', required: false, type: Boolean })
  @ApiQuery({ name: 'hasSystemAccess', required: false, type: Boolean })
  @ApiQuery({ name: 'country', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listVendors(
    @Query('status') status?: VendorStatus,
    @Query('riskLevel') riskLevel?: VendorRiskLevel,
    @Query('vendorType') vendorType?: string,
    @Query('hasDataAccess') hasDataAccess?: boolean,
    @Query('hasSystemAccess') hasSystemAccess?: boolean,
    @Query('country') country?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.vendorService.listVendors({
      status,
      riskLevel,
      vendorType,
      hasDataAccess,
      hasSystemAccess,
      country,
      search,
      page,
      limit,
    });
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get vendor statistics' })
  async getStatistics() {
    return this.vendorService.getStatistics();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get vendor by ID' })
  @ApiParam({ name: 'id', description: 'Vendor ID' })
  async getVendor(@Param('id') id: string) {
    return this.vendorService.getVendor(id);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update vendor status' })
  @ApiParam({ name: 'id', description: 'Vendor ID' })
  async updateVendorStatus(
    @Param('id') id: string,
    @Body() dto: UpdateVendorStatusDto,
    @Request() req: any,
  ) {
    return this.vendorService.updateVendorStatus(id, dto, req.user?.sub);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend vendor and revoke all access' })
  @ApiParam({ name: 'id', description: 'Vendor ID' })
  async suspendVendor(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Request() req: any,
  ) {
    await this.vendorService.suspendVendorAccess(id, reason, req.user?.sub);
    return { success: true, message: 'Vendor suspended and all access revoked' };
  }

  // ============ Contracts ============

  @Post(':id/contracts')
  @ApiOperation({ summary: 'Create a contract for vendor' })
  @ApiParam({ name: 'id', description: 'Vendor ID' })
  async createContract(
    @Param('id') id: string,
    @Body() dto: Omit<CreateContractDto, 'vendorId'>,
    @Request() req: any,
  ) {
    return this.vendorService.createContract({ ...dto, vendorId: id }, req.user?.sub);
  }

  @Get(':id/contracts')
  @ApiOperation({ summary: 'List contracts for vendor' })
  @ApiParam({ name: 'id', description: 'Vendor ID' })
  async listVendorContracts(@Param('id') id: string) {
    return this.vendorService.listVendorContracts(id);
  }

  @Get('contracts/expiring')
  @ApiOperation({ summary: 'Get contracts expiring soon' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async getExpiringContracts(@Query('days') days?: number) {
    return this.vendorService.getExpiringContracts(days ?? 30);
  }

  @Post('contracts/:contractId/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a contract' })
  @ApiParam({ name: 'contractId', description: 'Contract ID' })
  async activateContract(
    @Param('contractId') contractId: string,
    @Request() req: any,
  ) {
    return this.vendorService.activateContract(contractId, req.user?.sub);
  }

  // ============ Access Management ============

  @Post(':id/access')
  @ApiOperation({ summary: 'Grant access permission to vendor' })
  @ApiParam({ name: 'id', description: 'Vendor ID' })
  async grantAccess(
    @Param('id') id: string,
    @Body() dto: Omit<GrantAccessDto, 'vendorId'>,
    @Request() req: any,
  ) {
    return this.vendorService.grantAccess({ ...dto, vendorId: id }, req.user?.sub);
  }

  @Get(':id/access')
  @ApiOperation({ summary: 'List active access permissions for vendor' })
  @ApiParam({ name: 'id', description: 'Vendor ID' })
  async listVendorAccess(@Param('id') id: string) {
    return this.vendorService.listVendorAccess(id);
  }

  @Delete('access/:permissionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke access permission' })
  @ApiParam({ name: 'permissionId', description: 'Permission ID' })
  async revokeAccess(
    @Param('permissionId') permissionId: string,
    @Body('reason') reason: string,
    @Request() req: any,
  ) {
    await this.vendorService.revokeAccess({ permissionId, reason }, req.user?.sub);
    return { success: true, message: 'Access revoked' };
  }

  @Post('access/log')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Log vendor access activity' })
  async logAccess(@Body() dto: LogAccessDto) {
    await this.vendorService.logAccess(dto);
    return { success: true };
  }

  // ============ Incidents ============

  @Post(':id/incidents')
  @ApiOperation({ summary: 'Report a vendor security incident' })
  @ApiParam({ name: 'id', description: 'Vendor ID' })
  async reportIncident(
    @Param('id') id: string,
    @Body() dto: Omit<ReportIncidentDto, 'vendorId'>,
    @Request() req: any,
  ) {
    return this.vendorService.reportIncident({ ...dto, vendorId: id }, req.user?.sub);
  }

  @Get(':id/incidents')
  @ApiOperation({ summary: 'List vendor incidents' })
  @ApiParam({ name: 'id', description: 'Vendor ID' })
  async listVendorIncidents(@Param('id') id: string) {
    return this.vendorService.listVendorIncidents(id);
  }

  // ============ Performance ============

  @Post(':id/performance')
  @ApiOperation({ summary: 'Record vendor performance metrics' })
  @ApiParam({ name: 'id', description: 'Vendor ID' })
  async recordPerformance(
    @Param('id') id: string,
    @Body() dto: Omit<RecordPerformanceDto, 'vendorId'>,
    @Request() req: any,
  ) {
    return this.vendorService.recordPerformance({ ...dto, vendorId: id }, req.user?.sub);
  }

  @Get(':id/performance')
  @ApiOperation({ summary: 'Get vendor performance history' })
  @ApiParam({ name: 'id', description: 'Vendor ID' })
  @ApiQuery({ name: 'months', required: false, type: Number })
  async getPerformanceHistory(
    @Param('id') id: string,
    @Query('months') months?: number,
  ) {
    return this.vendorService.getPerformanceHistory(id, months ?? 12);
  }

  // ============ Certifications ============

  @Post(':id/certifications')
  @ApiOperation({ summary: 'Add vendor certification' })
  @ApiParam({ name: 'id', description: 'Vendor ID' })
  async addCertification(
    @Param('id') id: string,
    @Body() certification: {
      certificationName: string;
      certificationBody?: string;
      certificationNumber?: string;
      issuedAt: Date;
      expiresAt?: Date;
      scope?: string;
    },
    @Request() req: any,
  ) {
    return this.vendorService.addCertification(id, certification, req.user?.sub);
  }

  @Post('certifications/:certificationId/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a certification' })
  @ApiParam({ name: 'certificationId', description: 'Certification ID' })
  async verifyCertification(
    @Param('certificationId') certificationId: string,
    @Request() req: any,
  ) {
    await this.vendorService.verifyCertification(certificationId, req.user?.sub);
    return { success: true, message: 'Certification verified' };
  }
}

// ============ Vendor Assessment Controller ============

@ApiTags('CTDISR - Vendor Assessments')
@ApiBearerAuth()
@Controller('ctdisr/vendor-assessments')
export class VendorAssessmentController {
  constructor(private readonly assessmentService: VendorAssessmentService) {}

  @Post()
  @ApiOperation({ summary: 'Initiate a new vendor risk assessment' })
  async initiateAssessment(@Body() dto: InitiateAssessmentDto, @Request() req: any) {
    return this.assessmentService.initiateAssessment(dto, req.user?.sub);
  }

  @Get('overdue')
  @ApiOperation({ summary: 'Get overdue assessments' })
  async getOverdueAssessments() {
    return this.assessmentService.getOverdueAssessments();
  }

  @Get('questionnaire-template')
  @ApiOperation({ summary: 'Get due diligence questionnaire template' })
  getQuestionnaireTemplate() {
    return this.assessmentService.getQuestionnaireTemplate();
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get third-party risk dashboard' })
  async getRiskDashboard() {
    return this.assessmentService.getRiskDashboard();
  }

  @Get('compliance-report')
  @ApiOperation({ summary: 'Generate PTA compliance report for vendor management' })
  async getComplianceReport() {
    return this.assessmentService.generateComplianceReport();
  }

  @Get('vendor/:vendorId')
  @ApiOperation({ summary: 'List assessments for a vendor' })
  @ApiParam({ name: 'vendorId', description: 'Vendor ID' })
  async listVendorAssessments(@Param('vendorId') vendorId: string) {
    return this.assessmentService.listVendorAssessments(vendorId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get assessment by ID' })
  @ApiParam({ name: 'id', description: 'Assessment ID' })
  async getAssessment(@Param('id') id: string) {
    return this.assessmentService.getAssessment(id);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start working on an assessment' })
  @ApiParam({ name: 'id', description: 'Assessment ID' })
  async startAssessment(@Param('id') id: string, @Request() req: any) {
    return this.assessmentService.startAssessment(id, req.user?.sub);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit assessment responses and findings' })
  @ApiParam({ name: 'id', description: 'Assessment ID' })
  async submitAssessment(
    @Param('id') id: string,
    @Body() dto: SubmitAssessmentDto,
    @Request() req: any,
  ) {
    return this.assessmentService.submitAssessment(id, dto, req.user?.sub);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Review and complete an assessment' })
  @ApiParam({ name: 'id', description: 'Assessment ID' })
  async completeAssessment(
    @Param('id') id: string,
    @Body('reviewerNotes') reviewerNotes: string,
    @Request() req: any,
  ) {
    return this.assessmentService.completeAssessment(id, reviewerNotes, req.user?.sub);
  }

  @Post(':id/findings')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a finding to an assessment' })
  @ApiParam({ name: 'id', description: 'Assessment ID' })
  async addFinding(
    @Param('id') id: string,
    @Body() finding: {
      category: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      title: string;
      description: string;
      recommendation: string;
      dueDate?: Date;
    },
    @Request() req: any,
  ) {
    await this.assessmentService.addFinding(
      id,
      { ...finding, id: '', status: 'open' },
      req.user?.sub,
    );
    return { success: true, message: 'Finding added' };
  }

  @Put(':id/findings/:findingId/status')
  @ApiOperation({ summary: 'Update finding status' })
  @ApiParam({ name: 'id', description: 'Assessment ID' })
  @ApiParam({ name: 'findingId', description: 'Finding ID' })
  async updateFindingStatus(
    @Param('id') id: string,
    @Param('findingId') findingId: string,
    @Body('status') status: 'open' | 'in_progress' | 'resolved' | 'accepted',
    @Request() req: any,
  ) {
    await this.assessmentService.updateFindingStatus(id, findingId, status, req.user?.sub);
    return { success: true };
  }
}
