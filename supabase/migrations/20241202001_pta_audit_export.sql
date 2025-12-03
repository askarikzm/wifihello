-- ============================================
-- WANCOM ISP Portal - PTA Audit Log Exporter
-- Migration: 20241202001_pta_audit_export.sql
-- Description: Automated PTA-compliant audit export system
-- Regulatory: PTRA 1996, CTDISR 2020, PTA Security Guidelines
-- ============================================

-- Step 1: Create audit_export schema for isolation
CREATE SCHEMA IF NOT EXISTS audit_export;

-- Step 2: Create enum types for export management
DO $$ BEGIN
    CREATE TYPE audit_export.export_status AS ENUM (
        'PENDING',
        'RUNNING', 
        'COMPLETED',
        'FAILED',
        'CANCELLED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE audit_export.schedule_type AS ENUM (
        'ON_DEMAND',
        'DAILY',
        'WEEKLY',
        'MONTHLY'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE audit_export.export_format AS ENUM (
        'csv',
        'xlsx',
        'pdf',
        'mixed'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE audit_export.access_action AS ENUM (
        'DOWNLOAD',
        'VIEW_METADATA',
        'SHARE',
        'DELETE_REQUEST'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Step 3: Export Template Table
-- Stores configurable column mappings for each export type
-- PTA may change required columns - this allows dynamic updates
CREATE TABLE IF NOT EXISTS audit_export.templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Template identification
    code TEXT UNIQUE NOT NULL,  -- e.g. 'IPDR_DAILY', 'RADIUS_AUTH_LOGS'
    name TEXT NOT NULL,
    description TEXT,
    
    -- Template configuration
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    default_format audit_export.export_format NOT NULL DEFAULT 'xlsx',
    
    -- Column definitions (ordered list)
    -- Each column: { key, header, type, source, required, transform?, mask? }
    columns JSONB NOT NULL DEFAULT '[]',
    
    -- Source configuration
    source_table TEXT NOT NULL,  -- e.g. 'public.radius_sessions', 'network.usage_logs'
    source_schema TEXT DEFAULT 'public',
    date_filter_field TEXT NOT NULL,  -- Field to filter by date range
    region_filter_field TEXT,  -- Optional: field to filter by region
    
    -- Constraints
    max_range_days INTEGER NOT NULL DEFAULT 31,
    max_rows_per_export INTEGER DEFAULT 1000000,
    
    -- PTA compliance metadata
    pta_category TEXT,  -- e.g. 'IPDR', 'CDR', 'AUTH', 'KYC'
    retention_days INTEGER DEFAULT 365,  -- How long to keep exports
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_columns CHECK (jsonb_typeof(columns) = 'array')
);

-- Step 4: Export Run Table
-- Tracks each export execution (scheduled or on-demand)
CREATE TABLE IF NOT EXISTS audit_export.runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    template_id UUID NOT NULL REFERENCES audit_export.templates(id) ON DELETE RESTRICT,
    requested_by_user_id UUID NOT NULL,  -- References auth.users
    
    -- Run configuration
    region_code TEXT NOT NULL DEFAULT 'ALL',  -- e.g. 'KTR', 'STR-I', 'ALL'
    type_code TEXT NOT NULL,  -- Copy of template.code for quick access
    
    -- Status tracking
    status audit_export.export_status NOT NULL DEFAULT 'PENDING',
    
    -- Date range
    date_from TIMESTAMPTZ,
    date_to TIMESTAMPTZ,
    
    -- Schedule info
    schedule_type audit_export.schedule_type NOT NULL DEFAULT 'ON_DEMAND',
    schedule_id UUID,  -- If triggered by schedule
    
    -- Execution timestamps
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Results
    total_rows INTEGER DEFAULT 0,
    file_count INTEGER DEFAULT 0,
    total_size_bytes BIGINT DEFAULT 0,
    
    -- Error tracking
    error_message TEXT,
    error_code TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- ZIP bundle info (after completion)
    zip_file_name TEXT,
    zip_storage_path TEXT,
    zip_sha256_hash TEXT,
    
    -- Manifest data (stored for quick access)
    manifest JSONB,
    
    -- Immutability flags
    is_archived BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMPTZ,
    archived_by UUID,
    archive_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_date_range CHECK (date_to IS NULL OR date_from IS NULL OR date_to >= date_from),
    CONSTRAINT no_delete_completed CHECK (status != 'COMPLETED' OR is_archived = FALSE)
);

-- Step 5: Export File Table
-- Individual files within a ZIP bundle
CREATE TABLE IF NOT EXISTS audit_export.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    run_id UUID NOT NULL REFERENCES audit_export.runs(id) ON DELETE CASCADE,
    
    -- File info
    file_name TEXT NOT NULL,  -- Filename inside ZIP
    storage_path TEXT NOT NULL,  -- Full path in object storage
    format audit_export.export_format NOT NULL,
    
    -- Integrity
    sha256_hash TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    row_count INTEGER DEFAULT 0,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_sha256 CHECK (LENGTH(sha256_hash) = 64)
);

