-- ============================================
-- WANCOM ISP Portal - Admin Operations
-- Optional: Run these for admin functionality
-- ============================================

-- ============================================
-- CREATE ADMIN SCHEMA FIRST
-- ============================================
create schema if not exists admin;

-- ============================================
-- ADMIN RLS POLICIES
-- ============================================

-- Allow admins to view all customers
create policy "admin_view_all_customers" on public.customers
  for select using (
    exists (
      select 1 from public.admin_roles 
      where user_id = auth.uid() 
      and role in ('superadmin', 'support', 'noc', 'finance')
    )
  );

-- Allow admins to update customers
create policy "admin_update_customers" on public.customers
  for update using (
    exists (
      select 1 from public.admin_roles 
      where user_id = auth.uid() 
      and role in ('superadmin', 'support')
    )
  );

-- Allow admins to view all invoices
create policy "admin_view_all_invoices" on billing.invoices
  for select using (
    exists (
      select 1 from public.admin_roles 
      where user_id = auth.uid() 
      and role in ('superadmin', 'finance', 'support')
    )
  );

-- Allow finance to update invoices
create policy "admin_update_invoices" on billing.invoices
  for update using (
    exists (
      select 1 from public.admin_roles 
      where user_id = auth.uid() 
      and role in ('superadmin', 'finance')
    )
  );

-- Allow admins to view all usage logs
create policy "admin_view_all_usage" on network.usage_logs
  for select using (
    exists (
      select 1 from public.admin_roles 
      where user_id = auth.uid() 
      and role in ('superadmin', 'noc', 'support')
    )
  );

-- ============================================
-- ADMIN FUNCTIONS
-- ============================================

-- Get all customers (admin only)
create or replace function admin.get_all_customers(
  p_status text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  account_no text,
  full_name text,
  phone text,
  status text,
  service_name text,
  monthly_fee numeric,
  pending_amount numeric,
  created_at timestamptz
) as $$
begin
  -- Check admin role
  if not exists (
    select 1 from public.admin_roles 
    where user_id = auth.uid() 
    and role in ('superadmin', 'support', 'finance', 'noc')
  ) then
    raise exception 'Access denied';
  end if;

  return query
  select 
    c.id,
    c.account_no,
    c.full_name,
    c.phone,
    c.status,
    s.name as service_name,
    s.monthly_fee,
    coalesce((
      select sum(i.amount + i.tax)
      from billing.invoices i
      join public.subscriptions sub on sub.id = i.subscription_id
      where sub.customer_id = c.id and i.status in ('pending', 'overdue')
    ), 0) as pending_amount,
    c.created_at
  from public.customers c
  left join public.subscriptions sub on sub.customer_id = c.id and sub.status = 'active'
  left join public.services s on s.id = sub.service_id
  where (p_status is null or c.status = p_status)
  order by c.created_at desc
  limit p_limit
  offset p_offset;
end;
$$ language plpgsql security definer;

-- Get revenue summary (finance/admin only)
create or replace function admin.get_revenue_summary(
  p_start_date date default date_trunc('month', current_date)::date,
  p_end_date date default current_date
)
returns json as $$
declare
  v_result json;
begin
  -- Check admin role
  if not exists (
    select 1 from public.admin_roles 
    where user_id = auth.uid() 
    and role in ('superadmin', 'finance')
  ) then
    raise exception 'Access denied';
  end if;

  select json_build_object(
    'period_start', p_start_date,
    'period_end', p_end_date,
    'total_invoiced', coalesce(sum(case when i.status != 'cancelled' then i.amount + i.tax end), 0),
    'total_collected', coalesce(sum(case when i.status = 'paid' then i.amount + i.tax end), 0),
    'total_pending', coalesce(sum(case when i.status in ('pending', 'overdue') then i.amount + i.tax end), 0),
    'invoice_count', count(*),
    'paid_count', count(*) filter (where i.status = 'paid'),
    'pending_count', count(*) filter (where i.status in ('pending', 'overdue'))
  ) into v_result
  from billing.invoices i
  where i.issued_at between p_start_date and p_end_date + interval '1 day';
  
  return v_result;
end;
$$ language plpgsql security definer;

-- Suspend customer (admin only)
create or replace function admin.suspend_customer(p_customer_id uuid, p_reason text)
returns void as $$
begin
  -- Check admin role
  if not exists (
    select 1 from public.admin_roles 
    where user_id = auth.uid() 
    and role in ('superadmin', 'support', 'noc')
  ) then
    raise exception 'Access denied';
  end if;

  -- Update customer status
  update public.customers 
  set status = 'suspended'
  where id = p_customer_id;

  -- Update subscriptions
  update public.subscriptions
  set status = 'grace'
  where customer_id = p_customer_id and status = 'active';

  -- Log action
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'suspend', 'customer', p_customer_id::text, jsonb_build_object('reason', p_reason));
end;
$$ language plpgsql security definer;

-- Reactivate customer (admin only)
create or replace function admin.reactivate_customer(p_customer_id uuid)
returns void as $$
begin
  -- Check admin role
  if not exists (
    select 1 from public.admin_roles 
    where user_id = auth.uid() 
    and role in ('superadmin', 'support')
  ) then
    raise exception 'Access denied';
  end if;

  -- Update customer status
  update public.customers 
  set status = 'active'
  where id = p_customer_id;

  -- Update subscriptions
  update public.subscriptions
  set status = 'active'
  where customer_id = p_customer_id and status = 'grace';

  -- Log action
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'reactivate', 'customer', p_customer_id::text, null);
end;
$$ language plpgsql security definer;

-- ============================================
-- GRANT ACCESS TO ADMIN SCHEMA
-- ============================================
grant usage on schema admin to authenticated;
grant execute on all functions in schema admin to authenticated;

-- ============================================
-- HELPER: Add admin user
-- Usage: select add_admin_user('user@example.com', 'superadmin');
-- ============================================
create or replace function public.add_admin_user(p_email text, p_role text)
returns void as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = p_email;
  
  if v_user_id is null then
    raise exception 'User with email % not found', p_email;
  end if;
  
  insert into public.admin_roles (user_id, role)
  values (v_user_id, p_role)
  on conflict do nothing;
  
  raise notice 'Admin role % granted to %', p_role, p_email;
end;
$$ language plpgsql security definer;
