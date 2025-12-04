/**
 * NetAxis ISP - CTDISR-2025 Admin Controller
 * Admin endpoints for compliance management
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CtdisrService } from './ctdisr.service';
import { SecurityEventsService } from './security-events.service';
import { ApprovalWorkflowService } from './approval-workflow.service';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { CtdisrPolicy, AuditLogAccess } from './ctdisr-policy.decorator';
import { AssetClassification, ViolationSeverity, ViolationStatus } from './types';

@ApiTags('CTDISR Compliance')
@ApiBearerAuth()
@Controller('api/admin/ctdisr')
@UseGuards(SupabaseJwtGuard)
export class CtdisrAdminController {
  constructor(
    private readonly ctdisrService: CtdisrService,
    private readonly securityEventsService: SecurityEventsService,
    private readonly approvalWorkflowService: ApprovalWorkflowService,
  ) {}

  // ============================================
  // POLICIES
  // ============================================

  @Get('policies')
  @ApiOperation({ summary: 'Get all CTDISR policies' })
  @AuditLogAccess()
  async getAllPolicies() {
    return this.ctdisrService.getAllPolicies();
  }

  @Get('policies/:code')
  @ApiOperation({ summary: 'Get a specific policy by code' })
  @AuditLogAccess()
  async getPolicy(@Param('code') code: string) {
    return this.ctdisrService.getPolicy(code);
  }

  // ============================================
  // VIOLATIONS
  // ============================================

  @Get('violations')
  @ApiOperation({ summary: 'Get violations by status' })
  @AuditLogAccess()
  async getViolations(@Query('status') status?: ViolationStatus) {
    if (status) {
      return this.ctdisrService.getViolationsByStatus(status);
    }
    return this.ctdisrService.getViolationsByStatus(ViolationStatus.OPEN);
  }

  @Get('violations/critical')
  @ApiOperation({ summary: 'Get critical open violations' })
  @CtdisrPolicy({
    assetClass: AssetClassification.CRITICAL,
    requireMfa: true,
    logDataAccess: true,
    dataType: 'AUDIT_LOG',
  })
  async getCriticalViolations() {
    return this.ctdisrService.getCriticalOpenViolations();
  }

  @Patch('violations/:id/status')
  @ApiOperation({ summary: 'Update violation status' })
  @CtdisrPolicy({
    assetClass: AssetClassification.SENSITIVE,
    requireMfa: true,
  })
  async updateViolationStatus(
    @Param('id') id: string,
    @Body() body: { status: ViolationStatus; notes?: string },
    @Request() req: { user: { id: string } },
  ) {
    return this.ctdisrService.updateViolationStatus(
      id,
      body.status,
      req.user.id,
      body.notes,
    );
  }

  // ============================================
  // SECURITY EVENTS
  // ============================================

  @Get('events/high-severity')
  @ApiOperation({ summary: 'Get high-severity events' })
  @AuditLogAccess()
  async getHighSeverityEvents(@Query('hours') hours?: number) {
    return this.securityEventsService.getHighSeverityEvents(hours || 24);
  }

  @Get('events/actor/:actorId')
  @ApiOperation({ summary: 'Get events by actor (user)' })
  @CtdisrPolicy({
    assetClass: AssetClassification.SENSITIVE,
    logDataAccess: true,
    dataType: 'AUDIT_LOG',
  })
  async getEventsByActor(
    @Param('actorId') actorId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.securityEventsService.getEventsByActor(
      actorId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('events/correlation/:correlationId')
  @ApiOperation({ summary: 'Get events by correlation ID' })
  @AuditLogAccess()
  async getEventsByCorrelation(@Param('correlationId') correlationId: string) {
    return this.securityEventsService.getEventsByCorrelation(correlationId);
  }

  // ============================================
  // APPROVAL WORKFLOWS
  // ============================================

  @Get('approvals/workflows')
  @ApiOperation({ summary: 'Get all approval workflows' })
  async getAllWorkflows() {
    return this.approvalWorkflowService.getAllWorkflows();
  }

  @Get('approvals/pending')
  @ApiOperation({ summary: 'Get pending approval requests for current user' })
  async getPendingApprovals(@Request() req: { user: { id: string; roles?: string[] } }) {
    return this.approvalWorkflowService.getPendingRequestsForApprover(
      req.user.id,
      req.user.roles || [],
    );
  }

  @Post('approvals/request')
  @ApiOperation({ summary: 'Create an approval request' })
  @HttpCode(HttpStatus.CREATED)
  async createApprovalRequest(
    @Body()
    body: {
      workflowCode: string;
      actionType: string;
      resourceType?: string;
      resourceId?: string;
      actionPayload?: Record<string, unknown>;
      justification: string;
    },
    @Request() req: { user: { id: string }; ctdisrContext: unknown },
  ) {
    return this.approvalWorkflowService.createApprovalRequest({
      ...body,
      context: req.ctdisrContext as Parameters<
        typeof this.approvalWorkflowService.createApprovalRequest
      >[0]['context'],
    });
  }

  @Post('approvals/:requestCode/decision')
  @ApiOperation({ summary: 'Submit approval decision' })
  @CtdisrPolicy({
    requireMfa: true,
  })
  async submitDecision(
    @Param('requestCode') requestCode: string,
    @Body() body: { decision: 'APPROVE' | 'REJECT'; notes?: string },
    @Request() req: { ctdisrContext: unknown },
  ) {
    return this.approvalWorkflowService.submitDecision({
      requestCode,
      decision: body.decision,
      notes: body.notes,
      context: req.ctdisrContext as Parameters<
        typeof this.approvalWorkflowService.submitDecision
      >[0]['context'],
    });
  }

  // ============================================
  // COMPLIANCE REPORTS
  // ============================================

  @Post('reports/compliance')
  @ApiOperation({ summary: 'Generate compliance report' })
  @CtdisrPolicy({
    assetClass: AssetClassification.CONFIDENTIAL,
    logDataAccess: true,
    dataType: 'AUDIT_LOG',
  })
  async generateComplianceReport(
    @Body() body: { from: string; to: string },
    @Request() req: { user: { id: string } },
  ) {
    return this.ctdisrService.generateComplianceReport(
      new Date(body.from),
      new Date(body.to),
      req.user.id,
    );
  }

  // ============================================
  // HASH CHAIN VERIFICATION
  // ============================================

  @Post('integrity/verify')
  @ApiOperation({ summary: 'Verify hash chain integrity' })
  @CtdisrPolicy({
    assetClass: AssetClassification.CRITICAL,
    requireMfa: true,
  })
  async verifyIntegrity() {
    return this.ctdisrService.verifyViolationsHashChain();
  }

  // ============================================
  // POLICY REFRESH
  // ============================================

  @Post('policies/refresh')
  @ApiOperation({ summary: 'Refresh policies cache' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async refreshPolicies() {
    await this.ctdisrService.refreshPoliciesCache();
  }
}
