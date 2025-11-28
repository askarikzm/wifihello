-- Supabase initial schema for WANCOM ISP Portal
create schema if not exists billing;
create schema if not exists network;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null,
  status text not null check (status in ('active','suspended','blocked')),
  account_no text unique not null,
  created_at timestamptz default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  down_mbps int not null,
  up_mbps int not null,
  monthly_fee numeric(12,2) not null,
  created_at timestamptz default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  service_id uuid not null references public.services(id),
  start_date date not null,
  end_date date,
  status text not null check (status in ('active','grace','expired','terminated')),
  created_at timestamptz default now()
);

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

create table if not exists billing.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references billing.invoices(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  gateway text not null,
  amount numeric(12,2) not null,
  status text not null check (status in ('initiated','pending','success','failed','refunded')),
  reference text,
  initiated_at timestamptz default now(),
  completed_at timestamptz,
  unique(invoice_id, gateway, reference)
);

create table if not exists billing.transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references billing.payments(id) on delete cascade,
  ledger_side text not null check (ledger_side in ('debit','credit')),
  amount numeric(12,2) not null,
  currency text default 'PKR',
  description text,
  created_at timestamptz default now()
);

create table if not exists public.olt_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  vendor text not null,
  hostname text not null,
  mgmt_ip inet not null,
  region text,
  created_at timestamptz default now()
);

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

create table if not exists network.usage_logs (
  id bigserial primary key,
  customer_id uuid not null references public.customers(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  download_mb bigint default 0,
  upload_mb bigint default 0,
  session_id text
);

create table if not exists public.admin_roles (
  id serial primary key,
  user_id uuid not null references public.customers(user_id) on delete cascade,
  role text not null check (role in ('finance','noc','support','superadmin')),
  granted_at timestamptz default now()
);

create table if not exists public.audit_logs (
  id bigserial primary key,
  actor_user_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  metadata jsonb,
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table public.customers enable row level security;
alter table billing.invoices enable row level security;
alter table billing.payments enable row level security;
alter table network.usage_logs enable row level security;

create policy "tenant-customers" on public.customers
  for select using ( tenant_id = (auth.jwt()->>'tenant_id')::uuid );

create policy "tenant-invoices" on billing.invoices
  for select using ( tenant_id = (auth.jwt()->>'tenant_id')::uuid );

create policy "customer-usage" on network.usage_logs
  for select using ( customer_id in (
    select id from public.customers where user_id = auth.uid()
  ));

create policy "service-role-payments" on billing.payments
  for all using ( auth.role() = 'service_role' ) with check ( true );

-- helper view for NestJS read models
create or replace view billing_invoices_view as
select i.*, c.user_id
from billing.invoices i
join public.subscriptions s on s.id = i.subscription_id
join public.customers c on c.id = s.customer_id;

create or replace view usage_logs_view as
select u.*, c.user_id
from network.usage_logs u
join public.customers c on c.id = u.customer_id;
