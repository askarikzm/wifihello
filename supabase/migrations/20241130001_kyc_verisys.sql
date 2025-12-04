-- ============================================
-- NetAxis ISP Portal - KYC Verisys Integration
-- Migration: 20241130001_kyc_verisys.sql
-- Description: NADRA Verisys CNIC verification tables
-- Regulatory: PTRA 1996, PTA KYC Rules, CTDISR
-- ============================================

-- Step 1: Create KYC schema for isolation (optional module)
CREATE SCHEMA IF NOT EXISTS kyc;

-- Step 2: Create enum types for KYC status
DO $$ BEGIN
    CREATE TYPE kyc.verification_status AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE kyc.kyc_status AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Step 3: Main KYC verification table
-- Stores all NADRA Verisys verification attempts and results
CREATE TABLE IF NOT EXISTS kyc.verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User reference (links to auth.users)
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    
    -- CNIC data (NEVER store raw CNIC)
    cnic_hash TEXT NOT NULL,  -- SHA-256 hash of CNIC (13 digits, no dashes)
    cnic_last4 TEXT NOT NULL, -- Last 4 digits for operator reference
    cnic_issue_date DATE,
    cnic_expiry_date DATE,
    
    -- Verification status
    verification_status kyc.verification_status NOT NULL DEFAULT 'PENDING',
    
    -- NADRA response data (encrypted at rest via Supabase)
    nadra_name TEXT,
    nadra_father_husband_name TEXT,
    nadra_dob DATE,
    nadra_gender TEXT,
    nadra_permanent_address TEXT,
    nadra_present_address TEXT,
    nadra_photo_match BOOLEAN,
    
    -- NADRA transaction metadata
    nadra_response_code TEXT,
    nadra_response_message TEXT,
    nadra_reference_id TEXT,  -- NADRA's transaction ID
    nadra_request_timestamp TIMESTAMPTZ,
    nadra_response_timestamp TIMESTAMPTZ,
    
    -- Request metadata (for audit/compliance)
    request_ip INET,
    request_user_agent TEXT,
    request_source TEXT DEFAULT 'customer_portal',  -- customer_portal, admin_portal, api
    
    -- Attempt tracking (rate limiting)
    attempt_number INTEGER DEFAULT 1,
    
    -- Consent tracking (PTRA compliance)
    consent_given BOOLEAN NOT NULL DEFAULT FALSE,
    consent_timestamp TIMESTAMPTZ,
    consent_ip INET,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,  -- Optional: KYC expiry for re-verification
    
    -- Constraints
    CONSTRAINT valid_cnic_hash CHECK (LENGTH(cnic_hash) = 64),  -- SHA-256 = 64 hex chars
    CONSTRAINT valid_cnic_last4 CHECK (LENGTH(cnic_last4) = 4 AND cnic_last4 ~ '^[0-9]{4}$')
);

-- Step 4: Add kyc_status column to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS kyc_status kyc.kyc_status DEFAULT 'UNVERIFIED';

ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ;

ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS kyc_verification_id UUID REFERENCES kyc.verifications(id);

-- Step 5: KYC rate limiting table (track attempts per user per day)
CREATE TABLE IF NOT EXISTS kyc.rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    blocked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_user_date UNIQUE (user_id, date)
);

-- Step 6: KYC audit log (append-only, immutable for PTA compliance)
CREATE TABLE IF NOT EXISTS kyc.audit_logs (
    id BIGSERIAL PRIMARY KEY,
    
    -- Actor info
    actor_user_id UUID NOT NULL,
    actor_role TEXT,  -- customer, admin, system
    actor_ip INET,
    
    -- Action details
    action TEXT NOT NULL,  -- VERIFY_INITIATED, VERIFY_SUCCESS, VERIFY_FAILED, VIEW_KYC, EXPORT_KYC
    entity_type TEXT NOT NULL DEFAULT 'kyc_verification',
    entity_id UUID,
    
    -- Target user (for admin viewing customer KYC)
    target_user_id UUID,
    
    -- Result
    status TEXT NOT NULL,  -- SUCCESS, FAILURE, ERROR
    error_code TEXT,
    error_message TEXT,
    
    -- Metadata (JSON for flexibility)
    metadata JSONB DEFAULT '{}',
    
    -- Immutable timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Hash of previous record for tamper detection (blockchain-like)
    prev_hash TEXT,
    record_hash TEXT
);

-- Make audit_logs append-only (no UPDATE or DELETE)
CREATE OR REPLACE FUNCTION kyc.prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable. UPDATE and DELETE operations are not allowed.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_audit_update ON kyc.audit_logs;
CREATE TRIGGER prevent_audit_update
    BEFORE UPDATE OR DELETE ON kyc.audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION kyc.prevent_audit_modification();

