-- WANCOM ISP - CTDISR-2025 Logging & SIEM Integration
-- Comprehensive audit logging, monitoring, and SIEM forwarding

-- =====================================================
-- ENHANCED AUDIT LOG
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    log_id VARCHAR(100) UNIQUE NOT NULL, -- Unique identifier for deduplication
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    log_level VARCHAR(20) NOT NULL CHECK (log_level IN ('debug', 'info', 'warn', 'error', 'critical')),
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) NOT NULL CHECK (event_category IN (
        'authentication', 'authorization', 'data_access', 'data_modification',
        'configuration', 'network', 'security', 'system', 'compliance', 'user_activity'
    )),
    domain VARCHAR(50) NOT NULL,
    source_system VARCHAR(100) NOT NULL,
    source_component VARCHAR(100),
    actor_id UUID,
    actor_type VARCHAR(50) CHECK (actor_type IN ('user', 'admin', 'system', 'service', 'api')),
    actor_email VARCHAR(255),
    actor_ip INET,
    actor_user_agent TEXT,
    session_id UUID,
    request_id UUID,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('success', 'failure', 'partial', 'pending')),
    outcome_reason TEXT,
    affected_count INTEGER DEFAULT 0,
    old_values JSONB,
    new_values JSONB,
    metadata JSONB DEFAULT '{}',
    geo_location JSONB, -- {country, region, city, lat, lon}
    risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),
    tags TEXT[],
    correlation_id UUID, -- For linking related events
    parent_event_id UUID REFERENCES ctdisr.audit_log(id),
    hash_chain VARCHAR(128), -- For tamper detection
    forwarded_to_siem BOOLEAN DEFAULT FALSE,
    siem_forwarded_at TIMESTAMPTZ,
    retention_days INTEGER DEFAULT 2555, -- 7 years default for regulatory
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_audit_log_timestamp ON ctdisr.audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_actor ON ctdisr.audit_log(actor_id);
CREATE INDEX idx_audit_log_event_type ON ctdisr.audit_log(event_type);
CREATE INDEX idx_audit_log_category ON ctdisr.audit_log(event_category);
CREATE INDEX idx_audit_log_domain ON ctdisr.audit_log(domain);
CREATE INDEX idx_audit_log_resource ON ctdisr.audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_outcome ON ctdisr.audit_log(outcome);
CREATE INDEX idx_audit_log_correlation ON ctdisr.audit_log(correlation_id);
CREATE INDEX idx_audit_log_siem ON ctdisr.audit_log(forwarded_to_siem) WHERE forwarded_to_siem = FALSE;
CREATE INDEX idx_audit_log_tags ON ctdisr.audit_log USING GIN(tags);

-- =====================================================
-- SIEM FORWARDING QUEUE
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.siem_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_log_id UUID NOT NULL REFERENCES ctdisr.audit_log(id),
    siem_target VARCHAR(50) NOT NULL CHECK (siem_target IN ('splunk', 'elasticsearch', 'sentinel', 'qradar', 'syslog')),
    payload JSONB NOT NULL,
    priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 5,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead_letter')),
    last_error TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_siem_queue_status ON ctdisr.siem_queue(status);
CREATE INDEX idx_siem_queue_scheduled ON ctdisr.siem_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_siem_queue_target ON ctdisr.siem_queue(siem_target);

-- =====================================================
-- REAL-TIME ALERTS
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    event_pattern JSONB NOT NULL, -- Matching criteria
    threshold_count INTEGER DEFAULT 1,
    threshold_window_minutes INTEGER DEFAULT 5,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    alert_channels TEXT[] NOT NULL, -- ['email', 'sms', 'slack', 'pagerduty']
    recipients JSONB NOT NULL, -- {email: [], phone: [], webhook: []}
    is_active BOOLEAN DEFAULT TRUE,
    cooldown_minutes INTEGER DEFAULT 15, -- Prevent alert fatigue
    last_triggered_at TIMESTAMPTZ,
    trigger_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_rules_active ON ctdisr.alert_rules(is_active) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS ctdisr.alert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES ctdisr.alert_rules(id),
    alert_title VARCHAR(255) NOT NULL,
    alert_body TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL,
    triggering_events UUID[] NOT NULL, -- References to audit_log
    channels_notified TEXT[],
    notification_status JSONB DEFAULT '{}', -- Status per channel
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by UUID REFERENCES auth.users(id),
    acknowledged_at TIMESTAMPTZ,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_history_rule ON ctdisr.alert_history(rule_id);
