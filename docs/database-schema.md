# Supabase Database Schema

All data lives in Supabase Postgres. `auth.users` is managed by Supabase; business tables sit under `public`, `billing`, and `network` schemas. All timestamps are UTC.

## Core Identity Tables

### public.customers
- `id uuid PK default gen_random_uuid()`
- `user_id uuid` → references `auth.users(id)`
- `tenant_id uuid` – multi-region isolation
- `account_no text` – human-readable identifier
- `status text` – `active|suspended|blocked`
- `created_at timestamptz`

### public.services
- Tariff catalog (code, speeds, monthly_fee)

### public.subscriptions
- Links customers to services with `start_date`, `end_date`, `status`

## Billing Schema (`billing`)

### billing.invoices
- `tenant_id`, `subscription_id`, `invoice_no`, `period_start/end`
- Amount columns: `amount`, `tax`, `due_date`, `status`
- Indexes: `(tenant_id, status)`, `(subscription_id, period_start)`

### billing.payments
- `invoice_id`, `customer_id`, `gateway`, `amount`, `status`, `reference`
- Enforces unique `(invoice_id, gateway, reference)` for idempotency

### billing.transactions
- Immutable ledger referencing `payment_id`
- Stores `ledger_side`, `amount`, `currency`, `description`

### billing_invoices_view
- Convenience view joining invoices → subscriptions → customers (exposes `user_id` for RLS reads from NestJS)

## Network Schema (`network`)

### network.usage_logs
- Aggregated usage rows per subscriber (`download_mb`, `upload_mb`, `recorded_at`)
- Indexed on `(customer_id, recorded_at desc)`

### public.olt_devices & public.onu_mapping
- Inventory of OLTs + mapping of subscribers to frame/slot/port/onu_id

## Admin & Audit

### public.admin_roles
- Grants `finance|noc|support|superadmin` role to Supabase users

### public.audit_logs
- Append-only ledger of sensitive actions (actor, entity, metadata JSON)

## Row-Level Security Overview

```sql
alter table public.customers enable row level security;

create policy tenant_customer_read on public.customers
	for select using ((auth.jwt()->>'tenant_id')::uuid = tenant_id);

alter table billing.invoices enable row level security;
create policy tenant_invoice_read on billing.invoices
	for select using (tenant_id = (auth.jwt()->>'tenant_id')::uuid);

alter table network.usage_logs enable row level security;
create policy customer_usage_read on network.usage_logs
	for select using (
		customer_id in (select id from public.customers where user_id = auth.uid())
	);

alter table billing.payments enable row level security;
create policy service_role_payments on billing.payments
	for all using (auth.role() = 'service_role') with check (true);
```

Supabase service role keys are used only inside NestJS backend and provisioning microservices; end users always access via JWT + RLS.

## Migrations
- SQL migrations stored under `supabase/migrations/` (timestamped files).
- Apply locally using `supabase db push` or in CI using Supabase CLI.

## Indexing Strategy
- `create index on billing.invoices (tenant_id, status)` → overdue lookups
- `create index on billing.payments(reference)` → fast webhook reconciliation
- `create index on network.usage_logs (customer_id, recorded_at desc)` → timeline queries
- `create index on audit_logs (created_at)` + `gin` index on `metadata` for JSON search
