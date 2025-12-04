-- ============================================
-- NetAxis ISP Portal - Demo/Seed Data
-- Run this AFTER creating the demo user in Auth
-- ============================================

-- First, get the demo user's ID from auth.users
-- Replace 'DEMO_USER_ID' with actual UUID after creating user

-- Step 1: Insert service packages
insert into public.services (code, name, down_mbps, up_mbps, monthly_fee) values
  ('FIBER-10', 'Fiber Basic 10 Mbps', 10, 5, 1500.00),
  ('FIBER-25', 'Fiber Standard 25 Mbps', 25, 10, 2500.00),
  ('FIBER-50', 'Fiber Plus 50 Mbps', 50, 25, 4000.00),
  ('FIBER-100', 'Fiber Pro 100 Mbps', 100, 50, 6000.00),
  ('FIBER-200', 'Fiber Ultra 200 Mbps', 200, 100, 9000.00),
  ('FIBER-500', 'Fiber Max 500 Mbps', 500, 250, 15000.00),
  ('FIBER-1G', 'Fiber Giga 1 Gbps', 1000, 500, 25000.00)
on conflict (code) do nothing;

-- Step 2: Insert OLT devices
insert into public.olt_devices (tenant_id, vendor, hostname, mgmt_ip, region) values
  (gen_random_uuid(), 'huawei', 'OLT-HUB-01', '10.0.1.1', 'Central'),
  (gen_random_uuid(), 'zte', 'OLT-NORTH-01', '10.0.2.1', 'North'),
  (gen_random_uuid(), 'huawei', 'OLT-SOUTH-01', '10.0.3.1', 'South'),
  (gen_random_uuid(), 'fiberhome', 'OLT-EAST-01', '10.0.4.1', 'East')
on conflict do nothing;

-- ============================================
-- AFTER CREATING DEMO USER, RUN THIS:
-- ============================================

-- Step 3: Create a function to set up demo user data
create or replace function setup_demo_user(demo_email text)
returns void as $$
declare
  v_user_id uuid;
  v_customer_id uuid;
  v_subscription_id uuid;
  v_service_id uuid;
  v_olt_id uuid;
  v_tenant_id uuid := gen_random_uuid();
begin
  -- Get the user ID from auth.users
  select id into v_user_id from auth.users where email = demo_email;
  
  if v_user_id is null then
    raise exception 'User with email % not found. Create the user first in Authentication.', demo_email;
  end if;

  -- Get a service
  select id into v_service_id from public.services where code = 'FIBER-50' limit 1;
  
  -- Get an OLT
  select id into v_olt_id from public.olt_devices limit 1;

  -- Create customer record
  insert into public.customers (user_id, tenant_id, status, account_no, full_name, phone, address)
  values (
    v_user_id,
    v_tenant_id,
    'active',
    'WAN-' || to_char(now(), 'YYYYMM') || '-0001',
    'Demo Customer',
    '+92-300-1234567',
    '123 Demo Street, Islamabad, Pakistan'
  )
  returning id into v_customer_id;

  -- Create subscription
  insert into public.subscriptions (customer_id, service_id, start_date, status)
  values (v_customer_id, v_service_id, current_date - interval '3 months', 'active')
  returning id into v_subscription_id;

  -- Create ONU mapping
  insert into public.onu_mapping (customer_id, olt_id, frame, slot, port, onu_id, serial)
  values (v_customer_id, v_olt_id, 0, 1, 1, 1, 'HWTC12345678');

  -- Create invoices (last 3 months)
  insert into billing.invoices (tenant_id, subscription_id, invoice_no, period_start, period_end, amount, tax, status, due_date, issued_at)
  values
    -- 3 months ago - PAID
    (v_tenant_id, v_subscription_id, 
     'INV-' || to_char(current_date - interval '3 months', 'YYYYMM') || '-0001',
     (current_date - interval '3 months')::date,
     (current_date - interval '2 months')::date,
     4000.00, 640.00, 'paid',
     (current_date - interval '2 months' + interval '15 days')::date,
     current_date - interval '3 months'),
    -- 2 months ago - PAID
    (v_tenant_id, v_subscription_id,
     'INV-' || to_char(current_date - interval '2 months', 'YYYYMM') || '-0001',
     (current_date - interval '2 months')::date,
     (current_date - interval '1 month')::date,
     4000.00, 640.00, 'paid',
     (current_date - interval '1 month' + interval '15 days')::date,
     current_date - interval '2 months'),
    -- Last month - PAID
    (v_tenant_id, v_subscription_id,
     'INV-' || to_char(current_date - interval '1 month', 'YYYYMM') || '-0001',
     (current_date - interval '1 month')::date,
     current_date,
     4000.00, 640.00, 'paid',
     (current_date + interval '15 days')::date,
     current_date - interval '1 month'),
    -- Current month - PENDING
    (v_tenant_id, v_subscription_id,
     'INV-' || to_char(current_date, 'YYYYMM') || '-0001',
     current_date,
     (current_date + interval '1 month')::date,
     4000.00, 640.00, 'pending',
     (current_date + interval '15 days')::date,
     current_date);

  -- Create usage logs (last 30 days)
  insert into network.usage_logs (customer_id, recorded_at, download_mb, upload_mb)
  select 
    v_customer_id,
    current_date - (n || ' days')::interval + (random() * interval '24 hours'),
    (random() * 5000 + 500)::bigint,  -- 500MB to 5.5GB download
    (random() * 1000 + 100)::bigint   -- 100MB to 1.1GB upload
  from generate_series(0, 29) as n;

  raise notice 'Demo user setup complete for %', demo_email;
end;
$$ language plpgsql security definer;

-- ============================================
-- TO SET UP DEMO USER, RUN:
-- select setup_demo_user('demo@netaxis.pk');
-- ============================================
