-- CTDISR-2025 Disaster Recovery & Business Continuity Schema
-- PTA Regulation: Chapter 8 - Business Continuity & Disaster Recovery

-- DR Plan Status
CREATE TYPE ctdisr.dr_plan_status AS ENUM (
    'draft',
    'under_review',
    'approved',
    'active',
    'suspended',
    'archived'
);

-- Recovery Priority
CREATE TYPE ctdisr.recovery_priority AS ENUM (
    'critical',      -- RTO < 1 hour
    'high',          -- RTO < 4 hours
    'medium',        -- RTO < 24 hours
    'low',           -- RTO < 72 hours
    'non_critical'   -- RTO > 72 hours
);

-- Backup Type
CREATE TYPE ctdisr.backup_type AS ENUM (
    'full',
    'incremental',
    'differential',
    'snapshot',
    'continuous'
);

-- Backup Status
CREATE TYPE ctdisr.backup_status AS ENUM (
    'pending',
    'running',
    'completed',
    'failed',
    'verified',
    'expired'
);

-- DR Test Type
CREATE TYPE ctdisr.dr_test_type AS ENUM (
    'tabletop',
    'walkthrough',
    'simulation',
    'parallel',
    'full_interruption'
);

-- DR Test Result
CREATE TYPE ctdisr.dr_test_result AS ENUM (
    'passed',
    'passed_with_issues',
    'failed',
    'aborted'
);

-- Failover Status
CREATE TYPE ctdisr.failover_status AS ENUM (
    'standby',
    'initiating',
    'in_progress',
    'active',
    'failing_back',
    'failed'
);

-- Business Continuity Plans
CREATE TABLE ctdisr.business_continuity_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_number VARCHAR(50) UNIQUE NOT NULL,  -- BCP-2025-001 format
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    
    -- Status
    status ctdisr.dr_plan_status NOT NULL DEFAULT 'draft',
    
    -- Ownership
    owner_id UUID REFERENCES auth.users(id),
    department VARCHAR(100),
    
    -- Scope
    scope TEXT,
    covered_systems TEXT[] DEFAULT '{}',
    covered_processes TEXT[] DEFAULT '{}',
    
    -- Objectives
    rto_hours INTEGER NOT NULL,  -- Recovery Time Objective
    rpo_hours INTEGER NOT NULL,  -- Recovery Point Objective
    mtpd_hours INTEGER,          -- Maximum Tolerable Period of Disruption
    
    -- Documentation
    plan_document_url VARCHAR(500),
    plan_document_hash VARCHAR(64),
    
    -- Review Schedule
    last_reviewed_at TIMESTAMPTZ,
    next_review_at TIMESTAMPTZ,
    review_frequency_days INTEGER DEFAULT 365,
    
    -- Approval
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    
    -- Activation
    last_activated_at TIMESTAMPTZ,
    activation_count INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disaster Recovery Plans
CREATE TABLE ctdisr.disaster_recovery_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_number VARCHAR(50) UNIQUE NOT NULL,  -- DRP-2025-001 format
    bcp_id UUID REFERENCES ctdisr.business_continuity_plans(id),
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    
    -- Status
    status ctdisr.dr_plan_status NOT NULL DEFAULT 'draft',
    priority ctdisr.recovery_priority NOT NULL,
    
    -- Target Systems
    target_systems TEXT[] NOT NULL,
    target_assets UUID[] DEFAULT '{}',  -- References to ctdisr.assets
    
    -- Recovery Sites
    primary_site VARCHAR(255) NOT NULL,
    secondary_site VARCHAR(255),
    tertiary_site VARCHAR(255),
    
    -- Objectives
    rto_minutes INTEGER NOT NULL,
    rpo_minutes INTEGER NOT NULL,
    
    -- Recovery Steps
    recovery_procedures JSONB NOT NULL DEFAULT '[]',
    rollback_procedures JSONB DEFAULT '[]',
    
    -- Dependencies
    dependencies JSONB DEFAULT '{}',
    upstream_systems TEXT[] DEFAULT '{}',
    downstream_systems TEXT[] DEFAULT '{}',
    
    -- Contact Information
    primary_contact JSONB,
    escalation_contacts JSONB DEFAULT '[]',
    vendor_contacts JSONB DEFAULT '[]',
    
    -- Testing
    last_tested_at TIMESTAMPTZ,
    last_test_result ctdisr.dr_test_result,
    next_test_date TIMESTAMPTZ,
    test_frequency_days INTEGER DEFAULT 90,
    
    -- Documentation
    runbook_url VARCHAR(500),
    architecture_diagram_url VARCHAR(500),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backup Schedules
