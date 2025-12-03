-- CTDISR-2025 Vendor & Third-Party Security Schema
-- PTA Regulation: Chapter 9 - Third-Party Risk Management

-- Vendor Risk Level
CREATE TYPE ctdisr.vendor_risk_level AS ENUM (
    'critical',
    'high',
    'medium',
    'low',
    'minimal'
);

-- Vendor Status
CREATE TYPE ctdisr.vendor_status AS ENUM (
    'prospect',
    'under_review',
    'approved',
    'active',
    'suspended',
    'terminated',
    'archived'
);

-- Assessment Status
CREATE TYPE ctdisr.assessment_status AS ENUM (
    'not_started',
    'in_progress',
    'pending_review',
    'completed',
    'expired'
);

-- Contract Status
CREATE TYPE ctdisr.contract_status AS ENUM (
    'draft',
    'negotiation',
    'pending_approval',
    'active',
    'expiring_soon',
    'expired',
    'terminated',
    'renewed'
);

-- Access Type
CREATE TYPE ctdisr.vendor_access_type AS ENUM (
    'none',
    'read_only',
    'read_write',
    'admin',
    'api_only',
    'physical',
    'remote'
);

-- Data Classification for Vendor Access
CREATE TYPE ctdisr.data_sensitivity AS ENUM (
    'public',
    'internal',
    'confidential',
    'restricted',
    'top_secret'
);

-- Vendor Registry
CREATE TABLE ctdisr.vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_code VARCHAR(50) UNIQUE NOT NULL,  -- VND-001 format
    
    -- Basic Information
    name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255),
    registration_number VARCHAR(100),
    tax_id VARCHAR(50),
    
    -- Classification
    status ctdisr.vendor_status NOT NULL DEFAULT 'prospect',
    risk_level ctdisr.vendor_risk_level,
    vendor_type VARCHAR(100) NOT NULL,  -- software, hardware, service, cloud, etc.
    
    -- Location
    country VARCHAR(100) NOT NULL,
    city VARCHAR(100),
    address TEXT,
    is_local_vendor BOOLEAN DEFAULT FALSE,  -- PTA preference for local vendors
    
    -- Contact
    primary_contact_name VARCHAR(255),
    primary_contact_email VARCHAR(255),
    primary_contact_phone VARCHAR(50),
    secondary_contact_name VARCHAR(255),
    secondary_contact_email VARCHAR(255),
    
    -- Services
    services_provided TEXT[] NOT NULL,
    service_criticality ctdisr.vendor_risk_level,
    
    -- Data Access
    has_data_access BOOLEAN DEFAULT FALSE,
    data_types_accessed TEXT[] DEFAULT '{}',
    max_data_sensitivity ctdisr.data_sensitivity,
    
    -- System Access
    has_system_access BOOLEAN DEFAULT FALSE,
    systems_accessed TEXT[] DEFAULT '{}',
    access_type ctdisr.vendor_access_type DEFAULT 'none',
    
    -- Compliance
    certifications TEXT[] DEFAULT '{}',  -- ISO 27001, SOC 2, PCI-DSS, etc.
    regulatory_compliance TEXT[] DEFAULT '{}',
    pta_registered BOOLEAN DEFAULT FALSE,  -- Required for telecom vendors
    
    -- Risk Assessment
    last_risk_assessment_at TIMESTAMPTZ,
    next_risk_assessment_at TIMESTAMPTZ,
    risk_assessment_frequency_days INTEGER DEFAULT 365,
    
    -- Security Requirements
    security_requirements JSONB DEFAULT '{}',
    required_controls TEXT[] DEFAULT '{}',
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ
);

