-- ============================================
-- WANCOM ISP Portal - PTA Audit Export Templates Seed
-- Seeds standard PTA-compliant export templates
-- ============================================

-- Template 1: IPDR Daily Export
-- Internet Protocol Detail Record - Required by PTA for all ISPs
INSERT INTO audit_export.templates (
    code,
    name,
    description,
    enabled,
    default_format,
    source_table,
    source_schema,
    date_filter_field,
    region_filter_field,
    max_range_days,
    max_rows_per_export,
    pta_category,
    retention_days,
    columns
) VALUES (
    'IPDR_DAILY',
    'IPDR Daily Export',
    'Internet Protocol Detail Records - Daily subscriber session data as required by PTA CTDISR guidelines',
    true,
    'xlsx',
    'radius_sessions',
    'public',
    'session_start',
    NULL,
    7,
    500000,
    'IPDR',
    365,
    '[
        {"key": "session_id", "header": "Session ID", "type": "string", "source": "radius_sessions.session_id", "required": true},
        {"key": "subscriber_username", "header": "Subscriber Username", "type": "string", "source": "radius_sessions.username", "required": true},
        {"key": "cnic", "header": "CNIC", "type": "string", "source": "customers.cnic", "required": true, "mask": "first5"},
        {"key": "customer_name", "header": "Customer Name", "type": "string", "source": "customers.full_name", "required": true},
        {"key": "account_no", "header": "Account No", "type": "string", "source": "customers.account_no", "required": true},
        {"key": "public_ip", "header": "Public IP Address", "type": "inet", "source": "radius_sessions.framed_ip_address", "required": true},
        {"key": "nas_ip", "header": "NAS IP Address", "type": "inet", "source": "radius_sessions.nas_ip_address", "required": true},
        {"key": "session_start", "header": "Session Start (PKT)", "type": "timestamp", "source": "radius_sessions.session_start", "required": true, "timezone": "Asia/Karachi"},
        {"key": "session_end", "header": "Session End (PKT)", "type": "timestamp", "source": "radius_sessions.session_end", "required": false, "timezone": "Asia/Karachi"},
        {"key": "session_duration_seconds", "header": "Session Duration (Seconds)", "type": "integer", "source": "radius_sessions.session_time", "required": false},
        {"key": "input_bytes", "header": "Download (Bytes)", "type": "bigint", "source": "radius_sessions.input_octets", "required": false},
        {"key": "output_bytes", "header": "Upload (Bytes)", "type": "bigint", "source": "radius_sessions.output_octets", "required": false},
        {"key": "terminate_cause", "header": "Terminate Cause", "type": "string", "source": "radius_sessions.terminate_cause", "required": false},
        {"key": "mac_address", "header": "MAC Address", "type": "string", "source": "onu_mapping.mac_address", "required": false}
    ]'::jsonb
) ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    columns = EXCLUDED.columns,
    updated_at = NOW();

-- Template 2: RADIUS Authentication Logs
INSERT INTO audit_export.templates (
    code,
    name,
    description,
    enabled,
    default_format,
    source_table,
    source_schema,
    date_filter_field,
    max_range_days,
    max_rows_per_export,
    pta_category,
    retention_days,
    columns
) VALUES (
    'RADIUS_AUTH_LOGS',
    'RADIUS Authentication Logs',
    'All authentication attempts (success and failure) for PTA security audit',
    true,
    'xlsx',
    'radius_auth_logs',
    'public',
    'attempted_at',
    31,
    1000000,
    'AUTH',
    365,
    '[
        {"key": "id", "header": "Log ID", "type": "bigint", "source": "radius_auth_logs.id", "required": true},
        {"key": "username", "header": "Username", "type": "string", "source": "radius_auth_logs.username", "required": true},
        {"key": "success", "header": "Auth Success", "type": "boolean", "source": "radius_auth_logs.success", "required": true},
        {"key": "nas_ip_address", "header": "NAS IP", "type": "string", "source": "radius_auth_logs.nas_ip_address", "required": true},
        {"key": "failure_reason", "header": "Failure Reason", "type": "string", "source": "radius_auth_logs.failure_reason", "required": false},
        {"key": "attempted_at", "header": "Attempt Time (PKT)", "type": "timestamp", "source": "radius_auth_logs.attempted_at", "required": true, "timezone": "Asia/Karachi"}
    ]'::jsonb
) ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    columns = EXCLUDED.columns,
    updated_at = NOW();

