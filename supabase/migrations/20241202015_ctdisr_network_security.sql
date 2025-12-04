-- NetAxis ISP - CTDISR-2025 Network Security Architecture
-- Firewall rules, network zones, IDS/IPS, DDoS protection

-- =====================================================
-- NETWORK ZONES
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.network_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_name VARCHAR(100) UNIQUE NOT NULL,
    zone_type VARCHAR(50) NOT NULL CHECK (zone_type IN ('dmz', 'internal', 'external', 'management', 'restricted', 'guest')),
    description TEXT,
    cidr_blocks CIDR[] NOT NULL,
    vlan_ids INTEGER[],
    security_level INTEGER NOT NULL CHECK (security_level >= 1 AND security_level <= 10),
    parent_zone_id UUID REFERENCES ctdisr.network_zones(id),
    allowed_protocols TEXT[] DEFAULT ARRAY['tcp', 'udp', 'icmp'],
    default_policy VARCHAR(20) NOT NULL DEFAULT 'deny' CHECK (default_policy IN ('allow', 'deny')),
    isolation_enabled BOOLEAN DEFAULT TRUE,
    monitoring_enabled BOOLEAN DEFAULT TRUE,
    zone_metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_network_zones_type ON ctdisr.network_zones(zone_type);
CREATE INDEX idx_network_zones_level ON ctdisr.network_zones(security_level);

-- =====================================================
-- FIREWALL RULES
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.firewall_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name VARCHAR(100) NOT NULL,
    rule_number INTEGER NOT NULL,
    description TEXT,
    source_zone_id UUID REFERENCES ctdisr.network_zones(id),
    source_addresses CIDR[],
    source_ports INT4RANGE[],
    destination_zone_id UUID REFERENCES ctdisr.network_zones(id),
    destination_addresses CIDR[],
    destination_ports INT4RANGE[],
    protocols TEXT[] NOT NULL DEFAULT ARRAY['tcp'],
    action VARCHAR(20) NOT NULL CHECK (action IN ('allow', 'deny', 'drop', 'reject', 'log')),
    log_enabled BOOLEAN DEFAULT TRUE,
    rate_limit INTEGER, -- Packets per second
    schedule_start TIME,
    schedule_end TIME,
    schedule_days INTEGER[], -- 0=Sunday, 6=Saturday
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    hit_count BIGINT DEFAULT 0,
    last_hit_at TIMESTAMPTZ,
    change_ticket VARCHAR(50), -- Change management reference
    approved_by UUID REFERENCES auth.users(id),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_firewall_rules_number ON ctdisr.firewall_rules(rule_number);
CREATE INDEX idx_firewall_rules_source ON ctdisr.firewall_rules(source_zone_id);
CREATE INDEX idx_firewall_rules_dest ON ctdisr.firewall_rules(destination_zone_id);
CREATE INDEX idx_firewall_rules_action ON ctdisr.firewall_rules(action);

-- Firewall rule change history
CREATE TABLE IF NOT EXISTS ctdisr.firewall_rule_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES ctdisr.firewall_rules(id),
    change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('create', 'update', 'delete', 'enable', 'disable')),
    old_values JSONB,
    new_values JSONB,
    change_reason TEXT NOT NULL,
    change_ticket VARCHAR(50),
    changed_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_firewall_history_rule ON ctdisr.firewall_rule_history(rule_id);

-- =====================================================
-- INTRUSION DETECTION/PREVENTION
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.ids_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signature_id VARCHAR(50) UNIQUE NOT NULL,
    signature_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    description TEXT,
    pattern TEXT,
    protocol VARCHAR(20),
    source_port_range INT4RANGE,
    destination_port_range INT4RANGE,
    action VARCHAR(20) NOT NULL DEFAULT 'alert' CHECK (action IN ('alert', 'block', 'drop', 'reset')),
    cve_ids TEXT[],
    references TEXT[],
    is_enabled BOOLEAN DEFAULT TRUE,
    false_positive_rate DECIMAL(5,2),
    last_updated TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ids_signatures_category ON ctdisr.ids_signatures(category);