-- Vendor Risk Assessments
CREATE TABLE ctdisr.vendor_risk_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_number VARCHAR(50) UNIQUE NOT NULL,  -- VRA-2025-001
    vendor_id UUID NOT NULL REFERENCES ctdisr.vendors(id) ON DELETE CASCADE,
    
    -- Assessment Details
    assessment_type VARCHAR(100) NOT NULL,  -- initial, periodic, triggered
    status ctdisr.assessment_status NOT NULL DEFAULT 'not_started',
    
    -- Timeline
    initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    
    -- Assessor
    assessor_id UUID REFERENCES auth.users(id),
    reviewer_id UUID REFERENCES auth.users(id),
    
    -- Questionnaire
    questionnaire_responses JSONB DEFAULT '{}',
    questionnaire_version VARCHAR(20),
    
    -- Risk Scores
    inherent_risk_score INTEGER,  -- 1-100
    control_effectiveness_score INTEGER,  -- 1-100
    residual_risk_score INTEGER,  -- 1-100
    calculated_risk_level ctdisr.vendor_risk_level,
    
    -- Categories
    financial_risk_score INTEGER,
    operational_risk_score INTEGER,
    security_risk_score INTEGER,
    compliance_risk_score INTEGER,
    reputational_risk_score INTEGER,
    
    -- Findings
    findings JSONB DEFAULT '[]',
    critical_findings INTEGER DEFAULT 0,
    high_findings INTEGER DEFAULT 0,
    medium_findings INTEGER DEFAULT 0,
    low_findings INTEGER DEFAULT 0,
    
    -- Recommendations
    recommendations JSONB DEFAULT '[]',
    required_actions JSONB DEFAULT '[]',
    
    -- Evidence
    evidence_documents TEXT[] DEFAULT '{}',
    
    -- Decision
    decision VARCHAR(50),  -- approve, conditional_approve, reject
    decision_rationale TEXT,
    conditions TEXT[],
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vendor Contracts
CREATE TABLE ctdisr.vendor_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_number VARCHAR(50) UNIQUE NOT NULL,  -- CTR-2025-001
    vendor_id UUID NOT NULL REFERENCES ctdisr.vendors(id) ON DELETE CASCADE,
    
    -- Contract Details
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status ctdisr.contract_status NOT NULL DEFAULT 'draft',
    
    -- Type
    contract_type VARCHAR(100) NOT NULL,  -- service, license, maintenance, etc.
    
    -- Duration
    effective_date DATE NOT NULL,
    expiration_date DATE NOT NULL,
    auto_renewal BOOLEAN DEFAULT FALSE,
    renewal_notice_days INTEGER DEFAULT 90,
    
    -- Value
    total_value DECIMAL(15,2),
    currency VARCHAR(3) DEFAULT 'PKR',
    payment_terms VARCHAR(100),
    
    -- SLAs
    sla_terms JSONB DEFAULT '{}',
    uptime_requirement DECIMAL(5,2),  -- e.g., 99.95
    response_time_sla_hours INTEGER,
    resolution_time_sla_hours INTEGER,
    
    -- Security Clauses
    security_requirements JSONB NOT NULL DEFAULT '{}',
    data_protection_clause BOOLEAN DEFAULT TRUE,
    audit_rights BOOLEAN DEFAULT TRUE,
    breach_notification_hours INTEGER DEFAULT 24,
    liability_cap DECIMAL(15,2),
    
    -- Compliance
    regulatory_compliance_required TEXT[] DEFAULT '{}',
    ctdisr_compliance_required BOOLEAN DEFAULT TRUE,
    
    -- Termination
    termination_notice_days INTEGER DEFAULT 90,
    termination_for_convenience BOOLEAN DEFAULT FALSE,
    termination_for_cause_conditions TEXT[] DEFAULT '{}',
    
    -- Documents
    contract_document_url VARCHAR(500),
    contract_document_hash VARCHAR(64),
    amendments JSONB DEFAULT '[]',
    
    -- Approval
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    legal_review_completed BOOLEAN DEFAULT FALSE,
    security_review_completed BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vendor Access Permissions
