-- ============================================
-- WANCOM ISP - CTDISR-2025 ASSET MANAGEMENT SCHEMA
-- Section 4: Asset Management & Classification
-- Migration: 20241202011_ctdisr_asset_management.sql
-- ============================================

-- ============================================
-- PART 1: ASSET REGISTRY
-- ============================================

CREATE TABLE IF NOT EXISTS ctdisr.assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Asset identification
    asset_code TEXT UNIQUE NOT NULL,    -- Auto-generated: AST-TYPE-XXXXX
    asset_name TEXT NOT NULL,
    description TEXT,
    
    -- Classification (per CTDISR Section 4.2)
    classification ctdisr.asset_classification NOT NULL,
    
    -- Asset type
    asset_type TEXT NOT NULL,           -- SERVER, NETWORK, APPLICATION, DATA, ENDPOINT
    asset_subtype TEXT,                 -- OLT, ROUTER, DATABASE, etc.
    
    -- Ownership
    owner_department TEXT NOT NULL,
    owner_user_id UUID,
    custodian_user_id UUID,
    
    -- Location
    location_type TEXT,                 -- DATACENTER, OFFICE, CLOUD, REMOTE
    location_details JSONB DEFAULT '{}',
    
    -- Technical details
    technical_details JSONB DEFAULT '{}',  -- IP, hostname, specs, etc.
    network_zone TEXT,                  -- DMZ, INTERNAL, MANAGEMENT, INTERNET
    
    -- Criticality assessment
    confidentiality_impact TEXT NOT NULL DEFAULT 'MEDIUM',  -- LOW, MEDIUM, HIGH, CRITICAL
    integrity_impact TEXT NOT NULL DEFAULT 'MEDIUM',
    availability_impact TEXT NOT NULL DEFAULT 'MEDIUM',
    
    -- Compliance
    handles_pii BOOLEAN DEFAULT FALSE,
    handles_financial BOOLEAN DEFAULT FALSE,
    handles_li_data BOOLEAN DEFAULT FALSE,    -- Lawful Intercept data
    pta_registered BOOLEAN DEFAULT FALSE,     -- Registered with PTA
    pta_registration_ref TEXT,
    
    -- Lifecycle
    status TEXT NOT NULL DEFAULT 'ACTIVE',    -- ACTIVE, INACTIVE, DECOMMISSIONED, DISPOSED
    acquisition_date DATE,
    go_live_date DATE,
    end_of_life_date DATE,
    decommission_date DATE,
    disposal_date DATE,
    disposal_method TEXT,
    disposal_certificate_ref TEXT,
    
    -- Dependencies
    depends_on UUID[],                  -- Array of asset IDs this asset depends on
    depended_by UUID[],                 -- Array of asset IDs that depend on this asset
    
    -- Risk assessment
    risk_score INTEGER DEFAULT 0,       -- Calculated: 0-100
    last_risk_assessment_at TIMESTAMPTZ,
    next_risk_assessment_due TIMESTAMPTZ,
    
    -- Audit trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    
    -- Version control
    version INTEGER NOT NULL DEFAULT 1
);

-- ============================================
-- PART 2: ASSET CLASSIFICATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS ctdisr.asset_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    asset_id UUID NOT NULL REFERENCES ctdisr.assets(id) ON DELETE CASCADE,
    
    -- Classification details
    classification ctdisr.asset_classification NOT NULL,
    classification_reason TEXT NOT NULL,
    
    -- Approval
    classified_by UUID NOT NULL,
    classified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    
    -- Validity
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,        -- NULL = current classification
    
    -- Review
    review_required_by TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- PART 3: ASSET VULNERABILITIES
-- ============================================

CREATE TABLE IF NOT EXISTS ctdisr.asset_vulnerabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    asset_id UUID NOT NULL REFERENCES ctdisr.assets(id) ON DELETE CASCADE,
    
    -- Vulnerability details
    vulnerability_id TEXT NOT NULL,     -- CVE ID or internal ID
    vulnerability_name TEXT NOT NULL,
    description TEXT,
    
    -- Severity (CVSS-based)
    cvss_score DECIMAL(3,1),
    severity TEXT NOT NULL,             -- CRITICAL, HIGH, MEDIUM, LOW, INFO
    
    -- Status
    status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN, ACCEPTED, MITIGATED, PATCHED, FALSE_POSITIVE
    
    -- Discovery
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    discovered_by TEXT,                 -- Scanner name or manual
    scan_report_ref TEXT,
    
    -- Remediation
    remediation_plan TEXT,
    remediation_deadline TIMESTAMPTZ,
    remediated_at TIMESTAMPTZ,
    remediated_by UUID,
    
    -- Acceptance (if accepted)
    accepted_by UUID,
    accepted_at TIMESTAMPTZ,
    acceptance_reason TEXT,
    acceptance_expires_at TIMESTAMPTZ,
    
    -- Evidence
    evidence JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- PART 4: ASSET SOFTWARE INVENTORY
-- ============================================

