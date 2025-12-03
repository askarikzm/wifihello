-- CTDISR-2025 Incident Response & Forensics Schema
-- PTA Regulation: Chapter 7 - Incident Management & Digital Forensics

-- Incident Severity Levels
CREATE TYPE ctdisr.incident_severity AS ENUM (
    'critical',      -- Business-critical impact, immediate response
    'high',          -- Significant impact, urgent response
    'medium',        -- Moderate impact, planned response
    'low',           -- Minor impact, scheduled response
    'informational'  -- No direct impact, awareness only
);

-- Incident Status
CREATE TYPE ctdisr.incident_status AS ENUM (
    'detected',      -- Initial detection
    'triaged',       -- Initial assessment complete
    'contained',     -- Threat contained
    'eradicated',    -- Threat removed
    'recovered',     -- Systems restored
    'closed',        -- Incident closed
    'reopened'       -- Incident reopened
);

-- Incident Category
CREATE TYPE ctdisr.incident_category AS ENUM (
    'malware',
    'phishing',
    'unauthorized_access',
    'data_breach',
    'dos_ddos',
    'insider_threat',
    'physical_security',
    'policy_violation',
    'system_compromise',
    'network_intrusion',
    'fraud',
    'other'
);

-- Evidence Type
CREATE TYPE ctdisr.evidence_type AS ENUM (
    'log_file',
    'memory_dump',
    'disk_image',
    'network_capture',
    'malware_sample',
    'screenshot',
    'email',
    'document',
    'database_record',
    'configuration',
    'other'
);

-- Evidence Chain of Custody Action
CREATE TYPE ctdisr.custody_action AS ENUM (
    'collected',
    'transferred',
    'analyzed',
    'stored',
    'retrieved',
    'returned',
    'destroyed'
);

-- Forensic Analysis Status
CREATE TYPE ctdisr.forensic_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'on_hold',
    'cancelled'
);

-- Security Incidents Table
CREATE TABLE ctdisr.security_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_number VARCHAR(50) UNIQUE NOT NULL,  -- INC-2025-001234 format
    
    -- Classification
    severity ctdisr.incident_severity NOT NULL,
    status ctdisr.incident_status NOT NULL DEFAULT 'detected',
    category ctdisr.incident_category NOT NULL,
    
    -- Description
    title VARCHAR(500) NOT NULL,
    description TEXT,
    
    -- Affected Resources
    affected_assets UUID[] DEFAULT '{}',  -- References to ctdisr.assets
    affected_systems TEXT[] DEFAULT '{}',
    affected_users UUID[] DEFAULT '{}',
    affected_data_types TEXT[] DEFAULT '{}',
    
    -- Impact Assessment
    business_impact TEXT,
    data_compromised BOOLEAN DEFAULT FALSE,
    data_exfiltrated BOOLEAN DEFAULT FALSE,
    service_disruption BOOLEAN DEFAULT FALSE,
    estimated_financial_impact DECIMAL(15,2),
    
    -- Detection
    detection_method VARCHAR(100),  -- IDS, SIEM, User Report, etc.
    detection_source VARCHAR(255),
    initial_indicators JSONB DEFAULT '{}',
    
    -- Timeline
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reported_at TIMESTAMPTZ,
    triaged_at TIMESTAMPTZ,
    contained_at TIMESTAMPTZ,
    eradicated_at TIMESTAMPTZ,
    recovered_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    
    -- Response SLAs
    response_sla_minutes INTEGER,
    containment_sla_minutes INTEGER,
    sla_breached BOOLEAN DEFAULT FALSE,
    
    -- Attribution
    threat_actor VARCHAR(255),
    attack_vector VARCHAR(255),
    ttps TEXT[],  -- MITRE ATT&CK TTPs
    iocs JSONB DEFAULT '{}',  -- Indicators of Compromise
    
    -- Team Assignment
    incident_commander UUID REFERENCES auth.users(id),
    assigned_team UUID[],
    escalation_level INTEGER DEFAULT 1,
    
    -- External Reporting
    pta_reported BOOLEAN DEFAULT FALSE,
    pta_report_date TIMESTAMPTZ,
    pta_reference VARCHAR(100),
    law_enforcement_notified BOOLEAN DEFAULT FALSE,
    customers_notified BOOLEAN DEFAULT FALSE,
    
    -- Documentation
    root_cause TEXT,
    lessons_learned TEXT,
    remediation_actions JSONB DEFAULT '[]',
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Hash for integrity
    record_hash VARCHAR(64)
);