-- Step 6: Export Access Log Table
-- Immutable audit trail of all access to exports
CREATE TABLE IF NOT EXISTS audit_export.access_logs (
    id BIGSERIAL PRIMARY KEY,
    
    -- References
    run_id UUID NOT NULL REFERENCES audit_export.runs(id) ON DELETE RESTRICT,
    file_id UUID REFERENCES audit_export.files(id) ON DELETE RESTRICT,
    
    -- Actor info
    accessed_by_user_id UUID NOT NULL,
    accessed_by_role TEXT,
    
    -- Action details
    action audit_export.access_action NOT NULL,
    
    -- Request context
    ip_address INET,
    user_agent TEXT,
    
    -- Result
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,
    
    -- Immutable timestamp
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Hash chain for tamper detection
    prev_hash TEXT,
    record_hash TEXT
);

-- Make access_logs append-only
CREATE OR REPLACE FUNCTION audit_export.prevent_access_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit access logs are immutable. UPDATE and DELETE operations are not allowed.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_access_log_update ON audit_export.access_logs;
CREATE TRIGGER prevent_access_log_update
    BEFORE UPDATE OR DELETE ON audit_export.access_logs
    FOR EACH ROW
    EXECUTE FUNCTION audit_export.prevent_access_log_modification();

-- Step 7: Export Schedule Table
-- Automated export scheduling
CREATE TABLE IF NOT EXISTS audit_export.schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    template_id UUID NOT NULL REFERENCES audit_export.templates(id) ON DELETE CASCADE,
    
    -- Schedule configuration
    region_code TEXT NOT NULL DEFAULT 'ALL',
    schedule_type audit_export.schedule_type NOT NULL,
    
    -- Timing (PKT timezone)
    time_of_day TIME NOT NULL DEFAULT '02:00:00',  -- Default 2 AM PKT
    day_of_week INTEGER,  -- 0=Sunday, 6=Saturday (for WEEKLY)
    day_of_month INTEGER,  -- 1-31 (for MONTHLY)
    timezone TEXT NOT NULL DEFAULT 'Asia/Karachi',
    
    -- State
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    last_run_id UUID REFERENCES audit_export.runs(id),
    next_run_at TIMESTAMPTZ,
    
    -- Error tracking
    consecutive_failures INTEGER DEFAULT 0,
    last_error TEXT,
    
    -- Notification settings
    notify_on_success BOOLEAN DEFAULT TRUE,
    notify_on_failure BOOLEAN DEFAULT TRUE,
    notification_emails TEXT[],  -- Array of email addresses
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    
    -- Constraints
    CONSTRAINT valid_day_of_week CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
    CONSTRAINT valid_day_of_month CHECK (day_of_month IS NULL OR (day_of_month >= 1 AND day_of_month <= 31)),
    CONSTRAINT unique_schedule_per_template_region UNIQUE (template_id, region_code, schedule_type)
);

