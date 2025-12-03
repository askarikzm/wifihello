/**
 * WANCOM ISP - CTDISR-2025 Approval Workflows Service
 * Handles dual-approval workflows for sensitive operations
 */

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import {
  ApprovalWorkflow,
  ApprovalRequest,
  ApprovalDecision,
  CtdisrContext,
} from './types';

@Injectable()
export class ApprovalWorkflowService {
  private readonly logger = new Logger(ApprovalWorkflowService.name);

  constructor(private readonly configService: ConfigService) {}

  // ============================================
  // WORKFLOW MANAGEMENT
  // ============================================

  /**
   * Get a workflow by code
   */
  async getWorkflow(workflowCode: string): Promise<ApprovalWorkflow | null> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(
      `${supabaseUrl}/rest/v1/approval_workflows?workflow_code=eq.${workflowCode}&is_active=eq.true`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch workflow');
    }

    const [workflow] = await response.json();
    return workflow ? this.mapWorkflowFromDb(workflow) : null;
  }

  /**
   * Get all active workflows
   */
  async getAllWorkflows(): Promise<ApprovalWorkflow[]> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(
      `${supabaseUrl}/rest/v1/approval_workflows?is_active=eq.true`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch workflows');
    }

    const workflows = await response.json();
    return workflows.map((w: Record<string, unknown>) => this.mapWorkflowFromDb(w));
  }

  // ============================================
  // APPROVAL REQUESTS
  // ============================================

  /**
   * Create an approval request
   */
  async createApprovalRequest(params: {
    workflowCode: string;
    actionType: string;
    resourceType?: string;
    resourceId?: string;
    actionPayload?: Record<string, unknown>;
    justification: string;
    context: CtdisrContext;
  }): Promise<ApprovalRequest> {
    const workflow = await this.getWorkflow(params.workflowCode);
    if (!workflow) {
      throw new NotFoundException(`Workflow not found: ${params.workflowCode}`);
    }

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const requestCode = this.generateRequestCode();
    const expiresAt = new Date(Date.now() + workflow.approvalTimeoutHours * 60 * 60 * 1000);

    const requestData = {
      workflow_id: workflow.id,
      request_code: requestCode,
      action_type: params.actionType,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      action_payload: params.actionPayload || {},
      requested_by: params.context.userId,
      requested_at: new Date().toISOString(),
      request_justification: params.justification,
      status: 'PENDING',
      expires_at: expiresAt.toISOString(),
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/approval_requests`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Failed to create approval request: ${error}`);
      throw new Error('Failed to create approval request');
    }

    const [created] = await response.json();
    
    this.logger.log(`Approval request created: ${requestCode}`, {
      workflowCode: params.workflowCode,
      actionType: params.actionType,
      requestedBy: params.context.userId,
    });

    // TODO: Send notifications to approvers

    return this.mapRequestFromDb(created);
  }

  /**
   * Get pending approval requests for a user (as approver)
   */
  async getPendingRequestsForApprover(
    userId: string,
    userRoles: string[],
  ): Promise<ApprovalRequest[]> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    // Get workflows where user's role can approve
    const workflows = await this.getAllWorkflows();
    const applicableWorkflows = workflows.filter((w) =>
      w.approverRoles.some((role) => userRoles.includes(role)),
    );

    if (applicableWorkflows.length === 0) {
      return [];
    }

    const workflowIds = applicableWorkflows.map((w) => w.id);

    const response = await fetch(
      `${supabaseUrl}/rest/v1/approval_requests?workflow_id=in.(${workflowIds.join(',')})&status=eq.PENDING&order=requested_at.desc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch approval requests');
    }

    const requests = await response.json();
    return requests.map((r: Record<string, unknown>) => this.mapRequestFromDb(r));
  }

  /**
   * Get a specific approval request
   */
  async getApprovalRequest(requestCode: string): Promise<ApprovalRequest | null> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(
      `${supabaseUrl}/rest/v1/approval_requests?request_code=eq.${requestCode}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch approval request');
    }

    const [request] = await response.json();
    return request ? this.mapRequestFromDb(request) : null;
  }

  /**
   * Submit an approval decision
   */
  async submitDecision(params: {
    requestCode: string;
    decision: 'APPROVE' | 'REJECT';
    notes?: string;
    context: CtdisrContext;
  }): Promise<ApprovalRequest> {
    const request = await this.getApprovalRequest(params.requestCode);
    if (!request) {
      throw new NotFoundException(`Approval request not found: ${params.requestCode}`);
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Request is not pending: ${request.status}`);
    }

    if (new Date() > new Date(request.expiresAt)) {
      throw new BadRequestException('Approval request has expired');
    }

    // Check if user already approved
    const existingDecision = await this.getUserDecision(request.id, params.context.userId!);
    if (existingDecision) {
      throw new BadRequestException('You have already submitted a decision for this request');
    }

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    // Record the decision
    const decisionData = {
      request_id: request.id,
      approver_id: params.context.userId,
      approver_role: params.context.roles[0] || 'unknown',
      decision: params.decision,
      decision_notes: params.notes,
      decided_at: new Date().toISOString(),
      ip_address: params.context.ipAddress,
      user_agent: params.context.userAgent,
      mfa_verified: params.context.mfaVerified || false,
    };

    const decisionResponse = await fetch(`${supabaseUrl}/rest/v1/approval_decisions`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(decisionData),
    });

    if (!decisionResponse.ok) {
      throw new Error('Failed to record decision');
    }

    // Get workflow to check required approvals
    const workflow = await this.getWorkflowById(request.workflowId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Count approvals
    const decisions = await this.getRequestDecisions(request.id);
    const approvals = decisions.filter((d) => d.decision === 'APPROVE').length;
    const rejections = decisions.filter((d) => d.decision === 'REJECT').length;

    // Determine new status
    let newStatus = 'PENDING';
    if (rejections > 0) {
      newStatus = 'REJECTED';
    } else if (approvals >= workflow.requiredApprovals) {
      newStatus = 'APPROVED';
    }

    // Update request status if changed
    if (newStatus !== 'PENDING') {
      const updateData = {
        status: newStatus,
        resolved_at: new Date().toISOString(),
        resolution_notes: params.notes,
      };

      await fetch(`${supabaseUrl}/rest/v1/approval_requests?id=eq.${request.id}`, {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      this.logger.log(`Approval request ${newStatus}: ${params.requestCode}`, {
        approvals,
        rejections,
        requiredApprovals: workflow.requiredApprovals,
      });
    }

    return (await this.getApprovalRequest(params.requestCode))!;
  }

  /**
   * Validate an approval token for accessing protected resource
   */
  async validateApprovalToken(
    approvalToken: string,
    actionType: string,
    resourceId?: string,
  ): Promise<boolean> {
    // The approval token is the request code
    const request = await this.getApprovalRequest(approvalToken);
    
    if (!request) {
      return false;
    }

    if (request.status !== 'APPROVED') {
      return false;
    }

    if (new Date() > new Date(request.expiresAt)) {
      return false;
    }

    if (request.actionType !== actionType) {
      return false;
    }

    if (resourceId && request.resourceId !== resourceId) {
      return false;
    }

    // Mark as executed if not already
    if (!request.executedAt) {
      await this.markAsExecuted(request.id);
    }

    return true;
  }

  // ============================================
  // SCHEDULED TASKS
  // ============================================

  /**
   * Expire stale approval requests
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireStaleRequests(): Promise<void> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const now = new Date().toISOString();

    const response = await fetch(
      `${supabaseUrl}/rest/v1/approval_requests?status=eq.PENDING&expires_at=lt.${now}`,
      {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          status: 'EXPIRED',
          resolved_at: now,
          resolution_notes: 'Automatically expired due to timeout',
        }),
      },
    );

    if (response.ok) {
      const expired = await response.json();
      if (expired.length > 0) {
        this.logger.log(`Expired ${expired.length} stale approval requests`);
      }
    }
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private generateRequestCode(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const uuid = randomUUID().slice(0, 8).toUpperCase();
    return `APR-${date}-${uuid}`;
  }

  private async getWorkflowById(workflowId: string): Promise<ApprovalWorkflow | null> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(
      `${supabaseUrl}/rest/v1/approval_workflows?id=eq.${workflowId}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) return null;

    const [workflow] = await response.json();
    return workflow ? this.mapWorkflowFromDb(workflow) : null;
  }

  private async getUserDecision(
    requestId: string,
    userId: string,
  ): Promise<ApprovalDecision | null> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(
      `${supabaseUrl}/rest/v1/approval_decisions?request_id=eq.${requestId}&approver_id=eq.${userId}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) return null;

    const [decision] = await response.json();
    return decision ? this.mapDecisionFromDb(decision) : null;
  }

  private async getRequestDecisions(requestId: string): Promise<ApprovalDecision[]> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(
      `${supabaseUrl}/rest/v1/approval_decisions?request_id=eq.${requestId}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch decisions');
    }

    const decisions = await response.json();
    return decisions.map((d: Record<string, unknown>) => this.mapDecisionFromDb(d));
  }

  private async markAsExecuted(requestId: string): Promise<void> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    await fetch(`${supabaseUrl}/rest/v1/approval_requests?id=eq.${requestId}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        executed_at: new Date().toISOString(),
      }),
    });
  }

  private mapWorkflowFromDb(row: Record<string, unknown>): ApprovalWorkflow {
    return {
      id: row.id as string,
      workflowCode: row.workflow_code as string,
      workflowName: row.workflow_name as string,
      description: row.description as string,
      requiredApprovals: row.required_approvals as number,
      approverRoles: row.approver_roles as string[],
      approvalTimeoutHours: row.approval_timeout_hours as number,
      autoRejectOnTimeout: row.auto_reject_on_timeout as boolean,
      appliesToActions: row.applies_to_actions as string[],
      isActive: row.is_active as boolean,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapRequestFromDb(row: Record<string, unknown>): ApprovalRequest {
    return {
      id: row.id as string,
      workflowId: row.workflow_id as string,
      requestCode: row.request_code as string,
      actionType: row.action_type as string,
      resourceType: row.resource_type as string,
      resourceId: row.resource_id as string,
      actionPayload: row.action_payload as Record<string, unknown>,
      requestedBy: row.requested_by as string,
      requestedAt: new Date(row.requested_at as string),
      requestJustification: row.request_justification as string,
      status: row.status as ApprovalRequest['status'],
      expiresAt: new Date(row.expires_at as string),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : undefined,
      resolutionNotes: row.resolution_notes as string,
      executedAt: row.executed_at ? new Date(row.executed_at as string) : undefined,
      executionResult: row.execution_result as Record<string, unknown>,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapDecisionFromDb(row: Record<string, unknown>): ApprovalDecision {
    return {
      id: row.id as string,
      requestId: row.request_id as string,
      approverId: row.approver_id as string,
      approverRole: row.approver_role as string,
      decision: row.decision as 'APPROVE' | 'REJECT',
      decisionNotes: row.decision_notes as string,
      decidedAt: new Date(row.decided_at as string),
      ipAddress: row.ip_address as string,
      userAgent: row.user_agent as string,
      mfaVerified: row.mfa_verified as boolean,
      createdAt: new Date(row.created_at as string),
    };
  }
}
