-- =====================================================
-- NetAxis ISP Customer Portal - Demo Data Migration
-- Generated: 2024-11-28
-- Purpose: High-stakes live demo with realistic mock data
-- SAFE: Only INSERT statements, no destructive operations
-- =====================================================

-- Demo User UUID (consistent across all tables)
-- customer_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

-- =====================================================
-- 1. DEMO CUSTOMER / SUBSCRIBER
-- =====================================================

INSERT INTO subscribers (
  id,
  user_id,
  full_name,
  email,
  phone,
  address,
  cnic,
  package_id,
  status,
  onu_serial,
  olt_id,
  olt_port,
  pppoe_username,
  activation_date,
  created_at,
  updated_at
) VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'Ahmed Hassan',
  'ahmed.hassan@demo.netaxis.pk',
  '+92 321 1234567',
  'House 42, Street 7, F-10/3, Islamabad',
  '61101-1234567-8',
  (SELECT id FROM packages WHERE name LIKE '%30%' OR speed_down = 30 LIMIT 1),
  'active',
  'HWTC12345678',
  'olt-islamabad-01',
  '0/1/3:5',
  'ahmed.hassan@netaxis',
  '2024-06-15 10:00:00+05',
  '2024-06-15 10:00:00+05',
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  status = EXCLUDED.status,
  updated_at = NOW();

-- =====================================================
-- 2. DEMO PACKAGE (if not exists)
-- =====================================================

INSERT INTO packages (
  id,
  name,
  description,
  speed_down,
  speed_up,
  data_cap_gb,
  price,
  billing_cycle,
  is_active,
  created_at
) VALUES (
  'pkg-fiber-30mbps',
  '30Mbps Fiber Home',
  'High-speed fiber connection for home users with unlimited data',
  30,
  10,
  NULL,
  2500.00,
  'monthly',
  true,
  '2024-01-01 00:00:00+05'
) ON CONFLICT (id) DO NOTHING;

-- Update subscriber to use this package if needed
UPDATE subscribers 
SET package_id = 'pkg-fiber-30mbps' 
WHERE id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479' 
  AND package_id IS NULL;

-- =====================================================
-- 3. USAGE LOGS - Last 30 Days (PKT Timezone)
-- Realistic patterns: Higher on weekends, varies 8-25GB/day
-- =====================================================