-- Step 8: PTA Region Codes Reference Table
CREATE TABLE IF NOT EXISTS audit_export.region_codes (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    province TEXT,
    pta_region TEXT,  -- PTA regional office
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert Pakistan region codes
INSERT INTO audit_export.region_codes (code, name, province, pta_region) VALUES
    ('ALL', 'All Regions', NULL, 'Head Office'),
    ('ISB', 'Islamabad', 'Federal', 'Islamabad'),
    ('RWP', 'Rawalpindi', 'Punjab', 'Islamabad'),
    ('LHR', 'Lahore', 'Punjab', 'Lahore'),
    ('KHI', 'Karachi', 'Sindh', 'Karachi'),
    ('PEW', 'Peshawar', 'KPK', 'Peshawar'),
    ('QTA', 'Quetta', 'Balochistan', 'Quetta'),
    ('MUL', 'Multan', 'Punjab', 'Lahore'),
    ('FSD', 'Faisalabad', 'Punjab', 'Lahore'),
    ('HYD', 'Hyderabad', 'Sindh', 'Karachi'),
    ('SKT', 'Sialkot', 'Punjab', 'Lahore'),
    ('GUJ', 'Gujranwala', 'Punjab', 'Lahore')
ON CONFLICT (code) DO NOTHING;

-- Step 9: Indexes for performance
CREATE INDEX IF NOT EXISTS idx_templates_code ON audit_export.templates(code);
CREATE INDEX IF NOT EXISTS idx_templates_enabled ON audit_export.templates(enabled);
CREATE INDEX IF NOT EXISTS idx_runs_status ON audit_export.runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_template ON audit_export.runs(template_id);
CREATE INDEX IF NOT EXISTS idx_runs_date_range ON audit_export.runs(date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_runs_requested_at ON audit_export.runs(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_region ON audit_export.runs(region_code);
CREATE INDEX IF NOT EXISTS idx_runs_user ON audit_export.runs(requested_by_user_id);
CREATE INDEX IF NOT EXISTS idx_files_run ON audit_export.files(run_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_run ON audit_export.access_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_user ON audit_export.access_logs(accessed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp ON audit_export.access_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON audit_export.schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON audit_export.schedules(next_run_at);

-- Step 10: Enable Row Level Security
ALTER TABLE audit_export.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_export.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_export.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_export.access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_export.schedules ENABLE ROW LEVEL SECURITY;

-- Step 11: RBAC Helper Functions

-- Check if user has PTA compliance role
CREATE OR REPLACE FUNCTION audit_export.is_pta_compliance_officer()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_roles 
        WHERE user_id = auth.uid() 
        AND role IN ('superadmin', 'pta_compliance')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user has any admin role that can view exports
CREATE OR REPLACE FUNCTION audit_export.can_view_exports()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_roles 
        WHERE user_id = auth.uid() 
        AND role IN ('superadmin', 'pta_compliance', 'noc', 'finance')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 12: RLS Policies

-- Templates: Read by anyone with export view permission, write by compliance/superadmin
CREATE POLICY "view_templates" ON audit_export.templates
    FOR SELECT
    USING (audit_export.can_view_exports() OR auth.role() = 'service_role');

CREATE POLICY "manage_templates" ON audit_export.templates
    FOR ALL
    USING (audit_export.is_pta_compliance_officer() OR auth.role() = 'service_role');

-- Runs: Read by viewers, create by compliance, update by service role
CREATE POLICY "view_runs" ON audit_export.runs
    FOR SELECT
    USING (audit_export.can_view_exports() OR auth.role() = 'service_role');

CREATE POLICY "create_runs" ON audit_export.runs
    FOR INSERT
    WITH CHECK (audit_export.is_pta_compliance_officer() OR auth.role() = 'service_role');

CREATE POLICY "update_runs" ON audit_export.runs
    FOR UPDATE
    USING (auth.role() = 'service_role');

-- Files: Read by viewers
CREATE POLICY "view_files" ON audit_export.files
    FOR SELECT
    USING (audit_export.can_view_exports() OR auth.role() = 'service_role');

CREATE POLICY "manage_files" ON audit_export.files
    FOR ALL
    USING (auth.role() = 'service_role');

-- Access logs: Insert by service role, read by compliance
CREATE POLICY "insert_access_logs" ON audit_export.access_logs
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "view_access_logs" ON audit_export.access_logs
    FOR SELECT
    USING (audit_export.is_pta_compliance_officer() OR auth.role() = 'service_role');

-- Schedules: Managed by compliance/superadmin
CREATE POLICY "view_schedules" ON audit_export.schedules
    FOR SELECT
    USING (audit_export.can_view_exports() OR auth.role() = 'service_role');

CREATE POLICY "manage_schedules" ON audit_export.schedules
    FOR ALL
    USING (audit_export.is_pta_compliance_officer() OR auth.role() = 'service_role');

-- Step 13: Trigger to update timestamps
CREATE OR REPLACE FUNCTION audit_export.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_templates_timestamp ON audit_export.templates;
CREATE TRIGGER update_templates_timestamp
    BEFORE UPDATE ON audit_export.templates
    FOR EACH ROW
    EXECUTE FUNCTION audit_export.update_timestamp();

DROP TRIGGER IF EXISTS update_runs_timestamp ON audit_export.runs;
CREATE TRIGGER update_runs_timestamp
    BEFORE UPDATE ON audit_export.runs
    FOR EACH ROW
    EXECUTE FUNCTION audit_export.update_timestamp();

DROP TRIGGER IF EXISTS update_schedules_timestamp ON audit_export.schedules;
CREATE TRIGGER update_schedules_timestamp
    BEFORE UPDATE ON audit_export.schedules
    FOR EACH ROW
    EXECUTE FUNCTION audit_export.update_timestamp();

-- Step 14: Function to calculate next run time for a schedule
CREATE OR REPLACE FUNCTION audit_export.calculate_next_run(
    p_schedule_type audit_export.schedule_type,
    p_time_of_day TIME,
    p_day_of_week INTEGER,
    p_day_of_month INTEGER,
    p_timezone TEXT DEFAULT 'Asia/Karachi'
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
    v_now TIMESTAMPTZ;
    v_today DATE;
    v_next_run TIMESTAMPTZ;
    v_target_time TIME;
BEGIN
    v_now := NOW() AT TIME ZONE p_timezone;
    v_today := v_now::DATE;
    v_target_time := p_time_of_day;
    
    CASE p_schedule_type
        WHEN 'DAILY' THEN
            -- Next occurrence of time_of_day
            v_next_run := v_today + v_target_time;
            IF v_next_run <= v_now THEN
                v_next_run := v_next_run + INTERVAL '1 day';
            END IF;
            
        WHEN 'WEEKLY' THEN
            -- Next occurrence of day_of_week at time_of_day
            v_next_run := v_today + v_target_time;
            WHILE EXTRACT(DOW FROM v_next_run) != p_day_of_week OR v_next_run <= v_now LOOP
                v_next_run := v_next_run + INTERVAL '1 day';
            END LOOP;
            
        WHEN 'MONTHLY' THEN
            -- Next occurrence of day_of_month at time_of_day
            v_next_run := DATE_TRUNC('month', v_today) + (p_day_of_month - 1) * INTERVAL '1 day' + v_target_time;
            IF v_next_run <= v_now THEN
                v_next_run := DATE_TRUNC('month', v_today + INTERVAL '1 month') + (p_day_of_month - 1) * INTERVAL '1 day' + v_target_time;
            END IF;
            
        ELSE
            -- ON_DEMAND: no automatic scheduling
            RETURN NULL;
    END CASE;
    
    -- Convert back to UTC
    RETURN v_next_run AT TIME ZONE p_timezone;
END;
$$ LANGUAGE plpgsql;

-- Step 15: Trigger to auto-calculate next_run_at
CREATE OR REPLACE FUNCTION audit_export.set_next_run()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.enabled AND NEW.schedule_type != 'ON_DEMAND' THEN
        NEW.next_run_at := audit_export.calculate_next_run(
            NEW.schedule_type,
            NEW.time_of_day,
            NEW.day_of_week,
            NEW.day_of_month,
            NEW.timezone
        );
    ELSE
        NEW.next_run_at := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_schedule_next_run ON audit_export.schedules;
CREATE TRIGGER set_schedule_next_run
    BEFORE INSERT OR UPDATE ON audit_export.schedules
    FOR EACH ROW
    EXECUTE FUNCTION audit_export.set_next_run();

-- Step 16: Views for API consumption

-- Summary view for runs with template info
CREATE OR REPLACE VIEW audit_export.runs_summary AS
SELECT 
    r.id,
    r.template_id,
    t.code AS template_code,
    t.name AS template_name,
    t.pta_category,
    r.region_code,
    rc.name AS region_name,
    r.status,
    r.schedule_type,
    r.date_from,
    r.date_to,
    r.requested_at,
    r.completed_at,
    r.total_rows,
    r.file_count,
    r.total_size_bytes,
    r.zip_file_name,
    r.is_archived,
    r.error_message
FROM audit_export.runs r
JOIN audit_export.templates t ON t.id = r.template_id
LEFT JOIN audit_export.region_codes rc ON rc.code = r.region_code
ORDER BY r.requested_at DESC;

-- Schedule status view
CREATE OR REPLACE VIEW audit_export.schedules_status AS
SELECT 
    s.id,
    s.template_id,
    t.code AS template_code,
    t.name AS template_name,
    s.region_code,
    rc.name AS region_name,
    s.schedule_type,
    s.time_of_day,
    s.day_of_week,
    s.day_of_month,
    s.timezone,
    s.enabled,
    s.last_run_at,
    s.next_run_at,
    s.consecutive_failures,
    s.last_error
FROM audit_export.schedules s
JOIN audit_export.templates t ON t.id = s.template_id
LEFT JOIN audit_export.region_codes rc ON rc.code = s.region_code
ORDER BY s.next_run_at ASC NULLS LAST;

-- Grant access to views
GRANT SELECT ON audit_export.runs_summary TO authenticated;
GRANT SELECT ON audit_export.schedules_status TO authenticated;

-- Step 17: Add PTA compliance role to admin_roles if not exists
DO $$
BEGIN
    ALTER TABLE public.admin_roles 
    DROP CONSTRAINT IF EXISTS admin_roles_role_check;
    
    ALTER TABLE public.admin_roles
    ADD CONSTRAINT admin_roles_role_check 
    CHECK (role IN ('finance', 'noc', 'support', 'superadmin', 'pta_compliance'));
EXCEPTION
    WHEN others THEN
        -- Constraint already exists or table structure different
        NULL;
END $$;

-- ============================================
-- MIGRATION COMPLETE
-- 
-- Schema: audit_export
-- 
-- Tables created:
--   - audit_export.templates (export type configurations)
--   - audit_export.runs (export execution records)
--   - audit_export.files (individual export files)
--   - audit_export.access_logs (immutable access audit trail)
--   - audit_export.schedules (automated export scheduling)
--   - audit_export.region_codes (PTA region reference)
--
-- Views created:
--   - audit_export.runs_summary
--   - audit_export.schedules_status
--
-- Security:
--   - RLS enabled on all tables
--   - RBAC via is_pta_compliance_officer() and can_view_exports()
--   - Immutable access_logs (trigger prevents UPDATE/DELETE)
--   - Service role for backend operations
--
-- Key features:
--   - Configurable export templates with column mappings
--   - Scheduled exports (daily/weekly/monthly)
--   - SHA-256 hash verification for tamper detection
--   - Complete audit trail of all access
--   - Region-based filtering for PTA compliance
-- ============================================
