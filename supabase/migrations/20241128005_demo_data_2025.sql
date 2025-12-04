-- =====================================================
-- NetAxis ISP Customer Portal - Demo Data (2025 Dates)
-- Generated: 2025-11-28
-- Purpose: High-stakes live demo with realistic mock data
-- SAFE: Only INSERT/UPDATE statements, no destructive operations
-- =====================================================

-- =====================================================
-- 1. DEMO PACKAGE (ensure exists)
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
  '2025-01-01 00:00:00+05'
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price = EXCLUDED.price;

-- =====================================================
-- 2. LINK EXISTING AUTH USER TO DEMO SUBSCRIBER
-- Run this AFTER you have a user logged in - it will link them
-- =====================================================

-- Create or update demo subscriber with a known ID
-- The user_id will be updated by the next query
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
  'pkg-fiber-30mbps',
  'active',
  'HWTC12345678',
  'olt-islamabad-01',
  '0/1/3:5',
  'ahmed.hassan@netaxis',
  '2025-06-15 10:00:00+05',
  '2025-06-15 10:00:00+05',
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  package_id = EXCLUDED.package_id,
  status = EXCLUDED.status,
  updated_at = NOW();

-- =====================================================
-- 3. USAGE LOGS - Last 30 Days (2025 dates, PKT Timezone)
-- =====================================================

DELETE FROM usage_logs WHERE subscriber_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

INSERT INTO usage_logs (id, subscriber_id, bytes_down, bytes_up, session_start, session_end, created_at) VALUES
-- October-November 2025 (Last 30 days from Nov 28)
('ul-2025-10-29', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 12884901888, 2147483648, '2025-10-29 00:00:00+05', '2025-10-29 23:59:59+05', '2025-10-29 23:59:59+05'),
('ul-2025-10-30', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 15032385536, 2684354560, '2025-10-30 00:00:00+05', '2025-10-30 23:59:59+05', '2025-10-30 23:59:59+05'),
('ul-2025-10-31', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 21474836480, 3758096384, '2025-10-31 00:00:00+05', '2025-10-31 23:59:59+05', '2025-10-31 23:59:59+05'),
('ul-2025-11-01', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 24696061952, 4294967296, '2025-11-01 00:00:00+05', '2025-11-01 23:59:59+05', '2025-11-01 23:59:59+05'),
('ul-2025-11-02', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 23622320128, 4026531840, '2025-11-02 00:00:00+05', '2025-11-02 23:59:59+05', '2025-11-02 23:59:59+05'),
('ul-2025-11-03', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 10737418240, 1610612736, '2025-11-03 00:00:00+05', '2025-11-03 23:59:59+05', '2025-11-03 23:59:59+05'),
('ul-2025-11-04', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 9663676416, 1342177280, '2025-11-04 00:00:00+05', '2025-11-04 23:59:59+05', '2025-11-04 23:59:59+05'),
('ul-2025-11-05', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 13958643712, 2415919104, '2025-11-05 00:00:00+05', '2025-11-05 23:59:59+05', '2025-11-05 23:59:59+05'),
('ul-2025-11-06', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 11274289152, 1879048192, '2025-11-06 00:00:00+05', '2025-11-06 23:59:59+05', '2025-11-06 23:59:59+05'),
('ul-2025-11-07', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 22548578304, 3758096384, '2025-11-07 00:00:00+05', '2025-11-07 23:59:59+05', '2025-11-07 23:59:59+05'),
('ul-2025-11-08', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 25769803776, 4563402752, '2025-11-08 00:00:00+05', '2025-11-08 23:59:59+05', '2025-11-08 23:59:59+05'),
('ul-2025-11-09', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 24159191040, 4294967296, '2025-11-09 00:00:00+05', '2025-11-09 23:59:59+05', '2025-11-09 23:59:59+05'),
('ul-2025-11-10', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 12348030976, 2147483648, '2025-11-10 00:00:00+05', '2025-11-10 23:59:59+05', '2025-11-10 23:59:59+05'),
('ul-2025-11-11', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 10200547328, 1610612736, '2025-11-11 00:00:00+05', '2025-11-11 23:59:59+05', '2025-11-11 23:59:59+05'),
('ul-2025-11-12', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 14495514624, 2684354560, '2025-11-12 00:00:00+05', '2025-11-12 23:59:59+05', '2025-11-12 23:59:59+05'),
('ul-2025-11-13', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 13421772800, 2415919104, '2025-11-13 00:00:00+05', '2025-11-13 23:59:59+05', '2025-11-13 23:59:59+05'),
('ul-2025-11-14', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 23622320128, 4026531840, '2025-11-14 00:00:00+05', '2025-11-14 23:59:59+05', '2025-11-14 23:59:59+05'),
('ul-2025-11-15', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 26843545600, 4831838208, '2025-11-15 00:00:00+05', '2025-11-15 23:59:59+05', '2025-11-15 23:59:59+05'),
('ul-2025-11-16', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 24696061952, 4294967296, '2025-11-16 00:00:00+05', '2025-11-16 23:59:59+05', '2025-11-16 23:59:59+05'),
('ul-2025-11-17', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 9126805504, 1342177280, '2025-11-17 00:00:00+05', '2025-11-17 23:59:59+05', '2025-11-17 23:59:59+05'),
('ul-2025-11-18', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 11811160064, 2147483648, '2025-11-18 00:00:00+05', '2025-11-18 23:59:59+05', '2025-11-18 23:59:59+05'),
('ul-2025-11-19', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 12884901888, 2415919104, '2025-11-19 00:00:00+05', '2025-11-19 23:59:59+05', '2025-11-19 23:59:59+05'),
('ul-2025-11-20', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 10737418240, 1879048192, '2025-11-20 00:00:00+05', '2025-11-20 23:59:59+05', '2025-11-20 23:59:59+05'),
('ul-2025-11-21', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 21474836480, 3758096384, '2025-11-21 00:00:00+05', '2025-11-21 23:59:59+05', '2025-11-21 23:59:59+05'),
('ul-2025-11-22', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 25232932864, 4563402752, '2025-11-22 00:00:00+05', '2025-11-22 23:59:59+05', '2025-11-22 23:59:59+05'),
('ul-2025-11-23', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 24159191040, 4294967296, '2025-11-23 00:00:00+05', '2025-11-23 23:59:59+05', '2025-11-23 23:59:59+05'),
('ul-2025-11-24', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 11274289152, 1879048192, '2025-11-24 00:00:00+05', '2025-11-24 23:59:59+05', '2025-11-24 23:59:59+05'),
('ul-2025-11-25', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 13958643712, 2415919104, '2025-11-25 00:00:00+05', '2025-11-25 23:59:59+05', '2025-11-25 23:59:59+05'),
('ul-2025-11-26', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 14495514624, 2684354560, '2025-11-26 00:00:00+05', '2025-11-26 23:59:59+05', '2025-11-26 23:59:59+05'),
('ul-2025-11-27', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 15569256448, 2952790016, '2025-11-27 00:00:00+05', '2025-11-27 23:59:59+05', '2025-11-27 23:59:59+05'),
('ul-2025-11-28', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 8589934592, 1610612736, '2025-11-28 00:00:00+05', '2025-11-28 14:30:00+05', '2025-11-28 14:30:00+05');