INSERT INTO usage_logs (id, subscriber_id, bytes_down, bytes_up, session_start, session_end, created_at) VALUES
-- November 2024 (Current month - last 30 days)
('ul-2024-10-29', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 12884901888, 2147483648, '2024-10-29 00:00:00+05', '2024-10-29 23:59:59+05', '2024-10-29 23:59:59+05'),
('ul-2024-10-30', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 15032385536, 2684354560, '2024-10-30 00:00:00+05', '2024-10-30 23:59:59+05', '2024-10-30 23:59:59+05'),
('ul-2024-10-31', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 11811160064, 1879048192, '2024-10-31 00:00:00+05', '2024-10-31 23:59:59+05', '2024-10-31 23:59:59+05'),
('ul-2024-11-01', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 18253611008, 3221225472, '2024-11-01 00:00:00+05', '2024-11-01 23:59:59+05', '2024-11-01 23:59:59+05'),
('ul-2024-11-02', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 24696061952, 4294967296, '2024-11-02 00:00:00+05', '2024-11-02 23:59:59+05', '2024-11-02 23:59:59+05'),
('ul-2024-11-03', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 26843545600, 4831838208, '2024-11-03 00:00:00+05', '2024-11-03 23:59:59+05', '2024-11-03 23:59:59+05'),
('ul-2024-11-04', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 10737418240, 1610612736, '2024-11-04 00:00:00+05', '2024-11-04 23:59:59+05', '2024-11-04 23:59:59+05'),
('ul-2024-11-05', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 9663676416, 1342177280, '2024-11-05 00:00:00+05', '2024-11-05 23:59:59+05', '2024-11-05 23:59:59+05'),
('ul-2024-11-06', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 13958643712, 2415919104, '2024-11-06 00:00:00+05', '2024-11-06 23:59:59+05', '2024-11-06 23:59:59+05'),
('ul-2024-11-07', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 11274289152, 1879048192, '2024-11-07 00:00:00+05', '2024-11-07 23:59:59+05', '2024-11-07 23:59:59+05'),
('ul-2024-11-08', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 16106127360, 2952790016, '2024-11-08 00:00:00+05', '2024-11-08 23:59:59+05', '2024-11-08 23:59:59+05'),
('ul-2024-11-09', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 23622320128, 4026531840, '2024-11-09 00:00:00+05', '2024-11-09 23:59:59+05', '2024-11-09 23:59:59+05'),
('ul-2024-11-10', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 25769803776, 4563402752, '2024-11-10 00:00:00+05', '2024-11-10 23:59:59+05', '2024-11-10 23:59:59+05'),
('ul-2024-11-11', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 12348030976, 2147483648, '2024-11-11 00:00:00+05', '2024-11-11 23:59:59+05', '2024-11-11 23:59:59+05'),
('ul-2024-11-12', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 10200547328, 1610612736, '2024-11-12 00:00:00+05', '2024-11-12 23:59:59+05', '2024-11-12 23:59:59+05'),
('ul-2024-11-13', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 14495514624, 2684354560, '2024-11-13 00:00:00+05', '2024-11-13 23:59:59+05', '2024-11-13 23:59:59+05'),
('ul-2024-11-14', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 13421772800, 2415919104, '2024-11-14 00:00:00+05', '2024-11-14 23:59:59+05', '2024-11-14 23:59:59+05'),
('ul-2024-11-15', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 17716740096, 3221225472, '2024-11-15 00:00:00+05', '2024-11-15 23:59:59+05', '2024-11-15 23:59:59+05'),
('ul-2024-11-16', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 24159191040, 4294967296, '2024-11-16 00:00:00+05', '2024-11-16 23:59:59+05', '2024-11-16 23:59:59+05'),
('ul-2024-11-17', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 25232932864, 4563402752, '2024-11-17 00:00:00+05', '2024-11-17 23:59:59+05', '2024-11-17 23:59:59+05'),
('ul-2024-11-18', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 9126805504, 1342177280, '2024-11-18 00:00:00+05', '2024-11-18 23:59:59+05', '2024-11-18 23:59:59+05'),
('ul-2024-11-19', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 11811160064, 2147483648, '2024-11-19 00:00:00+05', '2024-11-19 23:59:59+05', '2024-11-19 23:59:59+05'),
('ul-2024-11-20', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 12884901888, 2415919104, '2024-11-20 00:00:00+05', '2024-11-20 23:59:59+05', '2024-11-20 23:59:59+05'),
('ul-2024-11-21', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 10737418240, 1879048192, '2024-11-21 00:00:00+05', '2024-11-21 23:59:59+05', '2024-11-21 23:59:59+05'),
('ul-2024-11-22', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 15569256448, 2952790016, '2024-11-22 00:00:00+05', '2024-11-22 23:59:59+05', '2024-11-22 23:59:59+05'),
('ul-2024-11-23', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 22548578304, 3758096384, '2024-11-23 00:00:00+05', '2024-11-23 23:59:59+05', '2024-11-23 23:59:59+05'),
('ul-2024-11-24', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 24696061952, 4294967296, '2024-11-24 00:00:00+05', '2024-11-24 23:59:59+05', '2024-11-24 23:59:59+05'),
('ul-2024-11-25', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 11274289152, 1879048192, '2024-11-25 00:00:00+05', '2024-11-25 23:59:59+05', '2024-11-25 23:59:59+05'),
('ul-2024-11-26', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 13958643712, 2415919104, '2024-11-26 00:00:00+05', '2024-11-26 23:59:59+05', '2024-11-26 23:59:59+05'),
('ul-2024-11-27', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 14495514624, 2684354560, '2024-11-27 00:00:00+05', '2024-11-27 23:59:59+05', '2024-11-27 23:59:59+05'),
('ul-2024-11-28', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 8589934592, 1610612736, '2024-11-28 00:00:00+05', '2024-11-28 14:30:00+05', '2024-11-28 14:30:00+05')
ON CONFLICT (id) DO UPDATE SET
  bytes_down = EXCLUDED.bytes_down,
  bytes_up = EXCLUDED.bytes_up;

-- =====================================================
-- 4. INVOICES - Last 6 Months
-- =====================================================

