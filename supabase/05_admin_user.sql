-- ============================================
-- WANCOM Admin User Setup
-- Run this in Supabase SQL Editor AFTER creating 
-- the admin user in Authentication dashboard
-- ============================================

-- Option 1: Update existing user to have admin role
-- Replace 'admin@wancom.pk' with your admin email
UPDATE auth.users 
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin", "full_name": "Admin User"}'::jsonb
WHERE email = 'admin@wancom.pk';

-- Option 2: If you have multiple admin roles, you can use these:

-- For Finance Admin
-- UPDATE auth.users 
-- SET raw_user_meta_data = raw_user_meta_data || '{"role": "finance", "full_name": "Finance Admin"}'::jsonb
-- WHERE email = 'finance@wancom.pk';

-- For NOC Admin
-- UPDATE auth.users 
-- SET raw_user_meta_data = raw_user_meta_data || '{"role": "noc", "full_name": "NOC Admin"}'::jsonb
-- WHERE email = 'noc@wancom.pk';

-- For Support Admin
-- UPDATE auth.users 
-- SET raw_user_meta_data = raw_user_meta_data || '{"role": "support", "full_name": "Support Admin"}'::jsonb
-- WHERE email = 'support@wancom.pk';

-- For Super Admin (full access)
-- UPDATE auth.users 
-- SET raw_user_meta_data = raw_user_meta_data || '{"role": "superadmin", "full_name": "Super Admin"}'::jsonb
-- WHERE email = 'superadmin@wancom.pk';

-- ============================================
-- Verify the update
-- ============================================
SELECT id, email, raw_user_meta_data->>'role' as role, raw_user_meta_data->>'full_name' as name
FROM auth.users
WHERE email LIKE '%@wancom.pk';

-- ============================================
-- ADMIN ROLES EXPLAINED:
-- ============================================
-- admin      - Full admin access to all features
-- superadmin - Same as admin (highest privilege)
-- finance    - Access to billing, payments, revenue
-- noc        - Access to network, OLTs, ONUs, alarms
-- support    - Access to tickets, subscriber management
-- ============================================