-- =====================================================
-- 4. INVOICES - Last 6 Months (2025 dates)
-- =====================================================

DELETE FROM invoices WHERE subscriber_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

-- June 2025 - PAID
INSERT INTO invoices (id, subscriber_id, invoice_number, amount, tax_amount, total_amount, status, billing_period_start, billing_period_end, due_date, paid_at, created_at)
VALUES ('inv-2025-06-demo', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'INV-2025-06-0001', 2500.00, 450.00, 2950.00, 'paid', '2025-06-01 00:00:00+05', '2025-06-30 23:59:59+05', '2025-07-05 00:00:00+05', '2025-07-03 14:22:00+05', '2025-06-28 10:00:00+05');

-- July 2025 - PAID
INSERT INTO invoices (id, subscriber_id, invoice_number, amount, tax_amount, total_amount, status, billing_period_start, billing_period_end, due_date, paid_at, created_at)
VALUES ('inv-2025-07-demo', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'INV-2025-07-0001', 2500.00, 450.00, 2950.00, 'paid', '2025-07-01 00:00:00+05', '2025-07-31 23:59:59+05', '2025-08-05 00:00:00+05', '2025-08-02 11:45:00+05', '2025-07-28 10:00:00+05');

-- August 2025 - PAID
INSERT INTO invoices (id, subscriber_id, invoice_number, amount, tax_amount, total_amount, status, billing_period_start, billing_period_end, due_date, paid_at, created_at)
VALUES ('inv-2025-08-demo', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'INV-2025-08-0001', 2500.00, 450.00, 2950.00, 'paid', '2025-08-01 00:00:00+05', '2025-08-31 23:59:59+05', '2025-09-05 00:00:00+05', '2025-09-04 16:33:00+05', '2025-08-28 10:00:00+05');

