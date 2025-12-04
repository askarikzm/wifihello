-- NetAxis ISP - CTDISR-2025 Cryptography Framework
-- Key Management, Encryption & Certificate Management

-- =====================================================
-- CRYPTOGRAPHIC KEY MANAGEMENT
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_alias VARCHAR(100) UNIQUE NOT NULL,
    key_type VARCHAR(50) NOT NULL CHECK (key_type IN ('AES-256', 'RSA-4096', 'EC-P256', 'HMAC-SHA256')),
    purpose VARCHAR(100) NOT NULL,
    algorithm VARCHAR(50) NOT NULL,
    key_length INTEGER NOT NULL,
    encrypted_key_material BYTEA NOT NULL, -- Encrypted with Master Key
    key_version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rotating', 'deprecated', 'destroyed')),
    activation_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiration_date TIMESTAMPTZ,
    rotation_interval_days INTEGER DEFAULT 90,
    last_rotated_at TIMESTAMPTZ,
    next_rotation_at TIMESTAMPTZ,
    hsm_backed BOOLEAN DEFAULT FALSE,
    key_metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_encryption_keys_alias ON ctdisr.encryption_keys(key_alias);
CREATE INDEX idx_encryption_keys_status ON ctdisr.encryption_keys(status);
CREATE INDEX idx_encryption_keys_rotation ON ctdisr.encryption_keys(next_rotation_at) WHERE status = 'active';

-- Key rotation history for audit trail
CREATE TABLE IF NOT EXISTS ctdisr.key_rotation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id UUID NOT NULL REFERENCES ctdisr.encryption_keys(id),
    old_version INTEGER NOT NULL,
    new_version INTEGER NOT NULL,
    rotation_reason VARCHAR(100) NOT NULL CHECK (rotation_reason IN ('scheduled', 'manual', 'compromise', 'policy', 'emergency')),
    rotated_by UUID REFERENCES auth.users(id),
    rotation_details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_key_rotation_key_id ON ctdisr.key_rotation_history(key_id);

-- =====================================================
-- CERTIFICATE MANAGEMENT
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cert_alias VARCHAR(100) UNIQUE NOT NULL,
    subject_cn VARCHAR(255) NOT NULL,
    subject_dn TEXT NOT NULL,
    issuer_dn TEXT NOT NULL,
    serial_number VARCHAR(100) NOT NULL,
    cert_type VARCHAR(50) NOT NULL CHECK (cert_type IN ('server', 'client', 'code-signing', 'ca', 'intermediate')),
    key_algorithm VARCHAR(50) NOT NULL,
    signature_algorithm VARCHAR(100) NOT NULL,
    key_size INTEGER NOT NULL,
    not_before TIMESTAMPTZ NOT NULL,
    not_after TIMESTAMPTZ NOT NULL,
    certificate_pem TEXT NOT NULL,
    fingerprint_sha256 VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'pending')),
    revocation_reason VARCHAR(100),
    revoked_at TIMESTAMPTZ,
    auto_renew BOOLEAN DEFAULT TRUE,
    renewal_days_before INTEGER DEFAULT 30,
    associated_domains TEXT[],
    certificate_metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_certificates_alias ON ctdisr.certificates(cert_alias);
CREATE INDEX idx_certificates_status ON ctdisr.certificates(status);
CREATE INDEX idx_certificates_expiry ON ctdisr.certificates(not_after) WHERE status = 'active';
CREATE INDEX idx_certificates_fingerprint ON ctdisr.certificates(fingerprint_sha256);

-- Certificate renewal tracking
CREATE TABLE IF NOT EXISTS ctdisr.certificate_renewals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_id UUID NOT NULL REFERENCES ctdisr.certificates(id),
    old_fingerprint VARCHAR(64) NOT NULL,
    new_fingerprint VARCHAR(64),
    renewal_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (renewal_status IN ('pending', 'in_progress', 'completed', 'failed')),
    initiated_by UUID REFERENCES auth.users(id),
    initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    failure_reason TEXT,
    renewal_details JSONB DEFAULT '{}'
);

