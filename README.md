# WANCOM ISP Customer Portal Platform

Enterprise-grade reference implementation for WANCOM's ISP operations, covering customer self-care, billing, payments, OLT/ONU telemetry, and RADIUS automation. The repository is structured as a multi-service monorepo that can be deployed via Docker Compose or split into independent services for Kubernetes.

## Project Pillars

- **Customer Experience**: Responsive Next.js 15 portal with usage insights, invoices, payments, and support workflows.
- **Operational Automation**: NestJS backend that consumes Supabase Auth + Postgres (RLS), orchestrates billing/payments, and proxies network provisioning microservices.
- **Network Intelligence**: Dedicated Network Integration Service exposing unified vendor-neutral OLT/ONU telemetry and actions.
- **Payments & Revenue Assurance**: Modular payment connectors (PayFast, JazzCash/Easypaisa, 1LINK-ready) with secure webhooks and reconciliation jobs.
- **Observability & Security**: Centralized logging (Loki), metrics (Prometheus), dashboards (Grafana), tamper-proof audit logs, and JWT/HMAC enforcement.

## Top-Level Structure

```
backend/                NestJS API (Supabase JWT guard, billing, payments, usage, admin)
supabase/               SQL migrations + RLS policies applied via Supabase CLI
network-service/        OLT/ONU integration microservice (SNMP, SSH, vendor APIs)
payment-service/        Gateway-specific connectors (optional future use)
frontend/               Next.js 15 + TypeScript portal (customer & admin shells)
infra/                  Docker, Nginx, GitHub Actions, monitoring manifests
scripts/                Automation helpers (seed data, reconciliation, backups)
docs/                   Architecture, API contracts, diagrams, runbooks
```

## Getting Started

1. Duplicate `.env.example` into `.env` and adjust Supabase keys, network service API keys, and gateway secrets.
2. Install Docker + Docker Compose v2.
3. Run `docker compose up --build` to start Supabase-connected backend services, frontend, and observability stack.
4. Access portals:
   - Frontend: `https://localhost:3100`
   - NestJS API: `https://localhost:9000/api`
   - Network service: `https://localhost:9100/docs`

## Documentation Map

- `docs/architecture.md` – system overview, deployment topologies, trust zones
- `docs/database-schema.md` – Supabase schemas + RLS policies
- `docs/api-contracts.md` – REST contracts aligned with the product brief
- `docs/devops.md` – CI/CD, observability, backup strategy
- `docs/testing-strategy.md` – unit/integration/load/security test plans
- `docs/olt-integration.md` – SNMP/SSH flows, vendor command matrix
- `docs/payment-flow.md` – sequence diagrams, reconciliation workflows

Each document includes actionable steps and responsibilities to accelerate handover to engineering teams.

## Status

This repository currently provides **production-ready scaffolding** with examples, contracts, and automation hooks. Domain modules, connectors, and UI widgets include TODO markers where implementation specifics (gateway credentials, OLT IPs, SMS vendors) must be supplied. Use the provided tests and CI templates as a baseline before rolling out to live subscribers.
