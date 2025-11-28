# WANCOM Architecture Overview

## High-Level View

```
[Next.js 15 SPA] --Supabase Auth--> [Supabase JWT]
        |                                   \
        | Bearer JWT                          \---> [Supabase Postgres + RLS]
        v                                         ^
   [Nginx / API GW] ---> [NestJS Core API] -------/
        |                     |-- Payment intents -> PayFast/JazzCash/Easypaisa
        |                     |-- Internal HTTP -> Network Provisioning Microservice
        |                     |-- Audit + Metrics -> Loki/Prometheus

[Network Provisioning Service] --SNMP/SSH--> Huawei/ZTE/FiberHome OLTs
[Payment Gateways] <--HMAC Webhooks-- [NestJS Payment Webhook]

[Observability Stack] <-- metrics/logs --> All services
```

## Services & Responsibilities

- **Frontend (Next.js 15 + Supabase client)**
  - Supabase Auth helpers for SSR/CSR token handling
  - React Query for `/api/invoices`, `/api/usage`, `/api/payments`
  - Tailwind + shadcn/ui for dashboards, UsageCard, InvoiceTable, NetworkStatus
  - GA4 instrumentation for funnels (login → pay → success)

- **Backend (NestJS)**
  - Modules: Auth (Supabase JWKS guard), Billing, Payments, Usage, Network proxy, Admin
  - Supabase service-role client for RLS-compliant queries
  - Payment module handles intents & webhooks with HMAC + idempotency
  - Network module calls provisioning microservice (mTLS/API key) for ONU status/actions

- **Supabase (Auth + Postgres + RLS)**
  - Supabase Auth issues JWT with `sub`, `role`, `tenant_id`
  - Schemas `public`, `billing`, `network` enforce tenant-level access via RLS
  - SQL migrations tracked under `supabase/migrations/`

- **Network Provisioning Service (Go/Python)**
  - Secure internal API: `/provision`, `/suspend`, `/resume`, `/onu/:id/status`
  - Executes SNMP/SSH/NETCONF commands per vendor; logs every action to `audit_logs`

- **Payment Gateways**
  - Hosted checkout; NestJS never handles PAN/CVV
  - Webhooks validated via shared secret, mapped to internal invoices

- **Observability / DevOps**
  - Docker Compose for local dev, ready for containerized deployment behind Nginx
  - GitHub Actions pipeline (lint, test, security scan)
  - Prometheus + Grafana + Loki for metrics/logs; Sentry for exceptions

## Data Flow Highlights

1. **Payment Flow**
   1. User initiates `/payments/intent` with Supabase JWT → NestJS verifies → inserts `billing.payments`
   2. Redirects to gateway (PayFast/JazzCash). On completion gateway posts webhook.
   3. NestJS webhook verifies HMAC, maps `reference` → invoice, updates status via service-role client, writes `audit_logs`.

2. **Usage Flow**
   1. Provisioning microservice polls/pushes usage to Supabase `network.usage_logs` via server key.
   2. Frontend `GET /api/usage/daily` (JWT+RLS) fetches only that user’s rows.

3. **Provisioning Flow**
   1. Admin issues speed change → NestJS ensures admin role → calls internal microservice with service JWT.
   2. Microservice executes vendor commands, returns status, NestJS appends `audit_logs`.

## Deployment Topology

- **DMZ**: Nginx terminating TLS 1.3, routing to Next.js SSR and NestJS API.
- **Application Zone**: NestJS containers, payment webhooks, Supabase connections (over TLS).
- **Network Zone**: Provisioning microservice with outbound SNMP/SSH only, reachable via private network.
- **Data Zone**: Supabase managed Postgres, backups + PITR; observability stack (Prometheus, Grafana, Loki).
