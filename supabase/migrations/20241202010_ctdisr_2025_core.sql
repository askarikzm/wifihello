-- ============================================
-- WANCOM ISP - CTDISR-2025 CORE SCHEMA
-- Critical Telecom Data & Infrastructure Security Regulations 2025
-- Migration: 20241202010_ctdisr_2025_core.sql
-- ============================================

-- Create dedicated schema for CTDISR compliance
CREATE SCHEMA IF NOT EXISTS ctdisr;

-- ============================================
-- PART 1: ENUMS AND TYPES
-- ============================================

-- Asset classification levels (Section 4.2)
DO $$ BEGIN
    CREATE TYPE ctdisr.asset_classification AS ENUM (
        'CRITICAL',      -- Core infrastructure (RADIUS, OLT, BGP)
        'SENSITIVE',     -- Customer PII, billing, KYC
        'CONFIDENTIAL',  -- Internal operations
        'PUBLIC'         -- Public-facing services
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Incident severity (Section 8.1)
DO $$ BEGIN
    CREATE TYPE ctdisr.incident_severity AS ENUM (
        'P1_CRITICAL',   -- Data breach, LI compromise, core infra down
        'P2_HIGH',       -- Significant security event
        'P3_MEDIUM',     -- Notable security event
        'P4_LOW',        -- Minor security event
        'P5_INFO'        -- Informational
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Incident status
DO $$ BEGIN
    CREATE TYPE ctdisr.incident_status AS ENUM (
        'DETECTED',
        'TRIAGED',
        'INVESTIGATING',
        'CONTAINING',
        'ERADICATING',
        'RECOVERING',
        'POST_INCIDENT',
        'CLOSED',
        'ESCALATED_PTA'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Compliance violation severity
DO $$ BEGIN
    CREATE TYPE ctdisr.violation_severity AS ENUM (
        'CRITICAL',      -- Immediate PTA notification required
        'HIGH',          -- CTO escalation within 1 hour
        'MEDIUM',        -- Compliance officer review within 24h
        'LOW',           -- Routine review
        'WARNING'        -- Advisory only
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Violation status
DO $$ BEGIN
    CREATE TYPE ctdisr.violation_status AS ENUM (
        'OPEN',
        'ACKNOWLEDGED',
        'INVESTIGATING',
        'REMEDIATION_PLANNED',
        'REMEDIATION_IN_PROGRESS',
        'REMEDIATION_VERIFIED',
        'CLOSED',
        'FALSE_POSITIVE',
        'ESCALATED_PTA'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Access action types
DO $$ BEGIN
    CREATE TYPE ctdisr.access_action AS ENUM (
        'LOGIN',
        'LOGOUT',
        'MFA_CHALLENGE',
        'MFA_SUCCESS',
        'MFA_FAILURE',
        'PRIVILEGE_ESCALATION',
        'PRIVILEGE_DEESCALATION',
        'SESSION_START',
        'SESSION_END',
        'SESSION_TIMEOUT',
        'ACCESS_DENIED',
        'RESOURCE_ACCESS',
        'DATA_EXPORT',
        'CONFIG_CHANGE',
        'SUBSCRIBER_DATA_ACCESS',
        'LI_DATA_ACCESS',
        'AUDIT_LOG_ACCESS'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Vendor risk rating
DO $$ BEGIN
    CREATE TYPE ctdisr.vendor_risk_rating AS ENUM (
        'CRITICAL',      -- Access to critical infrastructure
        'HIGH',          -- Access to sensitive data
        'MEDIUM',        -- Limited access
        'LOW',           -- No sensitive access
        'UNASSESSED'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Encryption algorithm tracking
DO $$ BEGIN
    CREATE TYPE ctdisr.encryption_algorithm AS ENUM (
        'AES_256_GCM',
        'AES_256_CBC',
        'RSA_4096',
        'RSA_2048',
        'CHACHA20_POLY1305',
        'ARGON2ID',
        'BCRYPT',
        'SHA256',
        'SHA384',
        'SHA512'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- PART 2: CTDISR POLICY CONFIGURATION
-- ============================================

-- Central policy configuration table
CREATE TABLE IF NOT EXISTS ctdisr.policy_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Policy identification
    policy_code TEXT UNIQUE NOT NULL,  -- e.g., 'CTDISR-5.2.1'
    policy_name TEXT NOT NULL,
    policy_description TEXT,
    ctdisr_section TEXT NOT NULL,      -- Reference to CTDISR section
    
    -- Policy settings
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    enforcement_mode TEXT NOT NULL DEFAULT 'ENFORCE',  -- ENFORCE, AUDIT_ONLY, DISABLED
    
    -- Thresholds and limits
    config_json JSONB NOT NULL DEFAULT '{}',
    
    -- Violation handling
    violation_severity ctdisr.violation_severity NOT NULL DEFAULT 'MEDIUM',
    auto_block BOOLEAN DEFAULT FALSE,
    notify_compliance_officer BOOLEAN DEFAULT TRUE,
    notify_cto BOOLEAN DEFAULT FALSE,
    notify_pta BOOLEAN DEFAULT FALSE,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    
    -- Version control
    version INTEGER NOT NULL DEFAULT 1,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ
);

-- ============================================
-- PART 3: COMPLIANCE VIOLATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS ctdisr.violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Violation identification
    violation_code TEXT NOT NULL,       -- Auto-generated: CTDISR-YYYYMMDD-XXXXXX
    policy_id UUID REFERENCES ctdisr.policy_config(id),
    
    -- Classification
    severity ctdisr.violation_severity NOT NULL,
    status ctdisr.violation_status NOT NULL DEFAULT 'OPEN',
    
    -- Context
    actor_user_id UUID,
    actor_ip_address INET,
    actor_user_agent TEXT,
    actor_session_id TEXT,
    
    -- Violation details
    resource_type TEXT,                 -- e.g., 'subscriber', 'radius_session', 'olt_config'
    resource_id TEXT,
    action_attempted TEXT,
    violation_description TEXT NOT NULL,
    evidence_json JSONB,                -- Captured evidence
    
    -- Blocking
    was_blocked BOOLEAN DEFAULT FALSE,
    block_reason TEXT,
    
    -- Timestamps
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    
    -- Remediation
    remediation_plan TEXT,
    remediation_deadline TIMESTAMPTZ,
    remediation_completed_at TIMESTAMPTZ,
    remediation_verified_by UUID,
    
    -- Escalation tracking
    escalated_to_cto BOOLEAN DEFAULT FALSE,
    escalated_to_cto_at TIMESTAMPTZ,
    escalated_to_pta BOOLEAN DEFAULT FALSE,
    escalated_to_pta_at TIMESTAMPTZ,
    pta_reference_number TEXT,
    
    -- Hash chain for immutability
    previous_hash TEXT,
    record_hash TEXT NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Make violations append-only for critical fields
CREATE OR REPLACE FUNCTION ctdisr.protect_violation_core_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent modification of core evidence fields
    IF OLD.violation_code IS DISTINCT FROM NEW.violation_code OR
       OLD.detected_at IS DISTINCT FROM NEW.detected_at OR
       OLD.actor_user_id IS DISTINCT FROM NEW.actor_user_id OR
       OLD.evidence_json IS DISTINCT FROM NEW.evidence_json OR
       OLD.previous_hash IS DISTINCT FROM NEW.previous_hash OR
       OLD.record_hash IS DISTINCT FROM NEW.record_hash THEN
        RAISE EXCEPTION 'Cannot modify immutable violation fields (violation_code, detected_at, actor, evidence, hash)';
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_violation_immutability ON ctdisr.violations;
CREATE TRIGGER protect_violation_immutability
    BEFORE UPDATE ON ctdisr.violations
    FOR EACH ROW
    EXECUTE FUNCTION ctdisr.protect_violation_core_fields();

-- ============================================
-- PART 4: REMEDIATION TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS ctdisr.remediation_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    violation_id UUID NOT NULL REFERENCES ctdisr.violations(id),
    
    -- Action details
    action_number INTEGER NOT NULL,
    action_description TEXT NOT NULL,
    action_type TEXT NOT NULL,  -- 'TECHNICAL', 'PROCEDURAL', 'TRAINING', 'POLICY'
    
    -- Assignment
    assigned_to UUID,
    assigned_at TIMESTAMPTZ,
    due_date TIMESTAMPTZ,
    
    -- Completion
    status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING, IN_PROGRESS, COMPLETED, VERIFIED
    completed_at TIMESTAMPTZ,
    completed_by UUID,
    completion_notes TEXT,
    
    -- Verification
    requires_verification BOOLEAN DEFAULT TRUE,
    verified_at TIMESTAMPTZ,
    verified_by UUID,
    verification_notes TEXT,
    
    -- Evidence
    evidence_attachments JSONB DEFAULT '[]',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- PART 5: DUAL APPROVAL WORKFLOWS
-- ============================================

CREATE TABLE IF NOT EXISTS ctdisr.approval_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Workflow definition
    workflow_code TEXT UNIQUE NOT NULL,
    workflow_name TEXT NOT NULL,
    description TEXT,
    
    -- Required approvers
    required_approvals INTEGER NOT NULL DEFAULT 2,
    approver_roles TEXT[] NOT NULL,  -- Roles that can approve
    
    -- Timeout
    approval_timeout_hours INTEGER DEFAULT 24,
    auto_reject_on_timeout BOOLEAN DEFAULT TRUE,
    
    -- Actions requiring this workflow
    applies_to_actions TEXT[] NOT NULL,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ctdisr.approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    workflow_id UUID NOT NULL REFERENCES ctdisr.approval_workflows(id),
    
    -- Request details
    request_code TEXT UNIQUE NOT NULL,
    action_type TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    action_payload JSONB,
    
    -- Requestor
    requested_by UUID NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_justification TEXT NOT NULL,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING, APPROVED, REJECTED, EXPIRED, CANCELLED
    
    -- Timeout
    expires_at TIMESTAMPTZ NOT NULL,
    
    -- Resolution
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    
    -- Execution (if approved)
    executed_at TIMESTAMPTZ,
    execution_result JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ctdisr.approval_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    request_id UUID NOT NULL REFERENCES ctdisr.approval_requests(id),
    
    -- Approver
    approver_id UUID NOT NULL,
    approver_role TEXT NOT NULL,
    
    -- Decision
    decision TEXT NOT NULL,  -- APPROVE, REJECT
    decision_notes TEXT,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Context
    ip_address INET,
    user_agent TEXT,
    mfa_verified BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- PART 6: PRIVILEGED ACCESS MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS ctdisr.privileged_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Session identification
    session_token TEXT UNIQUE NOT NULL,
    
    -- User
    user_id UUID NOT NULL,
    elevated_role TEXT NOT NULL,
    original_role TEXT NOT NULL,
    
    -- Justification
    justification TEXT NOT NULL,
    approval_request_id UUID REFERENCES ctdisr.approval_requests(id),
    
    -- Time bounds
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    end_reason TEXT,  -- EXPIRED, MANUAL, FORCED, TIMEOUT
    
    -- Context
    ip_address INET NOT NULL,
    user_agent TEXT,
    mfa_method TEXT,
    
    -- Activity tracking
    actions_performed INTEGER DEFAULT 0,
    last_activity_at TIMESTAMPTZ,
    
    -- Session recording (if enabled)
    recording_enabled BOOLEAN DEFAULT TRUE,
    recording_path TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ctdisr.privileged_session_logs (
    id BIGSERIAL PRIMARY KEY,
    
    session_id UUID NOT NULL REFERENCES ctdisr.privileged_sessions(id),
    
    -- Action
    action_type ctdisr.access_action NOT NULL,
    action_target TEXT,
    action_details JSONB,
    
    -- Outcome
    success BOOLEAN NOT NULL,
    error_message TEXT,
    
    -- Context
    ip_address INET,
    
    -- Timestamp
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Hash chain
    previous_hash TEXT,
    record_hash TEXT NOT NULL
);

-- Prevent modification of privileged session logs
CREATE OR REPLACE FUNCTION ctdisr.prevent_session_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Privileged session logs are immutable. UPDATE and DELETE operations are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS immutable_session_logs ON ctdisr.privileged_session_logs;
CREATE TRIGGER immutable_session_logs
    BEFORE UPDATE OR DELETE ON ctdisr.privileged_session_logs
    FOR EACH ROW
    EXECUTE FUNCTION ctdisr.prevent_session_log_modification();

-- ============================================
-- PART 7: MFA TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS ctdisr.mfa_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    user_id UUID NOT NULL,
    
    -- MFA method
    mfa_type TEXT NOT NULL,  -- TOTP, SMS, EMAIL, HARDWARE_TOKEN, BIOMETRIC
    
    -- Configuration (encrypted)
    secret_encrypted TEXT,  -- For TOTP
    device_info JSONB,
    
    -- Status
    is_primary BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    
    -- Usage
    last_used_at TIMESTAMPTZ,
    use_count INTEGER DEFAULT 0,
    
    -- Recovery
    recovery_codes_hash TEXT,
    recovery_codes_remaining INTEGER DEFAULT 10,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT,
    
    CONSTRAINT one_primary_per_user UNIQUE (user_id, is_primary) 
        DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS ctdisr.mfa_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    user_id UUID NOT NULL,
    enrollment_id UUID REFERENCES ctdisr.mfa_enrollments(id),
    
    -- Challenge
    challenge_type TEXT NOT NULL,
    challenge_code_hash TEXT,
    
    -- Context
    ip_address INET NOT NULL,
    user_agent TEXT,
    trigger_action TEXT,  -- What action triggered MFA
    
    -- Status
    status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING, VERIFIED, FAILED, EXPIRED
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    
    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    
    -- Result
    failure_reason TEXT
);

-- ============================================
-- PART 8: IP RESTRICTION & GEOFENCING
-- ============================================

CREATE TABLE IF NOT EXISTS ctdisr.ip_allowlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Scope
    scope_type TEXT NOT NULL,  -- GLOBAL, ROLE, USER, RESOURCE
    scope_id TEXT,             -- Role name, user ID, or resource ID
    
    -- IP configuration
    ip_range CIDR NOT NULL,
    description TEXT,
    
    -- Validity
    is_active BOOLEAN DEFAULT TRUE,
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    
    -- Audit
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Approval (for sensitive additions)
    requires_approval BOOLEAN DEFAULT FALSE,
    approval_id UUID REFERENCES ctdisr.approval_requests(id)
);

CREATE TABLE IF NOT EXISTS ctdisr.ip_blocklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    ip_range CIDR NOT NULL,
    
    -- Reason
    block_reason TEXT NOT NULL,
    threat_type TEXT,  -- BRUTE_FORCE, SUSPICIOUS, KNOWN_BAD, GEO_RESTRICTED
    
    -- Auto-block info
    auto_blocked BOOLEAN DEFAULT FALSE,
    triggered_by_violation_id UUID REFERENCES ctdisr.violations(id),
    
    -- Duration
    blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,  -- NULL = permanent
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    unblocked_at TIMESTAMPTZ,
    unblocked_by UUID,
    unblock_reason TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- PART 9: SECURITY EVENTS (SIEM FEED)
-- ============================================

CREATE TABLE IF NOT EXISTS ctdisr.security_events (
    id BIGSERIAL PRIMARY KEY,
    
    -- Event identification
    event_id TEXT UNIQUE NOT NULL,  -- UUID or formatted ID
    event_type TEXT NOT NULL,
    event_category TEXT NOT NULL,   -- AUTH, ACCESS, CONFIG, NETWORK, DATA, INCIDENT
    
    -- Severity
    severity ctdisr.incident_severity NOT NULL,
    
    -- Source
    source_system TEXT NOT NULL,    -- BACKEND, RADIUS, OLT, FIREWALL, etc.
    source_component TEXT,
    
    -- Actor
    actor_type TEXT,                -- USER, SYSTEM, EXTERNAL
    actor_id TEXT,
    actor_ip INET,
    actor_geo JSONB,               -- Country, city if available
    
    -- Target
    target_type TEXT,
    target_id TEXT,
    
    -- Event details
    action TEXT NOT NULL,
    outcome TEXT NOT NULL,          -- SUCCESS, FAILURE, PARTIAL, UNKNOWN
    details JSONB,
    
    -- Correlation
    correlation_id TEXT,            -- To link related events
    parent_event_id BIGINT,
    
    -- Timestamps
    event_time TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- SIEM forwarding
    forwarded_to_siem BOOLEAN DEFAULT FALSE,
    forwarded_at TIMESTAMPTZ,
    
    -- Hash chain
    previous_hash TEXT,
    record_hash TEXT NOT NULL
);

-- Partition security events by month for performance
-- (In production, implement proper partitioning)

-- Prevent modification
CREATE OR REPLACE FUNCTION ctdisr.prevent_security_event_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Security events are immutable. UPDATE and DELETE operations are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS immutable_security_events ON ctdisr.security_events;
CREATE TRIGGER immutable_security_events
    BEFORE UPDATE OR DELETE ON ctdisr.security_events
    FOR EACH ROW
    EXECUTE FUNCTION ctdisr.prevent_security_event_modification();

-- ============================================
-- PART 10: INDEXES
-- ============================================

-- Policy config
CREATE INDEX IF NOT EXISTS idx_policy_config_code ON ctdisr.policy_config(policy_code);
CREATE INDEX IF NOT EXISTS idx_policy_config_section ON ctdisr.policy_config(ctdisr_section);
CREATE INDEX IF NOT EXISTS idx_policy_config_enabled ON ctdisr.policy_config(is_enabled);

-- Violations
CREATE INDEX IF NOT EXISTS idx_violations_code ON ctdisr.violations(violation_code);
CREATE INDEX IF NOT EXISTS idx_violations_severity ON ctdisr.violations(severity);
CREATE INDEX IF NOT EXISTS idx_violations_status ON ctdisr.violations(status);
CREATE INDEX IF NOT EXISTS idx_violations_actor ON ctdisr.violations(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_violations_detected ON ctdisr.violations(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_violations_policy ON ctdisr.violations(policy_id);

-- Approval requests
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON ctdisr.approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_requestor ON ctdisr.approval_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_approval_requests_expires ON ctdisr.approval_requests(expires_at);

-- Privileged sessions
CREATE INDEX IF NOT EXISTS idx_priv_sessions_user ON ctdisr.privileged_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_priv_sessions_active ON ctdisr.privileged_sessions(ended_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_priv_sessions_expires ON ctdisr.privileged_sessions(expires_at);

-- MFA
CREATE INDEX IF NOT EXISTS idx_mfa_enrollments_user ON ctdisr.mfa_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_user ON ctdisr.mfa_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_status ON ctdisr.mfa_challenges(status);

-- Security events
CREATE INDEX IF NOT EXISTS idx_security_events_type ON ctdisr.security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_category ON ctdisr.security_events(event_category);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON ctdisr.security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_time ON ctdisr.security_events(event_time DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_actor ON ctdisr.security_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_security_events_correlation ON ctdisr.security_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_security_events_siem ON ctdisr.security_events(forwarded_to_siem) WHERE NOT forwarded_to_siem;

-- IP lists
CREATE INDEX IF NOT EXISTS idx_ip_allowlists_range ON ctdisr.ip_allowlists USING GIST (ip_range inet_ops);
CREATE INDEX IF NOT EXISTS idx_ip_blocklists_range ON ctdisr.ip_blocklists USING GIST (ip_range inet_ops);
CREATE INDEX IF NOT EXISTS idx_ip_blocklists_active ON ctdisr.ip_blocklists(is_active) WHERE is_active;

-- ============================================
-- PART 11: ROW LEVEL SECURITY
-- ============================================

ALTER TABLE ctdisr.policy_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.remediation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.privileged_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.privileged_session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.mfa_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.mfa_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.ip_allowlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.ip_blocklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.security_events ENABLE ROW LEVEL SECURITY;

-- Helper functions for RBAC
CREATE OR REPLACE FUNCTION ctdisr.is_security_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_roles 
        WHERE user_id = auth.uid() 
        AND role IN ('superadmin', 'security_admin', 'pta_compliance')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION ctdisr.is_compliance_officer()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_roles 
        WHERE user_id = auth.uid() 
        AND role IN ('superadmin', 'pta_compliance', 'compliance_officer')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies
CREATE POLICY "security_admin_policy_config" ON ctdisr.policy_config
    FOR ALL USING (ctdisr.is_security_admin() OR auth.role() = 'service_role');

CREATE POLICY "compliance_view_violations" ON ctdisr.violations
    FOR SELECT USING (ctdisr.is_compliance_officer() OR auth.role() = 'service_role');

CREATE POLICY "service_manage_violations" ON ctdisr.violations
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_manage_security_events" ON ctdisr.security_events
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "compliance_view_security_events" ON ctdisr.security_events
    FOR SELECT USING (ctdisr.is_compliance_officer() OR auth.role() = 'service_role');

-- ============================================
-- PART 12: HELPER FUNCTIONS
-- ============================================

-- Generate violation code
CREATE OR REPLACE FUNCTION ctdisr.generate_violation_code()
RETURNS TEXT AS $$
DECLARE
    v_date TEXT;
    v_seq TEXT;
BEGIN
    v_date := TO_CHAR(NOW(), 'YYYYMMDD');
    v_seq := LPAD(FLOOR(RANDOM() * 999999 + 1)::TEXT, 6, '0');
    RETURN 'CTDISR-' || v_date || '-' || v_seq;
END;
$$ LANGUAGE plpgsql;

-- Calculate SHA-256 hash for record
CREATE OR REPLACE FUNCTION ctdisr.calculate_record_hash(
    p_data JSONB,
    p_previous_hash TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
    v_input TEXT;
BEGIN
    v_input := COALESCE(p_previous_hash, '') || p_data::TEXT;
    RETURN encode(sha256(v_input::bytea), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Check if IP is allowed
CREATE OR REPLACE FUNCTION ctdisr.is_ip_allowed(
    p_ip INET,
    p_scope_type TEXT DEFAULT 'GLOBAL',
    p_scope_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    -- First check blocklist
    IF EXISTS (
        SELECT 1 FROM ctdisr.ip_blocklists
        WHERE is_active
          AND p_ip <<= ip_range
          AND (expires_at IS NULL OR expires_at > NOW())
    ) THEN
        RETURN FALSE;
    END IF;
    
    -- Then check allowlist
    RETURN EXISTS (
        SELECT 1 FROM ctdisr.ip_allowlists
        WHERE is_active
          AND p_ip <<= ip_range
          AND (valid_until IS NULL OR valid_until > NOW())
          AND (
              scope_type = 'GLOBAL'
              OR (scope_type = p_scope_type AND (scope_id IS NULL OR scope_id = p_scope_id))
          )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
COMMENT ON SCHEMA ctdisr IS 'CTDISR-2025 Compliance Framework Schema';