-- Template 3: Subscriber Activation/Deactivation
INSERT INTO audit_export.templates (
    code,
    name,
    description,
    enabled,
    default_format,
    source_table,
    source_schema,
    date_filter_field,
    max_range_days,
    max_rows_per_export,
    pta_category,
    retention_days,
    columns
) VALUES (
    'SUBSCRIBER_ACTIVATION',
    'Subscriber Activation/Deactivation Report',
    'All subscriber status changes including activation, suspension, and termination events',
    true,
    'xlsx',
    'customers',
    'public',
    'created_at',
    90,
    100000,
    'KYC',
    730,
    '[
        {"key": "account_no", "header": "Account No", "type": "string", "source": "customers.account_no", "required": true},
        {"key": "full_name", "header": "Subscriber Name", "type": "string", "source": "customers.full_name", "required": true},
        {"key": "cnic", "header": "CNIC", "type": "string", "source": "customers.cnic", "required": true},
        {"key": "phone", "header": "Phone", "type": "string", "source": "customers.phone", "required": true},
        {"key": "email", "header": "Email", "type": "string", "source": "customers.email", "required": false},
        {"key": "address", "header": "Address", "type": "string", "source": "customers.address", "required": false},
        {"key": "status", "header": "Current Status", "type": "string", "source": "customers.status", "required": true},
        {"key": "kyc_status", "header": "KYC Status", "type": "string", "source": "customers.kyc_status", "required": false},
        {"key": "created_at", "header": "Registration Date (PKT)", "type": "timestamp", "source": "customers.created_at", "required": true, "timezone": "Asia/Karachi"},
        {"key": "service_name", "header": "Package", "type": "string", "source": "services.name", "required": false},
        {"key": "subscription_start", "header": "Service Start Date", "type": "date", "source": "subscriptions.start_date", "required": false}
    ]'::jsonb
) ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    columns = EXCLUDED.columns,
    updated_at = NOW();

-- Template 4: KYC/Verisys Verification Logs
INSERT INTO audit_export.templates (
    code,
    name,
    description,
    enabled,
    default_format,
    source_table,
    source_schema,
    date_filter_field,
    max_range_days,
    max_rows_per_export,
    pta_category,
    retention_days,
    columns
) VALUES (
    'KYC_VERISYS_LOGS',
    'KYC/Verisys Verification Logs',
    'NADRA Verisys CNIC verification attempts and results for PTA KYC compliance',
    true,
    'xlsx',
    'verifications',
    'kyc',
    'created_at',
    90,
    50000,
    'KYC',
    1825,
    '[
        {"key": "id", "header": "Verification ID", "type": "uuid", "source": "verifications.id", "required": true},
        {"key": "account_no", "header": "Account No", "type": "string", "source": "customers.account_no", "required": false},
        {"key": "cnic_last4", "header": "CNIC Last 4", "type": "string", "source": "verifications.cnic_last4", "required": true},
        {"key": "verification_status", "header": "Verification Status", "type": "string", "source": "verifications.verification_status", "required": true},
        {"key": "nadra_name", "header": "NADRA Name", "type": "string", "source": "verifications.nadra_name", "required": false},
        {"key": "nadra_response_code", "header": "NADRA Response Code", "type": "string", "source": "verifications.nadra_response_code", "required": false},
        {"key": "nadra_reference_id", "header": "NADRA Reference ID", "type": "string", "source": "verifications.nadra_reference_id", "required": false},
        {"key": "consent_given", "header": "Consent Given", "type": "boolean", "source": "verifications.consent_given", "required": true},
        {"key": "consent_timestamp", "header": "Consent Time (PKT)", "type": "timestamp", "source": "verifications.consent_timestamp", "required": false, "timezone": "Asia/Karachi"},
        {"key": "request_source", "header": "Request Source", "type": "string", "source": "verifications.request_source", "required": true},
        {"key": "request_ip", "header": "Request IP", "type": "inet", "source": "verifications.request_ip", "required": false},
        {"key": "created_at", "header": "Verification Date (PKT)", "type": "timestamp", "source": "verifications.created_at", "required": true, "timezone": "Asia/Karachi"},
        {"key": "verified_at", "header": "Verified At (PKT)", "type": "timestamp", "source": "verifications.verified_at", "required": false, "timezone": "Asia/Karachi"}
    ]'::jsonb
) ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    columns = EXCLUDED.columns,
    updated_at = NOW();

