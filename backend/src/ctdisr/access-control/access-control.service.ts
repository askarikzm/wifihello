/**
 * WANCOM ISP - CTDISR-2025 Zero-Trust Access Control Service
 */

import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash, randomUUID } from 'crypto';
import {
  Role,
  Permission,
  UserRole,
  UserSession,
  SessionAction,
  JitPrivilegeRequest,
  AccessAnomaly,
  UserAccessBaseline,
  CreateRoleDto,
  AssignRoleDto,
  CreateJitRequestDto,
  SessionStartDto,
  PermissionCheck,
  PermissionCheckResult,
  AnomalyCheckContext,
  AnomalyDetectionResult,
  RoleType,
  JitStatus,
  AnomalyType,
  AnomalyStatus,
  SessionEndReason,
} from './types';
import { CtdisrContext, AssetClassification, IncidentSeverity, AccessAction } from '../types';
import { SecurityEventsService } from '../security-events.service';
import { ApprovalWorkflowService } from '../approval-workflow.service';
import { SecurityEventCategory, SecurityEventOutcome } from '../types';

@Injectable()
export class AccessControlService {
  private readonly logger = new Logger(AccessControlService.name);
  private readonly roleCache: Map<string, Role> = new Map();
  private readonly permissionCache: Map<string, Permission> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly securityEventsService: SecurityEventsService,
    private readonly approvalWorkflowService: ApprovalWorkflowService,
  ) {}

  // ============================================
  // ROLE MANAGEMENT
  // ============================================

  /**
   * Get all roles
   */
  async getAllRoles(): Promise<Role[]> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(`${supabaseUrl}/rest/v1/roles?is_active=eq.true&order=role_code`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch roles');
    }

    const roles = await response.json();
    return roles.map((r: Record<string, unknown>) => this.mapRoleFromDb(r));
  }

  /**
   * Get role by code
   */
  async getRoleByCode(roleCode: string): Promise<Role | null> {
    // Check cache first
    if (this.roleCache.has(roleCode)) {
      return this.roleCache.get(roleCode)!;
    }

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(
      `${supabaseUrl}/rest/v1/roles?role_code=eq.${roleCode}&is_active=eq.true`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch role');
    }

    const [role] = await response.json();
    if (role) {
      const mapped = this.mapRoleFromDb(role);
      this.roleCache.set(roleCode, mapped);
      return mapped;
    }
    return null;
  }

  /**
   * Get user's effective roles
   */
  async getUserRoles(userId: string): Promise<UserRole[]> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(
      `${supabaseUrl}/rest/v1/user_roles?user_id=eq.${userId}&is_active=eq.true&select=*,role:roles(*)`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch user roles');
    }

    const userRoles = await response.json();
    return userRoles
      .filter((ur: { expires_at: string | null }) => !ur.expires_at || new Date(ur.expires_at) > new Date())
      .map((ur: Record<string, unknown>) => this.mapUserRoleFromDb(ur));
  }

  /**
   * Assign role to user
   */
  async assignRole(dto: AssignRoleDto, context: CtdisrContext): Promise<UserRole> {
    const role = await this.getRoleByCode(dto.roleCode);
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // Check if privileged role requires approval
    let approvalRequestId: string | undefined;
    if (role.isPrivileged && role.requiresApproval) {
      const approvalRequest = await this.approvalWorkflowService.createApprovalRequest({
        workflowCode: 'ROLE_ASSIGNMENT',
        actionType: 'ASSIGN_PRIVILEGED_ROLE',
        resourceType: 'ROLE',
        resourceId: role.id,
        actionPayload: { userId: dto.userId, roleCode: dto.roleCode },
        justification: dto.assignmentReason,
        context,
      });
      approvalRequestId = approvalRequest.id;
    }

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const assignmentData = {
      user_id: dto.userId,
      role_id: role.id,
      assigned_at: new Date().toISOString(),
      assigned_by: context.userId,
      expires_at: dto.expiresAt,
      assignment_reason: dto.assignmentReason,
      requires_approval: role.isPrivileged && role.requiresApproval,
      approval_request_id: approvalRequestId,
      is_active: !approvalRequestId, // Active immediately if no approval needed
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/user_roles`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(assignmentData),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Failed to assign role: ${error}`);
      throw new Error('Failed to assign role');
    }

    const [created] = await response.json();

    // Log the assignment
    await this.securityEventsService.logEvent({
      eventType: 'ROLE_ASSIGNED',
      category: SecurityEventCategory.ACCESS,
      severity: role.isPrivileged ? IncidentSeverity.P3_MEDIUM : IncidentSeverity.P4_LOW,
      sourceSystem: 'BACKEND',
      sourceComponent: 'access-control',
      context,
      targetType: 'USER',
      targetId: dto.userId,
      action: 'ASSIGN_ROLE',
      outcome: SecurityEventOutcome.SUCCESS,
      details: {
        roleCode: dto.roleCode,
        isPrivileged: role.isPrivileged,
        requiresApproval: !!approvalRequestId,
      },
    });

    return this.mapUserRoleFromDb(created);
  }

  /**
   * Revoke role from user
   */
  async revokeRole(
    userId: string,
    roleCode: string,
    reason: string,
    context: CtdisrContext,
  ): Promise<void> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const role = await this.getRoleByCode(roleCode);
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/user_roles?user_id=eq.${userId}&role_id=eq.${role.id}&is_active=eq.true`,
      {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          is_active: false,
          revoked_at: new Date().toISOString(),
          revoked_by: context.userId,
          revocation_reason: reason,
          updated_at: new Date().toISOString(),
        }),
      },
    );

    if (!response.ok) {
      throw new Error('Failed to revoke role');
    }

    // Log the revocation
    await this.securityEventsService.logEvent({
      eventType: 'ROLE_REVOKED',
      category: SecurityEventCategory.ACCESS,
      severity: IncidentSeverity.P3_MEDIUM,
      sourceSystem: 'BACKEND',
      sourceComponent: 'access-control',
      context,
      targetType: 'USER',
      targetId: userId,
      action: 'REVOKE_ROLE',
      outcome: SecurityEventOutcome.SUCCESS,
      details: { roleCode, reason },
    });
  }

  // ============================================
  // PERMISSION CHECKING
  // ============================================

  /**
   * Check if user has permission
   */
  async checkPermission(check: PermissionCheck): Promise<PermissionCheckResult> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    // Get user's roles with permissions
    const userRoles = await this.getUserRoles(check.userId);
    
    if (userRoles.length === 0) {
      return { allowed: false, reason: 'User has no active roles' };
    }

    // Check if any role grants the permission
    for (const userRole of userRoles) {
      const role = userRole.role;
      if (!role) continue;

      // Check permission in role_permissions
      const response = await fetch(
        `${supabaseUrl}/rest/v1/role_permissions?role_id=eq.${userRole.roleId}&select=*,permission:permissions(*)`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) continue;

      const rolePermissions = await response.json();
      
      for (const rp of rolePermissions) {
        const perm = rp.permission;
        if (perm.permission_code !== check.permissionCode) continue;
        if (!perm.is_active) continue;
        if (rp.expires_at && new Date(rp.expires_at) < new Date()) continue;

        // Check ABAC conditions
        if (rp.conditions && Object.keys(rp.conditions).length > 0) {
          if (!this.matchConditions(rp.conditions, check.conditions || {})) {
            continue;
          }
        }

        return {
          allowed: true,
          requiresMfa: role.requiresMfa,
          requiresApproval: role.requiresApproval,
          maxClassification: role.maxClassification,
        };
      }
    }

    return { allowed: false, reason: 'Permission not granted' };
  }

  private matchConditions(
    required: Record<string, unknown>,
    provided: Record<string, unknown>,
  ): boolean {
    for (const [key, value] of Object.entries(required)) {
      if (provided[key] !== value) {
        return false;
      }
    }
    return true;
  }

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  /**
   * Start a new session
   */
  async startSession(dto: SessionStartDto): Promise<UserSession> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    // Get user's roles to determine session limits
    const userRoles = await this.getUserRoles(dto.userId);
    const maxDuration = Math.max(...userRoles.map(r => r.role?.maxSessionDurationMinutes || 480), 480);
    const maxConcurrent = Math.min(...userRoles.map(r => r.role?.maxConcurrentSessions || 3), 10);

    // Check concurrent session limit
    const activeSessions = await this.getActiveSessions(dto.userId);
    if (activeSessions.length >= maxConcurrent) {
      // End oldest session
      const oldest = activeSessions[0];
      await this.endSession(oldest.id, SessionEndReason.FORCED, 'Exceeded concurrent session limit');
    }

    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + maxDuration * 60 * 1000);

    const sessionData = {
      session_id: sessionId,
      user_id: dto.userId,
      started_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      last_activity_at: new Date().toISOString(),
      ip_address: dto.ipAddress,
      user_agent: dto.userAgent,
      device_fingerprint: dto.deviceFingerprint,
      geo_country: dto.geoData?.country,
      geo_region: dto.geoData?.region,
      geo_city: dto.geoData?.city,
      auth_method: dto.authMethod,
      mfa_verified: false,
      risk_score: 0,
      risk_factors: [],
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/user_sessions`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(sessionData),
    });

    if (!response.ok) {
      throw new Error('Failed to create session');
    }

    const [created] = await response.json();
    const session = this.mapSessionFromDb(created);

    // Perform anomaly detection
    const anomalyResult = await this.detectAnomalies({
      userId: dto.userId,
      sessionId: session.id,
      ipAddress: dto.ipAddress,
      geoData: dto.geoData,
      deviceFingerprint: dto.deviceFingerprint,
    });

    if (anomalyResult.isAnomalous) {
      // Update session risk score
      await this.updateSessionRisk(session.id, anomalyResult.riskScore, anomalyResult.anomalies.map(a => a.type));
      
      // Create anomaly records
      for (const anomaly of anomalyResult.anomalies) {
        await this.createAnomaly({
          userId: dto.userId,
          sessionId: session.id,
          ipAddress: dto.ipAddress,
          anomaly,
        });
      }
    }

    // Update user baseline
    await this.updateUserBaseline(dto.userId, dto.ipAddress, dto.geoData);

    return session;
  }

  /**
   * Get active sessions for user
   */
  async getActiveSessions(userId: string): Promise<UserSession[]> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(
      `${supabaseUrl}/rest/v1/user_sessions?user_id=eq.${userId}&ended_at=is.null&order=started_at.asc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch sessions');
    }

    const sessions = await response.json();
    return sessions.map((s: Record<string, unknown>) => this.mapSessionFromDb(s));
  }

  /**
   * End a session
   */
  async endSession(sessionId: string, reason: SessionEndReason, details?: string): Promise<void> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    await fetch(`${supabaseUrl}/rest/v1/user_sessions?id=eq.${sessionId}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ended_at: new Date().toISOString(),
        end_reason: reason,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    await fetch(`${supabaseUrl}/rest/v1/user_sessions?id=eq.${sessionId}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        last_activity_at: new Date().toISOString(),
        actions_count: { increment: 1 },
        updated_at: new Date().toISOString(),
      }),
    });
  }

  /**
   * Log session action
   */
  async logSessionAction(
    sessionId: string,
    action: {
      actionType: AccessAction;
      resourceType?: string;
      resourceId?: string;
      actionDetails?: Record<string, unknown>;
      success: boolean;
      errorCode?: string;
      errorMessage?: string;
      permissionCode?: string;
      durationMs?: number;
    },
    ipAddress?: string,
  ): Promise<void> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    // Get previous hash for chain
    const lastAction = await this.getLastSessionAction(sessionId);
    const previousHash = lastAction?.recordHash;

    const actionData = {
      session_id: sessionId,
      action_type: action.actionType,
      resource_type: action.resourceType,
      resource_id: action.resourceId,
      action_details: action.actionDetails,
      success: action.success,
      error_code: action.errorCode,
      error_message: action.errorMessage,
      ip_address: ipAddress,
      permission_code: action.permissionCode,
      performed_at: new Date().toISOString(),
      duration_ms: action.durationMs,
      previous_hash: previousHash,
      record_hash: '', // Calculate below
    };

    // Calculate hash
    actionData.record_hash = this.calculateHash(actionData, previousHash);

    await fetch(`${supabaseUrl}/rest/v1/session_actions`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(actionData),
    });

    // Update session activity
    await this.updateSessionActivity(sessionId);
  }

  private async getLastSessionAction(sessionId: string): Promise<SessionAction | null> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(
      `${supabaseUrl}/rest/v1/session_actions?session_id=eq.${sessionId}&order=id.desc&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) return null;

    const [action] = await response.json();
    return action ? this.mapSessionActionFromDb(action) : null;
  }

  // ============================================
  // JIT PRIVILEGE ESCALATION
  // ============================================

  /**
   * Request JIT privilege escalation
   */
  async requestJitPrivilege(
    dto: CreateJitRequestDto,
    context: CtdisrContext,
  ): Promise<JitPrivilegeRequest> {
    const role = await this.getRoleByCode(dto.requestedRoleCode);
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (!role.isPrivileged) {
      throw new ForbiddenException('JIT escalation only available for privileged roles');
    }

    const maxDuration = Math.min(dto.requestedDurationMinutes, 240); // Max 4 hours

    // Create approval request
    const approvalRequest = await this.approvalWorkflowService.createApprovalRequest({
      workflowCode: 'JIT_PRIVILEGE',
      actionType: 'JIT_PRIVILEGE_ESCALATION',
      resourceType: 'ROLE',
      resourceId: role.id,
      actionPayload: {
        userId: context.userId,
        roleCode: dto.requestedRoleCode,
        durationMinutes: maxDuration,
        targetResources: dto.targetResources,
      },
      justification: dto.justification,
      context,
    });

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const requestCode = `JIT-${Date.now().toString(36).toUpperCase()}`;

    const jitData = {
      request_code: requestCode,
      user_id: context.userId,
      requested_role_id: role.id,
      requested_duration_minutes: maxDuration,
      max_duration_minutes: 240,
      justification: dto.justification,
      ticket_reference: dto.ticketReference,
      target_resources: dto.targetResources,
      approval_request_id: approvalRequest.id,
      status: JitStatus.PENDING,
      ip_address: context.ipAddress,
      user_agent: context.userAgent,
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/jit_privilege_requests`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(jitData),
    });

    if (!response.ok) {
      throw new Error('Failed to create JIT request');
    }

    const [created] = await response.json();

    // Log the request
    await this.securityEventsService.logEvent({
      eventType: 'JIT_PRIVILEGE_REQUESTED',
      category: SecurityEventCategory.ACCESS,
      severity: IncidentSeverity.P3_MEDIUM,
      sourceSystem: 'BACKEND',
      sourceComponent: 'access-control',
      context,
      targetType: 'JIT_REQUEST',
      targetId: created.id,
      action: 'REQUEST_JIT_PRIVILEGE',
      outcome: SecurityEventOutcome.SUCCESS,
      details: {
        roleCode: dto.requestedRoleCode,
        durationMinutes: maxDuration,
        justification: dto.justification,
      },
    });

    return this.mapJitRequestFromDb(created);
  }

  /**
   * Activate approved JIT privilege
   */
  async activateJitPrivilege(requestId: string, context: CtdisrContext): Promise<JitPrivilegeRequest> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    // Get the request
    const response = await fetch(
      `${supabaseUrl}/rest/v1/jit_privilege_requests?id=eq.${requestId}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const [request] = await response.json();
    if (!request) {
      throw new NotFoundException('JIT request not found');
    }

    if (request.status !== JitStatus.APPROVED) {
      throw new ForbiddenException('JIT request is not approved');
    }

    const expiresAt = new Date(Date.now() + request.requested_duration_minutes * 60 * 1000);

    await fetch(`${supabaseUrl}/rest/v1/jit_privilege_requests?id=eq.${requestId}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        status: JitStatus.ACTIVATED,
        activated_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });

    // Log activation
    await this.securityEventsService.logEvent({
      eventType: 'JIT_PRIVILEGE_ACTIVATED',
      category: SecurityEventCategory.ACCESS,
      severity: IncidentSeverity.P2_HIGH,
      sourceSystem: 'BACKEND',
      sourceComponent: 'access-control',
      context,
      targetType: 'JIT_REQUEST',
      targetId: requestId,
      action: 'ACTIVATE_JIT_PRIVILEGE',
      outcome: SecurityEventOutcome.SUCCESS,
      details: { expiresAt: expiresAt.toISOString() },
    });

    const [updated] = await (await fetch(
      `${supabaseUrl}/rest/v1/jit_privilege_requests?id=eq.${requestId}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    )).json();

    return this.mapJitRequestFromDb(updated);
  }

  // ============================================
  // ANOMALY DETECTION
  // ============================================

  /**
   * Detect anomalies in access pattern
   */
  async detectAnomalies(context: AnomalyCheckContext): Promise<AnomalyDetectionResult> {
    const anomalies: AnomalyDetectionResult['anomalies'] = [];
    let riskScore = 0;

    // Get user baseline
    const baseline = await this.getUserBaseline(context.userId);

    // Check for impossible travel
    if (await this.checkImpossibleTravel(context.userId, context.ipAddress, context.geoData)) {
      anomalies.push({
        type: AnomalyType.IMPOSSIBLE_TRAVEL,
        severity: IncidentSeverity.P2_HIGH,
        description: 'Login from geographically impossible location given previous session',
        evidence: { newLocation: context.geoData },
        deviationScore: 0.95,
      });
      riskScore += 40;
    }

    // Check for new device
    if (baseline && context.deviceFingerprint) {
      if (!baseline.knownDevices?.includes(context.deviceFingerprint)) {
        anomalies.push({
          type: AnomalyType.NEW_DEVICE,
          severity: IncidentSeverity.P4_LOW,
          description: 'Login from previously unknown device',
          evidence: { deviceFingerprint: context.deviceFingerprint },
          deviationScore: 0.3,
        });
        riskScore += 10;
      }
    }

    // Check for unusual time
    if (baseline?.typicalLoginHours) {
      const hour = new Date().getHours();
      const startHour = parseInt(baseline.typicalLoginHours.start.split(':')[0]);
      const endHour = parseInt(baseline.typicalLoginHours.end.split(':')[0]);
      
      if (hour < startHour || hour > endHour) {
        anomalies.push({
          type: AnomalyType.UNUSUAL_TIME,
          severity: IncidentSeverity.P4_LOW,
          description: 'Login outside typical hours',
          evidence: { currentHour: hour, typicalHours: baseline.typicalLoginHours },
          deviationScore: 0.4,
        });
        riskScore += 15;
      }
    }

    // Check for new location
    if (baseline?.typicalLocations && context.geoData?.country) {
      const knownLocation = baseline.typicalLocations.find(
        loc => loc.country === context.geoData?.country
      );
      if (!knownLocation) {
        anomalies.push({
          type: AnomalyType.NEW_LOCATION,
          severity: IncidentSeverity.P3_MEDIUM,
          description: 'Login from new country',
          evidence: { newCountry: context.geoData.country },
          deviationScore: 0.6,
        });
        riskScore += 20;
      }
    }

    // Determine recommended action
    let recommendedAction: AnomalyDetectionResult['recommendedAction'] = 'ALLOW';
    if (riskScore >= 70) {
      recommendedAction = 'BLOCK';
    } else if (riskScore >= 40) {
      recommendedAction = 'CHALLENGE';
    } else if (riskScore >= 20) {
      recommendedAction = 'ALLOW'; // But monitor
    }

    return {
      isAnomalous: anomalies.length > 0,
      anomalies,
      riskScore: Math.min(riskScore, 100),
      recommendedAction,
    };
  }

  private async checkImpossibleTravel(
    userId: string,
    newIp: string,
    newGeo?: { country?: string; region?: string; city?: string },
  ): Promise<boolean> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(
      `${supabaseUrl}/rest/v1/user_sessions?user_id=eq.${userId}&ended_at=not.is.null&order=ended_at.desc&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) return false;

    const [lastSession] = await response.json();
    if (!lastSession) return false;

    const timeDiff = Date.now() - new Date(lastSession.ended_at).getTime();
    const oneHour = 60 * 60 * 1000;

    // If less than 1 hour and different country
    if (timeDiff < oneHour && lastSession.geo_country && newGeo?.country) {
      if (lastSession.geo_country !== newGeo.country) {
        return true;
      }
    }

    return false;
  }

  private async getUserBaseline(userId: string): Promise<UserAccessBaseline | null> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(
      `${supabaseUrl}/rest/v1/user_access_baselines?user_id=eq.${userId}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) return null;

    const [baseline] = await response.json();
    return baseline ? this.mapBaselineFromDb(baseline) : null;
  }

  private async updateUserBaseline(
    userId: string,
    ipAddress: string,
    geoData?: { country?: string; region?: string; city?: string },
  ): Promise<void> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const existing = await this.getUserBaseline(userId);

    if (existing) {
      // Update existing baseline
      const updates: Record<string, unknown> = {
        last_login_at: new Date().toISOString(),
        last_ip_address: ipAddress,
        last_location: geoData,
        total_logins: (existing.totalLogins || 0) + 1,
        failed_login_streak: 0,
        learning_data_points: (existing.learningDataPoints || 0) + 1,
        updated_at: new Date().toISOString(),
      };

      await fetch(`${supabaseUrl}/rest/v1/user_access_baselines?user_id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
    } else {
      // Create new baseline
      const hour = new Date().getHours();
      const baselineData = {
        user_id: userId,
        typical_login_hours: { start: `${Math.max(0, hour - 2)}:00`, end: `${Math.min(23, hour + 2)}:00` },
        typical_locations: geoData ? [{ country: geoData.country, city: geoData.city }] : [],
        last_login_at: new Date().toISOString(),
        last_ip_address: ipAddress,
        last_location: geoData,
        total_logins: 1,
        learning_data_points: 1,
      };

      await fetch(`${supabaseUrl}/rest/v1/user_access_baselines`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(baselineData),
      });
    }
  }

  private async updateSessionRisk(sessionId: string, riskScore: number, riskFactors: string[]): Promise<void> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    await fetch(`${supabaseUrl}/rest/v1/user_sessions?id=eq.${sessionId}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        risk_score: riskScore,
        risk_factors: riskFactors,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  private async createAnomaly(params: {
    userId: string;
    sessionId: string;
    ipAddress: string;
    anomaly: AnomalyDetectionResult['anomalies'][0];
  }): Promise<void> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const anomalyData = {
      anomaly_type: params.anomaly.type,
      severity: params.anomaly.severity,
      user_id: params.userId,
      session_id: params.sessionId,
      ip_address: params.ipAddress,
      description: params.anomaly.description,
      evidence: params.anomaly.evidence,
      deviation_score: params.anomaly.deviationScore,
      status: AnomalyStatus.OPEN,
      detected_at: new Date().toISOString(),
    };

    await fetch(`${supabaseUrl}/rest/v1/access_anomalies`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(anomalyData),
    });
  }

  // ============================================
  // SCHEDULED TASKS
  // ============================================

  /**
   * Expire stale sessions
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireStaleSessions(): Promise<void> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    await fetch(`${supabaseUrl}/rest/v1/rpc/expire_stale_sessions`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
  }

  /**
   * Expire JIT privileges
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireJitPrivileges(): Promise<void> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const now = new Date().toISOString();

    await fetch(
      `${supabaseUrl}/rest/v1/jit_privilege_requests?status=eq.ACTIVATED&expires_at=lt.${now}`,
      {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: JitStatus.EXPIRED,
          deactivated_at: now,
          deactivation_reason: 'Automatic expiration',
          updated_at: now,
        }),
      },
    );
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private calculateHash(data: Record<string, unknown>, previousHash?: string): string {
    const input = (previousHash || '') + JSON.stringify(data);
    return createHash('sha256').update(input).digest('hex');
  }

  private mapRoleFromDb(row: Record<string, unknown>): Role {
    return {
      id: row.id as string,
      roleCode: row.role_code as string,
      roleName: row.role_name as string,
      description: row.description as string,
      roleType: row.role_type as RoleType,
      maxClassification: row.max_classification as AssetClassification,
      isPrivileged: row.is_privileged as boolean,
      requiresMfa: row.requires_mfa as boolean,
      requiresApproval: row.requires_approval as boolean,
      maxSessionDurationMinutes: row.max_session_duration_minutes as number,
      maxConcurrentSessions: row.max_concurrent_sessions as number,
      sessionTimeoutMinutes: row.session_timeout_minutes as number,
      ipRestricted: row.ip_restricted as boolean,
      allowedIpRanges: row.allowed_ip_ranges as string[],
      timeRestricted: row.time_restricted as boolean,
      allowedHoursStart: row.allowed_hours_start as string,
      allowedHoursEnd: row.allowed_hours_end as string,
      allowedDays: row.allowed_days as number[],
      isActive: row.is_active as boolean,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapUserRoleFromDb(row: Record<string, unknown>): UserRole {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      roleId: row.role_id as string,
      assignedAt: new Date(row.assigned_at as string),
      assignedBy: row.assigned_by as string,
      expiresAt: row.expires_at ? new Date(row.expires_at as string) : undefined,
      assignmentReason: row.assignment_reason as string,
      requiresApproval: row.requires_approval as boolean,
      approvalRequestId: row.approval_request_id as string,
      isActive: row.is_active as boolean,
      revokedAt: row.revoked_at ? new Date(row.revoked_at as string) : undefined,
      revokedBy: row.revoked_by as string,
      revocationReason: row.revocation_reason as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      role: row.role ? this.mapRoleFromDb(row.role as Record<string, unknown>) : undefined,
    };
  }

  private mapSessionFromDb(row: Record<string, unknown>): UserSession {
    return {
      id: row.id as string,
      sessionId: row.session_id as string,
      userId: row.user_id as string,
      startedAt: new Date(row.started_at as string),
      expiresAt: new Date(row.expires_at as string),
      lastActivityAt: new Date(row.last_activity_at as string),
      endedAt: row.ended_at ? new Date(row.ended_at as string) : undefined,
      endReason: row.end_reason as SessionEndReason,
      ipAddress: row.ip_address as string,
      userAgent: row.user_agent as string,
      deviceFingerprint: row.device_fingerprint as string,
      geoCountry: row.geo_country as string,
      geoRegion: row.geo_region as string,
      geoCity: row.geo_city as string,
      authMethod: row.auth_method as string,
      mfaVerified: row.mfa_verified as boolean,
      mfaMethod: row.mfa_method as string,
      riskScore: row.risk_score as number,
      riskFactors: row.risk_factors as string[],
      actionsCount: row.actions_count as number,
      sensitiveAccessCount: row.sensitive_access_count as number,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapSessionActionFromDb(row: Record<string, unknown>): SessionAction {
    return {
      id: row.id as number,
      sessionId: row.session_id as string,
      actionType: row.action_type as AccessAction,
      resourceType: row.resource_type as string,
      resourceId: row.resource_id as string,
      actionDetails: row.action_details as Record<string, unknown>,
      success: row.success as boolean,
      errorCode: row.error_code as string,
      errorMessage: row.error_message as string,
      ipAddress: row.ip_address as string,
      permissionCode: row.permission_code as string,
      performedAt: new Date(row.performed_at as string),
      durationMs: row.duration_ms as number,
      previousHash: row.previous_hash as string,
      recordHash: row.record_hash as string,
    };
  }

  private mapJitRequestFromDb(row: Record<string, unknown>): JitPrivilegeRequest {
    return {
      id: row.id as string,
      requestCode: row.request_code as string,
      userId: row.user_id as string,
      requestedRoleId: row.requested_role_id as string,
      requestedPermissions: row.requested_permissions as string[],
      requestedDurationMinutes: row.requested_duration_minutes as number,
      maxDurationMinutes: row.max_duration_minutes as number,
      justification: row.justification as string,
      ticketReference: row.ticket_reference as string,
      targetResources: row.target_resources as Record<string, unknown>,
      approvalRequestId: row.approval_request_id as string,
      status: row.status as JitStatus,
      activatedAt: row.activated_at ? new Date(row.activated_at as string) : undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at as string) : undefined,
      deactivatedAt: row.deactivated_at ? new Date(row.deactivated_at as string) : undefined,
      deactivationReason: row.deactivation_reason as string,
      ipAddress: row.ip_address as string,
      userAgent: row.user_agent as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapBaselineFromDb(row: Record<string, unknown>): UserAccessBaseline {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      typicalLoginHours: row.typical_login_hours as UserAccessBaseline['typicalLoginHours'],
      typicalLoginDays: row.typical_login_days as number[],
      typicalIpRanges: row.typical_ip_ranges as string[],
      typicalLocations: row.typical_locations as UserAccessBaseline['typicalLocations'],
      knownDevices: row.known_devices as string[],
      typicalResources: row.typical_resources as string[],
      typicalActionsPerHour: row.typical_actions_per_hour as number,
      typicalSensitiveAccessPerDay: row.typical_sensitive_access_per_day as number,
      totalLogins: row.total_logins as number,
      failedLoginStreak: row.failed_login_streak as number,
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at as string) : undefined,
      lastIpAddress: row.last_ip_address as string,
      lastLocation: row.last_location as Record<string, unknown>,
      baselineEstablishedAt: row.baseline_established_at
        ? new Date(row.baseline_established_at as string)
        : undefined,
      learningDataPoints: row.learning_data_points as number,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