CREATE INDEX idx_cert_renewals_cert_id ON ctdisr.certificate_renewals(certificate_id);

-- =====================================================
-- DATA ENCRYPTION TRACKING
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.encrypted_data_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_reference VARCHAR(255) NOT NULL, -- Table.column or file path
    data_type VARCHAR(50) NOT NULL CHECK (data_type IN ('pii', 'financial', 'cdr', 'credentials', 'config', 'backup')),
    encryption_key_id UUID NOT NULL REFERENCES ctdisr.encryption_keys(id),
    encryption_algorithm VARCHAR(50) NOT NULL,
    encryption_mode VARCHAR(20) NOT NULL CHECK (encryption_mode IN ('GCM', 'CBC', 'CTR')),
    iv_nonce_size INTEGER NOT NULL,
    tag_size INTEGER, -- For authenticated encryption
    is_active BOOLEAN DEFAULT TRUE,
    last_re_encrypted_at TIMESTAMPTZ,
    data_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_encrypted_data_reference ON ctdisr.encrypted_data_registry(data_reference);
CREATE INDEX idx_encrypted_data_key ON ctdisr.encrypted_data_registry(encryption_key_id);

-- =====================================================
-- HSM INTEGRATION TRACKING
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.hsm_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hsm_id VARCHAR(100) NOT NULL,
    operation_type VARCHAR(50) NOT NULL CHECK (operation_type IN ('encrypt', 'decrypt', 'sign', 'verify', 'wrap', 'unwrap', 'generate')),
    key_handle VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'timeout')),
    latency_ms INTEGER,
    error_code VARCHAR(50),
    error_message TEXT,
    request_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hsm_ops_created ON ctdisr.hsm_operations(created_at DESC);
CREATE INDEX idx_hsm_ops_status ON ctdisr.hsm_operations(status);

-- =====================================================
-- CRYPTOGRAPHIC POLICY CONFIGURATION
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.crypto_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    min_key_length INTEGER NOT NULL,
    allowed_algorithms TEXT[] NOT NULL,
    allowed_modes TEXT[] NOT NULL,
    require_hsm BOOLEAN DEFAULT FALSE,
    max_key_age_days INTEGER DEFAULT 365,
    require_key_rotation BOOLEAN DEFAULT TRUE,
    rotation_interval_days INTEGER DEFAULT 90,
    require_dual_control BOOLEAN DEFAULT FALSE,
    policy_metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default CTDISR-2025 compliant policies
INSERT INTO ctdisr.crypto_policies (policy_name, description, min_key_length, allowed_algorithms, allowed_modes, require_hsm, max_key_age_days, rotation_interval_days, require_dual_control)
VALUES
    ('ctdisr_pii_encryption', 'CTDISR-2025 PII data encryption policy', 256, ARRAY['AES-256-GCM'], ARRAY['GCM'], FALSE, 365, 90, FALSE),
    ('ctdisr_financial_encryption', 'CTDISR-2025 Financial data encryption policy', 256, ARRAY['AES-256-GCM'], ARRAY['GCM'], TRUE, 180, 60, TRUE),
    ('ctdisr_cdr_encryption', 'CTDISR-2025 CDR data encryption policy', 256, ARRAY['AES-256-GCM', 'AES-256-CBC'], ARRAY['GCM', 'CBC'], FALSE, 365, 90, FALSE),
    ('ctdisr_backup_encryption', 'CTDISR-2025 Backup encryption policy', 256, ARRAY['AES-256-GCM'], ARRAY['GCM'], TRUE, 730, 180, TRUE),
    ('ctdisr_transit_encryption', 'CTDISR-2025 Data in transit encryption policy', 256, ARRAY['TLS-1.3', 'TLS-1.2'], ARRAY['GCM'], FALSE, 365, 365, FALSE)
ON CONFLICT (policy_name) DO NOTHING;

