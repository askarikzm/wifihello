/**
 * NetAxis ISP - CTDISR-2025 Network Security Controller
 */

import {
  Controller,
  Get,
  Post,
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
import { NetworkSecurityService } from './network-security.service';
import { CriticalInfrastructure, AuditLogAccess } from '../ctdisr-policy.decorator';
import {
  CreateNetworkZoneDto,
  CreateFirewallRuleDto,
  IdsSeverity,
} from './types';

@ApiTags('Network Security')
@ApiBearerAuth()
@Controller('api/admin/network-security')
@UseGuards(SupabaseJwtGuard)
export class NetworkSecurityController {
  constructor(private readonly networkSecurityService: NetworkSecurityService) {}

  // ============================================
  // NETWORK ZONES
  // ============================================

  @Get('zones')
  @ApiOperation({ summary: 'Get network zones' })
  @AuditLogAccess()
  async getZones(@Query('activeOnly') activeOnly?: string) {
    return this.networkSecurityService.getZones(activeOnly !== 'false');
  }

  @Post('zones')
  @ApiOperation({ summary: 'Create network zone' })
  @CriticalInfrastructure()
  @HttpCode(HttpStatus.CREATED)
  async createZone(
    @Body() dto: CreateNetworkZoneDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.networkSecurityService.createZone(dto, req.user?.id);
  }

  @Patch('zones/:zoneId')
  @ApiOperation({ summary: 'Update network zone' })
  @CriticalInfrastructure()
  async updateZone(
    @Param('zoneId') zoneId: string,
    @Body() dto: Partial<CreateNetworkZoneDto>,
  ) {
    return this.networkSecurityService.updateZone(zoneId, dto);
  }

  // ============================================
  // FIREWALL RULES
  // ============================================

  @Get('firewall/rules')
  @ApiOperation({ summary: 'Get firewall rules' })
  @AuditLogAccess()
  async getFirewallRules(@Query('activeOnly') activeOnly?: string) {
    return this.networkSecurityService.getFirewallRules(activeOnly !== 'false');
  }

  @Post('firewall/rules')
  @ApiOperation({ summary: 'Create firewall rule' })
  @CriticalInfrastructure()
  @HttpCode(HttpStatus.CREATED)
  async createFirewallRule(
    @Body() dto: CreateFirewallRuleDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.networkSecurityService.createFirewallRule(dto, req.user?.id);
  }

  @Patch('firewall/rules/:ruleId')
  @ApiOperation({ summary: 'Update firewall rule' })
  @CriticalInfrastructure()
  async updateFirewallRule(
    @Param('ruleId') ruleId: string,
    @Body() body: { updates: Partial<CreateFirewallRuleDto>; changeReason: string },
    @Request() req: { user: { id: string } },
  ) {
    return this.networkSecurityService.updateFirewallRule(
      ruleId,
      body.updates,
      body.changeReason,
      req.user?.id,
    );
  }

  @Delete('firewall/rules/:ruleId')
  @ApiOperation({ summary: 'Delete firewall rule' })
  @CriticalInfrastructure()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFirewallRule(
    @Param('ruleId') ruleId: string,
    @Body() body: { reason: string },
    @Request() req: { user: { id: string } },
  ) {
    await this.networkSecurityService.deleteFirewallRule(ruleId, body.reason, req.user?.id);
  }

  // ============================================
  // IDS/IPS
  // ============================================

  @Get('ids/events')
  @ApiOperation({ summary: 'Get IDS events' })
  @AuditLogAccess()
  async getIdsEvents(
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('severity') severity?: string,
    @Query('sourceIp') sourceIp?: string,
    @Query('investigated') investigated?: string,
    @Query('limit') limit?: string,
  ) {
    return this.networkSecurityService.getIdsEvents({
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      severity: severity ? (severity.split(',') as IdsSeverity[]) : undefined,
      sourceIp,
      investigated: investigated ? investigated === 'true' : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('ids/events/:eventId/investigate')
  @ApiOperation({ summary: 'Mark IDS event as investigated' })
  @AuditLogAccess()
  @HttpCode(HttpStatus.NO_CONTENT)
  async markEventInvestigated(
    @Param('eventId') eventId: string,
    @Body() body: { notes: string; falsePositive: boolean },
    @Request() req: { user: { id: string } },
  ) {
    await this.networkSecurityService.markIdsEventInvestigated(
      eventId,
      body.notes,
      body.falsePositive,
      req.user.id,
    );
  }

  @Get('ids/threat-sources')
  @ApiOperation({ summary: 'Get top threat sources' })
  @AuditLogAccess()
  async getTopThreatSources(
    @Query('hours') hours?: string,
    @Query('limit') limit?: string,
  ) {
    return this.networkSecurityService.getTopThreatSources(
      hours ? parseInt(hours, 10) : 24,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  // ============================================
  // DDOS PROTECTION
  // ============================================

  @Get('ddos/attacks')
  @ApiOperation({ summary: 'Get active DDoS attacks' })
  @AuditLogAccess()
  async getActiveDdosAttacks() {
    return this.networkSecurityService.getActiveDdosAttacks();
  }

  @Get('ddos/blacklist')
  @ApiOperation({ summary: 'Get blacklist' })
  @AuditLogAccess()
  async getBlacklist() {
    return this.networkSecurityService.getBlacklist();
  }

  @Post('ddos/blacklist')
  @ApiOperation({ summary: 'Add IP to blacklist' })
  @CriticalInfrastructure()
  @HttpCode(HttpStatus.CREATED)
  async addToBlacklist(
    @Body() body: {
      ipAddress: string;
      reason: string;
      expiresAt?: string;
      isPermanent?: boolean;
    },
    @Request() req: { user: { id: string } },
  ) {
    return this.networkSecurityService.addToBlacklist(
      body.ipAddress,
      body.reason,
      undefined,
      body.expiresAt ? new Date(body.expiresAt) : undefined,
      body.isPermanent || false,
      req.user?.id,
    );
  }

  @Delete('ddos/blacklist/:ip')
  @ApiOperation({ summary: 'Remove IP from blacklist' })
  @CriticalInfrastructure()
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFromBlacklist(@Param('ip') ip: string) {
    await this.networkSecurityService.removeFromBlacklist(ip);
  }

  // ============================================
  // VPN
  // ============================================

  @Get('vpn/sessions')
  @ApiOperation({ summary: 'Get active VPN sessions' })
  @AuditLogAccess()
  async getActiveVpnSessions() {
    return this.networkSecurityService.getActiveVpnSessions();
  }

  @Post('vpn/sessions/:sessionId/terminate')
  @ApiOperation({ summary: 'Terminate VPN session' })
  @CriticalInfrastructure()
  @HttpCode(HttpStatus.NO_CONTENT)
  async terminateVpnSession(
    @Param('sessionId') sessionId: string,
    @Body() body: { reason: string },
  ) {
    await this.networkSecurityService.terminateVpnSession(sessionId, body.reason);
  }

  // ============================================
  // SUMMARY
  // ============================================

  @Get('summary')
  @ApiOperation({ summary: 'Get network security summary' })
  @AuditLogAccess()
  async getSecuritySummary() {
    return this.networkSecurityService.getSecuritySummary();
  }
}