CREATE TABLE ctdisr.vendor_access_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES ctdisr.vendors(id) ON DELETE CASCADE,
    contract_id UUID REFERENCES ctdisr.vendor_contracts(id),
    
    -- Access Details
    permission_name VARCHAR(255) NOT NULL,
    access_type ctdisr.vendor_access_type NOT NULL,
    
    -- Scope
    resource_type VARCHAR(100) NOT NULL,  -- system, database, api, facility
    resource_identifier VARCHAR(255) NOT NULL,
    
    -- Data Access
    data_sensitivity ctdisr.data_sensitivity,
    data_types TEXT[] DEFAULT '{}',
    
    -- Constraints
    ip_whitelist TEXT[] DEFAULT '{}',
    time_restrictions JSONB DEFAULT '{}',  -- days, hours
    geo_restrictions TEXT[] DEFAULT '{}',
    
    -- Duration
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    -- Authorization
    granted_by UUID REFERENCES auth.users(id) NOT NULL,
    approved_by UUID REFERENCES auth.users(id),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES auth.users(id),
    revocation_reason TEXT,
    
    -- Review
    last_reviewed_at TIMESTAMPTZ,
    next_review_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vendor Access Logs
CREATE TABLE ctdisr.vendor_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES ctdisr.vendors(id),
    permission_id UUID REFERENCES ctdisr.vendor_access_permissions(id),
    
    -- Access Details
    access_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_type VARCHAR(50) NOT NULL,  -- login, data_access, api_call, etc.
    resource_accessed VARCHAR(255),
    
    -- Source
    source_ip VARCHAR(45),
    source_location VARCHAR(100),
    user_agent TEXT,
    
    -- Credentials
    credentials_used VARCHAR(100),  -- api_key, certificate, password, etc.
    
    -- Activity
    action VARCHAR(100) NOT NULL,
    success BOOLEAN NOT NULL,
    
    -- Data
    data_accessed TEXT[] DEFAULT '{}',
    records_affected INTEGER,
    
    -- Risk
    risk_score INTEGER,
    anomaly_detected BOOLEAN DEFAULT FALSE,
    anomaly_details TEXT,
    
    -- Metadata
    request_id VARCHAR(100),
    session_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vendor Security Incidents
CREATE TABLE ctdisr.vendor_security_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES ctdisr.vendors(id),
    incident_id UUID,  -- Reference to main security incident
    
    -- Incident Details
    incident_type VARCHAR(100) NOT NULL,
    severity ctdisr.vendor_risk_level NOT NULL,
    description TEXT NOT NULL,
    
    -- Timeline
    occurred_at TIMESTAMPTZ NOT NULL,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    
    -- Impact
    data_impacted BOOLEAN DEFAULT FALSE,
    data_types_affected TEXT[] DEFAULT '{}',
    systems_affected TEXT[] DEFAULT '{}',
    
    -- Response
    vendor_response TEXT,
    vendor_response_time_hours INTEGER,
    our_response TEXT,
    
    -- Root Cause
    root_cause TEXT,
    vendor_responsible BOOLEAN,
    
    -- Remediation
    remediation_actions JSONB DEFAULT '[]',
    remediation_verified BOOLEAN DEFAULT FALSE,
    
    -- Contract Impact
    sla_breached BOOLEAN DEFAULT FALSE,
    penalties_applied DECIMAL(15,2),
    
    -- Reporting
    pta_notified BOOLEAN DEFAULT FALSE,
    pta_notification_date TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vendor Compliance Certifications
CREATE TABLE ctdisr.vendor_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES ctdisr.vendors(id) ON DELETE CASCADE,
    
    certification_name VARCHAR(255) NOT NULL,
    certification_body VARCHAR(255),
    certification_number VARCHAR(100),
    
    -- Validity
    issued_at DATE NOT NULL,
    expires_at DATE,
    is_valid BOOLEAN DEFAULT TRUE,
    
    -- Scope
    scope TEXT,
    
    -- Verification
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES auth.users(id),
    
    -- Documents
    certificate_url VARCHAR(500),
    certificate_hash VARCHAR(64),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vendor Performance Metrics
