-- ============================================
-- NetAxis ISP - CTDISR-2025 ZERO-TRUST ACCESS CONTROL SCHEMA
-- Section 5: Identity & Access Management
-- Migration: 20241202012_ctdisr_zero_trust.sql
-- ============================================

-- ============================================
-- PART 1: USER ROLES & PERMISSIONS
-- ============================================

-- Role definitions with RBAC+ABAC support
CREATE TABLE IF NOT EXISTS ctdisr.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    role_code TEXT UNIQUE NOT NULL,
    role_name TEXT NOT NULL,
    description TEXT,
    
    -- Role type
    role_type TEXT NOT NULL DEFAULT 'STANDARD',  -- STANDARD, PRIVILEGED, SERVICE, TEMPORARY
    
    -- Classification access
    max_classification ctdisr.asset_classification NOT NULL DEFAULT 'PUBLIC',
    
    -- Flags
    is_privileged BOOLEAN DEFAULT FALSE,
    requires_mfa BOOLEAN DEFAULT FALSE,
    requires_approval BOOLEAN DEFAULT FALSE,
    
    -- Session limits
    max_session_duration_minutes INTEGER DEFAULT 480,  -- 8 hours
    max_concurrent_sessions INTEGER DEFAULT 3,
    session_timeout_minutes INTEGER DEFAULT 30,
    
    -- IP restrictions
    ip_restricted BOOLEAN DEFAULT FALSE,
    allowed_ip_ranges CIDR[],
    
    -- Time restrictions
    time_restricted BOOLEAN DEFAULT FALSE,
    allowed_hours_start TIME,
    allowed_hours_end TIME,
    allowed_days INTEGER[],  -- 0=Sunday, 6=Saturday
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Permissions with granular access control
CREATE TABLE IF NOT EXISTS ctdisr.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    permission_code TEXT UNIQUE NOT NULL,  -- e.g., 'subscribers.read', 'olt.configure'
    permission_name TEXT NOT NULL,
    description TEXT,
    
    -- Resource
    resource_type TEXT NOT NULL,
    action TEXT NOT NULL,  -- CREATE, READ, UPDATE, DELETE, EXECUTE, EXPORT
    
    -- Classification
    requires_classification ctdisr.asset_classification,
    
    -- Audit
    audit_access BOOLEAN DEFAULT TRUE,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Role-Permission mapping
CREATE TABLE IF NOT EXISTS ctdisr.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    role_id UUID NOT NULL REFERENCES ctdisr.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES ctdisr.permissions(id) ON DELETE CASCADE,
    
    -- Conditions (ABAC)
    conditions JSONB DEFAULT '{}',  -- e.g., {"department": "NOC", "region": "punjab"}
    
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by UUID,
    expires_at TIMESTAMPTZ,
    
    UNIQUE(role_id, permission_id)
);

-- User role assignments
CREATE TABLE IF NOT EXISTS ctdisr.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    user_id UUID NOT NULL,
    role_id UUID NOT NULL REFERENCES ctdisr.roles(id) ON DELETE CASCADE,
    
    -- Assignment details
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by UUID NOT NULL,
    expires_at TIMESTAMPTZ,
    
    -- Context
    assignment_reason TEXT NOT NULL,
    
    -- Approval (for privileged roles)
    requires_approval BOOLEAN DEFAULT FALSE,
    approval_request_id UUID REFERENCES ctdisr.approval_requests(id),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID,
    revocation_reason TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(user_id, role_id)
);

-- ============================================
-- PART 2: SESSIONS & ACCESS TRACKING
-- ============================================

-- User sessions with comprehensive tracking
CREATE TABLE IF NOT EXISTS ctdisr.user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    session_id TEXT UNIQUE NOT NULL,
    user_id UUID NOT NULL,
    
    -- Session details
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    end_reason TEXT,  -- LOGOUT, TIMEOUT, FORCED, EXPIRED, ERROR
    
    -- Context
    ip_address INET NOT NULL,
    user_agent TEXT,
    device_fingerprint TEXT,
    
    -- Geolocation
    geo_country TEXT,
    geo_region TEXT,
    geo_city TEXT,
    
    -- Authentication
    auth_method TEXT NOT NULL,  -- PASSWORD, SSO, MFA
    mfa_verified BOOLEAN DEFAULT FALSE,
    mfa_method TEXT,
    
    -- Risk scoring
    risk_score INTEGER DEFAULT 0,  -- 0-100
    risk_factors JSONB DEFAULT '[]',
    
    -- Activity metrics
    actions_count INTEGER DEFAULT 0,
    sensitive_access_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Session actions (immutable audit log)
