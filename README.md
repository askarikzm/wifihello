# NetAxis ISP Customer Portal Platform

Enterprise-grade ISP management platform for NetAxis operations, covering customer self-care, billing, payments, OLT/ONU telemetry, RADIUS AAA automation, and comprehensive admin tools. The repository is structured as a multi-service monorepo that can be deployed via Docker Compose or split into independent services for Kubernetes.

## 🚀 Features

### Customer Portal
- **Dashboard**: Real-time network status, usage statistics, and account overview
- **Payments**: Multi-gateway support (PayFast, JazzCash, Easypaisa) with secure webhook handling
- **Invoices**: View and download billing history
- **Usage**: Detailed bandwidth usage analytics with sparkline charts
- **Support**: Ticket submission and tracking system

### Admin Portal
- **Revenue Dashboard**: Real-time collections, outstanding balances, growth metrics
- **NOC Dashboard**: OLT/ONU status, alarms, offline devices, signal quality monitoring
- **Subscriber Management**: Full CRUD with search, filtering, suspend/reactivate actions
- **Support Desk**: Ticket management with priority queues and agent assignment
- **Reports**: Financial reports, subscriber analytics, network health reports

### Backend Services
- **Billing Service**: Automated invoice generation, package management
- **Payment Service**: Multi-gateway integration with HMAC verification and idempotency
- **Notification Service**: SMS (Clickatell, Twilio) and Email (SMTP, SendGrid) with event triggers
- **Support Service**: Full ticket lifecycle management with messaging

### Network Services
- **RADIUS AAA**: PAP/CHAP authentication, speed profiles, accounting, suspension logic
- **OLT Integration**: Multi-vendor support (Huawei MA5800, ZTE C300/C600, FiberHome AN5516)
- **ONU Management**: Provisioning, rebooting, diagnostics, optical power monitoring

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js 15    │────▶│    NestJS API   │────▶│    Supabase     │
│   Frontend      │     │    Backend      │     │    PostgreSQL   │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
            ┌───────────┐ ┌───────────┐ ┌───────────┐
            │  Network  │ │  RADIUS   │ │  Payment  │
            │  Service  │ │  Service  │ │  Gateways │
            │ (FastAPI) │ │  (PyRad)  │ │           │
            └───────────┘ └───────────┘ └───────────┘
                    │            │
                    ▼            ▼
            ┌───────────────────────────────────────┐
            │           OLT/ONU Devices             │
            │   (Huawei, ZTE, FiberHome via SSH)    │
            └───────────────────────────────────────┘
```

## 📦 Project Structure

```
backend/                NestJS API with modules:
  ├── auth/            Supabase JWT authentication
  ├── billing/         Invoice generation, package management
  ├── payment/         Multi-gateway payment processing
  ├── notification/    SMS/Email notification engine
  ├── support/         Ticket system
  ├── network/         OLT/ONU proxy endpoints
  └── admin/           Admin dashboard endpoints

frontend/              Next.js 15 App Router:
  ├── app/dashboard/   Customer dashboard
  ├── app/payments/    Payment flow UI
  ├── app/support/     Ticket submission
  └── app/admin/       Admin portal (NOC, Finance, Subscribers)

network-service/       Python FastAPI:
  └── app/drivers/     OLT vendor drivers (Huawei, ZTE, FiberHome)

radius-service/        Python RADIUS AAA:
  └── app/             Authentication, Authorization, Accounting

supabase/              Database:
  └── migrations/      Schema, RLS policies, functions

infra/                 Infrastructure:
  ├── nginx/           Reverse proxy configuration
  ├── prometheus/      Metrics collection
  ├── grafana/         Dashboards (via docker-compose)
  └── loki/            Log aggregation
```

## 🛠️ Getting Started

### Prerequisites
- Docker & Docker Compose v2
- Node.js 20+ (for local development)
- Python 3.11+ (for network/radius services)

### Quick Start

1. **Clone and configure:**
   ```bash
   git clone https://github.com/bilalhzaidi/NetAxis.git
   cd NetAxis
   cp .env.example .env
   # Edit .env with your Supabase credentials and gateway keys
   ```

2. **Start all services:**
   ```bash
   docker compose up --build
   ```

3. **Access the portals:**
   - Customer Portal: http://localhost:3100
   - Admin Portal: http://localhost:3100/admin
   - API Documentation: http://localhost:9000/api
   - Network Service: http://localhost:9100/docs
   - Grafana: http://localhost:3200

### Development Mode

```bash
# Backend
cd backend && npm install && npm run start:dev

# Frontend
cd frontend && npm install && npm run dev

# Network Service
cd network-service && pip install -e . && uvicorn app.main:app --reload

# RADIUS Service
cd radius-service && pip install -e . && python -m app.main
```

## 🔧 Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin operations |
| `PAYMENT_WEBHOOK_SECRET` | HMAC secret for payment webhooks |
| `NETWORK_SERVICE_API_KEY` | API key for network service |

### Payment Gateway Setup

See `docs/payment-flow.md` for detailed gateway configuration:
- **PayFast**: South African payment gateway
- **JazzCash**: Pakistani mobile payments
- **Easypaisa**: Pakistani mobile wallet

### OLT Configuration

Configure your OLTs in the network service environment:
```json
OLT_CONFIG='[
  {"id":"olt-01","name":"Main OLT","ip":"192.168.1.1","vendor":"huawei","model":"MA5800-X7"}
]'
```

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System design, deployment topologies |
| [Database Schema](docs/database-schema.md) | Tables, RLS policies, functions |
| [API Contracts](docs/api-contracts.md) | REST API documentation |
| [OLT Integration](docs/olt-integration.md) | SNMP/SSH flows, vendor commands |
| [Payment Flow](docs/payment-flow.md) | Gateway integration, webhooks |
| [DevOps](docs/devops.md) | CI/CD, monitoring, backups |
| [Testing](docs/testing-strategy.md) | Test plans and coverage |

## 🔒 Security

- JWT authentication via Supabase Auth
- Row-Level Security (RLS) on all database tables
- HMAC signature verification on payment webhooks
- Role-based access control (admin, noc, finance, support)
- Audit logging for sensitive operations

## 📊 Monitoring

The stack includes:
- **Prometheus**: Metrics collection (port 9190)
- **Grafana**: Visualization dashboards (port 3200)
- **Loki**: Log aggregation (port 3101)
- **Health endpoints**: `/health` on all services

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `npm test` / `pytest`
4. Submit a pull request

## 📄 License

Proprietary - NetAxis Technologies