-- Step 7: Indexes for performance
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_user_id ON kyc.verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_customer_id ON kyc.verifications(customer_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_status ON kyc.verifications(verification_status);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_cnic_hash ON kyc.verifications(cnic_hash);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_created_at ON kyc.verifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kyc_rate_limits_user_date ON kyc.rate_limits(user_id, date);
CREATE INDEX IF NOT EXISTS idx_kyc_audit_logs_user ON kyc.audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_audit_logs_target ON kyc.audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_audit_logs_created ON kyc.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_kyc_status ON public.customers(kyc_status);

-- Step 8: Enable Row Level Security
ALTER TABLE kyc.verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc.audit_logs ENABLE ROW LEVEL SECURITY;

-- Step 9: RLS Policies

-- Users can only see their own KYC verifications
CREATE POLICY "users_own_kyc_verifications" ON kyc.verifications
    FOR SELECT
    USING (user_id = auth.uid());

-- Users can insert their own KYC verification requests
CREATE POLICY "users_insert_own_kyc" ON kyc.verifications
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Service role has full access (for backend operations)
CREATE POLICY "service_role_kyc_verifications" ON kyc.verifications
    FOR ALL
    USING (auth.role() = 'service_role');

-- Rate limits - users can see their own
CREATE POLICY "users_own_rate_limits" ON kyc.rate_limits
    FOR SELECT
    USING (user_id = auth.uid());

-- Service role full access to rate limits
CREATE POLICY "service_role_rate_limits" ON kyc.rate_limits
    FOR ALL
    USING (auth.role() = 'service_role');

-- Audit logs - users can see logs where they are actor or target
CREATE POLICY "users_own_audit_logs" ON kyc.audit_logs
    FOR SELECT
    USING (actor_user_id = auth.uid() OR target_user_id = auth.uid());

-- Service role full access to audit logs (insert only effectively due to trigger)
CREATE POLICY "service_role_audit_logs" ON kyc.audit_logs
    FOR ALL
    USING (auth.role() = 'service_role');

-- Step 10: Admin access policies
-- Admins (from admin_roles table) can view all KYC records

CREATE OR REPLACE FUNCTION kyc.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_roles 
        WHERE user_id = auth.uid() 
        AND role IN ('superadmin', 'noc', 'support')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "admins_view_all_kyc" ON kyc.verifications
    FOR SELECT
    USING (kyc.is_admin());

CREATE POLICY "admins_view_all_audit" ON kyc.audit_logs
    FOR SELECT
    USING (kyc.is_admin());

-- Step 11: Helper functions

-- Function to hash CNIC (called from application, but available in DB too)
CREATE OR REPLACE FUNCTION kyc.hash_cnic(cnic TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Remove dashes and spaces, then SHA-256 hash
    RETURN encode(sha256(regexp_replace(cnic, '[-\s]', '', 'g')::bytea), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get last 4 digits of CNIC
CREATE OR REPLACE FUNCTION kyc.cnic_last4(cnic TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN RIGHT(regexp_replace(cnic, '[-\s]', '', 'g'), 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if user can attempt KYC (rate limiting)
CREATE OR REPLACE FUNCTION kyc.can_attempt_verification(p_user_id UUID, max_attempts INTEGER DEFAULT 3)
RETURNS BOOLEAN AS $$
DECLARE
    current_attempts INTEGER;
    is_blocked BOOLEAN;
BEGIN
    SELECT 
        attempt_count,
        blocked_until > NOW()
    INTO current_attempts, is_blocked
    FROM kyc.rate_limits
    WHERE user_id = p_user_id AND date = CURRENT_DATE;
    
    IF is_blocked THEN
        RETURN FALSE;
    END IF;
    
    IF current_attempts IS NULL THEN
        RETURN TRUE;
    END IF;
    
    RETURN current_attempts < max_attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment attempt count
CREATE OR REPLACE FUNCTION kyc.increment_attempt(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    new_count INTEGER;
BEGIN
    INSERT INTO kyc.rate_limits (user_id, date, attempt_count, last_attempt_at)
    VALUES (p_user_id, CURRENT_DATE, 1, NOW())
    ON CONFLICT (user_id, date) 
    DO UPDATE SET 
        attempt_count = kyc.rate_limits.attempt_count + 1,
        last_attempt_at = NOW()
    RETURNING attempt_count INTO new_count;
    
    RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update customer KYC status
CREATE OR REPLACE FUNCTION kyc.update_customer_kyc_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the customer record when verification status changes
    IF NEW.verification_status = 'VERIFIED' THEN
        UPDATE public.customers
        SET 
            kyc_status = 'VERIFIED',
            kyc_verified_at = NOW(),
            kyc_verification_id = NEW.id
        WHERE user_id = NEW.user_id;
        
        -- Also update the verification record
        NEW.verified_at = NOW();
    ELSIF NEW.verification_status = 'FAILED' THEN
        UPDATE public.customers
        SET kyc_status = 'FAILED'
        WHERE user_id = NEW.user_id 
        AND kyc_status != 'VERIFIED';  -- Don't downgrade if already verified
    END IF;
    
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_kyc_status ON kyc.verifications;
CREATE TRIGGER trigger_update_kyc_status
    BEFORE UPDATE ON kyc.verifications
    FOR EACH ROW
    WHEN (OLD.verification_status IS DISTINCT FROM NEW.verification_status)
    EXECUTE FUNCTION kyc.update_customer_kyc_status();

-- Step 12: View for admin dashboard
CREATE OR REPLACE VIEW kyc.verification_summary AS
SELECT 
    v.id,
    v.user_id,
    v.customer_id,
    c.account_no,
    c.full_name AS customer_name,
    c.phone AS customer_phone,
    v.cnic_last4,
    v.verification_status,
    v.nadra_name,
    v.nadra_father_husband_name,
    v.nadra_response_code,
    v.nadra_reference_id,
    v.consent_given,
    v.consent_timestamp,
    v.created_at,
    v.verified_at,
    v.attempt_number,
    v.request_source
FROM kyc.verifications v
LEFT JOIN public.customers c ON c.id = v.customer_id;

-- Grant access to the view
GRANT SELECT ON kyc.verification_summary TO authenticated;

-- ============================================
-- MIGRATION COMPLETE
-- 
-- Tables created:
--   - kyc.verifications (main KYC records)
--   - kyc.rate_limits (rate limiting)
--   - kyc.audit_logs (immutable audit trail)
--
-- Columns added to public.customers:
--   - kyc_status
--   - kyc_verified_at
--   - kyc_verification_id
--
-- RLS enabled with policies for:
--   - Users viewing own records
--   - Admins viewing all records
--   - Service role full access
-- ============================================
