-- =====================================================
-- WANCOM ISP - Link Current User to Demo Data
-- =====================================================
-- Run this AFTER logging in to link your user to the demo subscriber
-- Replace YOUR_USER_ID_HERE with your actual Supabase Auth user ID
-- You can find your user ID in Supabase Dashboard > Authentication > Users
-- =====================================================

-- STEP 1: Find your user ID from auth.users (run this first)
-- SELECT id, email FROM auth.users;

-- STEP 2: Update the subscriber to use your user ID
-- Replace the UUID below with your actual user ID from step 1
-- UPDATE subscribers 
-- SET user_id = 'YOUR_USER_ID_HERE'
-- WHERE id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

-- =====================================================
-- OR: Automatically link the FIRST user in auth.users
-- (Useful for single-user demo environments)
-- =====================================================

UPDATE subscribers 
SET user_id = (SELECT id FROM auth.users LIMIT 1)
WHERE id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

-- Verify the link
SELECT 
  s.id as subscriber_id,
  s.user_id,
  s.full_name,
  u.email as auth_email,
  s.status,
  p.name as package
FROM subscribers s
LEFT JOIN auth.users u ON s.user_id = u.id
LEFT JOIN packages p ON s.package_id = p.id
WHERE s.id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
