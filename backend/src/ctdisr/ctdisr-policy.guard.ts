/**
 * WANCOM ISP - CTDISR-2025 Policy Guard
 * Enforces CTDISR policies before request handling
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { randomUUID } from 'crypto';
import { CtdisrService } from './ctdisr.service';
import { SecurityEventsService } from './security-events.service';
import {
  CTDISR_POLICY_KEY,
  CTDISR_ASSET_CLASS_KEY,
  CTDISR_REQUIRE_MFA_KEY,
  CTDISR_REQUIRE_APPROVAL_KEY,
  CTDISR_VIOLATION_SEVERITY_KEY,
} from './ctdisr-policy.decorator';
import {
  AssetClassification,
  ViolationSeverity,
  SecurityEventCategory,
  SecurityEventOutcome,
  CtdisrContext,
} from './types';

interface RequestUser {
  id: string;
  email?: string;
  roles?: string[];
  mfaVerified?: boolean;
  sessionId?: string;
}

@Injectable()
export class CtdisrPolicyGuard implements CanActivate {
  private readonly logger = new Logger(CtdisrPolicyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly ctdisrService: CtdisrService,
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request['user'] as RequestUser | undefined;
    
    // Build CTDISR context
    const ctdisrContext: CtdisrContext = {
      userId: user?.id,
      sessionId: user?.sessionId || request.headers['x-session-id'] as string,
      ipAddress: this.getClientIp(request),
      userAgent: request.headers['user-agent'],
      correlationId: (request.headers['x-correlation-id'] as string) || randomUUID(),
      mfaVerified: user?.mfaVerified || false,
      roles: user?.roles || [],
    };

    // Attach context to request for later use
    request['ctdisrContext'] = ctdisrContext;

    // Get metadata from decorator
    const policies = this.reflector.getAllAndOverride<string[]>(CTDISR_POLICY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) || [];

    const assetClass = this.reflector.getAllAndOverride<AssetClassification>(
      CTDISR_ASSET_CLASS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requireMfa = this.reflector.getAllAndOverride<boolean>(CTDISR_REQUIRE_MFA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const approvalConfig = this.reflector.getAllAndOverride<{ required: boolean; workflow?: string }>(
      CTDISR_REQUIRE_APPROVAL_KEY,
      [context.getHandler(), context.getClass()],
    );

    const violationSeverity = this.reflector.getAllAndOverride<ViolationSeverity>(
      CTDISR_VIOLATION_SEVERITY_KEY,
      [context.getHandler(), context.getClass()],
    ) || ViolationSeverity.MEDIUM;

    // Update context with asset classification
    if (assetClass) {
      ctdisrContext.assetClassification = assetClass;
    }

    try {
      // Check 1: IP Allowlist
      const ipAllowed = await this.checkIpAllowlist(ctdisrContext);
      if (!ipAllowed) {
        await this.logAccessDenied(ctdisrContext, 'IP_NOT_ALLOWED', request);
        await this.createViolation(
          ctdisrContext,
          violationSeverity,
          'Access from non-allowlisted IP address',
          request,
        );
        throw new ForbiddenException('Access denied: IP address not in allowlist');
      }

      // Check 2: MFA requirement
      if (requireMfa && !ctdisrContext.mfaVerified) {
        await this.logAccessDenied(ctdisrContext, 'MFA_REQUIRED', request);
        throw new UnauthorizedException('MFA verification required for this action');
      }

      // Check 3: Dual-approval requirement
      if (approvalConfig?.required) {
        const hasApproval = await this.checkApproval(
          ctdisrContext,
          approvalConfig.workflow,
          request,
        );
        if (!hasApproval) {
          await this.logAccessDenied(ctdisrContext, 'APPROVAL_REQUIRED', request);
          throw new ForbiddenException(
            'This action requires dual-approval. Please submit an approval request.',
          );
        }
      }

      // Check 4: Evaluate specific policies
      if (policies.length > 0) {
        const results = await this.ctdisrService.evaluatePolicy({
          action: `${request.method} ${request.path}`,
          resourceType: this.getResourceType(request),
          resourceId: request.params?.id,
          context: ctdisrContext,
          additionalData: {
            query: request.query,
            body: this.sanitizeBody(request.body),
          },
        });

        // Check if any policy blocked the request
        const blocked = results.find(r => !r.allowed && r.enforcementMode === 'ENFORCE');
        if (blocked) {
          await this.logAccessDenied(ctdisrContext, 'POLICY_VIOLATION', request, blocked.policyCode);
          throw new ForbiddenException(`Access denied: ${blocked.blockReason}`);
        }
      }

      // All checks passed - log successful access
      await this.securityEventsService.logAccessEvent({
        eventType: 'ACCESS_GRANTED',
        context: ctdisrContext,
        targetType: this.getResourceType(request),
        targetId: request.params?.id,
        action: `${request.method} ${request.path}`,
        outcome: SecurityEventOutcome.SUCCESS,
      });

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof UnauthorizedException) {
        throw error;
      }
      
      this.logger.error('Error in CTDISR policy guard', error);
      throw new ForbiddenException('Access denied due to security policy');
    }
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return request.ip || request.socket.remoteAddress || '0.0.0.0';
  }

  private getResourceType(request: Request): string {
    // Extract resource type from path
    const parts = request.path.split('/').filter(Boolean);
    if (parts.length > 0) {
      // Remove 'api' prefix if present
      const index = parts[0] === 'api' ? 1 : 0;
      return parts[index] || 'unknown';
    }
    return 'unknown';
  }

  private sanitizeBody(body: unknown): unknown {
    if (!body || typeof body !== 'object') return body;

    const sanitized = { ...body as Record<string, unknown> };
    const sensitiveFields = ['password', 'secret', 'token', 'apiKey', 'creditCard'];
    
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  private async checkIpAllowlist(context: CtdisrContext): Promise<boolean> {
    // For now, allow all IPs - implement proper check with Supabase
    // In production, this would query ctdisr.ip_allowlists and ctdisr.ip_blocklists
    return true;
  }

  private async checkApproval(
    context: CtdisrContext,
    workflowCode?: string,
    request?: Request,
  ): Promise<boolean> {
    // Check for approval token in request headers
    const approvalToken = request?.headers['x-approval-token'] as string;
    if (!approvalToken) {
      return false;
    }

    // Verify the approval token is valid
    // In production, this would validate against ctdisr.approval_requests
    return true;
  }

  private async logAccessDenied(
    context: CtdisrContext,
    reason: string,
    request: Request,
    policyCode?: string,
  ): Promise<void> {
    await this.securityEventsService.logAccessEvent({
      eventType: 'ACCESS_DENIED',
      context,
      targetType: this.getResourceType(request),
      targetId: request.params?.id,
      action: `${request.method} ${request.path}`,
      outcome: SecurityEventOutcome.FAILURE,
      details: {
        reason,
        policyCode,
        userAgent: request.headers['user-agent'],
      },
    });
  }

  private async createViolation(
    context: CtdisrContext,
    severity: ViolationSeverity,
    description: string,
    request: Request,
  ): Promise<void> {
    await this.ctdisrService.createViolation({
      severity,
      context,
      resourceType: this.getResourceType(request),
      resourceId: request.params?.id,
      actionAttempted: `${request.method} ${request.path}`,
      description,
      evidence: {
        path: request.path,
        method: request.method,
        query: request.query,
        headers: {
          'user-agent': request.headers['user-agent'],
          origin: request.headers['origin'],
        },
      },
      shouldBlock: true,
      blockReason: description,
    });
  }
}