CREATE TABLE ctdisr.vendor_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES ctdisr.vendors(id) ON DELETE CASCADE,
    contract_id UUID REFERENCES ctdisr.vendor_contracts(id),
    
    -- Period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- SLA Metrics
    uptime_percentage DECIMAL(5,2),
    incidents_count INTEGER DEFAULT 0,
    critical_incidents INTEGER DEFAULT 0,
    avg_response_time_hours DECIMAL(10,2),
    avg_resolution_time_hours DECIMAL(10,2),
    sla_compliance_percentage DECIMAL(5,2),
    
    -- Security Metrics
    security_incidents INTEGER DEFAULT 0,
    vulnerabilities_reported INTEGER DEFAULT 0,
    vulnerabilities_resolved INTEGER DEFAULT 0,
    patch_compliance_percentage DECIMAL(5,2),
    
    -- Service Quality
    quality_score INTEGER,  -- 1-100
    customer_satisfaction_score INTEGER,  -- 1-100
    
    -- Notes
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX idx_vendors_status ON ctdisr.vendors(status);
CREATE INDEX idx_vendors_risk_level ON ctdisr.vendors(risk_level);
CREATE INDEX idx_vendors_type ON ctdisr.vendors(vendor_type);
CREATE INDEX idx_vendors_next_assessment ON ctdisr.vendors(next_risk_assessment_at);

CREATE INDEX idx_assessments_vendor ON ctdisr.vendor_risk_assessments(vendor_id);
CREATE INDEX idx_assessments_status ON ctdisr.vendor_risk_assessments(status);
CREATE INDEX idx_assessments_valid ON ctdisr.vendor_risk_assessments(valid_until);

CREATE INDEX idx_contracts_vendor ON ctdisr.vendor_contracts(vendor_id);
CREATE INDEX idx_contracts_status ON ctdisr.vendor_contracts(status);
CREATE INDEX idx_contracts_expiration ON ctdisr.vendor_contracts(expiration_date);

CREATE INDEX idx_access_vendor ON ctdisr.vendor_access_permissions(vendor_id);
CREATE INDEX idx_access_active ON ctdisr.vendor_access_permissions(is_active);
CREATE INDEX idx_access_expires ON ctdisr.vendor_access_permissions(expires_at);

CREATE INDEX idx_access_logs_vendor ON ctdisr.vendor_access_logs(vendor_id);
CREATE INDEX idx_access_logs_time ON ctdisr.vendor_access_logs(access_time);
CREATE INDEX idx_access_logs_anomaly ON ctdisr.vendor_access_logs(anomaly_detected) WHERE anomaly_detected = TRUE;

CREATE INDEX idx_vendor_incidents_vendor ON ctdisr.vendor_security_incidents(vendor_id);
CREATE INDEX idx_vendor_incidents_severity ON ctdisr.vendor_security_incidents(severity);

CREATE INDEX idx_certs_vendor ON ctdisr.vendor_certifications(vendor_id);
CREATE INDEX idx_certs_expires ON ctdisr.vendor_certifications(expires_at);

CREATE INDEX idx_performance_vendor ON ctdisr.vendor_performance(vendor_id);
CREATE INDEX idx_performance_period ON ctdisr.vendor_performance(period_start, period_end);

-- Row Level Security
ALTER TABLE ctdisr.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.vendor_risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.vendor_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.vendor_access_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.vendor_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.vendor_security_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.vendor_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.vendor_performance ENABLE ROW LEVEL SECURITY;

-- Admin policies
CREATE POLICY vendors_admin ON ctdisr.vendors FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'vendor_manager'));

CREATE POLICY assessments_admin ON ctdisr.vendor_risk_assessments FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'vendor_manager', 'risk_analyst'));

CREATE POLICY contracts_admin ON ctdisr.vendor_contracts FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'vendor_manager', 'legal'));

CREATE POLICY access_admin ON ctdisr.vendor_access_permissions FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin'));

CREATE POLICY access_logs_admin ON ctdisr.vendor_access_logs FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'auditor'));

CREATE POLICY vendor_incidents_admin ON ctdisr.vendor_security_incidents FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'incident_responder'));

CREATE POLICY certs_admin ON ctdisr.vendor_certifications FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'vendor_manager'));