-- Incident Timeline Events
CREATE TABLE ctdisr.incident_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES ctdisr.security_incidents(id) ON DELETE CASCADE,
    
    event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    
    -- Actor
    performed_by UUID REFERENCES auth.users(id),
    automated BOOLEAN DEFAULT FALSE,
    
    -- Details
    details JSONB DEFAULT '{}',
    attachments TEXT[] DEFAULT '{}',
    
    -- Verification
    verified BOOLEAN DEFAULT FALSE,
    verified_by UUID REFERENCES auth.users(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Incident Response Playbooks
CREATE TABLE ctdisr.response_playbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category ctdisr.incident_category NOT NULL,
    severity_levels ctdisr.incident_severity[] NOT NULL,
    
    -- Playbook Content
    steps JSONB NOT NULL DEFAULT '[]',  -- Ordered response steps
    automated_actions JSONB DEFAULT '[]',
    escalation_matrix JSONB DEFAULT '{}',
    communication_templates JSONB DEFAULT '{}',
    
    -- SLAs
    initial_response_minutes INTEGER NOT NULL,
    containment_target_minutes INTEGER,
    resolution_target_minutes INTEGER,
    
    -- Requirements
    required_tools TEXT[] DEFAULT '{}',
    required_skills TEXT[] DEFAULT '{}',
    required_approvals TEXT[] DEFAULT '{}',
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    version INTEGER DEFAULT 1,
    last_tested_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Digital Evidence Registry
CREATE TABLE ctdisr.digital_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_number VARCHAR(50) UNIQUE NOT NULL,  -- EVD-2025-001234 format
    
    incident_id UUID REFERENCES ctdisr.security_incidents(id),
    
    -- Evidence Details
    evidence_type ctdisr.evidence_type NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Source
    source_system VARCHAR(255),
    source_ip VARCHAR(45),
    source_hostname VARCHAR(255),
    source_user UUID REFERENCES auth.users(id),
    
    -- Collection
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    collected_by UUID REFERENCES auth.users(id) NOT NULL,
    collection_method VARCHAR(255),
    collection_tool VARCHAR(255),
    
    -- Storage
    storage_location VARCHAR(500) NOT NULL,  -- Secure storage path/URL
    storage_encrypted BOOLEAN DEFAULT TRUE,
    encryption_key_id UUID,  -- Reference to key used
    
    -- Integrity
    original_hash_md5 VARCHAR(32),
    original_hash_sha256 VARCHAR(64) NOT NULL,
    original_hash_sha512 VARCHAR(128),
    current_hash_sha256 VARCHAR(64),
    integrity_verified BOOLEAN DEFAULT TRUE,
    last_integrity_check TIMESTAMPTZ,
    
    -- Size and Format
    file_size_bytes BIGINT,
    file_format VARCHAR(50),
    mime_type VARCHAR(100),
    
    -- Classification
    classification VARCHAR(50) DEFAULT 'confidential',
    legal_hold BOOLEAN DEFAULT FALSE,
    retention_until TIMESTAMPTZ,
    
    -- Status
    is_available BOOLEAN DEFAULT TRUE,
    is_analyzed BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Evidence Chain of Custody
CREATE TABLE ctdisr.evidence_chain_of_custody (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES ctdisr.digital_evidence(id) ON DELETE CASCADE,
    
    action ctdisr.custody_action NOT NULL,
    action_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Parties
    from_custodian UUID REFERENCES auth.users(id),
    to_custodian UUID REFERENCES auth.users(id),
    
    -- Details
    reason TEXT NOT NULL,
    location VARCHAR(255),
    
    -- Verification
    hash_verified BOOLEAN DEFAULT TRUE,
    hash_at_transfer VARCHAR(64),
    
    -- Signatures (stored as hashes)
    from_signature_hash VARCHAR(64),
    to_signature_hash VARCHAR(64),
    
    -- Witness
    witnessed_by UUID REFERENCES auth.users(id),
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Forensic Analysis Cases
CREATE TABLE ctdisr.forensic_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number VARCHAR(50) UNIQUE NOT NULL,  -- FOR-2025-001234 format
    
    incident_id UUID REFERENCES ctdisr.security_incidents(id),
    
    -- Case Details
    title VARCHAR(500) NOT NULL,
    objective TEXT NOT NULL,
    scope TEXT,
    
    -- Status
    status ctdisr.forensic_status NOT NULL DEFAULT 'pending',
    priority ctdisr.incident_severity NOT NULL,
    
    -- Timeline
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    deadline TIMESTAMPTZ,
    
    -- Team
    lead_investigator UUID REFERENCES auth.users(id) NOT NULL,
    team_members UUID[] DEFAULT '{}',
    
    -- Evidence
    evidence_ids UUID[] DEFAULT '{}',
    
    -- Findings
    findings TEXT,
    conclusions TEXT,
    recommendations TEXT,
    
    -- Documentation
    report_location VARCHAR(500),
    report_hash VARCHAR(64),
    
    -- External
    external_consultant VARCHAR(255),
    law_enforcement_case_number VARCHAR(100),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Forensic Analysis Activities
CREATE TABLE ctdisr.forensic_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES ctdisr.forensic_cases(id) ON DELETE CASCADE,
    evidence_id UUID REFERENCES ctdisr.digital_evidence(id),
    
    activity_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    
    -- Execution
    performed_by UUID REFERENCES auth.users(id) NOT NULL,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_minutes INTEGER,
    
    -- Tools
    tools_used TEXT[] DEFAULT '{}',
    methodology VARCHAR(255),
    
    -- Results
    findings TEXT,
    artifacts_found JSONB DEFAULT '[]',
    
    -- Verification
    peer_reviewed BOOLEAN DEFAULT FALSE,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Incident Response Team Roster
CREATE TABLE ctdisr.incident_response_team (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    
    role VARCHAR(100) NOT NULL,  -- Commander, Analyst, Forensic Expert, etc.
    skills TEXT[] DEFAULT '{}',
    certifications TEXT[] DEFAULT '{}',
    
    -- Availability
    is_active BOOLEAN DEFAULT TRUE,
    is_on_call BOOLEAN DEFAULT FALSE,
    contact_phone VARCHAR(20),
    contact_email VARCHAR(255),
    
    -- Escalation
    escalation_level INTEGER DEFAULT 1,
    can_be_commander BOOLEAN DEFAULT FALSE,
    
    -- History
    incidents_handled INTEGER DEFAULT 0,
    avg_response_time_minutes DECIMAL(10,2),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-- Communication Log for Incidents
CREATE TABLE ctdisr.incident_communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES ctdisr.security_incidents(id) ON DELETE CASCADE,
    
    communication_type VARCHAR(50) NOT NULL,  -- email, call, meeting, notification
    direction VARCHAR(20) NOT NULL,  -- inbound, outbound, internal
    
    -- Parties
    from_party VARCHAR(255) NOT NULL,
    to_parties TEXT[] NOT NULL,
    
    -- Content
    subject VARCHAR(500),
    summary TEXT NOT NULL,
    full_content_hash VARCHAR(64),  -- Hash of actual content stored securely
    
    -- Timing
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    
    -- Attachments
    has_attachments BOOLEAN DEFAULT FALSE,
    attachment_count INTEGER DEFAULT 0,
    
    -- Regulatory
    is_regulatory BOOLEAN DEFAULT FALSE,
    regulatory_body VARCHAR(100),
    
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for Performance
CREATE INDEX idx_incidents_status ON ctdisr.security_incidents(status);
CREATE INDEX idx_incidents_severity ON ctdisr.security_incidents(severity);
CREATE INDEX idx_incidents_category ON ctdisr.security_incidents(category);
CREATE INDEX idx_incidents_detected_at ON ctdisr.security_incidents(detected_at);
CREATE INDEX idx_incidents_pta_reported ON ctdisr.security_incidents(pta_reported) WHERE pta_reported = FALSE;
CREATE INDEX idx_incidents_commander ON ctdisr.security_incidents(incident_commander);

CREATE INDEX idx_timeline_incident ON ctdisr.incident_timeline(incident_id);
CREATE INDEX idx_timeline_time ON ctdisr.incident_timeline(event_time);

CREATE INDEX idx_evidence_incident ON ctdisr.digital_evidence(incident_id);
CREATE INDEX idx_evidence_type ON ctdisr.digital_evidence(evidence_type);
CREATE INDEX idx_evidence_hash ON ctdisr.digital_evidence(original_hash_sha256);
CREATE INDEX idx_evidence_legal_hold ON ctdisr.digital_evidence(legal_hold) WHERE legal_hold = TRUE;

CREATE INDEX idx_custody_evidence ON ctdisr.evidence_chain_of_custody(evidence_id);
CREATE INDEX idx_custody_time ON ctdisr.evidence_chain_of_custody(action_time);

CREATE INDEX idx_forensic_incident ON ctdisr.forensic_cases(incident_id);
CREATE INDEX idx_forensic_status ON ctdisr.forensic_cases(status);
CREATE INDEX idx_forensic_lead ON ctdisr.forensic_cases(lead_investigator);

CREATE INDEX idx_irt_user ON ctdisr.incident_response_team(user_id);
CREATE INDEX idx_irt_oncall ON ctdisr.incident_response_team(is_on_call) WHERE is_on_call = TRUE;

-- Row Level Security
ALTER TABLE ctdisr.security_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.incident_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.response_playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.digital_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.evidence_chain_of_custody ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.forensic_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.forensic_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.incident_response_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.incident_communications ENABLE ROW LEVEL SECURITY;

-- Admin policies
CREATE POLICY incidents_admin ON ctdisr.security_incidents FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'incident_responder'));

CREATE POLICY timeline_admin ON ctdisr.incident_timeline FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'incident_responder'));