CREATE TABLE ctdisr.backup_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Target
    target_type VARCHAR(50) NOT NULL,  -- database, filesystem, application, etc.
    target_identifier VARCHAR(255) NOT NULL,
    target_asset_id UUID,  -- Reference to ctdisr.assets
    
    -- Schedule
    backup_type ctdisr.backup_type NOT NULL,
    cron_expression VARCHAR(100) NOT NULL,
    timezone VARCHAR(50) DEFAULT 'Asia/Karachi',
    
    -- Retention
    retention_days INTEGER NOT NULL DEFAULT 30,
    retention_copies INTEGER,
    
    -- Storage
    primary_storage VARCHAR(500) NOT NULL,
    secondary_storage VARCHAR(500),
    offsite_storage VARCHAR(500),
    encryption_enabled BOOLEAN DEFAULT TRUE,
    encryption_key_id UUID,
    
    -- Recovery Priority
    priority ctdisr.recovery_priority NOT NULL DEFAULT 'medium',
    
    -- Verification
    verify_after_backup BOOLEAN DEFAULT TRUE,
    verification_method VARCHAR(100),
    
    -- Last Execution
    last_run_at TIMESTAMPTZ,
    last_run_status ctdisr.backup_status,
    next_run_at TIMESTAMPTZ,
    
    -- Statistics
    total_runs INTEGER DEFAULT 0,
    successful_runs INTEGER DEFAULT 0,
    failed_runs INTEGER DEFAULT 0,
    avg_duration_seconds INTEGER,
    avg_size_bytes BIGINT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backup Execution History
CREATE TABLE ctdisr.backup_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES ctdisr.backup_schedules(id) ON DELETE CASCADE,
    
    -- Execution Details
    backup_type ctdisr.backup_type NOT NULL,
    status ctdisr.backup_status NOT NULL DEFAULT 'pending',
    
    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    
    -- Size
    source_size_bytes BIGINT,
    backup_size_bytes BIGINT,
    compression_ratio DECIMAL(5,2),
    
    -- Storage Locations
    primary_location VARCHAR(500),
    secondary_location VARCHAR(500),
    offsite_location VARCHAR(500),
    
    -- Integrity
    checksum_algorithm VARCHAR(20) DEFAULT 'SHA256',
    checksum_value VARCHAR(128),
    encrypted BOOLEAN DEFAULT TRUE,
    
    -- Verification
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    verification_method VARCHAR(100),
    verification_result TEXT,
    
    -- Recovery Testing
    restore_tested BOOLEAN DEFAULT FALSE,
    restore_tested_at TIMESTAMPTZ,
    restore_duration_seconds INTEGER,
    
    -- Error Information
    error_message TEXT,
    error_details JSONB,
    retry_count INTEGER DEFAULT 0,
    
    -- Expiration
    expires_at TIMESTAMPTZ,
    is_expired BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DR Tests
CREATE TABLE ctdisr.dr_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_number VARCHAR(50) UNIQUE NOT NULL,  -- DRT-2025-001 format
    
    dr_plan_id UUID NOT NULL REFERENCES ctdisr.disaster_recovery_plans(id),
    
    -- Test Details
    test_type ctdisr.dr_test_type NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    objectives TEXT[] NOT NULL,
    
    -- Schedule
    scheduled_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_minutes INTEGER,
    
    -- Team
    test_lead UUID REFERENCES auth.users(id),
    participants UUID[] DEFAULT '{}',
    observers UUID[] DEFAULT '{}',
    
    -- Scenario
    scenario_description TEXT NOT NULL,
    simulated_disaster_type VARCHAR(100),
    affected_systems TEXT[] DEFAULT '{}',
    
    -- Results
    result ctdisr.dr_test_result,
    actual_rto_minutes INTEGER,
    actual_rpo_minutes INTEGER,
    rto_met BOOLEAN,
    rpo_met BOOLEAN,
    
    -- Findings
    findings TEXT,
    issues_found JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',
    action_items JSONB DEFAULT '[]',
    
    -- Documentation
    test_report_url VARCHAR(500),
    evidence_urls TEXT[] DEFAULT '{}',
    
    -- Follow-up
    follow_up_date TIMESTAMPTZ,
    follow_up_completed BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Failover Events