CREATE TABLE IF NOT EXISTS ctdisr.asset_software (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    asset_id UUID NOT NULL REFERENCES ctdisr.assets(id) ON DELETE CASCADE,
    
    -- Software details
    software_name TEXT NOT NULL,
    vendor TEXT,
    version TEXT NOT NULL,
    
    -- Licensing
    license_type TEXT,                  -- COMMERCIAL, OPEN_SOURCE, PROPRIETARY
    license_key_hash TEXT,              -- Hashed license key
    license_expires_at TIMESTAMPTZ,
    
    -- Security
    is_approved BOOLEAN DEFAULT FALSE,
    approval_ref TEXT,
    is_eol BOOLEAN DEFAULT FALSE,       -- End of life
    eol_date DATE,
    
    -- Installation
    installed_at TIMESTAMPTZ,
    installed_by UUID,
    uninstalled_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- PART 5: ASSET NETWORK INTERFACES
-- ============================================

CREATE TABLE IF NOT EXISTS ctdisr.asset_network_interfaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    asset_id UUID NOT NULL REFERENCES ctdisr.assets(id) ON DELETE CASCADE,
    
    -- Interface details
    interface_name TEXT NOT NULL,
    interface_type TEXT NOT NULL,       -- ETHERNET, FIBER, WIRELESS, VIRTUAL
    mac_address TEXT,
    
    -- IP configuration
    ip_addresses INET[],
    subnet CIDR,
    gateway INET,
    vlan_id INTEGER,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_management BOOLEAN DEFAULT FALSE,
    
    -- Security
    firewall_zone TEXT,
    acl_applied TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- PART 6: ASSET CHANGES
-- ============================================

CREATE TABLE IF NOT EXISTS ctdisr.asset_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    asset_id UUID NOT NULL REFERENCES ctdisr.assets(id),
    
    -- Change details
    change_type TEXT NOT NULL,          -- CREATE, UPDATE, CLASSIFICATION, DECOMMISSION, DISPOSAL
    change_description TEXT NOT NULL,
    
    -- Before/After
    previous_values JSONB,
    new_values JSONB,
    
    -- Context
    change_request_ref TEXT,            -- Link to change management system
    change_reason TEXT NOT NULL,
    
    -- Who/When
    changed_by UUID NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Approval (if required)
    requires_approval BOOLEAN DEFAULT FALSE,
    approved_by UUID,
    approved_at TIMESTAMPTZ
);