CREATE POLICY playbooks_admin ON ctdisr.response_playbooks FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin'));

CREATE POLICY evidence_admin ON ctdisr.digital_evidence FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'forensic_analyst'));

CREATE POLICY custody_admin ON ctdisr.evidence_chain_of_custody FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'forensic_analyst'));

CREATE POLICY forensic_admin ON ctdisr.forensic_cases FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'forensic_analyst'));

CREATE POLICY forensic_activities_admin ON ctdisr.forensic_activities FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'forensic_analyst'));

CREATE POLICY irt_admin ON ctdisr.incident_response_team FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin'));

CREATE POLICY comms_admin ON ctdisr.incident_communications FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('admin', 'security_admin', 'incident_responder'));

-- Functions

-- Generate incident number
CREATE OR REPLACE FUNCTION ctdisr.generate_incident_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    year_part VARCHAR(4);
    seq_num INTEGER;
    inc_number VARCHAR(50);
BEGIN
    year_part := TO_CHAR(NOW(), 'YYYY');
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(incident_number FROM 'INC-\d{4}-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM ctdisr.security_incidents
    WHERE incident_number LIKE 'INC-' || year_part || '-%';
    
    inc_number := 'INC-' || year_part || '-' || LPAD(seq_num::TEXT, 6, '0');
    RETURN inc_number;
END;
$$ LANGUAGE plpgsql;

-- Generate evidence number
CREATE OR REPLACE FUNCTION ctdisr.generate_evidence_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    year_part VARCHAR(4);
    seq_num INTEGER;
    evd_number VARCHAR(50);
BEGIN
    year_part := TO_CHAR(NOW(), 'YYYY');
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(evidence_number FROM 'EVD-\d{4}-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM ctdisr.digital_evidence
    WHERE evidence_number LIKE 'EVD-' || year_part || '-%';
    
    evd_number := 'EVD-' || year_part || '-' || LPAD(seq_num::TEXT, 6, '0');
    RETURN evd_number;
END;
$$ LANGUAGE plpgsql;

-- Generate forensic case number
CREATE OR REPLACE FUNCTION ctdisr.generate_forensic_case_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    year_part VARCHAR(4);
    seq_num INTEGER;
    case_number VARCHAR(50);
BEGIN
    year_part := TO_CHAR(NOW(), 'YYYY');
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(case_number FROM 'FOR-\d{4}-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM ctdisr.forensic_cases
    WHERE case_number LIKE 'FOR-' || year_part || '-%';
    
    case_number := 'FOR-' || year_part || '-' || LPAD(seq_num::TEXT, 6, '0');
    RETURN case_number;
END;
$$ LANGUAGE plpgsql;

-- Check incident SLA breach
CREATE OR REPLACE FUNCTION ctdisr.check_incident_sla_breach()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.response_sla_minutes IS NOT NULL AND NEW.triaged_at IS NOT NULL THEN
        IF EXTRACT(EPOCH FROM (NEW.triaged_at - NEW.detected_at))/60 > NEW.response_sla_minutes THEN
            NEW.sla_breached := TRUE;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_sla_breach
    BEFORE UPDATE ON ctdisr.security_incidents
    FOR EACH ROW
    EXECUTE FUNCTION ctdisr.check_incident_sla_breach();

-- Update timestamps trigger
CREATE TRIGGER update_incidents_timestamp
    BEFORE UPDATE ON ctdisr.security_incidents
    FOR EACH ROW EXECUTE FUNCTION ctdisr.update_timestamp();

CREATE TRIGGER update_evidence_timestamp
    BEFORE UPDATE ON ctdisr.digital_evidence
    FOR EACH ROW EXECUTE FUNCTION ctdisr.update_timestamp();

CREATE TRIGGER update_forensic_timestamp
    BEFORE UPDATE ON ctdisr.forensic_cases
    FOR EACH ROW EXECUTE FUNCTION ctdisr.update_timestamp();

CREATE TRIGGER update_irt_timestamp
    BEFORE UPDATE ON ctdisr.incident_response_team
    FOR EACH ROW EXECUTE FUNCTION ctdisr.update_timestamp();

-- Comments
COMMENT ON TABLE ctdisr.security_incidents IS 'CTDISR-2025 Chapter 7: Security incident tracking with full lifecycle management';
COMMENT ON TABLE ctdisr.incident_timeline IS 'Chronological record of all incident activities for audit trail';
COMMENT ON TABLE ctdisr.response_playbooks IS 'Pre-defined incident response procedures per category and severity';
COMMENT ON TABLE ctdisr.digital_evidence IS 'Registry of all digital evidence with integrity hashing';
COMMENT ON TABLE ctdisr.evidence_chain_of_custody IS 'Immutable chain of custody log for legal admissibility';
COMMENT ON TABLE ctdisr.forensic_cases IS 'Digital forensic investigation cases and findings';
COMMENT ON TABLE ctdisr.forensic_activities IS 'Detailed forensic analysis activities and results';
COMMENT ON TABLE ctdisr.incident_response_team IS 'Incident response team roster and availability';
COMMENT ON TABLE ctdisr.incident_communications IS 'All communications related to incidents including regulatory notifications';
