-- =====================================================
-- NetAxis ISP - COMPLETE DEMO SETUP
-- Run this entire script in Supabase SQL Editor
-- This creates all tables AND populates demo data
-- =====================================================

-- =====================================================
-- PART 1: CREATE SCHEMA & TABLES
-- =====================================================

-- Packages table
CREATE TABLE IF NOT EXISTS public.packages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  speed_down INTEGER NOT NULL,
  speed_up INTEGER NOT NULL,
  data_cap_gb INTEGER,
  price NUMERIC(12,2) NOT NULL,
  billing_cycle TEXT DEFAULT 'monthly',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscribers table (links to auth.users)
CREATE TABLE IF NOT EXISTS public.subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID DEFAULT gen_random_uuid(),
  full_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  cnic TEXT,
  package_id TEXT REFERENCES public.packages(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'terminated', 'pending')),
  onu_serial TEXT,
  olt_id TEXT,
  olt_port TEXT,
  pppoe_username TEXT,
  activation_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage logs table
CREATE TABLE IF NOT EXISTS public.usage_logs (
  id TEXT PRIMARY KEY,
  subscriber_id UUID REFERENCES public.subscribers(id) ON DELETE CASCADE,
  bytes_down BIGINT DEFAULT 0,
  bytes_up BIGINT DEFAULT 0,
  session_start TIMESTAMPTZ,
  session_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id TEXT PRIMARY KEY,
  subscriber_id UUID REFERENCES public.subscribers(id) ON DELETE CASCADE,
  invoice_number TEXT UNIQUE,
  amount NUMERIC(12,2) NOT NULL,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'paid', 'overdue', 'cancelled')),
  billing_period_start DATE,
  billing_period_end DATE,
  due_date DATE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id TEXT PRIMARY KEY,
  subscriber_id UUID REFERENCES public.subscribers(id) ON DELETE CASCADE,
  invoice_id TEXT REFERENCES public.invoices(id),
  amount NUMERIC(12,2) NOT NULL,
  gateway TEXT NOT NULL,
  gateway_reference TEXT,
  gateway_response JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  webhook_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