CREATE TABLE ctdisr.failover_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_number VARCHAR(50) UNIQUE NOT NULL,  -- FOE-2025-001 format
    
    dr_plan_id UUID REFERENCES ctdisr.disaster_recovery_plans(id),
    incident_id UUID,  -- Reference to security incident if applicable
    
    -- Event Details
    event_type VARCHAR(50) NOT NULL,  -- planned, unplanned, test
    status ctdisr.failover_status NOT NULL DEFAULT 'standby',
    
    -- Sites
    source_site VARCHAR(255) NOT NULL,
    target_site VARCHAR(255) NOT NULL,
    
    -- Timing
    initiated_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failback_at TIMESTAMPTZ,
    
    -- Trigger
    trigger_type VARCHAR(100),  -- manual, automatic, scheduled
    triggered_by UUID REFERENCES auth.users(id),
    trigger_reason TEXT,
    
    -- Systems Affected
    systems_affected TEXT[] NOT NULL,
    services_affected TEXT[] NOT NULL,
    
    -- Metrics
    actual_downtime_seconds INTEGER,
    data_loss_seconds INTEGER,  -- RPO achievement
    
    -- Status Updates
    status_updates JSONB DEFAULT '[]',
    
    -- Issues
    issues_encountered JSONB DEFAULT '[]',
    resolution_steps JSONB DEFAULT '[]',
    
    -- Documentation
    post_mortem_url VARCHAR(500),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recovery Point Tracking
CREATE TABLE ctdisr.recovery_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    system_identifier VARCHAR(255) NOT NULL,
    asset_id UUID,  -- Reference to ctdisr.assets
    
    -- Recovery Point Details
    recovery_point_time TIMESTAMPTZ NOT NULL,
    backup_id UUID REFERENCES ctdisr.backup_executions(id),
    
    -- Status
    is_valid BOOLEAN DEFAULT TRUE,
    is_current BOOLEAN DEFAULT FALSE,
    
    -- Location
    primary_location VARCHAR(500) NOT NULL,
    replica_locations TEXT[] DEFAULT '{}',
    
    -- Integrity
    integrity_verified BOOLEAN DEFAULT FALSE,
    last_verification TIMESTAMPTZ,
    checksum VARCHAR(128),
    
    -- Size
    size_bytes BIGINT,
    
    -- Retention
    retention_until TIMESTAMPTZ,
    is_protected BOOLEAN DEFAULT FALSE,  -- Cannot be deleted
    
    -- Recovery Capability
    estimated_recovery_time_minutes INTEGER,
    recovery_tested BOOLEAN DEFAULT FALSE,
    last_recovery_test TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- BCP Activation Log
CREATE TABLE ctdisr.bcp_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    bcp_id UUID NOT NULL REFERENCES ctdisr.business_continuity_plans(id),
    
    -- Activation Details
    activation_reason TEXT NOT NULL,
    severity ctdisr.recovery_priority NOT NULL,
    
    -- Timeline
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deactivated_at TIMESTAMPTZ,
    duration_hours DECIMAL(10,2),
    
    -- Activated By
    activated_by UUID REFERENCES auth.users(id) NOT NULL,
    deactivated_by UUID REFERENCES auth.users(id),
    
    -- Impact
    affected_departments TEXT[] DEFAULT '{}',
    affected_processes TEXT[] DEFAULT '{}',
    estimated_impact TEXT,
    actual_impact TEXT,
    
    -- Actions Taken
    actions_taken JSONB DEFAULT '[]',
    
    -- Lessons Learned
    lessons_learned TEXT,
    improvements_identified JSONB DEFAULT '[]',
    
    -- Reporting
    pta_notified BOOLEAN DEFAULT FALSE,
    pta_notification_time TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_bcp_status ON ctdisr.business_continuity_plans(status);