CREATE INDEX idx_alert_history_severity ON ctdisr.alert_history(severity);
CREATE INDEX idx_alert_history_ack ON ctdisr.alert_history(acknowledged) WHERE acknowledged = FALSE;

-- =====================================================
-- LOG AGGREGATION METRICS
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.log_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_window TIMESTAMPTZ NOT NULL, -- 1-minute window start
    event_category VARCHAR(50) NOT NULL,
    domain VARCHAR(50) NOT NULL,
    outcome VARCHAR(20) NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    unique_actors INTEGER DEFAULT 0,
    unique_resources INTEGER DEFAULT 0,
    avg_risk_score DECIMAL(5,2),
    max_risk_score INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(metric_window, event_category, domain, outcome)
);

CREATE INDEX idx_log_metrics_window ON ctdisr.log_metrics(metric_window DESC);

-- =====================================================
-- DATA ACCESS LOG (For sensitive data tracking)
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.data_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accessor_id UUID NOT NULL,
    accessor_type VARCHAR(50) NOT NULL,
    data_classification VARCHAR(50) NOT NULL CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted', 'top_secret')),
    data_category VARCHAR(100) NOT NULL, -- 'pii', 'financial', 'cdr', 'network_config'
    table_name VARCHAR(100),
    record_ids TEXT[],
    fields_accessed TEXT[],
    access_type VARCHAR(20) NOT NULL CHECK (access_type IN ('read', 'write', 'delete', 'export', 'bulk_read')),
    purpose VARCHAR(255),
    access_granted BOOLEAN NOT NULL,
    denial_reason TEXT,
    ip_address INET,
    session_id UUID,
    data_volume_bytes BIGINT,
    record_count INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_access_timestamp ON ctdisr.data_access_log(timestamp DESC);
CREATE INDEX idx_data_access_accessor ON ctdisr.data_access_log(accessor_id);
CREATE INDEX idx_data_access_classification ON ctdisr.data_access_log(data_classification);
CREATE INDEX idx_data_access_denied ON ctdisr.data_access_log(access_granted) WHERE access_granted = FALSE;

-- =====================================================
-- SESSION ACTIVITY LOG
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.session_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    user_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activity_type VARCHAR(50) NOT NULL,
    page_url TEXT,
    action_taken VARCHAR(100),
    time_spent_seconds INTEGER,
    click_count INTEGER,
    scroll_depth_percent INTEGER,
    device_info JSONB,
    ip_address INET,
    geo_location JSONB,
    is_suspicious BOOLEAN DEFAULT FALSE,
    risk_indicators TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_activity_session ON ctdisr.session_activity_log(session_id);
CREATE INDEX idx_session_activity_user ON ctdisr.session_activity_log(user_id);
CREATE INDEX idx_session_activity_timestamp ON ctdisr.session_activity_log(timestamp DESC);
CREATE INDEX idx_session_activity_suspicious ON ctdisr.session_activity_log(is_suspicious) WHERE is_suspicious = TRUE;

-- =====================================================
-- LOG RETENTION POLICIES
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_name VARCHAR(100) UNIQUE NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    retention_days INTEGER NOT NULL,
    archive_before_delete BOOLEAN DEFAULT TRUE,
    archive_destination VARCHAR(255),
    delete_condition TEXT, -- Additional WHERE clause
    is_active BOOLEAN DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    records_archived INTEGER DEFAULT 0,
    records_deleted INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default retention policies (CTDISR-2025 requires 7 years for some data)
INSERT INTO ctdisr.retention_policies (policy_name, table_name, retention_days, archive_before_delete)
VALUES
    ('audit_log_retention', 'ctdisr.audit_log', 2555, TRUE), -- 7 years
    ('siem_queue_retention', 'ctdisr.siem_queue', 30, FALSE),
    ('alert_history_retention', 'ctdisr.alert_history', 365, TRUE),
    ('data_access_retention', 'ctdisr.data_access_log', 2555, TRUE), -- 7 years
    ('session_activity_retention', 'ctdisr.session_activity_log', 180, FALSE)
ON CONFLICT (policy_name) DO NOTHING;

-- =====================================================
-- RLS POLICIES
-- =====================================================

