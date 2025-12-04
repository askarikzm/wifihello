-- ============================================
-- NetAxis ISP Portal - Admin Functions & Views
-- Additional helper functions for the application
-- ============================================

-- ============================================
-- VIEWS FOR EASY DATA ACCESS
-- ============================================

-- Customer dashboard view
create or replace view public.customer_dashboard as
select 
  c.id as customer_id,
  c.user_id,
  c.account_no,
  c.full_name,
  c.status as customer_status,
  s.name as service_name,
  s.down_mbps,
  s.up_mbps,
  s.monthly_fee,
  sub.status as subscription_status,
  sub.start_date as subscription_start,
  om.serial as onu_serial,
  (
    select sum(download_mb + upload_mb) 
    from network.usage_logs ul 
    where ul.customer_id = c.id 
    and ul.recorded_at >= date_trunc('month', current_date)
  ) as current_month_usage_mb
from public.customers c
left join public.subscriptions sub on sub.customer_id = c.id and sub.status = 'active'
left join public.services s on s.id = sub.service_id
left join public.onu_mapping om on om.customer_id = c.id;

-- Billing summary view
create or replace view public.billing_summary as
select 
  c.id as customer_id,
  c.user_id,
  c.account_no,
  i.id as invoice_id,
  i.invoice_no,
  i.period_start,
  i.period_end,
  i.amount,
  i.tax,
  i.amount + i.tax as total_amount,
  i.status as invoice_status,
  i.due_date,
  p.completed_at as paid_at,
  p.reference as payment_reference,
  p.gateway as payment_method
from public.customers c
join public.subscriptions sub on sub.customer_id = c.id
join billing.invoices i on i.subscription_id = sub.id
left join billing.payments p on p.invoice_id = i.id and p.status = 'success';

-- Usage statistics view
create or replace view public.usage_stats as
select 
  c.id as customer_id,
  c.user_id,
  date_trunc('day', ul.recorded_at)::date as usage_date,
  sum(ul.download_mb) as daily_download_mb,
  sum(ul.upload_mb) as daily_upload_mb,
  sum(ul.download_mb + ul.upload_mb) as daily_total_mb
from public.customers c
join network.usage_logs ul on ul.customer_id = c.id
group by c.id, c.user_id, date_trunc('day', ul.recorded_at)::date
order by usage_date desc;

-- ============================================
-- API FUNCTIONS
-- ============================================

-- Get customer profile by user ID
create or replace function public.get_customer_profile(p_user_id uuid)
returns json as $$
declare
  v_result json;
begin
  select json_build_object(
    'customer', row_to_json(c.*),
    'subscription', row_to_json(sub.*),
    'service', row_to_json(s.*),
    'onu', row_to_json(om.*)
  ) into v_result
  from public.customers c
  left join public.subscriptions sub on sub.customer_id = c.id and sub.status = 'active'
  left join public.services s on s.id = sub.service_id
  left join public.onu_mapping om on om.customer_id = c.id
  where c.user_id = p_user_id;
  
  return v_result;
end;
$$ language plpgsql security definer;

-- Get invoices for customer
create or replace function public.get_customer_invoices(p_user_id uuid, p_limit int default 12)
returns json as $$
declare
  v_result json;
begin
  select json_agg(row_to_json(inv)) into v_result
  from (
    select 
      i.id,
      i.invoice_no,
      i.period_start,
      i.period_end,
      i.amount,
      i.tax,
      i.amount + i.tax as total,
      i.status,
      i.due_date,
      p.completed_at as paid_at
    from billing.invoices i
    join public.subscriptions sub on sub.id = i.subscription_id
    join public.customers c on c.id = sub.customer_id
    left join billing.payments p on p.invoice_id = i.id and p.status = 'success'
    where c.user_id = p_user_id
    order by i.period_start desc
    limit p_limit
  ) inv;
  
  return coalesce(v_result, '[]'::json);
end;
$$ language plpgsql security definer;

-- Get usage data for customer
create or replace function public.get_customer_usage(p_user_id uuid, p_days int default 30)
returns json as $$
declare
  v_result json;
begin
  select json_agg(row_to_json(usage)) into v_result
  from (
    select 
      date_trunc('day', ul.recorded_at)::date as date,
      sum(ul.download_mb)::bigint as download_mb,
      sum(ul.upload_mb)::bigint as upload_mb
    from network.usage_logs ul
    join public.customers c on c.id = ul.customer_id
    where c.user_id = p_user_id
    and ul.recorded_at >= current_date - (p_days || ' days')::interval
    group by date_trunc('day', ul.recorded_at)::date
    order by date desc
  ) usage;
  
  return coalesce(v_result, '[]'::json);
end;
$$ language plpgsql security definer;

-- Get current month summary
create or replace function public.get_monthly_summary(p_user_id uuid)
returns json as $$
declare
  v_result json;
begin
  select json_build_object(
    'total_download_gb', round(sum(ul.download_mb)::numeric / 1024, 2),
    'total_upload_gb', round(sum(ul.upload_mb)::numeric / 1024, 2),
    'total_usage_gb', round(sum(ul.download_mb + ul.upload_mb)::numeric / 1024, 2),
    'days_in_period', extract(day from current_date - date_trunc('month', current_date)::date) + 1,
    'period_start', date_trunc('month', current_date)::date,
    'period_end', (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date
  ) into v_result
  from network.usage_logs ul
  join public.customers c on c.id = ul.customer_id
  where c.user_id = p_user_id
  and ul.recorded_at >= date_trunc('month', current_date);
  
  return coalesce(v_result, json_build_object(
    'total_download_gb', 0,
    'total_upload_gb', 0,
    'total_usage_gb', 0,
    'days_in_period', 1,
    'period_start', date_trunc('month', current_date)::date,
    'period_end', (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date
  ));
end;
$$ language plpgsql security definer;

-- ============================================
-- GRANT ACCESS TO API FUNCTIONS
-- ============================================
grant execute on function public.get_customer_profile(uuid) to authenticated;
grant execute on function public.get_customer_invoices(uuid, int) to authenticated;
grant execute on function public.get_customer_usage(uuid, int) to authenticated;
grant execute on function public.get_monthly_summary(uuid) to authenticated;

-- ============================================
-- REALTIME SUBSCRIPTIONS (optional)
-- ============================================
-- Enable realtime for specific tables
alter publication supabase_realtime add table public.customers;
alter publication supabase_realtime add table billing.invoices;
alter publication supabase_realtime add table network.usage_logs;