-- =====================================================
-- ENCRYPTION AUDIT LOG
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.crypto_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_type VARCHAR(50) NOT NULL CHECK (operation_type IN ('encrypt', 'decrypt', 'sign', 'verify', 'key_generate', 'key_rotate', 'key_destroy', 'cert_issue', 'cert_revoke')),
    key_id UUID REFERENCES ctdisr.encryption_keys(id),
    certificate_id UUID REFERENCES ctdisr.certificates(id),
    user_id UUID REFERENCES auth.users(id),
    session_id UUID,
    ip_address INET,
    data_reference VARCHAR(255),
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'denied')),
    failure_reason TEXT,
    operation_details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crypto_audit_created ON ctdisr.crypto_audit_log(created_at DESC);
CREATE INDEX idx_crypto_audit_user ON ctdisr.crypto_audit_log(user_id);
CREATE INDEX idx_crypto_audit_key ON ctdisr.crypto_audit_log(key_id);
CREATE INDEX idx_crypto_audit_operation ON ctdisr.crypto_audit_log(operation_type);

-- =====================================================
-- KEY ESCROW (For lawful interception compliance)
-- =====================================================

CREATE TABLE IF NOT EXISTS ctdisr.key_escrow (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id UUID NOT NULL REFERENCES ctdisr.encryption_keys(id),
    escrow_holder VARCHAR(100) NOT NULL CHECK (escrow_holder IN ('pta', 'fia', 'internal', 'backup')),
    encrypted_escrow_key BYTEA NOT NULL, -- Key encrypted for escrow holder
    escrow_public_key_fingerprint VARCHAR(64) NOT NULL,
    escrow_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiration_date TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    escrow_metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_key_escrow_key_id ON ctdisr.key_escrow(key_id);
CREATE INDEX idx_key_escrow_holder ON ctdisr.key_escrow(escrow_holder);

-- Escrow access log
CREATE TABLE IF NOT EXISTS ctdisr.escrow_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escrow_id UUID NOT NULL REFERENCES ctdisr.key_escrow(id),
    accessed_by VARCHAR(100) NOT NULL,
    access_reason TEXT NOT NULL,
    authorization_reference VARCHAR(100), -- Court order, PTA directive, etc.
    ip_address INET,
    access_granted BOOLEAN NOT NULL,
    denial_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_escrow_access_escrow_id ON ctdisr.escrow_access_log(escrow_id);

-- =====================================================
-- RLS POLICIES
-- =====================================================

ALTER TABLE ctdisr.encryption_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.key_rotation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.certificate_renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.encrypted_data_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.hsm_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.crypto_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.crypto_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.key_escrow ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctdisr.escrow_access_log ENABLE ROW LEVEL SECURITY;

-- Only security admins can access cryptographic data
CREATE POLICY crypto_admin_policy ON ctdisr.encryption_keys
    FOR ALL USING (
        auth.jwt() ->> 'role' IN ('security_admin', 'service_role')
    );

CREATE POLICY crypto_policy_admin ON ctdisr.crypto_policies
    FOR ALL USING (
        auth.jwt() ->> 'role' IN ('security_admin', 'service_role')
    );

CREATE POLICY crypto_audit_view ON ctdisr.crypto_audit_log
    FOR SELECT USING (
        auth.jwt() ->> 'role' IN ('security_admin', 'compliance_officer', 'service_role')
    );

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Check if key needs rotation
CREATE OR REPLACE FUNCTION ctdisr.check_key_rotation_needed(p_key_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_next_rotation TIMESTAMPTZ;
    v_status VARCHAR(20);
BEGIN
    SELECT next_rotation_at, status INTO v_next_rotation, v_status
    FROM ctdisr.encryption_keys
    WHERE id = p_key_id;
    
    IF v_status != 'active' THEN
        RETURN FALSE;
    END IF;
    
    RETURN v_next_rotation IS NOT NULL AND v_next_rotation <= NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get keys needing rotation
CREATE OR REPLACE FUNCTION ctdisr.get_keys_needing_rotation()
RETURNS TABLE (
    key_id UUID,
    key_alias VARCHAR(100),
    key_type VARCHAR(50),
    days_overdue INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ek.id,
        ek.key_alias,
        ek.key_type,
        EXTRACT(DAY FROM NOW() - ek.next_rotation_at)::INTEGER
    FROM ctdisr.encryption_keys ek
    WHERE ek.status = 'active'
      AND ek.next_rotation_at <= NOW()
    ORDER BY ek.next_rotation_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get expiring certificates
CREATE OR REPLACE FUNCTION ctdisr.get_expiring_certificates(p_days_ahead INTEGER DEFAULT 30)
RETURNS TABLE (
    cert_id UUID,
    cert_alias VARCHAR(100),
    subject_cn VARCHAR(255),
    expires_at TIMESTAMPTZ,
    days_until_expiry INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.cert_alias,
        c.subject_cn,
        c.not_after,
        EXTRACT(DAY FROM c.not_after - NOW())::INTEGER
    FROM ctdisr.certificates c
    WHERE c.status = 'active'
      AND c.not_after <= NOW() + (p_days_ahead || ' days')::INTERVAL
    ORDER BY c.not_after;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crypto compliance summary
CREATE OR REPLACE FUNCTION ctdisr.get_crypto_compliance_summary()
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_active_keys', (SELECT COUNT(*) FROM ctdisr.encryption_keys WHERE status = 'active'),
        'keys_needing_rotation', (SELECT COUNT(*) FROM ctdisr.encryption_keys WHERE status = 'active' AND next_rotation_at <= NOW()),
        'total_active_certificates', (SELECT COUNT(*) FROM ctdisr.certificates WHERE status = 'active'),
        'certificates_expiring_30_days', (SELECT COUNT(*) FROM ctdisr.certificates WHERE status = 'active' AND not_after <= NOW() + INTERVAL '30 days'),
        'hsm_operations_today', (SELECT COUNT(*) FROM ctdisr.hsm_operations WHERE created_at >= CURRENT_DATE),
        'crypto_operations_today', (SELECT COUNT(*) FROM ctdisr.crypto_audit_log WHERE created_at >= CURRENT_DATE),
        'failed_operations_today', (SELECT COUNT(*) FROM ctdisr.crypto_audit_log WHERE created_at >= CURRENT_DATE AND status = 'failed'),
        'active_policies', (SELECT COUNT(*) FROM ctdisr.crypto_policies WHERE is_active = TRUE),
        'escrowed_keys', (SELECT COUNT(*) FROM ctdisr.key_escrow),
        'generated_at', NOW()
    ) INTO v_result;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for key rotation tracking
CREATE OR REPLACE FUNCTION ctdisr.update_key_rotation_schedule()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.rotation_interval_days IS NOT NULL THEN
        NEW.next_rotation_at := COALESCE(NEW.last_rotated_at, NEW.activation_date) + (NEW.rotation_interval_days || ' days')::INTERVAL;
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_key_rotation_schedule
    BEFORE INSERT OR UPDATE ON ctdisr.encryption_keys
    FOR EACH ROW EXECUTE FUNCTION ctdisr.update_key_rotation_schedule();

-- Trigger for certificate expiry alerts
CREATE OR REPLACE FUNCTION ctdisr.check_certificate_expiry()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark certificates as expired
    IF NEW.not_after < NOW() AND NEW.status = 'active' THEN
        NEW.status := 'expired';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_certificate_expiry
    BEFORE UPDATE ON ctdisr.certificates
    FOR EACH ROW EXECUTE FUNCTION ctdisr.check_certificate_expiry();

COMMENT ON TABLE ctdisr.encryption_keys IS 'CTDISR-2025 encryption key management with automated rotation';
COMMENT ON TABLE ctdisr.certificates IS 'CTDISR-2025 certificate management for TLS and code signing';
COMMENT ON TABLE ctdisr.key_escrow IS 'CTDISR-2025 key escrow for lawful interception compliance';
