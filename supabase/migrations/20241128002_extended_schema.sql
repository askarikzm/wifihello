-- ============================================
-- NetAxis ISP Portal - Extended Schema Migration
-- Support Tickets, RADIUS, Notifications, Admin RPCs
-- ============================================

-- Step 1: Support Ticket System
-- ============================================

-- Support tickets table
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  ticket_no text unique not null,
  subject text not null,
  category text not null check (category in ('billing', 'technical', 'general', 'complaint', 'request')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  assigned_to uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  resolved_at timestamptz,
  closed_at timestamptz
);

-- Support messages (ticket thread)
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null,
  sender_type text not null check (sender_type in ('customer', 'agent', 'system')),
  message text not null,
  is_internal boolean default false,
  created_at timestamptz default now()
);

-- Ticket attachments
create table if not exists public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.support_messages(id) on delete cascade,
  file_name text not null,
  file_type text not null,
  file_size int not null,
  storage_path text not null,
  created_at timestamptz default now()
);

-- Create ticket number sequence
create sequence if not exists ticket_number_seq start 1000;

-- Step 2: RADIUS Tables
-- ============================================

-- RADIUS credentials (separate from auth for security)
create table if not exists public.radius_credentials (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade unique,
  username text not null unique,
  password_hash text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RADIUS sessions (active and historical)
create table if not exists public.radius_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  session_id text not null unique,
  nas_ip_address text not null,
  framed_ip_address text,
  session_start timestamptz not null,
  session_end timestamptz,
  input_octets bigint default 0,
  output_octets bigint default 0,
  session_time int default 0,
  terminate_cause text,
  status text not null default 'active' check (status in ('active', 'closed')),
  last_update timestamptz default now()
);

-- RADIUS authentication logs
create table if not exists public.radius_auth_logs (
  id bigserial primary key,
  username text not null,
  success boolean not null,
  nas_ip_address text not null,
  failure_reason text,
  attempted_at timestamptz default now()
);

-- Step 3: Notification System
-- ============================================

-- Notification templates
create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  type text not null check (type in ('sms', 'email', 'push')),
  subject text,
  body text not null,
  variables jsonb default '[]',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Notification logs
create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  template_id uuid references public.notification_templates(id) on delete set null,
  type text not null check (type in ('sms', 'email', 'push')),
  recipient text not null,
  subject text,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'failed')),
  provider_response jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz default now()
);

-- Step 4: RLS Policies for New Tables
-- ============================================

-- Support tickets RLS
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.ticket_attachments enable row level security;

-- Customers can see their own tickets
create policy "customers_own_tickets" on public.support_tickets
  for select using (
    customer_id in (select id from public.customers where user_id = auth.uid())
  );

-- Customers can create tickets
create policy "customers_create_tickets" on public.support_tickets
  for insert with check (
    customer_id in (select id from public.customers where user_id = auth.uid())
  );

-- Customers can see messages on their tickets
create policy "customers_own_messages" on public.support_messages
  for select using (
    is_internal = false and
    ticket_id in (
      select id from public.support_tickets where customer_id in (
        select id from public.customers where user_id = auth.uid()
      )
    )
  );

-- Customers can add messages to their tickets
create policy "customers_add_messages" on public.support_messages
  for insert with check (
    ticket_id in (
      select id from public.support_tickets where customer_id in (
        select id from public.customers where user_id = auth.uid()
      )
    )
  );

-- Service role full access
create policy "service_role_tickets" on public.support_tickets
  for all using (auth.role() = 'service_role');

create policy "service_role_messages" on public.support_messages
  for all using (auth.role() = 'service_role');

create policy "service_role_attachments" on public.ticket_attachments
  for all using (auth.role() = 'service_role');

-- RADIUS tables (service role only)
alter table public.radius_credentials enable row level security;
alter table public.radius_sessions enable row level security;
alter table public.radius_auth_logs enable row level security;

create policy "service_role_radius_creds" on public.radius_credentials
  for all using (auth.role() = 'service_role');

create policy "service_role_radius_sessions" on public.radius_sessions
  for all using (auth.role() = 'service_role');

create policy "service_role_radius_auth" on public.radius_auth_logs
  for all using (auth.role() = 'service_role');

-- Notification logs RLS
alter table public.notification_logs enable row level security;

create policy "service_role_notifications" on public.notification_logs
  for all using (auth.role() = 'service_role');

-- Step 5: Indexes for Performance
-- ============================================

create index if not exists idx_tickets_customer on public.support_tickets(customer_id);
create index if not exists idx_tickets_status on public.support_tickets(status);
create index if not exists idx_tickets_created on public.support_tickets(created_at desc);
create index if not exists idx_messages_ticket on public.support_messages(ticket_id);
create index if not exists idx_radius_sessions_customer on public.radius_sessions(customer_id);
create index if not exists idx_radius_sessions_status on public.radius_sessions(status);
create index if not exists idx_radius_auth_username on public.radius_auth_logs(username);
create index if not exists idx_notifications_customer on public.notification_logs(customer_id);
create index if not exists idx_notifications_status on public.notification_logs(status);

-- Step 6: Views for API
-- ============================================

create or replace view public.support_tickets_view as
select 
  t.*,
  c.user_id,
  c.full_name as customer_name,
  c.account_no,
  (select count(*) from public.support_messages m where m.ticket_id = t.id) as message_count
from public.support_tickets t
join public.customers c on c.id = t.customer_id;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
