-- ============================================
-- WANCOM ISP Portal - RPC Functions
-- Admin Dashboard, Revenue, Analytics
-- ============================================

-- Revenue summary for last N days
create or replace function revenue_summary(p_days int default 30)
returns json
language plpgsql
security definer
as $$
declare
  result json;
begin
  select json_build_object(
    'total', coalesce(sum(p.amount), 0),
    'count', count(p.id),
    'by_gateway', (
      select json_object_agg(gateway, gateway_total)
      from (
        select gateway, sum(amount) as gateway_total
        from billing.payments
        where status = 'success'
          and completed_at >= now() - (p_days || ' days')::interval
        group by gateway
      ) g
    )
  ) into result
  from billing.payments p
  where p.status = 'success'
    and p.completed_at >= now() - (p_days || ' days')::interval;
  
  return result;
end;
$$;

-- Revenue summary for date range
create or replace function revenue_summary_range(p_start_date date, p_end_date date)
returns json
language plpgsql
security definer
as $$
declare
  result json;
begin
  select json_build_object(
    'total', coalesce(sum(p.amount), 0),
    'count', count(p.id),
    'by_gateway', (
      select json_object_agg(gateway, gateway_total)
      from (
        select gateway, sum(amount) as gateway_total
        from billing.payments
        where status = 'success'
          and completed_at::date between p_start_date and p_end_date
        group by gateway
      ) g
    ),
    'by_day', (
      select json_agg(day_data order by day)
      from (
        select completed_at::date as day, sum(amount) as amount, count(*) as count
        from billing.payments
        where status = 'success'
          and completed_at::date between p_start_date and p_end_date
        group by completed_at::date
      ) d(day, amount, count)
    )
  ) into result
  from billing.payments p
  where p.status = 'success'
    and p.completed_at::date between p_start_date and p_end_date;
  
  return result;
end;
$$;

-- Active subscribers count
create or replace function active_subscribers_count()
returns int
language plpgsql
security definer
as $$
begin
  return (
    select count(*)
    from public.customers
    where status = 'active'
  );
end;
$$;

-- Daily collections report
create or replace function daily_collections(p_start_date date, p_end_date date)
returns table(
  collection_date date,
  total_amount numeric,
  payment_count int,
  payfast_amount numeric,
  jazzcash_amount numeric,
  easypaisa_amount numeric
)
language plpgsql
security definer
as $$
begin
  return query
  select 
    p.completed_at::date as collection_date,
    sum(p.amount)::numeric as total_amount,
    count(*)::int as payment_count,
    coalesce(sum(case when p.gateway = 'payfast' then p.amount end), 0)::numeric as payfast_amount,
    coalesce(sum(case when p.gateway = 'jazzcash' then p.amount end), 0)::numeric as jazzcash_amount,
    coalesce(sum(case when p.gateway = 'easypaisa' then p.amount end), 0)::numeric as easypaisa_amount
  from billing.payments p
  where p.status = 'success'
    and p.completed_at::date between p_start_date and p_end_date
  group by p.completed_at::date
  order by collection_date;
end;
$$;

-- Subscriber usage summary
create or replace function subscriber_usage(p_customer_id uuid, p_days int default 30)
returns json
language plpgsql
security definer
as $$
declare
  result json;
begin
  select json_build_object(
    'total_download_mb', coalesce(sum(download_mb), 0),
    'total_upload_mb', coalesce(sum(upload_mb), 0),
    'daily', (
      select json_agg(day_data order by day)
      from (
        select 
          recorded_at::date as day,
          sum(download_mb) as download_mb,
          sum(upload_mb) as upload_mb
        from network.usage_logs
        where customer_id = p_customer_id
          and recorded_at >= now() - (p_days || ' days')::interval
        group by recorded_at::date
      ) d(day, download_mb, upload_mb)
    )
  ) into result
  from network.usage_logs
  where customer_id = p_customer_id
    and recorded_at >= now() - (p_days || ' days')::interval;
  
  return result;
end;
$$;

-- Check if customer has overdue invoices
create or replace function check_customer_overdue(p_customer_id uuid)
returns boolean
language plpgsql
security definer
as $$
begin
  return exists (
    select 1
    from billing.invoices i
    join public.subscriptions s on s.id = i.subscription_id
    where s.customer_id = p_customer_id
      and i.status = 'overdue'
  );
end;
$$;

-- Generate next ticket number
create or replace function generate_ticket_number()
returns text
language plpgsql
as $$
declare
  next_num int;
begin
  select nextval('ticket_number_seq') into next_num;
  return 'TKT-' || to_char(now(), 'YYYYMM') || '-' || lpad(next_num::text, 5, '0');
end;
$$;

-- Create support ticket with auto-generated number
create or replace function create_support_ticket(
  p_customer_id uuid,
  p_subject text,
  p_category text,
  p_priority text default 'normal',
  p_message text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_ticket_id uuid;
  v_ticket_no text;
begin
  -- Generate ticket number
  v_ticket_no := generate_ticket_number();
  
  -- Create ticket
  insert into public.support_tickets (
    customer_id, ticket_no, subject, category, priority, status
  ) values (
    p_customer_id, v_ticket_no, p_subject, p_category, p_priority, 'open'
  ) returning id into v_ticket_id;
  
  -- Add initial message if provided
  if p_message is not null then
    insert into public.support_messages (
      ticket_id, sender_id, sender_type, message
    ) values (
      v_ticket_id, p_customer_id, 'customer', p_message
    );
  end if;
  
  return v_ticket_id;
end;
$$;

-- NOC dashboard stats
create or replace function noc_dashboard_stats()
returns json
language plpgsql
security definer
as $$
declare
  result json;
begin
  select json_build_object(
    'total_subscribers', (select count(*) from public.customers),
    'active_subscribers', (select count(*) from public.customers where status = 'active'),
    'suspended_subscribers', (select count(*) from public.customers where status = 'suspended'),
    'active_sessions', (select count(*) from public.radius_sessions where status = 'active'),
    'open_tickets', (select count(*) from public.support_tickets where status in ('open', 'in_progress')),
    'today_new_tickets', (
      select count(*) from public.support_tickets 
      where created_at::date = current_date
    )
  ) into result;
  
  return result;
end;
$$;

-- Finance dashboard stats
create or replace function finance_dashboard_stats(p_days int default 30)
returns json
language plpgsql
security definer
as $$
declare
  result json;
begin
  select json_build_object(
    'total_revenue', (
      select coalesce(sum(amount), 0)
      from billing.payments
      where status = 'success'
        and completed_at >= now() - (p_days || ' days')::interval
    ),
    'pending_invoices', (
      select coalesce(sum(amount), 0)
      from billing.invoices
      where status = 'pending'
    ),
    'overdue_invoices', (
      select coalesce(sum(amount), 0)
      from billing.invoices
      where status = 'overdue'
    ),
    'pending_count', (
      select count(*) from billing.invoices where status = 'pending'
    ),
    'overdue_count', (
      select count(*) from billing.invoices where status = 'overdue'
    )
  ) into result;
  
  return result;
end;
$$;

-- Update invoice status to overdue (scheduled job)
create or replace function update_overdue_invoices()
returns int
language plpgsql
security definer
as $$
declare
  updated_count int;
begin
  update billing.invoices
  set status = 'overdue'
  where status = 'pending'
    and due_date < current_date;
  
  get diagnostics updated_count = row_count;
  
  return updated_count;
end;
$$;

-- ============================================
-- FUNCTIONS COMPLETE
-- ============================================
