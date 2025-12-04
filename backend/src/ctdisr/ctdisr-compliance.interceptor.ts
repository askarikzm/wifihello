/**
 * NetAxis ISP - CTDISR-2025 Compliance Interceptor
 * Logs all data access and configuration changes for audit trail
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap, catchError } from 'rxjs';
import { Request, Response } from 'express';
import { SecurityEventsService } from './security-events.service';
import {
  CTDISR_LOG_DATA_ACCESS_KEY,
  CTDISR_ASSET_CLASS_KEY,
} from './ctdisr-policy.decorator';
import {
  CtdisrContext,
  SecurityEventCategory,
  SecurityEventOutcome,
  AssetClassification,
} from './types';

@Injectable()
export class CtdisrComplianceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CtdisrComplianceInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    const ctdisrContext = request['ctdisrContext'] as CtdisrContext | undefined;
    if (!ctdisrContext) {
      // No CTDISR context, skip interceptor
      return next.handle();
    }

    const startTime = Date.now();

    // Get metadata
    const dataAccessConfig = this.reflector.getAllAndOverride<{ enabled: boolean; dataType?: string }>(
      CTDISR_LOG_DATA_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const assetClass = this.reflector.getAllAndOverride<AssetClassification>(
      CTDISR_ASSET_CLASS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const isConfigChange = this.reflector.getAllAndOverride<boolean>(
      'ctdisr:config_change',
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      tap(async (responseData) => {
        const duration = Date.now() - startTime;

        // Log data access if configured
        if (dataAccessConfig?.enabled) {
          await this.logDataAccess(
            ctdisrContext,
            request,
            responseData,
            dataAccessConfig.dataType,
            duration,
          );
        }

        // Log configuration changes
        if (isConfigChange && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
          await this.logConfigChange(
            ctdisrContext,
            request,
            responseData,
            duration,
          );
        }

        // Log access to critical assets
        if (assetClass === AssetClassification.CRITICAL) {
          await this.logCriticalAssetAccess(ctdisrContext, request, duration);
        }
      }),
      catchError(async (error) => {
        const duration = Date.now() - startTime;

        // Log failed operations
        await this.securityEventsService.logAccessEvent({
          eventType: 'OPERATION_FAILED',
          context: ctdisrContext,
          targetType: this.getResourceType(request),
          targetId: request.params?.id,
          action: `${request.method} ${request.path}`,
          outcome: SecurityEventOutcome.FAILURE,
          details: {
            error: error.message,
            statusCode: error.status || 500,
            duration,
          },
        });

        throw error;
      }),
    );
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private async logDataAccess(
    context: CtdisrContext,
    request: Request,
    responseData: unknown,
    dataType?: string,
    duration?: number,
  ): Promise<void> {
    const accessedFields = this.extractAccessedFields(responseData);

    await this.securityEventsService.logDataAccess({
      context,
      dataType: (dataType as 'SUBSCRIBER_PII' | 'LI_DATA' | 'BILLING' | 'AUDIT_LOG') || 'SUBSCRIBER_PII',
      resourceId: request.params?.id || 'multiple',
      action: `${request.method} ${request.path}`,
      fields: accessedFields,
      outcome: SecurityEventOutcome.SUCCESS,
    });

    // For LI data, add extra logging
    if (dataType === 'LI_DATA') {
      this.logger.warn(`LI DATA ACCESS by ${context.userId}`, {
        correlationId: context.correlationId,
        ip: context.ipAddress,
        path: request.path,
        duration,
      });
    }
  }

  private async logConfigChange(
    context: CtdisrContext,
    request: Request,
    responseData: unknown,
    duration?: number,
  ): Promise<void> {
    await this.securityEventsService.logConfigChange({
      context,
      targetType: this.getResourceType(request),
      targetId: request.params?.id || 'unknown',
      action: `${request.method} ${request.path}`,
      newValue: this.sanitizeBody(request.body),
    });

    this.logger.log(`Configuration change by ${context.userId}`, {
      correlationId: context.correlationId,
      path: request.path,
      method: request.method,
      duration,
    });
  }

  private async logCriticalAssetAccess(
    context: CtdisrContext,
    request: Request,
    duration?: number,
  ): Promise<void> {
    await this.securityEventsService.logEvent({
      eventType: 'CRITICAL_ASSET_ACCESS',
      category: SecurityEventCategory.ACCESS,
      severity: require('./types').IncidentSeverity.P3_MEDIUM,
      sourceSystem: 'BACKEND',
      context,
      targetType: this.getResourceType(request),
      targetId: request.params?.id,
      action: `${request.method} ${request.path}`,
      outcome: SecurityEventOutcome.SUCCESS,
      details: {
        duration,
        mfaVerified: context.mfaVerified,
        privilegedSession: !!context.privilegedSession,
      },
    });
  }

  private getResourceType(request: Request): string {
    const parts = request.path.split('/').filter(Boolean);
    if (parts.length > 0) {
      const index = parts[0] === 'api' ? 1 : 0;
      return parts[index] || 'unknown';
    }
    return 'unknown';
  }

  private extractAccessedFields(responseData: unknown): string[] {
    if (!responseData || typeof responseData !== 'object') {
      return [];
    }

    // Extract top-level field names
    if (Array.isArray(responseData)) {
      if (responseData.length > 0 && typeof responseData[0] === 'object') {
        return Object.keys(responseData[0] as object);
      }
      return [];
    }

    return Object.keys(responseData);
  }

  private sanitizeBody(body: unknown): unknown {
    if (!body || typeof body !== 'object') return body;

    const sanitized = { ...body as Record<string, unknown> };
    const sensitiveFields = [
      'password',
      'secret',
      'token',
      'apiKey',
      'api_key',
      'creditCard',
      'credit_card',
      'cvv',
      'ssn',
      'cnic',
    ];
    
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}