-- Template 5: Customer Complaints Summary
INSERT INTO audit_export.templates (
    code,
    name,
    description,
    enabled,
    default_format,
    source_table,
    source_schema,
    date_filter_field,
    max_range_days,
    max_rows_per_export,
    pta_category,
    retention_days,
    columns
) VALUES (
    'COMPLAINTS_SUMMARY',
    'Customer Complaints Summary',
    'All customer complaints with resolution status for PTA consumer protection audit',
    true,
    'xlsx',
    'support_tickets',
    'public',
    'created_at',
    90,
    100000,
    'COMPLAINTS',
    365,
    '[
        {"key": "ticket_no", "header": "Ticket No", "type": "string", "source": "support_tickets.ticket_no", "required": true},
        {"key": "account_no", "header": "Account No", "type": "string", "source": "customers.account_no", "required": true},
        {"key": "customer_name", "header": "Customer Name", "type": "string", "source": "customers.full_name", "required": true},
        {"key": "subject", "header": "Subject", "type": "string", "source": "support_tickets.subject", "required": true},
        {"key": "category", "header": "Category", "type": "string", "source": "support_tickets.category", "required": true},
        {"key": "priority", "header": "Priority", "type": "string", "source": "support_tickets.priority", "required": true},
        {"key": "status", "header": "Status", "type": "string", "source": "support_tickets.status", "required": true},
        {"key": "created_at", "header": "Created At (PKT)", "type": "timestamp", "source": "support_tickets.created_at", "required": true, "timezone": "Asia/Karachi"},
        {"key": "resolved_at", "header": "Resolved At (PKT)", "type": "timestamp", "source": "support_tickets.resolved_at", "required": false, "timezone": "Asia/Karachi"},
        {"key": "closed_at", "header": "Closed At (PKT)", "type": "timestamp", "source": "support_tickets.closed_at", "required": false, "timezone": "Asia/Karachi"},
        {"key": "resolution_time_hours", "header": "Resolution Time (Hours)", "type": "computed", "source": "EXTRACT(EPOCH FROM (support_tickets.resolved_at - support_tickets.created_at))/3600", "required": false}
    ]'::jsonb
) ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    columns = EXCLUDED.columns,
    updated_at = NOW();

-- Template 6: OLT/Network Alarms
INSERT INTO audit_export.templates (
    code,
    name,
    description,
    enabled,
    default_format,
    source_table,
    source_schema,
    date_filter_field,
    max_range_days,
    max_rows_per_export,
    pta_category,
    retention_days,
    columns
) VALUES (
    'OLT_ALARMS',
    'OLT/Network Alarms Report',
    'Network device alarms and events for infrastructure audit',
    true,
    'xlsx',
    'audit_logs',
    'public',
    'created_at',
    31,
    500000,
    'NETWORK',
    365,
    '[
        {"key": "id", "header": "Event ID", "type": "bigint", "source": "audit_logs.id", "required": true},
        {"key": "action", "header": "Event Type", "type": "string", "source": "audit_logs.action", "required": true},
        {"key": "entity", "header": "Device/Entity", "type": "string", "source": "audit_logs.entity", "required": true},
        {"key": "entity_id", "header": "Device ID", "type": "string", "source": "audit_logs.entity_id", "required": false},
        {"key": "metadata", "header": "Event Details", "type": "jsonb", "source": "audit_logs.metadata", "required": false},
        {"key": "actor_user_id", "header": "Actor User ID", "type": "uuid", "source": "audit_logs.actor_user_id", "required": false},
        {"key": "created_at", "header": "Event Time (PKT)", "type": "timestamp", "source": "audit_logs.created_at", "required": true, "timezone": "Asia/Karachi"}
    ]'::jsonb
) ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    columns = EXCLUDED.columns,
    updated_at = NOW();