CREATE INDEX idx_ids_signatures_severity ON ctdisr.ids_signatures(severity);

CREATE TABLE IF NOT EXISTS ctdisr.ids_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    signature_id UUID REFERENCES ctdisr.ids_signatures(id),
    sensor_id VARCHAR(100) NOT NULL,
    source_ip INET NOT NULL,
    source_port INTEGER,
    destination_ip INET NOT NULL,
    destination_port INTEGER,
    protocol VARCHAR(20),
    severity VARCHAR(20) NOT NULL,
    action_taken VARCHAR(20) NOT NULL,
    packet_payload BYTEA,
    raw_event TEXT,
    geo_source JSONB,
    geo_destination JSONB,
    is_investigated BOOLEAN DEFAULT FALSE,
    investigated_by UUID REFERENCES auth.users(id),
    investigation_notes TEXT,
    false_positive BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ids_events_timestamp ON ctdisr.ids_events(event_timestamp DESC);
CREATE INDEX idx_ids_events_signature ON ctdisr.ids_events(signature_id);
CREATE INDEX idx_ids_events_source ON ctdisr.ids_events(source_ip);
CREATE INDEX idx_ids_events_severity ON ctdisr.ids_events(severity);
CREATE INDEX idx_ids_events_uninvestigated ON ctdisr.ids_events(is_investigated) WHERE is_investigated = FALSE;

-- =====================================================
-- DDOS PROTECTION
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.ddos_protection_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    protected_resources TEXT[] NOT NULL, -- CIDRs or domain names
    protection_mode VARCHAR(20) NOT NULL DEFAULT 'detect' CHECK (protection_mode IN ('detect', 'mitigate', 'aggressive')),
    threshold_pps BIGINT DEFAULT 100000, -- Packets per second
    threshold_bps BIGINT DEFAULT 1000000000, -- Bits per second (1 Gbps)
    threshold_cps INTEGER DEFAULT 10000, -- Connections per second
    syn_flood_protection BOOLEAN DEFAULT TRUE,
    udp_flood_protection BOOLEAN DEFAULT TRUE,
    icmp_flood_protection BOOLEAN DEFAULT TRUE,
    dns_amplification_protection BOOLEAN DEFAULT TRUE,
    ntp_amplification_protection BOOLEAN DEFAULT TRUE,
    slowloris_protection BOOLEAN DEFAULT TRUE,
    auto_blacklist BOOLEAN DEFAULT TRUE,
    blacklist_duration_minutes INTEGER DEFAULT 60,
    whitelist CIDR[],
    notification_emails TEXT[],
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ctdisr.ddos_attacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attack_start TIMESTAMPTZ NOT NULL,
    attack_end TIMESTAMPTZ,
    attack_type VARCHAR(50) NOT NULL,
    target_resource TEXT NOT NULL,
    peak_pps BIGINT,
    peak_bps BIGINT,
    total_packets BIGINT,
    total_bytes BIGINT,
    source_count INTEGER,
    top_sources JSONB, -- [{ip, country, packets, bytes}]
    attack_vectors JSONB,
    mitigation_actions JSONB,
    protection_profile_id UUID REFERENCES ctdisr.ddos_protection_profiles(id),
    status VARCHAR(20) NOT NULL DEFAULT 'ongoing' CHECK (status IN ('ongoing', 'mitigated', 'ended')),
    impact_assessment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ddos_attacks_start ON ctdisr.ddos_attacks(attack_start DESC);
CREATE INDEX idx_ddos_attacks_status ON ctdisr.ddos_attacks(status);

CREATE TABLE IF NOT EXISTS ctdisr.ddos_blacklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address INET NOT NULL,
    reason TEXT NOT NULL,
    attack_id UUID REFERENCES ctdisr.ddos_attacks(id),
    blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_permanent BOOLEAN DEFAULT FALSE,
    auto_blocked BOOLEAN DEFAULT TRUE,
    blocked_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ddos_blacklist_ip ON ctdisr.ddos_blacklist(ip_address);
