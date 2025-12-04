-- ============================================
-- NetAxis ISP Portal - Complete Supabase Setup
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Create schemas
create schema if not exists billing;
create schema if not exists network;

-- Step 2: Core Tables

-- Customers table (linked to Supabase Auth)
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null default gen_random_uuid(),
  status text not null default 'active' check (status in ('active','suspended','blocked')),
  account_no text unique not null,
  full_name text,
  phone text,
  address text,
  created_at timestamptz default now()
);

-- Service packages
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  down_mbps int not null,
  up_mbps int not null,
  monthly_fee numeric(12,2) not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Customer subscriptions
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  service_id uuid not null references public.services(id),
  start_date date not null default current_date,
  end_date date,
  status text not null default 'active' check (status in ('active','grace','expired','terminated')),
  created_at timestamptz default now()
);

-- Step 3: Billing Tables

-- Invoices
create table if not exists billing.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  invoice_no text unique not null,
  period_start date not null,
  period_end date not null,
  amount numeric(12,2) not null,
  tax numeric(12,2) default 0,
  status text not null default 'pending' check (status in ('draft','pending','paid','overdue','cancelled')),
  due_date date not null,
  issued_at timestamptz default now()
);

-- Payments
create table if not exists billing.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references billing.invoices(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  gateway text not null,
  amount numeric(12,2) not null,
  status text not null default 'initiated' check (status in ('initiated','pending','success','failed','refunded')),
  reference text,
  initiated_at timestamptz default now(),
  completed_at timestamptz,
  unique(invoice_id, gateway, reference)
);

-- Transactions ledger
create table if not exists billing.transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references billing.payments(id) on delete cascade,
  ledger_side text not null check (ledger_side in ('debit','credit')),
  amount numeric(12,2) not null,
  currency text default 'PKR',
  description text,
  created_at timestamptz default now()
);

-- Step 4: Network Tables

-- OLT Devices
create table if not exists public.olt_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  vendor text not null,
  hostname text not null,
  mgmt_ip inet not null,
  region text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ONU Mapping (customer to ONU)
create table if not exists public.onu_mapping (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  olt_id uuid not null references public.olt_devices(id),
  frame smallint,
  slot smallint,
  port smallint,
  onu_id smallint,
  serial text,
  last_sync timestamptz
);

-- Usage logs
create table if not exists network.usage_logs (
  id bigserial primary key,
  customer_id uuid not null references public.customers(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  download_mb bigint default 0,
  upload_mb bigint default 0,
  session_id text
);

-- Step 5: Admin & Audit Tables

-- Admin roles
create table if not exists public.admin_roles (
  id serial primary key,
  user_id uuid not null,
  role text not null check (role in ('finance','noc','support','superadmin')),
  granted_at timestamptz default now()
);

-- Audit logs
create table if not exists public.audit_logs (
  id bigserial primary key,
  actor_user_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  metadata jsonb,
  created_at timestamptz default now()
);

-- Step 6: Enable Row Level Security
alter table public.customers enable row level security;
alter table public.subscriptions enable row level security;
alter table billing.invoices enable row level security;
alter table billing.payments enable row level security;
alter table network.usage_logs enable row level security;

-- Step 7: RLS Policies

-- Customers can see their own data
create policy "users_own_customer" on public.customers
  for select using (user_id = auth.uid());

-- Customers can see their subscriptions
create policy "users_own_subscriptions" on public.subscriptions
  for select using (
    customer_id in (select id from public.customers where user_id = auth.uid())
  );

-- Customers can see their invoices
create policy "users_own_invoices" on billing.invoices
  for select using (
    subscription_id in (
      select s.id from public.subscriptions s
      join public.customers c on c.id = s.customer_id
      where c.user_id = auth.uid()
    )
  );

-- Customers can see their payments
create policy "users_own_payments" on billing.payments
  for select using (
    customer_id in (select id from public.customers where user_id = auth.uid())
  );

-- Customers can see their usage
create policy "users_own_usage" on network.usage_logs
  for select using (
    customer_id in (select id from public.customers where user_id = auth.uid())
  );

-- Service role can do everything
create policy "service_role_customers" on public.customers
  for all using (auth.role() = 'service_role');

create policy "service_role_subscriptions" on public.subscriptions
  for all using (auth.role() = 'service_role');

create policy "service_role_invoices" on billing.invoices
  for all using (auth.role() = 'service_role');

create policy "service_role_payments" on billing.payments
  for all using (auth.role() = 'service_role');

create policy "service_role_usage" on network.usage_logs
  for all using (auth.role() = 'service_role');

-- Step 8: Helper Views for API

create or replace view public.billing_invoices_view as
select 
  i.*,
  c.user_id,
  c.full_name as customer_name,
  c.account_no,
  s.name as service_name
from billing.invoices i
join public.subscriptions sub on sub.id = i.subscription_id
join public.customers c on c.id = sub.customer_id
join public.services s on s.id = sub.service_id;

create or replace view public.usage_logs_view as
select 
  u.*,
  c.user_id,
  c.account_no
from network.usage_logs u
join public.customers c on c.id = u.customer_id;

create or replace view public.customer_dashboard_view as
select 
  c.id as customer_id,
  c.user_id,
  c.account_no,
  c.full_name,
  c.status as customer_status,
  sub.id as subscription_id,
  s.name as package_name,
  s.down_mbps,
  s.up_mbps,
  s.monthly_fee,
  sub.status as subscription_status,
  (
    select count(*) from billing.invoices i 
    where i.subscription_id = sub.id and i.status = 'pending'
  ) as pending_invoices,
  (
    select coalesce(sum(i.amount), 0) from billing.invoices i 
    where i.subscription_id = sub.id and i.status = 'pending'
  ) as amount_due
from public.customers c
left join public.subscriptions sub on sub.customer_id = c.id and sub.status = 'active'
left join public.services s on s.id = sub.service_id;

-- Step 9: Indexes for performance
create index if not exists idx_customers_user_id on public.customers(user_id);
create index if not exists idx_subscriptions_customer on public.subscriptions(customer_id);
create index if not exists idx_invoices_subscription on billing.invoices(subscription_id);
create index if not exists idx_invoices_status on billing.invoices(status);
create index if not exists idx_payments_invoice on billing.payments(invoice_id);
create index if not exists idx_usage_customer_date on network.usage_logs(customer_id, recorded_at);

-- ============================================
-- SETUP COMPLETE!
-- Now run the seed data script below
-- ============================================