CREATE TABLE IF NOT EXISTS ctdisr.session_actions (
    id BIGSERIAL PRIMARY KEY,
    
    session_id UUID NOT NULL REFERENCES ctdisr.user_sessions(id),
    
    -- Action details
    action_type ctdisr.access_action NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    action_details JSONB,
    
    -- Outcome
    success BOOLEAN NOT NULL,
    error_code TEXT,
    error_message TEXT,
    
    -- Context
    ip_address INET,
    
    -- Permission used
    permission_code TEXT,
    
    -- Timestamp
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms INTEGER,
    
    -- Hash chain
    previous_hash TEXT,
    record_hash TEXT NOT NULL
);

-- Make session actions immutable
CREATE OR REPLACE FUNCTION ctdisr.prevent_session_action_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Session actions are immutable. UPDATE and DELETE operations are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS immutable_session_actions ON ctdisr.session_actions;
CREATE TRIGGER immutable_session_actions
    BEFORE UPDATE OR DELETE ON ctdisr.session_actions
    FOR EACH ROW
    EXECUTE FUNCTION ctdisr.prevent_session_action_modification();

-- ============================================
-- PART 3: JUST-IN-TIME (JIT) PRIVILEGE ESCALATION
-- ============================================

CREATE TABLE IF NOT EXISTS ctdisr.jit_privilege_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Request details
    request_code TEXT UNIQUE NOT NULL,
    user_id UUID NOT NULL,
    
    -- Requested privilege
    requested_role_id UUID NOT NULL REFERENCES ctdisr.roles(id),
    requested_permissions TEXT[],
    
    -- Duration
    requested_duration_minutes INTEGER NOT NULL,
    max_duration_minutes INTEGER NOT NULL DEFAULT 240,  -- 4 hours max
    
    -- Context
    justification TEXT NOT NULL,
    ticket_reference TEXT,  -- Link to support ticket or change request
    
    -- Target resources (optional - for scoped access)
    target_resources JSONB,  -- e.g., {"asset_ids": ["xxx"], "subscriber_ids": ["yyy"]}
    
    -- Approval
    approval_request_id UUID REFERENCES ctdisr.approval_requests(id),
    
    -- Status
    status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING, APPROVED, REJECTED, ACTIVATED, EXPIRED, REVOKED
    
    -- Activation
    activated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    deactivated_at TIMESTAMPTZ,
    deactivation_reason TEXT,
    
    -- Audit
    ip_address INET NOT NULL,
    user_agent TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- JIT privilege usage tracking
CREATE TABLE IF NOT EXISTS ctdisr.jit_privilege_usage (
    id BIGSERIAL PRIMARY KEY,
    
    jit_request_id UUID NOT NULL REFERENCES ctdisr.jit_privilege_requests(id),
    
    -- Action
    action_type TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    action_details JSONB,
    
    -- Outcome
    success BOOLEAN NOT NULL,
    
    -- Timestamp
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Hash chain
    previous_hash TEXT,
    record_hash TEXT NOT NULL
);

-- ============================================
-- PART 4: ANOMALY DETECTION
-- ============================================

CREATE TABLE IF NOT EXISTS ctdisr.access_anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Detection
    anomaly_type TEXT NOT NULL,  -- IMPOSSIBLE_TRAVEL, UNUSUAL_TIME, NEW_DEVICE, BRUTE_FORCE, etc.
    severity ctdisr.incident_severity NOT NULL,
    
    -- Context
    user_id UUID,
    session_id UUID REFERENCES ctdisr.user_sessions(id),
    ip_address INET,
    
    -- Details
    description TEXT NOT NULL,
    evidence JSONB NOT NULL,
    
    -- Baseline comparison
    baseline_value JSONB,
    actual_value JSONB,
    deviation_score DECIMAL(5,2),
    
    -- Response
    auto_blocked BOOLEAN DEFAULT FALSE,
    auto_logout BOOLEAN DEFAULT FALSE,
    notification_sent BOOLEAN DEFAULT FALSE,
    
    -- Investigation
    status TEXT NOT NULL DEFAULT 'OPEN',  -- OPEN, INVESTIGATING, FALSE_POSITIVE, CONFIRMED, RESOLVED
    investigated_by UUID,
    investigation_notes TEXT,
    resolved_at TIMESTAMPTZ,
    
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User access baselines for anomaly detection
CREATE TABLE IF NOT EXISTS ctdisr.user_access_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    user_id UUID NOT NULL UNIQUE,
    
    -- Normal patterns
    typical_login_hours JSONB,      -- {"start": "09:00", "end": "18:00"}
    typical_login_days INTEGER[],   -- [1,2,3,4,5] for Mon-Fri
    typical_ip_ranges CIDR[],
    typical_locations JSONB,        -- [{"country": "PK", "city": "Lahore"}]
    
    -- Device fingerprints
    known_devices TEXT[],
    
    -- Access patterns
    typical_resources TEXT[],
    typical_actions_per_hour INTEGER,
    typical_sensitive_access_per_day INTEGER,
    
    -- Statistics
    total_logins INTEGER DEFAULT 0,
    failed_login_streak INTEGER DEFAULT 0,
    last_login_at TIMESTAMPTZ,
    last_ip_address INET,
    last_location JSONB,
    
    -- Learning period
    baseline_established_at TIMESTAMPTZ,
    learning_data_points INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- PART 5: INDEXES