CREATE INDEX idx_ddos_blacklist_expires ON ctdisr.ddos_blacklist(expires_at) WHERE is_permanent = FALSE;

-- =====================================================
-- VPN CONNECTIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.vpn_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_name VARCHAR(100) UNIQUE NOT NULL,
    vpn_type VARCHAR(30) NOT NULL CHECK (vpn_type IN ('ipsec', 'openvpn', 'wireguard', 'ssl_vpn')),
    description TEXT,
    server_endpoint VARCHAR(255) NOT NULL,
    allowed_networks CIDR[] NOT NULL,
    encryption_algorithm VARCHAR(50) NOT NULL,
    authentication_method VARCHAR(50) NOT NULL,
    key_exchange_method VARCHAR(50),
    dh_group VARCHAR(20),
    pfs_enabled BOOLEAN DEFAULT TRUE,
    mfa_required BOOLEAN DEFAULT TRUE,
    idle_timeout_minutes INTEGER DEFAULT 30,
    max_session_hours INTEGER DEFAULT 8,
    split_tunneling BOOLEAN DEFAULT FALSE,
    allowed_roles TEXT[],
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ctdisr.vpn_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES ctdisr.vpn_profiles(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    session_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_end TIMESTAMPTZ,
    client_ip INET NOT NULL,
    assigned_ip INET,
    client_device VARCHAR(255),
    client_os VARCHAR(100),
    bytes_in BIGINT DEFAULT 0,
    bytes_out BIGINT DEFAULT 0,
    packets_in BIGINT DEFAULT 0,
    packets_out BIGINT DEFAULT 0,
    disconnect_reason VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vpn_sessions_user ON ctdisr.vpn_sessions(user_id);
CREATE INDEX idx_vpn_sessions_profile ON ctdisr.vpn_sessions(profile_id);
CREATE INDEX idx_vpn_sessions_active ON ctdisr.vpn_sessions(is_active) WHERE is_active = TRUE;

-- =====================================================
-- NETWORK TRAFFIC ANALYSIS
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.network_flow_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_timestamp TIMESTAMPTZ NOT NULL,
    source_ip INET NOT NULL,
    source_port INTEGER,
    destination_ip INET NOT NULL,
    destination_port INTEGER,
    protocol VARCHAR(20) NOT NULL,
    packets BIGINT NOT NULL,
    bytes BIGINT NOT NULL,
    tcp_flags INTEGER,
    flow_direction VARCHAR(10) CHECK (flow_direction IN ('inbound', 'outbound', 'internal')),
    zone_pair VARCHAR(100),
    application VARCHAR(100),
    is_encrypted BOOLEAN,
    threat_score INTEGER CHECK (threat_score >= 0 AND threat_score <= 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partition by month for performance
CREATE INDEX idx_network_flow_timestamp ON ctdisr.network_flow_logs(flow_timestamp DESC);
CREATE INDEX idx_network_flow_source ON ctdisr.network_flow_logs(source_ip);
CREATE INDEX idx_network_flow_dest ON ctdisr.network_flow_logs(destination_ip);
CREATE INDEX idx_network_flow_threat ON ctdisr.network_flow_logs(threat_score) WHERE threat_score >= 50;

-- =====================================================
-- RLS POLICIES
-- =====================================================

ALTER TABLE ctdisr.network_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.firewall_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.firewall_rule_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.ids_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.ids_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.ddos_protection_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.ddos_attacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.vpn_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.vpn_sessions ENABLE ROW LEVEL SECURITY;

-- Network security policies
CREATE POLICY network_admin_policy ON ctdisr.network_zones
    FOR ALL USING (
        auth.jwt() ->> 'role' IN ('network_admin', 'security_admin', 'service_role')
    );

CREATE POLICY firewall_admin_policy ON ctdisr.firewall_rules
    FOR ALL USING (
        auth.jwt() ->> 'role' IN ('network_admin', 'security_admin', 'service_role')
    );

CREATE POLICY ids_view_policy ON ctdisr.ids_events
    FOR SELECT USING (
        auth.jwt() ->> 'role' IN ('network_admin', 'security_admin', 'soc_analyst', 'service_role')
    );

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Check if IP is in zone
CREATE OR REPLACE FUNCTION ctdisr.ip_in_zone(p_ip INET, p_zone_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_cidr CIDR;
    v_cidrs CIDR[];
BEGIN
    SELECT cidr_blocks INTO v_cidrs
    FROM ctdisr.network_zones
    WHERE id = p_zone_id AND is_active = TRUE;
    
    IF v_cidrs IS NULL THEN
        RETURN FALSE;
    END IF;
    
    FOREACH v_cidr IN ARRAY v_cidrs LOOP
        IF p_ip << v_cidr THEN
            RETURN TRUE;
        END IF;
    END LOOP;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Get network security summary
CREATE OR REPLACE FUNCTION ctdisr.get_network_security_summary()
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'active_zones', (SELECT COUNT(*) FROM ctdisr.network_zones WHERE is_active = TRUE),
        'active_firewall_rules', (SELECT COUNT(*) FROM ctdisr.firewall_rules WHERE is_active = TRUE),
        'ids_events_24h', (SELECT COUNT(*) FROM ctdisr.ids_events WHERE event_timestamp >= NOW() - INTERVAL '24 hours'),
        'critical_ids_events', (SELECT COUNT(*) FROM ctdisr.ids_events WHERE event_timestamp >= NOW() - INTERVAL '24 hours' AND severity IN ('high', 'critical')),
        'uninvestigated_ids_events', (SELECT COUNT(*) FROM ctdisr.ids_events WHERE is_investigated = FALSE),
        'active_ddos_attacks', (SELECT COUNT(*) FROM ctdisr.ddos_attacks WHERE status = 'ongoing'),
        'ddos_attacks_24h', (SELECT COUNT(*) FROM ctdisr.ddos_attacks WHERE attack_start >= NOW() - INTERVAL '24 hours'),
        'active_vpn_sessions', (SELECT COUNT(*) FROM ctdisr.vpn_sessions WHERE is_active = TRUE),
        'blacklisted_ips', (SELECT COUNT(*) FROM ctdisr.ddos_blacklist WHERE expires_at IS NULL OR expires_at > NOW()),
        'generated_at', NOW()
    ) INTO v_result;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get top threat sources
CREATE OR REPLACE FUNCTION ctdisr.get_top_threat_sources(p_hours INTEGER DEFAULT 24, p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
    source_ip INET,
    event_count BIGINT,
    severity_breakdown JSONB,
    first_seen TIMESTAMPTZ,
    last_seen TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ie.source_ip,
        COUNT(*) as event_count,
        jsonb_object_agg(ie.severity, cnt) as severity_breakdown,
        MIN(ie.event_timestamp) as first_seen,
        MAX(ie.event_timestamp) as last_seen
    FROM ctdisr.ids_events ie
    CROSS JOIN LATERAL (
        SELECT ie.severity, COUNT(*) as cnt
        FROM ctdisr.ids_events ie2
        WHERE ie2.source_ip = ie.source_ip
          AND ie2.event_timestamp >= NOW() - (p_hours || ' hours')::INTERVAL
        GROUP BY ie2.severity
    ) s
    WHERE ie.event_timestamp >= NOW() - (p_hours || ' hours')::INTERVAL
    GROUP BY ie.source_ip
    ORDER BY event_count DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE ctdisr.network_zones IS 'CTDISR-2025 network segmentation zones';
COMMENT ON TABLE ctdisr.firewall_rules IS 'CTDISR-2025 firewall rule management with audit trail';
COMMENT ON TABLE ctdisr.ids_events IS 'Intrusion detection system events';
COMMENT ON TABLE ctdisr.ddos_attacks IS 'DDoS attack tracking and mitigation';
