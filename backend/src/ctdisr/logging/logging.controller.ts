/**
 * WANCOM ISP - CTDISR-2025 Logging Controller
 */

import {
  Controller,
  Get,
  Post,
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
import { SupabaseJwtGuard } from '../../auth/supabase-jwt.guard';
import { AuditLoggingService } from './audit-logging.service';
import { SiemForwarderService } from './siem-forwarder.service';
import { AlertService } from './alert.service';
import { AuditLogAccess } from '../ctdisr-policy.decorator';
import {
  AuditLogSearchParams,
  CreateAlertRuleDto,
  SiemTarget,
} from './types';

@ApiTags('Logging & SIEM')
@ApiBearerAuth()
@Controller('api/admin/logging')
@UseGuards(SupabaseJwtGuard)
export class LoggingController {
  constructor(
    private readonly auditLoggingService: AuditLoggingService,
    private readonly siemForwarderService: SiemForwarderService,
    private readonly alertService: AlertService,
  ) {}

  // ============================================
  // AUDIT LOGS
  // ============================================

  @Post('search')
  @ApiOperation({ summary: 'Search audit logs' })
  @AuditLogAccess()
  async searchLogs(@Body() params: AuditLogSearchParams) {
    return this.auditLoggingService.searchLogs(params);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get audit log summary' })
  @AuditLogAccess()
  async getSummary(@Query('hours') hours?: string) {
    const hoursNum = hours ? parseInt(hours, 10) : 24;
    return this.auditLoggingService.getSummary(hoursNum);
  }

  @Get('correlation/:correlationId')
  @ApiOperation({ summary: 'Get logs by correlation ID' })
  @AuditLogAccess()
  async getByCorrelationId(@Param('correlationId') correlationId: string) {
    return this.auditLoggingService.getByCorrelationId(correlationId);
  }

  @Get('high-risk')
  @ApiOperation({ summary: 'Get high-risk events' })
  @AuditLogAccess()
  async getHighRiskEvents(
    @Query('minScore') minScore?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditLoggingService.getHighRiskEvents(
      minScore ? parseInt(minScore, 10) : 70,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  // ============================================
  // SIEM
  // ============================================

  @Get('siem/stats')
  @ApiOperation({ summary: 'Get SIEM queue statistics' })
  @AuditLogAccess()
  async getSiemStats() {
    return this.siemForwarderService.getQueueStats();
  }

  @Post('siem/retry-dead-letter')
  @ApiOperation({ summary: 'Retry dead letter items' })
  @AuditLogAccess()
  @HttpCode(HttpStatus.OK)
  async retryDeadLetter(@Query('target') target?: SiemTarget) {
    const count = await this.siemForwarderService.retryDeadLetterItems(target);
    return { retriedCount: count };
  }

  // ============================================
  // ALERTS
  // ============================================

  @Get('alerts/rules')
  @ApiOperation({ summary: 'Get active alert rules' })
  @AuditLogAccess()
  async getAlertRules() {
    return this.alertService.getActiveRules();
  }

  @Post('alerts/rules')
  @ApiOperation({ summary: 'Create alert rule' })
  @AuditLogAccess()
  @HttpCode(HttpStatus.CREATED)
  async createAlertRule(
    @Body() dto: CreateAlertRuleDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.alertService.createRule(dto, req.user?.id);
  }

  @Patch('alerts/rules/:ruleId')
  @ApiOperation({ summary: 'Update alert rule' })
  @AuditLogAccess()
  async updateAlertRule(
    @Param('ruleId') ruleId: string,
    @Body() dto: Partial<CreateAlertRuleDto>,
  ) {
    return this.alertService.updateRule(ruleId, dto);
  }

  @Post('alerts/rules/:ruleId/disable')
  @ApiOperation({ summary: 'Disable alert rule' })
  @AuditLogAccess()
  @HttpCode(HttpStatus.NO_CONTENT)
  async disableAlertRule(@Param('ruleId') ruleId: string) {
    await this.alertService.disableRule(ruleId);
  }

  @Get('alerts/unacknowledged')
  @ApiOperation({ summary: 'Get unacknowledged alerts' })
  @AuditLogAccess()
  async getUnacknowledgedAlerts() {
    return this.alertService.getUnacknowledgedAlerts();
  }

  @Post('alerts/:alertId/acknowledge')
  @ApiOperation({ summary: 'Acknowledge an alert' })
  @AuditLogAccess()
  @HttpCode(HttpStatus.NO_CONTENT)
  async acknowledgeAlert(
    @Param('alertId') alertId: string,
    @Request() req: { user: { id: string } },
  ) {
    await this.alertService.acknowledgeAlert(alertId, req.user.id);
  }

  @Post('alerts/:alertId/resolve')
  @ApiOperation({ summary: 'Resolve an alert' })
  @AuditLogAccess()
  @HttpCode(HttpStatus.NO_CONTENT)
  async resolveAlert(
    @Param('alertId') alertId: string,
    @Body() body: { notes?: string },
    @Request() req: { user: { id: string } },
  ) {
    await this.alertService.resolveAlert(alertId, req.user.id, body.notes);
  }
}