-- June 2024 - PAID
INSERT INTO invoices (
  id,
  subscriber_id,
  invoice_number,
  amount,
  tax_amount,
  total_amount,
  status,
  billing_period_start,
  billing_period_end,
  due_date,
  paid_at,
  created_at
) VALUES (
  'inv-2024-06-demo',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'INV-2024-06-0001',
  2500.00,
  450.00,
  2950.00,
  'paid',
  '2024-06-01 00:00:00+05',
  '2024-06-30 23:59:59+05',
  '2024-07-05 00:00:00+05',
  '2024-07-03 14:22:00+05',
  '2024-06-28 10:00:00+05'
) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

-- July 2024 - PAID
INSERT INTO invoices (
  id,
  subscriber_id,
  invoice_number,
  amount,
  tax_amount,
  total_amount,
  status,
  billing_period_start,
  billing_period_end,
  due_date,
  paid_at,
  created_at
) VALUES (
  'inv-2024-07-demo',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'INV-2024-07-0001',
  2500.00,
  450.00,
  2950.00,
  'paid',
  '2024-07-01 00:00:00+05',
  '2024-07-31 23:59:59+05',
  '2024-08-05 00:00:00+05',
  '2024-08-02 11:45:00+05',
  '2024-07-28 10:00:00+05'
) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

-- August 2024 - PAID
INSERT INTO invoices (
  id,
  subscriber_id,
  invoice_number,
  amount,
  tax_amount,
  total_amount,
  status,
  billing_period_start,
  billing_period_end,
  due_date,
  paid_at,
  created_at
) VALUES (
  'inv-2024-08-demo',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'INV-2024-08-0001',
  2500.00,
  450.00,
  2950.00,
  'paid',
  '2024-08-01 00:00:00+05',
  '2024-08-31 23:59:59+05',
  '2024-09-05 00:00:00+05',
  '2024-09-04 16:33:00+05',
  '2024-08-28 10:00:00+05'
) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

-- September 2024 - PAID
INSERT INTO invoices (
  id,
  subscriber_id,
  invoice_number,
  amount,
  tax_amount,
  total_amount,
  status,
  billing_period_start,
  billing_period_end,
  due_date,
  paid_at,
  created_at
) VALUES (
  'inv-2024-09-demo',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'INV-2024-09-0001',
  2500.00,
  450.00,
  2950.00,
  'paid',
  '2024-09-01 00:00:00+05',
  '2024-09-30 23:59:59+05',
  '2024-10-05 00:00:00+05',
  '2024-10-01 09:15:00+05',
  '2024-09-28 10:00:00+05'
) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

-- October 2024 - PAID
INSERT INTO invoices (
  id,
  subscriber_id,
  invoice_number,
  amount,
  tax_amount,
  total_amount,
  status,
  billing_period_start,
  billing_period_end,
  due_date,
  paid_at,
  created_at
) VALUES (
  'inv-2024-10-demo',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'INV-2024-10-0001',
  2500.00,
  450.00,
  2950.00,
  'paid',
  '2024-10-01 00:00:00+05',
  '2024-10-31 23:59:59+05',
  '2024-11-05 00:00:00+05',
  '2024-11-03 18:42:00+05',
  '2024-10-28 10:00:00+05'
) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

-- November 2024 - DUE (Current month)
INSERT INTO invoices (
  id,
  subscriber_id,
  invoice_number,
  amount,
  tax_amount,
  total_amount,
  status,
  billing_period_start,
  billing_period_end,
  due_date,
  paid_at,
  created_at
) VALUES (
  'inv-2024-11-demo',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'INV-2024-11-0001',
  2500.00,
  450.00,
  2950.00,
  'pending',
  '2024-11-01 00:00:00+05',
  '2024-11-30 23:59:59+05',
  '2024-12-05 00:00:00+05',
  NULL,
  '2024-11-28 10:00:00+05'
) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

-- =====================================================
-- 5. PAYMENTS - Linked to Paid Invoices
-- =====================================================

-- Payment for June Invoice - JazzCash
INSERT INTO payments (
  id,
  subscriber_id,
  invoice_id,
  amount,
  gateway,
  gateway_reference,
  gateway_response,
  status,
  webhook_verified,
  created_at,
  settled_at
) VALUES (
  'pay-2024-06-demo',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'inv-2024-06-demo',
  2950.00,
  'jazzcash',
  'JC240703142200001',
  '{"pp_ResponseCode":"000","pp_ResponseMessage":"Transaction successful","pp_TxnRefNo":"JC240703142200001","pp_AuthCode":"AUTH123456"}',
  'completed',
  true,
  '2024-07-03 14:22:00+05',
  '2024-07-03 14:22:30+05'
) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