CREATE INDEX idx_bcp_next_review ON ctdisr.business_continuity_plans(next_review_at);
CREATE INDEX idx_bcp_owner ON ctdisr.business_continuity_plans(owner_id);

CREATE INDEX idx_drp_status ON ctdisr.disaster_recovery_plans(status);
CREATE INDEX idx_drp_priority ON ctdisr.disaster_recovery_plans(priority);
CREATE INDEX idx_drp_bcp ON ctdisr.disaster_recovery_plans(bcp_id);
CREATE INDEX idx_drp_next_test ON ctdisr.disaster_recovery_plans(next_test_date);

CREATE INDEX idx_backup_schedule_active ON ctdisr.backup_schedules(is_active);
CREATE INDEX idx_backup_schedule_next ON ctdisr.backup_schedules(next_run_at);
CREATE INDEX idx_backup_schedule_target ON ctdisr.backup_schedules(target_type, target_identifier);

CREATE INDEX idx_backup_exec_schedule ON ctdisr.backup_executions(schedule_id);
CREATE INDEX idx_backup_exec_status ON ctdisr.backup_executions(status);
CREATE INDEX idx_backup_exec_started ON ctdisr.backup_executions(started_at);
CREATE INDEX idx_backup_exec_expires ON ctdisr.backup_executions(expires_at) WHERE is_expired = FALSE;

CREATE INDEX idx_dr_test_plan ON ctdisr.dr_tests(dr_plan_id);
CREATE INDEX idx_dr_test_scheduled ON ctdisr.dr_tests(scheduled_at);
CREATE INDEX idx_dr_test_result ON ctdisr.dr_tests(result);

CREATE INDEX idx_failover_plan ON ctdisr.failover_events(dr_plan_id);
CREATE INDEX idx_failover_status ON ctdisr.failover_events(status);
CREATE INDEX idx_failover_initiated ON ctdisr.failover_events(initiated_at);

CREATE INDEX idx_recovery_point_system ON ctdisr.recovery_points(system_identifier);
CREATE INDEX idx_recovery_point_time ON ctdisr.recovery_points(recovery_point_time);
CREATE INDEX idx_recovery_point_current ON ctdisr.recovery_points(is_current) WHERE is_current = TRUE;

CREATE INDEX idx_bcp_activation_bcp ON ctdisr.bcp_activations(bcp_id);
CREATE INDEX idx_bcp_activation_time ON ctdisr.bcp_activations(activated_at);

-- Row Level Security
ALTER TABLE ctdisr.business_continuity_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.disaster_recovery_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.backup_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.backup_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.dr_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.failover_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.recovery_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.bcp_activations ENABLE ROW LEVEL SECURITY;

-- Admin policies
CREATE POLICY bcp_admin ON ctdisr.business_continuity_plans FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'dr_admin'));

CREATE POLICY drp_admin ON ctdisr.disaster_recovery_plans FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'dr_admin'));

CREATE POLICY backup_schedules_admin ON ctdisr.backup_schedules FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'dr_admin', 'backup_operator'));

CREATE POLICY backup_exec_admin ON ctdisr.backup_executions FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'dr_admin', 'backup_operator'));

CREATE POLICY dr_tests_admin ON ctdisr.dr_tests FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'dr_admin'));

CREATE POLICY failover_admin ON ctdisr.failover_events FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'dr_admin'));

CREATE POLICY recovery_points_admin ON ctdisr.recovery_points FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'dr_admin', 'backup_operator'));

CREATE POLICY bcp_activations_admin ON ctdisr.bcp_activations FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'dr_admin'));

-- Functions

-- Generate BCP number
CREATE OR REPLACE FUNCTION ctdisr.generate_bcp_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    year_part VARCHAR(4);
    seq_num INTEGER;