ALTER TABLE ctdisr.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.siem_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.data_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.session_activity_log ENABLE ROW LEVEL SECURITY;

-- Only security and compliance personnel can access logs
CREATE POLICY audit_log_access ON ctdisr.audit_log
    FOR SELECT USING (
        auth.jwt() ->> 'role' IN ('security_admin', 'compliance_officer', 'auditor', 'service_role')
    );

CREATE POLICY data_access_log_view ON ctdisr.data_access_log
    FOR SELECT USING (
        auth.jwt() ->> 'role' IN ('security_admin', 'compliance_officer', 'service_role')
    );

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Generate hash chain for tamper detection
CREATE OR REPLACE FUNCTION ctdisr.generate_log_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
    prev_hash VARCHAR(128);
BEGIN
    -- Get previous hash
    SELECT hash_chain INTO prev_hash
    FROM ctdisr.audit_log
    WHERE created_at < NEW.created_at
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Generate new hash
    NEW.hash_chain := encode(
        sha512(
            (COALESCE(prev_hash, 'genesis') || 
             NEW.log_id || 
             NEW.timestamp::TEXT || 
             NEW.event_type || 
             NEW.actor_id::TEXT || 
             NEW.action || 
             NEW.outcome)::BYTEA
        ),
        'hex'
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_hash_chain
    BEFORE INSERT ON ctdisr.audit_log
    FOR EACH ROW EXECUTE FUNCTION ctdisr.generate_log_hash_chain();

-- Queue log for SIEM forwarding
CREATE OR REPLACE FUNCTION ctdisr.queue_for_siem()
RETURNS TRIGGER AS $$
BEGIN
    -- Queue critical and high-risk events immediately
    IF NEW.log_level IN ('error', 'critical') OR NEW.risk_score >= 70 THEN
        INSERT INTO ctdisr.siem_queue (audit_log_id, siem_target, payload, priority)
        VALUES (
            NEW.id,
            'elasticsearch', -- Default SIEM target
            jsonb_build_object(
                'log_id', NEW.log_id,
                'timestamp', NEW.timestamp,
                'level', NEW.log_level,
                'event_type', NEW.event_type,
                'category', NEW.event_category,
                'domain', NEW.domain,
                'actor', jsonb_build_object(
                    'id', NEW.actor_id,
                    'type', NEW.actor_type,
                    'ip', NEW.actor_ip
                ),
                'action', NEW.action,
                'outcome', NEW.outcome,
                'resource', jsonb_build_object(
                    'type', NEW.resource_type,
                    'id', NEW.resource_id
                ),
                'risk_score', NEW.risk_score,
                'metadata', NEW.metadata
            ),
            CASE 
                WHEN NEW.log_level = 'critical' THEN 1
                WHEN NEW.log_level = 'error' THEN 2
                WHEN NEW.risk_score >= 90 THEN 1
                WHEN NEW.risk_score >= 70 THEN 3
                ELSE 5
            END
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_queue_for_siem
    AFTER INSERT ON ctdisr.audit_log
    FOR EACH ROW EXECUTE FUNCTION ctdisr.queue_for_siem();

-- Aggregate metrics
CREATE OR REPLACE FUNCTION ctdisr.aggregate_log_metrics(p_window TIMESTAMPTZ)
RETURNS VOID AS $$
BEGIN
    INSERT INTO ctdisr.log_metrics (
        metric_window,
        event_category,
        domain,
        outcome,
        count,
        unique_actors,
        unique_resources,
        avg_risk_score,
        max_risk_score
    )
    SELECT
        date_trunc('minute', p_window),
        event_category,
        domain,
        outcome,
        COUNT(*),
        COUNT(DISTINCT actor_id),
        COUNT(DISTINCT resource_id),
        AVG(risk_score),
        MAX(risk_score)
    FROM ctdisr.audit_log
    WHERE timestamp >= p_window
      AND timestamp < p_window + INTERVAL '1 minute'
    GROUP BY event_category, domain, outcome
    ON CONFLICT (metric_window, event_category, domain, outcome)
    DO UPDATE SET
        count = EXCLUDED.count,
        unique_actors = EXCLUDED.unique_actors,
        unique_resources = EXCLUDED.unique_resources,
        avg_risk_score = EXCLUDED.avg_risk_score,
        max_risk_score = EXCLUDED.max_risk_score;
END;
$$ LANGUAGE plpgsql;

-- Get audit log summary
CREATE OR REPLACE FUNCTION ctdisr.get_audit_log_summary(p_hours INTEGER DEFAULT 24)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_events', (
            SELECT COUNT(*) FROM ctdisr.audit_log 
            WHERE timestamp >= NOW() - (p_hours || ' hours')::INTERVAL
        ),
        'events_by_level', (
            SELECT jsonb_object_agg(log_level, cnt)
            FROM (
                SELECT log_level, COUNT(*) as cnt
                FROM ctdisr.audit_log
                WHERE timestamp >= NOW() - (p_hours || ' hours')::INTERVAL
                GROUP BY log_level
            ) t
        ),
        'events_by_category', (
            SELECT jsonb_object_agg(event_category, cnt)
            FROM (
                SELECT event_category, COUNT(*) as cnt
                FROM ctdisr.audit_log
                WHERE timestamp >= NOW() - (p_hours || ' hours')::INTERVAL
                GROUP BY event_category
            ) t
        ),
        'failure_count', (
            SELECT COUNT(*) FROM ctdisr.audit_log
            WHERE timestamp >= NOW() - (p_hours || ' hours')::INTERVAL
              AND outcome = 'failure'
        ),
        'high_risk_events', (
            SELECT COUNT(*) FROM ctdisr.audit_log
            WHERE timestamp >= NOW() - (p_hours || ' hours')::INTERVAL
              AND risk_score >= 70
        ),
        'unique_actors', (
            SELECT COUNT(DISTINCT actor_id) FROM ctdisr.audit_log
            WHERE timestamp >= NOW() - (p_hours || ' hours')::INTERVAL
        ),
        'pending_siem_queue', (
            SELECT COUNT(*) FROM ctdisr.siem_queue WHERE status = 'pending'
        ),
        'unacknowledged_alerts', (
            SELECT COUNT(*) FROM ctdisr.alert_history WHERE acknowledged = FALSE
        ),
        'generated_at', NOW()
    ) INTO v_result;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Search audit logs