-- ============================================

-- Roles & Permissions
CREATE INDEX IF NOT EXISTS idx_roles_code ON ctdisr.roles(role_code);
CREATE INDEX IF NOT EXISTS idx_roles_privileged ON ctdisr.roles(is_privileged) WHERE is_privileged;
CREATE INDEX IF NOT EXISTS idx_permissions_code ON ctdisr.permissions(permission_code);
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON ctdisr.permissions(resource_type, action);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON ctdisr.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON ctdisr.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON ctdisr.user_roles(is_active) WHERE is_active;

-- Sessions
CREATE INDEX IF NOT EXISTS idx_sessions_user ON ctdisr.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON ctdisr.user_sessions(ended_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON ctdisr.user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_ip ON ctdisr.user_sessions(ip_address);
CREATE INDEX IF NOT EXISTS idx_session_actions_session ON ctdisr.session_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_session_actions_time ON ctdisr.session_actions(performed_at DESC);

-- JIT
CREATE INDEX IF NOT EXISTS idx_jit_requests_user ON ctdisr.jit_privilege_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_jit_requests_status ON ctdisr.jit_privilege_requests(status);
CREATE INDEX IF NOT EXISTS idx_jit_requests_expires ON ctdisr.jit_privilege_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_jit_usage_request ON ctdisr.jit_privilege_usage(jit_request_id);

-- Anomalies
CREATE INDEX IF NOT EXISTS idx_anomalies_user ON ctdisr.access_anomalies(user_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_type ON ctdisr.access_anomalies(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_anomalies_status ON ctdisr.access_anomalies(status);
CREATE INDEX IF NOT EXISTS idx_anomalies_severity ON ctdisr.access_anomalies(severity);
CREATE INDEX IF NOT EXISTS idx_baselines_user ON ctdisr.user_access_baselines(user_id);

-- ============================================
-- PART 6: ROW LEVEL SECURITY
-- ============================================

ALTER TABLE ctdisr.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.session_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.jit_privilege_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.jit_privilege_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.access_anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.user_access_baselines ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "security_admin_roles" ON ctdisr.roles
    FOR ALL USING (ctdisr.is_security_admin() OR auth.role() = 'service_role');

CREATE POLICY "security_admin_permissions" ON ctdisr.permissions
    FOR ALL USING (ctdisr.is_security_admin() OR auth.role() = 'service_role');

CREATE POLICY "service_manage_user_roles" ON ctdisr.user_roles
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_manage_sessions" ON ctdisr.user_sessions
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_manage_session_actions" ON ctdisr.session_actions
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_manage_jit" ON ctdisr.jit_privilege_requests
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "security_view_anomalies" ON ctdisr.access_anomalies
    FOR SELECT USING (ctdisr.is_security_admin() OR auth.role() = 'service_role');

CREATE POLICY "service_manage_anomalies" ON ctdisr.access_anomalies
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- PART 7: HELPER FUNCTIONS
-- ============================================

-- Check if user has permission
CREATE OR REPLACE FUNCTION ctdisr.user_has_permission(
    p_user_id UUID,
    p_permission_code TEXT,
    p_conditions JSONB DEFAULT '{}'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_has_permission BOOLEAN := FALSE;
BEGIN
    SELECT EXISTS (
        SELECT 1 
        FROM ctdisr.user_roles ur
        JOIN ctdisr.role_permissions rp ON rp.role_id = ur.role_id
        JOIN ctdisr.permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = p_user_id
          AND ur.is_active = TRUE
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
          AND p.permission_code = p_permission_code
          AND p.is_active = TRUE
          AND (rp.expires_at IS NULL OR rp.expires_at > NOW())
          AND (rp.conditions = '{}' OR rp.conditions @> p_conditions)
    ) INTO v_has_permission;
    
    RETURN v_has_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's effective roles
CREATE OR REPLACE FUNCTION ctdisr.get_user_roles(p_user_id UUID)
RETURNS TABLE (
    role_code TEXT,
    role_name TEXT,
    is_privileged BOOLEAN,
    max_classification ctdisr.asset_classification
) AS $$
BEGIN
    RETURN QUERY
    SELECT r.role_code, r.role_name, r.is_privileged, r.max_classification
    FROM ctdisr.user_roles ur
    JOIN ctdisr.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND ur.is_active = TRUE
      AND r.is_active = TRUE
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Expire stale sessions
CREATE OR REPLACE FUNCTION ctdisr.expire_stale_sessions()
RETURNS void AS $$
BEGIN
    UPDATE ctdisr.user_sessions
    SET ended_at = NOW(),
        end_reason = 'TIMEOUT',
        updated_at = NOW()
    WHERE ended_at IS NULL
      AND last_activity_at < NOW() - INTERVAL '30 minutes';
      
    UPDATE ctdisr.user_sessions
    SET ended_at = NOW(),
        end_reason = 'EXPIRED',
        updated_at = NOW()
    WHERE ended_at IS NULL
      AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Detect impossible travel
CREATE OR REPLACE FUNCTION ctdisr.detect_impossible_travel(
    p_user_id UUID,
    p_new_ip INET,
    p_new_geo JSONB
)
RETURNS BOOLEAN AS $$
DECLARE
    v_last_session RECORD;
    v_time_diff INTERVAL;
    v_max_distance_km INTEGER := 1000;  -- Maximum believable travel in timeframe
BEGIN
    -- Get last session
    SELECT * INTO v_last_session
    FROM ctdisr.user_sessions
    WHERE user_id = p_user_id
      AND ended_at IS NOT NULL
    ORDER BY ended_at DESC
    LIMIT 1;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    v_time_diff := NOW() - v_last_session.ended_at;
    
    -- If less than 1 hour and different country, flag as anomaly
    IF v_time_diff < INTERVAL '1 hour' 
       AND v_last_session.geo_country IS NOT NULL 
       AND v_last_session.geo_country != (p_new_geo->>'country') THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PART 8: SEED DEFAULT ROLES
-- ============================================

INSERT INTO ctdisr.roles (role_code, role_name, description, role_type, max_classification, is_privileged, requires_mfa) VALUES
    ('SUPERADMIN', 'Super Administrator', 'Full system access', 'PRIVILEGED', 'CRITICAL', TRUE, TRUE),
    ('SECURITY_ADMIN', 'Security Administrator', 'Security configuration and monitoring', 'PRIVILEGED', 'CRITICAL', TRUE, TRUE),
    ('COMPLIANCE_OFFICER', 'Compliance Officer', 'PTA compliance and audit access', 'PRIVILEGED', 'SENSITIVE', TRUE, TRUE),
    ('NOC_MANAGER', 'NOC Manager', 'Network operations center manager', 'PRIVILEGED', 'SENSITIVE', TRUE, TRUE),
    ('NOC_OPERATOR', 'NOC Operator', 'Network operations center operator', 'STANDARD', 'CONFIDENTIAL', FALSE, FALSE),
    ('BILLING_ADMIN', 'Billing Administrator', 'Billing and financial operations', 'STANDARD', 'SENSITIVE', FALSE, FALSE),
    ('SUPPORT_AGENT', 'Support Agent', 'Customer support operations', 'STANDARD', 'CONFIDENTIAL', FALSE, FALSE),
    ('READONLY', 'Read Only', 'Read-only access for auditors', 'STANDARD', 'PUBLIC', FALSE, FALSE)
ON CONFLICT (role_code) DO NOTHING;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
COMMENT ON TABLE ctdisr.roles IS 'CTDISR-2025 Section 5: Role-Based Access Control';
COMMENT ON TABLE ctdisr.user_sessions IS 'CTDISR-2025 Section 5: Session Management';
COMMENT ON TABLE ctdisr.access_anomalies IS 'CTDISR-2025 Section 5: Anomaly Detection';
