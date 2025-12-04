/**
 * NetAxis ISP - CTDISR-2025 Policy Decorator
 * Custom decorator to enforce CTDISR policies on endpoints
 */

import { SetMetadata, applyDecorators, UseGuards, UseInterceptors } from '@nestjs/common';
import { CtdisrPolicyGuard } from './ctdisr-policy.guard';
import { CtdisrComplianceInterceptor } from './ctdisr-compliance.interceptor';
import { AssetClassification, ViolationSeverity } from './types';

// Metadata keys
export const CTDISR_POLICY_KEY = 'ctdisr:policy';
export const CTDISR_ASSET_CLASS_KEY = 'ctdisr:asset_class';
export const CTDISR_REQUIRE_MFA_KEY = 'ctdisr:require_mfa';
export const CTDISR_REQUIRE_APPROVAL_KEY = 'ctdisr:require_approval';
export const CTDISR_LOG_DATA_ACCESS_KEY = 'ctdisr:log_data_access';
export const CTDISR_VIOLATION_SEVERITY_KEY = 'ctdisr:violation_severity';

/**
 * Configuration options for CTDISR policy enforcement
 */
export interface CtdisrPolicyOptions {
  /** CTDISR policy codes to enforce (e.g., 'CTDISR-5.2.1') */
  policies?: string[];
  
  /** Asset classification level */
  assetClass?: AssetClassification;
  
  /** Whether MFA is required for this action */
  requireMfa?: boolean;
  
  /** Whether dual-approval is required */
  requireApproval?: boolean;
  
  /** Workflow code for approval (if required) */
  approvalWorkflow?: string;
  
  /** Log data access for audit trail */
  logDataAccess?: boolean;
  
  /** Data type being accessed (for logging) */
  dataType?: 'SUBSCRIBER_PII' | 'LI_DATA' | 'BILLING' | 'AUDIT_LOG';
  
  /** Violation severity if policy is violated */
  violationSeverity?: ViolationSeverity;
  
  /** Custom action name for logging */
  actionName?: string;
  
  /** Roles allowed to access (in addition to RBAC) */
  allowedRoles?: string[];
  
  /** IP allowlist scope */
  ipAllowlistScope?: 'GLOBAL' | 'ROLE' | 'USER';
}

/**
 * Main CTDISR Policy decorator
 * Applies policy guard and compliance interceptor
 * 
 * @example
 * ```typescript
 * @CtdisrPolicy({
 *   policies: ['CTDISR-5.2.1'],
 *   assetClass: AssetClassification.SENSITIVE,
 *   requireMfa: true,
 *   logDataAccess: true,
 *   dataType: 'SUBSCRIBER_PII'
 * })
 * @Get('subscriber/:id')
 * getSubscriber(@Param('id') id: string) { ... }
 * ```
 */
export function CtdisrPolicy(options: CtdisrPolicyOptions = {}) {
  return applyDecorators(
    SetMetadata(CTDISR_POLICY_KEY, options.policies || []),
    SetMetadata(CTDISR_ASSET_CLASS_KEY, options.assetClass),
    SetMetadata(CTDISR_REQUIRE_MFA_KEY, options.requireMfa || false),
    SetMetadata(CTDISR_REQUIRE_APPROVAL_KEY, options.requireApproval 
      ? { required: true, workflow: options.approvalWorkflow } 
      : { required: false }
    ),
    SetMetadata(CTDISR_LOG_DATA_ACCESS_KEY, options.logDataAccess 
      ? { enabled: true, dataType: options.dataType }
      : { enabled: false }
    ),
    SetMetadata(CTDISR_VIOLATION_SEVERITY_KEY, options.violationSeverity || ViolationSeverity.MEDIUM),
    UseGuards(CtdisrPolicyGuard),
    UseInterceptors(CtdisrComplianceInterceptor),
  );
}

/**
 * Shorthand for requiring MFA on an endpoint
 */
export function RequireMfa() {
  return SetMetadata(CTDISR_REQUIRE_MFA_KEY, true);
}

/**
 * Shorthand for requiring dual-approval
 */
export function RequireApproval(workflowCode: string) {
  return SetMetadata(CTDISR_REQUIRE_APPROVAL_KEY, { required: true, workflow: workflowCode });
}

/**
 * Mark endpoint as accessing critical infrastructure
 */
export function CriticalInfrastructure() {
  return applyDecorators(
    SetMetadata(CTDISR_ASSET_CLASS_KEY, AssetClassification.CRITICAL),
    SetMetadata(CTDISR_REQUIRE_MFA_KEY, true),
    SetMetadata(CTDISR_VIOLATION_SEVERITY_KEY, ViolationSeverity.CRITICAL),
    UseGuards(CtdisrPolicyGuard),
    UseInterceptors(CtdisrComplianceInterceptor),
  );
}

/**
 * Mark endpoint as accessing sensitive data (PII)
 */
export function SensitiveData(dataType: 'SUBSCRIBER_PII' | 'BILLING' = 'SUBSCRIBER_PII') {
  return applyDecorators(
    SetMetadata(CTDISR_ASSET_CLASS_KEY, AssetClassification.SENSITIVE),
    SetMetadata(CTDISR_LOG_DATA_ACCESS_KEY, { enabled: true, dataType }),
    UseGuards(CtdisrPolicyGuard),
    UseInterceptors(CtdisrComplianceInterceptor),
  );
}

/**
 * Mark endpoint as accessing LI (Lawful Intercept) data
 * Highest security level - always requires MFA and approval
 */
export function LawfulInterceptData() {
  return applyDecorators(
    SetMetadata(CTDISR_ASSET_CLASS_KEY, AssetClassification.CRITICAL),
    SetMetadata(CTDISR_REQUIRE_MFA_KEY, true),
    SetMetadata(CTDISR_REQUIRE_APPROVAL_KEY, { required: true, workflow: 'LI_ACCESS' }),
    SetMetadata(CTDISR_LOG_DATA_ACCESS_KEY, { enabled: true, dataType: 'LI_DATA' }),
    SetMetadata(CTDISR_VIOLATION_SEVERITY_KEY, ViolationSeverity.CRITICAL),
    UseGuards(CtdisrPolicyGuard),
    UseInterceptors(CtdisrComplianceInterceptor),
  );
}

/**
 * Mark endpoint as accessing audit logs
 */
export function AuditLogAccess() {
  return applyDecorators(
    SetMetadata(CTDISR_ASSET_CLASS_KEY, AssetClassification.CONFIDENTIAL),
    SetMetadata(CTDISR_LOG_DATA_ACCESS_KEY, { enabled: true, dataType: 'AUDIT_LOG' }),
    UseGuards(CtdisrPolicyGuard),
    UseInterceptors(CtdisrComplianceInterceptor),
  );
}

/**
 * Mark endpoint as performing configuration changes
 */
export function ConfigurationChange(assetClass: AssetClassification = AssetClassification.CONFIDENTIAL) {
  return applyDecorators(
    SetMetadata(CTDISR_ASSET_CLASS_KEY, assetClass),
    SetMetadata('ctdisr:config_change', true),
    UseGuards(CtdisrPolicyGuard),
    UseInterceptors(CtdisrComplianceInterceptor),
  );
}