CREATE OR REPLACE FUNCTION ctdisr.search_audit_logs(
    p_start_time TIMESTAMPTZ DEFAULT NOW() - INTERVAL '24 hours',
    p_end_time TIMESTAMPTZ DEFAULT NOW(),
    p_event_types TEXT[] DEFAULT NULL,
    p_categories TEXT[] DEFAULT NULL,
    p_actors UUID[] DEFAULT NULL,
    p_outcomes TEXT[] DEFAULT NULL,
    p_min_risk_score INTEGER DEFAULT NULL,
    p_search_text TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    log_id VARCHAR(100),
    timestamp TIMESTAMPTZ,
    log_level VARCHAR(20),
    event_type VARCHAR(100),
    event_category VARCHAR(50),
    actor_id UUID,
    actor_email VARCHAR(255),
    action VARCHAR(100),
    outcome VARCHAR(20),
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    risk_score INTEGER,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        al.id,
        al.log_id,
        al.timestamp,
        al.log_level,
        al.event_type,
        al.event_category,
        al.actor_id,
        al.actor_email,
        al.action,
        al.outcome,
        al.resource_type,
        al.resource_id,
        al.risk_score,
        al.metadata
    FROM ctdisr.audit_log al
    WHERE al.timestamp >= p_start_time
      AND al.timestamp <= p_end_time
      AND (p_event_types IS NULL OR al.event_type = ANY(p_event_types))
      AND (p_categories IS NULL OR al.event_category = ANY(p_categories))
      AND (p_actors IS NULL OR al.actor_id = ANY(p_actors))
      AND (p_outcomes IS NULL OR al.outcome = ANY(p_outcomes))
      AND (p_min_risk_score IS NULL OR al.risk_score >= p_min_risk_score)
      AND (p_search_text IS NULL OR 
           al.event_type ILIKE '%' || p_search_text || '%' OR
           al.action ILIKE '%' || p_search_text || '%' OR
           al.resource_id ILIKE '%' || p_search_text || '%')
    ORDER BY al.timestamp DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE ctdisr.audit_log IS 'CTDISR-2025 comprehensive audit log with hash chain tamper detection';
COMMENT ON TABLE ctdisr.siem_queue IS 'Queue for forwarding logs to SIEM systems';
COMMENT ON TABLE ctdisr.data_access_log IS 'Track all access to sensitive data per CTDISR-2025';