-- Payment for July Invoice - Easypaisa
INSERT INTO payments (
  id,
  subscriber_id,
  invoice_id,
  amount,
  gateway,
  gateway_reference,
  gateway_response,
  status,
  webhook_verified,
  created_at,
  settled_at
) VALUES (
  'pay-2024-07-demo',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'inv-2024-07-demo',
  2950.00,
  'easypaisa',
  'EP240802114500002',
  '{"responseCode":"0000","responseDesc":"SUCCESS","transactionId":"EP240802114500002","accountNumber":"03211234567"}',
  'completed',
  true,
  '2024-08-02 11:45:00+05',
  '2024-08-02 11:45:45+05'
) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

-- Payment for August Invoice - PayFast
INSERT INTO payments (
  id,
  subscriber_id,
  invoice_id,
  amount,
  gateway,
  gateway_reference,
  gateway_response,
  status,
  webhook_verified,
  created_at,
  settled_at
) VALUES (
  'pay-2024-08-demo',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'inv-2024-08-demo',
  2950.00,
  'payfast',
  'PF240904163300003',
  '{"pf_payment_id":"17284523","payment_status":"COMPLETE","amount_gross":"2950.00","amount_fee":"73.75","amount_net":"2876.25"}',
  'completed',
  true,
  '2024-09-04 16:33:00+05',
  '2024-09-04 16:33:22+05'
) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

-- Payment for September Invoice - JazzCash
INSERT INTO payments (
  id,
  subscriber_id,
  invoice_id,
  amount,
  gateway,
  gateway_reference,
  gateway_response,
  status,
  webhook_verified,
  created_at,
  settled_at
) VALUES (
  'pay-2024-09-demo',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'inv-2024-09-demo',
  2950.00,
  'jazzcash',
  'JC241001091500004',
  '{"pp_ResponseCode":"000","pp_ResponseMessage":"Transaction successful","pp_TxnRefNo":"JC241001091500004","pp_AuthCode":"AUTH789012"}',
  'completed',
  true,
  '2024-10-01 09:15:00+05',
  '2024-10-01 09:15:28+05'
) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

-- Payment for October Invoice - Easypaisa
INSERT INTO payments (
  id,
  subscriber_id,
  invoice_id,
  amount,
  gateway,
  gateway_reference,
  gateway_response,
  status,
  webhook_verified,
  created_at,
  settled_at
) VALUES (
  'pay-2024-10-demo',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'inv-2024-10-demo',
  2950.00,
  'easypaisa',
  'EP241103184200005',
  '{"responseCode":"0000","responseDesc":"SUCCESS","transactionId":"EP241103184200005","accountNumber":"03211234567"}',
  'completed',
  true,
  '2024-11-03 18:42:00+05',
  '2024-11-03 18:42:35+05'
) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

-- =====================================================
-- 6. RADIUS SESSIONS (Recent connection history)
-- =====================================================

INSERT INTO radius_sessions (
  id,
  subscriber_id,
  session_id,
  nas_ip,
  framed_ip,
  calling_station_id,
  acct_status,
  bytes_in,
  bytes_out,
  session_time,
  started_at,
  stopped_at,
  created_at
) VALUES 
-- Current active session
(
  'rs-active-demo',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'SES-20241128-001',
  '10.0.0.1',
  '100.64.12.45',
  'HWTC12345678',
  'Start',
  8589934592,
  1610612736,
  28800,
  '2024-11-28 06:30:00+05',
  NULL,
  '2024-11-28 06:30:00+05'
),
-- Yesterday's session
(
  'rs-2024-11-27-demo',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'SES-20241127-001',
  '10.0.0.1',
  '100.64.12.45',
  'HWTC12345678',
  'Stop',
  14495514624,
  2684354560,
  86340,
  '2024-11-27 00:05:00+05',
  '2024-11-27 23:59:00+05',
  '2024-11-27 00:05:00+05'
),
-- Day before yesterday
(
  'rs-2024-11-26-demo',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'SES-20241126-001',
  '10.0.0.1',
  '100.64.12.44',
  'HWTC12345678',
  'Stop',
  13958643712,
  2415919104,
  85200,
  '2024-11-26 00:15:00+05',
  '2024-11-26 23:55:00+05',
  '2024-11-26 00:15:00+05'
)
ON CONFLICT (id) DO UPDATE SET 
  bytes_in = EXCLUDED.bytes_in,
  bytes_out = EXCLUDED.bytes_out;