-- ============================================
-- PART 7: INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_assets_code ON ctdisr.assets(asset_code);
CREATE INDEX IF NOT EXISTS idx_assets_classification ON ctdisr.assets(classification);
CREATE INDEX IF NOT EXISTS idx_assets_type ON ctdisr.assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_status ON ctdisr.assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_owner ON ctdisr.assets(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_assets_pii ON ctdisr.assets(handles_pii) WHERE handles_pii;
CREATE INDEX IF NOT EXISTS idx_assets_li ON ctdisr.assets(handles_li_data) WHERE handles_li_data;

CREATE INDEX IF NOT EXISTS idx_classifications_asset ON ctdisr.asset_classifications(asset_id);
CREATE INDEX IF NOT EXISTS idx_classifications_current ON ctdisr.asset_classifications(effective_until) 
    WHERE effective_until IS NULL;

CREATE INDEX IF NOT EXISTS idx_vulnerabilities_asset ON ctdisr.asset_vulnerabilities(asset_id);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_status ON ctdisr.asset_vulnerabilities(status);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_severity ON ctdisr.asset_vulnerabilities(severity);

CREATE INDEX IF NOT EXISTS idx_software_asset ON ctdisr.asset_software(asset_id);
CREATE INDEX IF NOT EXISTS idx_software_eol ON ctdisr.asset_software(is_eol) WHERE is_eol;

CREATE INDEX IF NOT EXISTS idx_interfaces_asset ON ctdisr.asset_network_interfaces(asset_id);
CREATE INDEX IF NOT EXISTS idx_interfaces_ip ON ctdisr.asset_network_interfaces USING GIN (ip_addresses);

CREATE INDEX IF NOT EXISTS idx_changes_asset ON ctdisr.asset_changes(asset_id);
CREATE INDEX IF NOT EXISTS idx_changes_date ON ctdisr.asset_changes(changed_at DESC);

-- ============================================
-- PART 8: ROW LEVEL SECURITY
-- ============================================

ALTER TABLE ctdisr.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.asset_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.asset_vulnerabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.asset_software ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.asset_network_interfaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.asset_changes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "security_admin_assets" ON ctdisr.assets
    FOR ALL USING (ctdisr.is_security_admin() OR auth.role() = 'service_role');

CREATE POLICY "security_admin_classifications" ON ctdisr.asset_classifications
    FOR ALL USING (ctdisr.is_security_admin() OR auth.role() = 'service_role');

CREATE POLICY "security_admin_vulnerabilities" ON ctdisr.asset_vulnerabilities
    FOR ALL USING (ctdisr.is_security_admin() OR auth.role() = 'service_role');

CREATE POLICY "security_admin_software" ON ctdisr.asset_software
    FOR ALL USING (ctdisr.is_security_admin() OR auth.role() = 'service_role');

CREATE POLICY "security_admin_interfaces" ON ctdisr.asset_network_interfaces
    FOR ALL USING (ctdisr.is_security_admin() OR auth.role() = 'service_role');

CREATE POLICY "service_manage_changes" ON ctdisr.asset_changes
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "compliance_view_changes" ON ctdisr.asset_changes
    FOR SELECT USING (ctdisr.is_compliance_officer());

-- ============================================
-- PART 9: HELPER FUNCTIONS
-- ============================================

-- Generate asset code
CREATE OR REPLACE FUNCTION ctdisr.generate_asset_code(p_asset_type TEXT)
RETURNS TEXT AS $$
DECLARE
    v_prefix TEXT;
    v_seq TEXT;
BEGIN
    v_prefix := CASE p_asset_type
        WHEN 'SERVER' THEN 'SRV'
        WHEN 'NETWORK' THEN 'NET'
        WHEN 'APPLICATION' THEN 'APP'
        WHEN 'DATA' THEN 'DAT'
        WHEN 'ENDPOINT' THEN 'END'
        ELSE 'AST'
    END;
    
    v_seq := LPAD(FLOOR(RANDOM() * 99999 + 1)::TEXT, 5, '0');
    RETURN 'AST-' || v_prefix || '-' || v_seq;
END;
$$ LANGUAGE plpgsql;

-- Calculate risk score
CREATE OR REPLACE FUNCTION ctdisr.calculate_asset_risk_score(p_asset_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_asset RECORD;
    v_vuln_count INTEGER;
    v_critical_vuln_count INTEGER;
    v_score INTEGER := 0;
BEGIN
    SELECT * INTO v_asset FROM ctdisr.assets WHERE id = p_asset_id;
    IF NOT FOUND THEN RETURN 0; END IF;
    
    -- Base score from classification
    v_score := CASE v_asset.classification
        WHEN 'CRITICAL' THEN 40
        WHEN 'SENSITIVE' THEN 30
        WHEN 'CONFIDENTIAL' THEN 20
        WHEN 'PUBLIC' THEN 10
    END;
    
    -- Add for PII/LI handling
    IF v_asset.handles_pii THEN v_score := v_score + 10; END IF;
    IF v_asset.handles_li_data THEN v_score := v_score + 20; END IF;
    
    -- Add for vulnerabilities
    SELECT 
        COUNT(*) FILTER (WHERE status = 'OPEN'),
        COUNT(*) FILTER (WHERE status = 'OPEN' AND severity IN ('CRITICAL', 'HIGH'))
    INTO v_vuln_count, v_critical_vuln_count
    FROM ctdisr.asset_vulnerabilities 
    WHERE asset_id = p_asset_id;
    
    v_score := v_score + LEAST(v_vuln_count * 2, 20);
    v_score := v_score + LEAST(v_critical_vuln_count * 5, 20);
    
    RETURN LEAST(v_score, 100);
END;
$$ LANGUAGE plpgsql;

-- Update risk scores periodically
CREATE OR REPLACE FUNCTION ctdisr.update_all_asset_risk_scores()
RETURNS void AS $$
BEGIN
    UPDATE ctdisr.assets
    SET risk_score = ctdisr.calculate_asset_risk_score(id),
        last_risk_assessment_at = NOW(),
        next_risk_assessment_due = NOW() + INTERVAL '30 days',
        updated_at = NOW()
    WHERE status = 'ACTIVE';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PART 10: TRIGGERS
-- ============================================

-- Auto-generate asset code
CREATE OR REPLACE FUNCTION ctdisr.auto_generate_asset_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.asset_code IS NULL OR NEW.asset_code = '' THEN
        NEW.asset_code := ctdisr.generate_asset_code(NEW.asset_type);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_asset_code ON ctdisr.assets;
CREATE TRIGGER auto_asset_code
    BEFORE INSERT ON ctdisr.assets
    FOR EACH ROW
    EXECUTE FUNCTION ctdisr.auto_generate_asset_code();

-- Track asset changes
CREATE OR REPLACE FUNCTION ctdisr.track_asset_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        INSERT INTO ctdisr.asset_changes (
            asset_id, change_type, change_description,
            previous_values, new_values, change_reason, changed_by
        ) VALUES (
            NEW.id, 'UPDATE', 'Asset updated',
            to_jsonb(OLD), to_jsonb(NEW), 'Automatic change tracking', NEW.updated_by
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS track_asset_updates ON ctdisr.assets;
CREATE TRIGGER track_asset_updates
    AFTER UPDATE ON ctdisr.assets
    FOR EACH ROW
    EXECUTE FUNCTION ctdisr.track_asset_changes();

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
COMMENT ON TABLE ctdisr.assets IS 'CTDISR-2025 Section 4: Asset Register';