-- September 2025 - PAID
INSERT INTO invoices (id, subscriber_id, invoice_number, amount, tax_amount, total_amount, status, billing_period_start, billing_period_end, due_date, paid_at, created_at)
VALUES ('inv-2025-09-demo', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'INV-2025-09-0001', 2500.00, 450.00, 2950.00, 'paid', '2025-09-01 00:00:00+05', '2025-09-30 23:59:59+05', '2025-10-05 00:00:00+05', '2025-10-01 09:15:00+05', '2025-09-28 10:00:00+05');

-- October 2025 - PAID
INSERT INTO invoices (id, subscriber_id, invoice_number, amount, tax_amount, total_amount, status, billing_period_start, billing_period_end, due_date, paid_at, created_at)
VALUES ('inv-2025-10-demo', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'INV-2025-10-0001', 2500.00, 450.00, 2950.00, 'paid', '2025-10-01 00:00:00+05', '2025-10-31 23:59:59+05', '2025-11-05 00:00:00+05', '2025-11-03 18:42:00+05', '2025-10-28 10:00:00+05');

-- November 2025 - PENDING (Current month)
INSERT INTO invoices (id, subscriber_id, invoice_number, amount, tax_amount, total_amount, status, billing_period_start, billing_period_end, due_date, paid_at, created_at)
VALUES ('inv-2025-11-demo', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'INV-2025-11-0001', 2500.00, 450.00, 2950.00, 'pending', '2025-11-01 00:00:00+05', '2025-11-30 23:59:59+05', '2025-12-05 00:00:00+05', NULL, '2025-11-28 10:00:00+05');

-- =====================================================
-- 5. PAYMENTS - Linked to Paid Invoices (2025 dates)
-- =====================================================

DELETE FROM payments WHERE subscriber_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

INSERT INTO payments (id, subscriber_id, invoice_id, amount, gateway, gateway_reference, gateway_response, status, webhook_verified, created_at, settled_at)
VALUES ('pay-2025-06-demo', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'inv-2025-06-demo', 2950.00, 'jazzcash', 'JC250703142200001', '{"pp_ResponseCode":"000","pp_ResponseMessage":"Transaction successful"}', 'completed', true, '2025-07-03 14:22:00+05', '2025-07-03 14:22:30+05');

INSERT INTO payments (id, subscriber_id, invoice_id, amount, gateway, gateway_reference, gateway_response, status, webhook_verified, created_at, settled_at)
VALUES ('pay-2025-07-demo', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'inv-2025-07-demo', 2950.00, 'easypaisa', 'EP250802114500002', '{"responseCode":"0000","responseDesc":"SUCCESS"}', 'completed', true, '2025-08-02 11:45:00+05', '2025-08-02 11:45:45+05');

INSERT INTO payments (id, subscriber_id, invoice_id, amount, gateway, gateway_reference, gateway_response, status, webhook_verified, created_at, settled_at)
VALUES ('pay-2025-08-demo', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'inv-2025-08-demo', 2950.00, 'payfast', 'PF250904163300003', '{"pf_payment_id":"17284523","payment_status":"COMPLETE"}', 'completed', true, '2025-09-04 16:33:00+05', '2025-09-04 16:33:22+05');

INSERT INTO payments (id, subscriber_id, invoice_id, amount, gateway, gateway_reference, gateway_response, status, webhook_verified, created_at, settled_at)
VALUES ('pay-2025-09-demo', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'inv-2025-09-demo', 2950.00, 'jazzcash', 'JC251001091500004', '{"pp_ResponseCode":"000","pp_ResponseMessage":"Transaction successful"}', 'completed', true, '2025-10-01 09:15:00+05', '2025-10-01 09:15:28+05');

INSERT INTO payments (id, subscriber_id, invoice_id, amount, gateway, gateway_reference, gateway_response, status, webhook_verified, created_at, settled_at)
VALUES ('pay-2025-10-demo', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'inv-2025-10-demo', 2950.00, 'easypaisa', 'EP251103184200005', '{"responseCode":"0000","responseDesc":"SUCCESS"}', 'completed', true, '2025-11-03 18:42:00+05', '2025-11-03 18:42:35+05');

-- =====================================================
-- END OF DEMO DATA
-- =====================================================