CREATE POLICY performance_admin ON ctdisr.vendor_performance FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'vendor_manager'));

-- Functions

-- Generate vendor code
CREATE OR REPLACE FUNCTION ctdisr.generate_vendor_code()
RETURNS VARCHAR(50) AS $$
DECLARE
    seq_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(vendor_code FROM 'VND-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM ctdisr.vendors;
    
    RETURN 'VND-' || LPAD(seq_num::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- Generate assessment number
CREATE OR REPLACE FUNCTION ctdisr.generate_assessment_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    year_part VARCHAR(4);
    seq_num INTEGER;
BEGIN
    year_part := TO_CHAR(NOW(), 'YYYY');
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(assessment_number FROM 'VRA-\d{4}-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM ctdisr.vendor_risk_assessments
    WHERE assessment_number LIKE 'VRA-' || year_part || '-%';
    
    RETURN 'VRA-' || year_part || '-' || LPAD(seq_num::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- Generate contract number
CREATE OR REPLACE FUNCTION ctdisr.generate_contract_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    year_part VARCHAR(4);
    seq_num INTEGER;
BEGIN
    year_part := TO_CHAR(NOW(), 'YYYY');
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(contract_number FROM 'CTR-\d{4}-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM ctdisr.vendor_contracts
    WHERE contract_number LIKE 'CTR-' || year_part || '-%';
    
    RETURN 'CTR-' || year_part || '-' || LPAD(seq_num::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- Calculate vendor risk score
CREATE OR REPLACE FUNCTION ctdisr.calculate_vendor_risk_score(
    p_inherent_risk INTEGER,
    p_control_effectiveness INTEGER
)
RETURNS INTEGER AS $$
BEGIN
    -- Residual Risk = Inherent Risk * (100 - Control Effectiveness) / 100
    RETURN GREATEST(1, LEAST(100, 
        p_inherent_risk * (100 - p_control_effectiveness) / 100
    ));
END;
$$ LANGUAGE plpgsql;

-- Timestamp triggers
CREATE TRIGGER update_vendors_timestamp
    BEFORE UPDATE ON ctdisr.vendors
    FOR EACH ROW EXECUTE FUNCTION ctdisr.update_timestamp();

CREATE TRIGGER update_assessments_timestamp
    BEFORE UPDATE ON ctdisr.vendor_risk_assessments
    FOR EACH ROW EXECUTE FUNCTION ctdisr.update_timestamp();

CREATE TRIGGER update_contracts_timestamp
    BEFORE UPDATE ON ctdisr.vendor_contracts
    FOR EACH ROW EXECUTE FUNCTION ctdisr.update_timestamp();

CREATE TRIGGER update_access_timestamp
    BEFORE UPDATE ON ctdisr.vendor_access_permissions
    FOR EACH ROW EXECUTE FUNCTION ctdisr.update_timestamp();

CREATE TRIGGER update_vendor_incidents_timestamp
    BEFORE UPDATE ON ctdisr.vendor_security_incidents
    FOR EACH ROW EXECUTE FUNCTION ctdisr.update_timestamp();

-- Comments
COMMENT ON TABLE ctdisr.vendors IS 'CTDISR-2025 Chapter 9: Vendor registry with risk classification';
COMMENT ON TABLE ctdisr.vendor_risk_assessments IS 'Third-party risk assessments with scoring';
COMMENT ON TABLE ctdisr.vendor_contracts IS 'Vendor contracts with security and SLA clauses';
COMMENT ON TABLE ctdisr.vendor_access_permissions IS 'Granular vendor access permissions';
COMMENT ON TABLE ctdisr.vendor_access_logs IS 'Audit trail of all vendor access activities';
COMMENT ON TABLE ctdisr.vendor_security_incidents IS 'Security incidents involving vendors';
COMMENT ON TABLE ctdisr.vendor_certifications IS 'Vendor compliance certifications';
COMMENT ON TABLE ctdisr.vendor_performance IS 'Periodic vendor performance metrics';
