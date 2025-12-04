/**
 * NetAxis ISP - CTDISR-2025 Access Control Controller
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
import { AccessControlService } from './access-control.service';
import {
  CtdisrPolicy,
  CriticalInfrastructure,
  AuditLogAccess,
} from '../ctdisr-policy.decorator';
import { AssetClassification, CtdisrContext } from '../types';
import {
  CreateRoleDto,
  AssignRoleDto,
  CreateJitRequestDto,
  SessionEndReason,
  JitStatus,
  AnomalyStatus,
} from './types';

@ApiTags('Access Control')
@ApiBearerAuth()
@Controller('api/admin/access-control')
@UseGuards(SupabaseJwtGuard)
export class AccessControlController {
  constructor(private readonly accessControlService: AccessControlService) {}

  // ============================================
  // ROLES
  // ============================================

  @Get('roles')
  @ApiOperation({ summary: 'Get all roles' })
  @AuditLogAccess()
  async getAllRoles() {
    return this.accessControlService.getAllRoles();
  }

  @Get('roles/:code')
  @ApiOperation({ summary: 'Get role by code' })
  @AuditLogAccess()
  async getRoleByCode(@Param('code') code: string) {
    return this.accessControlService.getRoleByCode(code);
  }

  // ============================================
  // USER ROLES
  // ============================================

  @Get('users/:userId/roles')
  @ApiOperation({ summary: 'Get user roles' })
  @AuditLogAccess()
  async getUserRoles(@Param('userId') userId: string) {
    return this.accessControlService.getUserRoles(userId);
  }

  @Post('users/roles')
  @ApiOperation({ summary: 'Assign role to user' })
  @CtdisrPolicy({
    assetClass: AssetClassification.SENSITIVE,
    requireMfa: true,
  })
  @HttpCode(HttpStatus.CREATED)
  async assignRole(
    @Body() dto: AssignRoleDto,
    @Request() req: { ctdisrContext: CtdisrContext },
  ) {
    return this.accessControlService.assignRole(dto, req.ctdisrContext);
  }

  @Delete('users/:userId/roles/:roleCode')
  @ApiOperation({ summary: 'Revoke role from user' })
  @CtdisrPolicy({
    assetClass: AssetClassification.SENSITIVE,
    requireMfa: true,
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeRole(
    @Param('userId') userId: string,
    @Param('roleCode') roleCode: string,
    @Body() body: { reason: string },
    @Request() req: { ctdisrContext: CtdisrContext },
  ) {
    await this.accessControlService.revokeRole(userId, roleCode, body.reason, req.ctdisrContext);
  }

  // ============================================
  // PERMISSION CHECKING
  // ============================================

  @Post('permissions/check')
  @ApiOperation({ summary: 'Check if user has permission' })
  async checkPermission(
    @Body() body: {
      userId: string;
      permissionCode: string;
      conditions?: Record<string, unknown>;
    },
  ) {
    return this.accessControlService.checkPermission({
      userId: body.userId,
      permissionCode: body.permissionCode,
      conditions: body.conditions,
    });
  }

  // ============================================
  // SESSIONS
  // ============================================

  @Get('sessions/user/:userId')
  @ApiOperation({ summary: 'Get active sessions for user' })
  @AuditLogAccess()
  async getActiveSessions(@Param('userId') userId: string) {
    return this.accessControlService.getActiveSessions(userId);
  }

  @Post('sessions/:sessionId/end')
  @ApiOperation({ summary: 'Force end a session' })
  @CtdisrPolicy({
    assetClass: AssetClassification.SENSITIVE,
    requireMfa: true,
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async endSession(
    @Param('sessionId') sessionId: string,
    @Body() body: { reason?: string },
  ) {
    await this.accessControlService.endSession(
      sessionId,
      SessionEndReason.FORCED,
      body.reason,
    );
  }

  // ============================================
  // JIT PRIVILEGE ESCALATION
  // ============================================

  @Post('jit/request')
  @ApiOperation({ summary: 'Request JIT privilege escalation' })
  @CtdisrPolicy({
    assetClass: AssetClassification.SENSITIVE,
    requireMfa: true,
  })
  @HttpCode(HttpStatus.CREATED)
  async requestJitPrivilege(
    @Body() dto: CreateJitRequestDto,
    @Request() req: { ctdisrContext: CtdisrContext },
  ) {
    return this.accessControlService.requestJitPrivilege(dto, req.ctdisrContext);
  }

  @Post('jit/:requestId/activate')
  @ApiOperation({ summary: 'Activate approved JIT privilege' })
  @CriticalInfrastructure()
  @HttpCode(HttpStatus.OK)
  async activateJitPrivilege(
    @Param('requestId') requestId: string,
    @Request() req: { ctdisrContext: CtdisrContext },
  ) {
    return this.accessControlService.activateJitPrivilege(requestId, req.ctdisrContext);
  }

  // ============================================
  // ANOMALY DETECTION
  // ============================================

  @Post('anomalies/detect')
  @ApiOperation({ summary: 'Run anomaly detection for context' })
  async detectAnomalies(
    @Body() body: {
      userId: string;
      sessionId: string;
      ipAddress: string;
      geoData?: { country?: string; region?: string; city?: string };
      deviceFingerprint?: string;
    },
  ) {
    return this.accessControlService.detectAnomalies(body);
  }
}