BEGIN
    year_part := TO_CHAR(NOW(), 'YYYY');
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(plan_number FROM 'BCP-\d{4}-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM ctdisr.business_continuity_plans
    WHERE plan_number LIKE 'BCP-' || year_part || '-%';
    
    RETURN 'BCP-' || year_part || '-' || LPAD(seq_num::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- Generate DRP number
CREATE OR REPLACE FUNCTION ctdisr.generate_drp_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    year_part VARCHAR(4);
    seq_num INTEGER;
BEGIN
    year_part := TO_CHAR(NOW(), 'YYYY');
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(plan_number FROM 'DRP-\d{4}-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM ctdisr.disaster_recovery_plans
    WHERE plan_number LIKE 'DRP-' || year_part || '-%';
    
    RETURN 'DRP-' || year_part || '-' || LPAD(seq_num::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- Generate DR Test number
CREATE OR REPLACE FUNCTION ctdisr.generate_dr_test_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    year_part VARCHAR(4);
    seq_num INTEGER;
BEGIN
    year_part := TO_CHAR(NOW(), 'YYYY');
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(test_number FROM 'DRT-\d{4}-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM ctdisr.dr_tests
    WHERE test_number LIKE 'DRT-' || year_part || '-%';
    
    RETURN 'DRT-' || year_part || '-' || LPAD(seq_num::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- Generate Failover Event number
CREATE OR REPLACE FUNCTION ctdisr.generate_failover_event_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    year_part VARCHAR(4);
    seq_num INTEGER;
BEGIN
    year_part := TO_CHAR(NOW(), 'YYYY');
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(event_number FROM 'FOE-\d{4}-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM ctdisr.failover_events
    WHERE event_number LIKE 'FOE-' || year_part || '-%';
    
    RETURN 'FOE-' || year_part || '-' || LPAD(seq_num::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- Mark expired backups
CREATE OR REPLACE FUNCTION ctdisr.mark_expired_backups()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE ctdisr.backup_executions
    SET is_expired = TRUE, status = 'expired'
    WHERE expires_at < NOW()
      AND is_expired = FALSE;
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Update timestamps
CREATE TRIGGER update_bcp_timestamp
    BEFORE UPDATE ON ctdisr.business_continuity_plans
    FOR EACH ROW EXECUTE FUNCTION ctdisr.update_timestamp();

CREATE TRIGGER update_drp_timestamp
    BEFORE UPDATE ON ctdisr.disaster_recovery_plans
    FOR EACH ROW EXECUTE FUNCTION ctdisr.update_timestamp();

CREATE TRIGGER update_backup_schedule_timestamp
    BEFORE UPDATE ON ctdisr.backup_schedules
    FOR EACH ROW EXECUTE FUNCTION ctdisr.update_timestamp();

CREATE TRIGGER update_dr_test_timestamp
    BEFORE UPDATE ON ctdisr.dr_tests
    FOR EACH ROW EXECUTE FUNCTION ctdisr.update_timestamp();

CREATE TRIGGER update_failover_timestamp
    BEFORE UPDATE ON ctdisr.failover_events
    FOR EACH ROW EXECUTE FUNCTION ctdisr.update_timestamp();

-- Comments
COMMENT ON TABLE ctdisr.business_continuity_plans IS 'CTDISR-2025 Chapter 8: Business Continuity Plans with RTO/RPO objectives';
COMMENT ON TABLE ctdisr.disaster_recovery_plans IS 'Detailed disaster recovery procedures for critical systems';
COMMENT ON TABLE ctdisr.backup_schedules IS 'Backup schedule configurations with retention policies';
COMMENT ON TABLE ctdisr.backup_executions IS 'Historical backup execution records with verification status';
COMMENT ON TABLE ctdisr.dr_tests IS 'Disaster recovery testing records and results';
COMMENT ON TABLE ctdisr.failover_events IS 'Failover event tracking for planned and unplanned events';
COMMENT ON TABLE ctdisr.recovery_points IS 'Available recovery points for point-in-time recovery';
COMMENT ON TABLE ctdisr.bcp_activations IS 'Business continuity plan activation history';