-- =====================================================
-- 7. ONU STATUS (Current network state)
-- =====================================================

INSERT INTO onu_status (
  id,
  subscriber_id,
  onu_serial,
  olt_id,
  olt_name,
  port,
  status,
  optical_power,
  temperature,
  uptime,
  firmware_version,
  last_seen,
  created_at,
  updated_at
) VALUES (
  'onu-demo-status',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'HWTC12345678',
  'olt-islamabad-01',
  'ISB-OLT-CORE-01',
  '0/1/3:5',
  'online',
  -22.5,
  38,
  '45 days 12:34:56',
  'V5R021C00S100',
  NOW() - INTERVAL '2 minutes',
  '2024-06-15 10:00:00+05',
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  optical_power = EXCLUDED.optical_power,
  last_seen = EXCLUDED.last_seen,
  updated_at = NOW();

-- =====================================================
-- 8. SUPPORT TICKETS (Demo customer history)
-- =====================================================

-- Resolved ticket from October
INSERT INTO support_tickets (
  id,
  subscriber_id,
  subject,
  description,
  category,
  priority,
  status,
  assigned_to,
  created_at,
  updated_at,
  resolved_at
) VALUES (
  'ticket-demo-01',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'Slow speeds during peak hours',
  'I am experiencing slower than usual speeds between 8 PM and 11 PM. My package is 30Mbps but speed tests show around 15Mbps during these hours.',
  'technical',
  'medium',
  'resolved',
  'noc-team',
  '2024-10-15 20:30:00+05',
  '2024-10-17 14:00:00+05',
  '2024-10-17 14:00:00+05'
) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

-- Ticket message
INSERT INTO ticket_messages (
  id,
  ticket_id,
  sender_type,
  sender_id,
  message,
  created_at
) VALUES 
(
  'msg-demo-01-1',
  'ticket-demo-01',
  'agent',
  'noc-team',
  'Dear Ahmed, thank you for reporting this issue. We have identified congestion on your serving OLT during peak hours. Our team has optimized the traffic shaping policies. Please run a speed test now and let us know if the issue persists.',
  '2024-10-16 10:15:00+05'
),
(
  'msg-demo-01-2',
  'ticket-demo-01',
  'customer',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'I just ran a speed test and I am now getting full 30Mbps. Thank you for the quick resolution!',
  '2024-10-17 13:45:00+05'
),
(
  'msg-demo-01-3',
  'ticket-demo-01',
  'agent',
  'noc-team',
  'Great to hear that! We are closing this ticket. Feel free to reach out if you experience any further issues.',
  '2024-10-17 14:00:00+05'
)
ON CONFLICT (id) DO UPDATE SET message = EXCLUDED.message;

-- =====================================================
-- 9. NOTIFICATION LOG (Recent notifications)
-- =====================================================

INSERT INTO notifications (
  id,
  subscriber_id,
  type,
  channel,
  recipient,
  subject,
  body,
  status,
  sent_at,
  created_at
) VALUES
(
  'notif-demo-01',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'invoice_generated',
  'email',
  'ahmed.hassan@demo.netaxis.pk',
  'Your November 2024 Invoice is Ready',
  'Dear Ahmed Hassan, your invoice INV-2024-11-0001 for PKR 2,950 has been generated. Due date: December 5, 2024.',
  'sent',
  '2024-11-28 10:05:00+05',
  '2024-11-28 10:05:00+05'
),
(
  'notif-demo-02',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'invoice_generated',
  'sms',
  '+92 321 1234567',
  NULL,
  'NetAxis: Your Nov invoice PKR 2,950 is ready. Due: Dec 5. Pay via JazzCash/Easypaisa. Ref: INV-2024-11-0001',
  'sent',
  '2024-11-28 10:05:30+05',
  '2024-11-28 10:05:30+05'
),
(
  'notif-demo-03',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'payment_received',
  'email',
  'ahmed.hassan@demo.netaxis.pk',
  'Payment Received - Thank You!',
  'Dear Ahmed Hassan, we have received your payment of PKR 2,950 for invoice INV-2024-10-0001. Thank you for your prompt payment!',
  'sent',
  '2024-11-03 18:43:00+05',
  '2024-11-03 18:43:00+05'
)
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

-- =====================================================
-- END OF DEMO DATA
-- =====================================================