-- Support tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  subscriber_id UUID REFERENCES public.subscribers(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  assigned_to TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Ticket messages table
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  ticket_id TEXT REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT CHECK (sender_type IN ('customer', 'agent', 'system')),
  sender_id TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  subscriber_id UUID REFERENCES public.subscribers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient TEXT,
  subject TEXT,
  body TEXT,
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RADIUS sessions table
CREATE TABLE IF NOT EXISTS public.radius_sessions (
  id TEXT PRIMARY KEY,
  subscriber_id UUID REFERENCES public.subscribers(id) ON DELETE CASCADE,
  session_id TEXT,
  nas_ip TEXT,
  framed_ip TEXT,
  calling_station_id TEXT,
  acct_status TEXT,
  bytes_in BIGINT DEFAULT 0,
  bytes_out BIGINT DEFAULT 0,
  session_time INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ONU status table
CREATE TABLE IF NOT EXISTS public.onu_status (
  id TEXT PRIMARY KEY,
  subscriber_id UUID REFERENCES public.subscribers(id) ON DELETE CASCADE,
  onu_serial TEXT,
  olt_id TEXT,
  olt_name TEXT,
  port TEXT,
  status TEXT DEFAULT 'unknown',
  optical_power NUMERIC(5,2),
  temperature INTEGER,
  uptime TEXT,
  firmware_version TEXT,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_subscribers_user_id ON public.subscribers(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_subscriber ON public.usage_logs(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_invoices_subscriber ON public.invoices(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscriber ON public.payments(subscriber_id);

-- =====================================================
-- PART 2: INSERT DEMO DATA
-- =====================================================

-- 1. Create demo package
INSERT INTO packages (id, name, description, speed_down, speed_up, data_cap_gb, price, billing_cycle, is_active, created_at)
VALUES ('pkg-fiber-30mbps', '30Mbps Fiber Home', 'High-speed fiber for home users', 30, 10, NULL, 2500.00, 'monthly', true, NOW())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price;

-- 2. Create demo subscriber linked to FIRST auth user
INSERT INTO subscribers (id, user_id, full_name, email, phone, address, cnic, package_id, status, onu_serial, olt_id, olt_port, pppoe_username, activation_date, created_at, updated_at)
VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  (SELECT id FROM auth.users LIMIT 1),
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
)
ON CONFLICT (id) DO UPDATE SET
  user_id = (SELECT id FROM auth.users LIMIT 1),
  package_id = 'pkg-fiber-30mbps',
  status = 'active',
  updated_at = NOW();

-- 3. Insert usage logs (30 days)
DELETE FROM usage_logs WHERE subscriber_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

INSERT INTO usage_logs (id, subscriber_id, bytes_down, bytes_up, session_start, session_end, created_at) VALUES
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

-- 4. Insert invoices (6 months)
DELETE FROM invoices WHERE subscriber_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

INSERT INTO invoices (id, subscriber_id, invoice_number, amount, tax_amount, total_amount, status, billing_period_start, billing_period_end, due_date, paid_at, created_at) VALUES
('inv-2025-06-demo', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'INV-2025-06-0001', 2500.00, 450.00, 2950.00, 'paid', '2025-06-01', '2025-06-30', '2025-07-05', '2025-07-03 14:22:00+05', '2025-06-28 10:00:00+05'),
('inv-2025-07-demo', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'INV-2025-07-0001', 2500.00, 450.00, 2950.00, 'paid', '2025-07-01', '2025-07-31', '2025-08-05', '2025-08-02 11:45:00+05', '2025-07-28 10:00:00+05'),
('inv-2025-08-demo', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'INV-2025-08-0001', 2500.00, 450.00, 2950.00, 'paid', '2025-08-01', '2025-08-31', '2025-09-05', '2025-09-04 16:33:00+05', '2025-08-28 10:00:00+05'),
('inv-2025-09-demo', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'INV-2025-09-0001', 2500.00, 450.00, 2950.00, 'paid', '2025-09-01', '2025-09-30', '2025-10-05', '2025-10-01 09:15:00+05', '2025-09-28 10:00:00+05'),
('inv-2025-10-demo', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'INV-2025-10-0001', 2500.00, 450.00, 2950.00, 'paid', '2025-10-01', '2025-10-31', '2025-11-05', '2025-11-03 18:42:00+05', '2025-10-28 10:00:00+05'),
('inv-2025-11-demo', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'INV-2025-11-0001', 2500.00, 450.00, 2950.00, 'pending', '2025-11-01', '2025-11-30', '2025-12-05', NULL, '2025-11-28 10:00:00+05');

-- 5. Insert payments
DELETE FROM payments WHERE subscriber_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

INSERT INTO payments (id, subscriber_id, invoice_id, amount, gateway, gateway_reference, gateway_response, status, webhook_verified, created_at, settled_at) VALUES
('pay-2025-06', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'inv-2025-06-demo', 2950.00, 'jazzcash', 'JC250703142200001', '{"status":"success"}', 'completed', true, '2025-07-03 14:22:00+05', '2025-07-03 14:22:30+05'),
('pay-2025-07', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'inv-2025-07-demo', 2950.00, 'easypaisa', 'EP250802114500002', '{"status":"success"}', 'completed', true, '2025-08-02 11:45:00+05', '2025-08-02 11:45:45+05'),
('pay-2025-08', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'inv-2025-08-demo', 2950.00, 'payfast', 'PF250904163300003', '{"status":"success"}', 'completed', true, '2025-09-04 16:33:00+05', '2025-09-04 16:33:22+05'),
('pay-2025-09', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'inv-2025-09-demo', 2950.00, 'jazzcash', 'JC251001091500004', '{"status":"success"}', 'completed', true, '2025-10-01 09:15:00+05', '2025-10-01 09:15:28+05'),
('pay-2025-10', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'inv-2025-10-demo', 2950.00, 'easypaisa', 'EP251103184200005', '{"status":"success"}', 'completed', true, '2025-11-03 18:42:00+05', '2025-11-03 18:42:35+05');

-- =====================================================
-- PART 3: VERIFY SETUP
-- =====================================================

SELECT '✅ Tables Created' as status;
SELECT 'Packages: ' || COUNT(*)::text FROM packages;
SELECT 'Subscribers: ' || COUNT(*)::text FROM subscribers;
SELECT 'Usage Logs: ' || COUNT(*)::text FROM usage_logs WHERE subscriber_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
SELECT 'Invoices: ' || COUNT(*)::text FROM invoices WHERE subscriber_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
SELECT 'Payments: ' || COUNT(*)::text FROM payments WHERE subscriber_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

-- Verify user link
SELECT 
  '🔗 User Link: ' || COALESCE(u.email, 'NOT LINKED') as user_link,
  s.full_name,
  s.status
FROM subscribers s
LEFT JOIN auth.users u ON s.user_id = u.id
WHERE s.id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

-- =====================================================
-- PART 4: ADMIN USER SETUP
-- =====================================================
-- NOTE: You must FIRST create the admin user in Supabase Dashboard:
-- 1. Go to Authentication → Users → Add User
-- 2. Email: admin@netaxis.pk
-- 3. Password: @dmin123456
-- 4. Then run this SQL to set the admin role:

-- Set admin role for admin@netaxis.pk
UPDATE auth.users 
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
    '{"role": "admin", "full_name": "System Administrator"}'::jsonb
WHERE email = 'admin@netaxis.pk';

-- Set customer role for demo user
UPDATE auth.users 
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
    '{"role": "customer", "full_name": "Demo Customer"}'::jsonb
WHERE email = 'demo@netaxis.pk';

-- Verify admin setup
SELECT 
  '👤 ' || email as user,
  raw_user_meta_data->>'role' as role,
  raw_user_meta_data->>'full_name' as name
FROM auth.users
WHERE email LIKE '%@netaxis.pk'
ORDER BY created_at;