-- Template 7: Billing & Payment Records
INSERT INTO audit_export.templates (
    code,
    name,
    description,
    enabled,
    default_format,
    source_table,
    source_schema,
    date_filter_field,
    max_range_days,
    max_rows_per_export,
    pta_category,
    retention_days,
    columns
) VALUES (
    'BILLING_RECORDS',
    'Billing & Payment Records',
    'Invoice and payment records for financial audit',
    true,
    'xlsx',
    'invoices',
    'billing',
    'issued_at',
    90,
    200000,
    'BILLING',
    730,
    '[
        {"key": "invoice_no", "header": "Invoice No", "type": "string", "source": "invoices.invoice_no", "required": true},
        {"key": "account_no", "header": "Account No", "type": "string", "source": "customers.account_no", "required": true},
        {"key": "customer_name", "header": "Customer Name", "type": "string", "source": "customers.full_name", "required": true},
        {"key": "period_start", "header": "Period Start", "type": "date", "source": "invoices.period_start", "required": true},
        {"key": "period_end", "header": "Period End", "type": "date", "source": "invoices.period_end", "required": true},
        {"key": "amount", "header": "Amount (PKR)", "type": "decimal", "source": "invoices.amount", "required": true},
        {"key": "tax", "header": "Tax (PKR)", "type": "decimal", "source": "invoices.tax", "required": true},
        {"key": "total", "header": "Total (PKR)", "type": "computed", "source": "invoices.amount + invoices.tax", "required": true},
        {"key": "status", "header": "Invoice Status", "type": "string", "source": "invoices.status", "required": true},
        {"key": "due_date", "header": "Due Date", "type": "date", "source": "invoices.due_date", "required": true},
        {"key": "issued_at", "header": "Issued At (PKT)", "type": "timestamp", "source": "invoices.issued_at", "required": true, "timezone": "Asia/Karachi"},
        {"key": "payment_status", "header": "Payment Status", "type": "string", "source": "payments.status", "required": false},
        {"key": "payment_gateway", "header": "Payment Gateway", "type": "string", "source": "payments.gateway", "required": false},
        {"key": "payment_date", "header": "Payment Date (PKT)", "type": "timestamp", "source": "payments.completed_at", "required": false, "timezone": "Asia/Karachi"}
    ]'::jsonb
) ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    columns = EXCLUDED.columns,
    updated_at = NOW();

-- Template 8: Usage/Traffic Summary (IPDR aggregated)
INSERT INTO audit_export.templates (
    code,
    name,
    description,
    enabled,
    default_format,
    source_table,
    source_schema,
    date_filter_field,
    max_range_days,
    max_rows_per_export,
    pta_category,
    retention_days,
    columns
) VALUES (
    'USAGE_SUMMARY',
    'Data Usage Summary Report',
    'Aggregated data usage per subscriber for traffic analysis',
    true,
    'xlsx',
    'usage_logs',
    'network',
    'recorded_at',
    31,
    500000,
    'IPDR',
    365,
    '[
        {"key": "customer_id", "header": "Customer ID", "type": "uuid", "source": "usage_logs.customer_id", "required": true},
        {"key": "account_no", "header": "Account No", "type": "string", "source": "customers.account_no", "required": true},
        {"key": "customer_name", "header": "Customer Name", "type": "string", "source": "customers.full_name", "required": true},
        {"key": "download_mb", "header": "Download (MB)", "type": "bigint", "source": "usage_logs.download_mb", "required": true},
        {"key": "upload_mb", "header": "Upload (MB)", "type": "bigint", "source": "usage_logs.upload_mb", "required": true},
        {"key": "total_mb", "header": "Total (MB)", "type": "computed", "source": "usage_logs.download_mb + usage_logs.upload_mb", "required": true},
        {"key": "session_id", "header": "Session ID", "type": "string", "source": "usage_logs.session_id", "required": false},
        {"key": "recorded_at", "header": "Recorded At (PKT)", "type": "timestamp", "source": "usage_logs.recorded_at", "required": true, "timezone": "Asia/Karachi"}
    ]'::jsonb
) ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    columns = EXCLUDED.columns,
    updated_at = NOW();

-- Create a default daily IPDR schedule for ISB region
INSERT INTO audit_export.schedules (
    template_id,
    region_code,
    schedule_type,
    time_of_day,
    timezone,
    enabled,
    notification_emails,
    created_by
) 
SELECT 
    t.id,
    'ALL',
    'DAILY',
    '02:00:00',
    'Asia/Karachi',
    false,  -- Disabled by default, enable when ready
    ARRAY['compliance@wancom.pk'],
    '00000000-0000-0000-0000-000000000000'::uuid
FROM audit_export.templates t
WHERE t.code = 'IPDR_DAILY'
ON CONFLICT (template_id, region_code, schedule_type) DO NOTHING;

-- ============================================
-- SEED COMPLETE
-- 
-- Templates seeded:
--   1. IPDR_DAILY - Internet Protocol Detail Records
--   2. RADIUS_AUTH_LOGS - Authentication attempts
--   3. SUBSCRIBER_ACTIVATION - Customer lifecycle
--   4. KYC_VERISYS_LOGS - NADRA verification records
--   5. COMPLAINTS_SUMMARY - Support tickets
--   6. OLT_ALARMS - Network events
--   7. BILLING_RECORDS - Invoices and payments
--   8. USAGE_SUMMARY - Data consumption
--
-- Note: Column mappings may need adjustment based on
-- actual table structure. Review and update as needed.
-- ============================================
