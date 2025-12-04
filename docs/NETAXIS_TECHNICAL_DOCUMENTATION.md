# NetAxis ISP Customer Portal

## Enterprise Technical Documentation

**Version:** 1.0.0  
**Last Updated:** November 29, 2025  
**Classification:** Internal - Technical Leadership  
**Prepared For:** Chief Technology Officer

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Customer Portal Features](#3-customer-portal-features)
4. [Admin Portal Features](#4-admin-portal-features)
5. [Reports & Analytics](#5-reports--analytics)
6. [API Reference](#6-api-reference)
7. [Database Schema](#7-database-schema)
8. [Security Architecture](#8-security-architecture)
9. [Network Integration](#9-network-integration)
10. [Payment Gateway Integration](#10-payment-gateway-integration)
11. [Deployment & Operations](#11-deployment--operations)
12. [Operational Requirements](#12-operational-requirements)
13. [Monitoring & Observability](#13-monitoring--observability)
14. [Disaster Recovery](#14-disaster-recovery)
15. [Appendices](#15-appendices)

---

## 1. Executive Summary

### 1.1 Overview

NetAxis is an enterprise-grade ISP Customer Portal designed for fiber-optic internet service providers. The platform provides a comprehensive solution for customer self-service, billing management, payment processing, network operations, and administrative functions.

### 1.2 Key Capabilities

| Capability | Description |
|------------|-------------|
| **Customer Self-Service** | View usage, invoices, payments, and manage account |
| **Billing Automation** | Automated invoice generation, payment processing, and reconciliation |
| **Network Operations** | Real-time OLT/ONU monitoring, provisioning, and diagnostics |
| **Multi-Gateway Payments** | PayFast, JazzCash, Easypaisa integration with HMAC security |
| **Role-Based Access** | Admin, NOC, Finance, Support roles with granular permissions |
| **Multi-Tenant Architecture** | Support for multiple regions/brands on single deployment |

### 1.3 Technology Stack

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TECHNOLOGY STACK                               │
├─────────────────────────────────────────────────────────────────────────┤
│  FRONTEND          │  Next.js 15, TailwindCSS, ShadCN, React Query      │
│  BACKEND           │  NestJS 10+, TypeScript, Pino Logger               │
│  DATABASE          │  Supabase (PostgreSQL) with Row-Level Security     │
│  AUTHENTICATION    │  Supabase Auth (JWT, Email/Password, OTP)          │
│  NETWORK SERVICE   │  Python FastAPI for OLT/ONU management             │
│  RADIUS SERVICE    │  Python with pyrad for AAA                         │
│  CACHING           │  Redis 7                                           │
│  MONITORING        │  Prometheus, Grafana, Loki                         │
│  CONTAINERIZATION  │  Docker, Docker Compose                            │
│  REVERSE PROXY     │  Nginx with TLS 1.3                                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. System Architecture

### 2.1 High-Level Architecture Diagram

```
                                    ┌─────────────────┐
                                    │   End Users     │
                                    │  (Customers)    │
                                    └────────┬────────┘
                                             │ HTTPS
                                             ▼
                              ┌──────────────────────────────┐
                              │      Nginx Reverse Proxy     │
                              │    (TLS 1.3 Termination)     │
                              │      Port 80/443             │
                              └──────────────┬───────────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
         ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
         │   Next.js SSR    │    │   NestJS API     │    │  Payment Webhook │
         │   Frontend       │    │   Backend        │    │   Endpoints      │
         │   Port 3000      │    │   Port 9000      │    │   /webhook/*     │
         └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘
                  │                       │                        │
                  │                       │                        │
                  └───────────────────────┼────────────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
         ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
         │   Supabase       │  │  Network Service │  │  RADIUS Service  │
         │   (PostgreSQL)   │  │  (Python/FastAPI)│  │  (Python/pyrad)  │
         │   Auth + RLS     │  │  Port 9100       │  │  Port 1812/1813  │
         └──────────────────┘  └────────┬─────────┘  └──────────────────┘
                                        │
                                        ▼
                              ┌──────────────────┐
                              │   OLT Devices    │
                              │ (Huawei/ZTE/FH)  │
                              │  SNMP/SSH/CLI    │
                              └──────────────────┘
```

### 2.2 Service Communication Matrix

| Source | Destination | Protocol | Port | Authentication |
|--------|-------------|----------|------|----------------|
| Browser | Nginx | HTTPS | 443 | - |
| Nginx | Frontend | HTTP | 3000 | - |
| Nginx | Backend | HTTP | 9000 | - |
| Frontend | Supabase | HTTPS | 443 | Anon Key |
| Backend | Supabase | HTTPS | 443 | Service Role Key |
| Backend | Network Service | HTTP | 9100 | API Key |
| Network Service | OLT | SNMP/SSH | 161/22 | Credentials |
| Payment Gateway | Backend | HTTPS | 443 | HMAC Signature |

### 2.3 Data Flow Patterns

#### 2.3.1 Authentication Flow

```
┌─────────┐     ┌─────────┐     ┌──────────┐     ┌──────────┐
│ Browser │────▶│ Next.js │────▶│ Supabase │────▶│ Response │
│         │     │         │     │   Auth   │     │   JWT    │
└─────────┘     └─────────┘     └──────────┘     └──────────┘
     │                                                 │
     │                    JWT Token                    │
     ◀─────────────────────────────────────────────────┘
     │
     │              API Request + Bearer Token
     ▼
┌─────────┐     ┌─────────┐     ┌──────────┐
│ Browser │────▶│ NestJS  │────▶│ Supabase │
│         │     │  Guard  │     │ Verify   │
└─────────┘     └─────────┘     └──────────┘
```

#### 2.3.2 Payment Flow

```
1. Customer → Invoice Selection → /payments/create
2. Backend → Validate Invoice → Create Payment Intent
3. Backend → Gateway Session → Return Redirect URL
4. Customer → Hosted Payment Page → Complete Payment
5. Gateway → Webhook POST → /payments/webhook
6. Backend → Verify HMAC → Update Invoice Status
7. Backend → Trigger RADIUS CoA → Unblock Service
8. Backend → Send Notification → SMS/Email
```

---

## 3. Customer Portal Features

### 3.1 Dashboard

| Feature | Description | Endpoint |
|---------|-------------|----------|
| Account Overview | Current package, status, balance | `GET /customer/profile` |
| Usage Sparkline | Visual data consumption graph | `GET /customer/usage/daily` |
| Recent Invoices | Last 5 invoices with status | `GET /customer/invoices?limit=5` |
| Quick Pay | One-click payment for overdue balance | `POST /payments/create` |
| Network Status | Real-time ONU online/offline indicator | `GET /network/olt/status/{id}` |

### 3.2 Usage Analytics

| Feature | Description | Data Points |
|---------|-------------|-------------|
| Daily Usage | Hourly breakdown of consumption | Download MB, Upload MB, Sessions |
| Monthly Trends | 6-month historical view | Total GB, Peak hours, Average |
| Usage Alerts | Threshold notifications | 80%, 90%, 100% of quota |
| Export | CSV download of usage data | Date range selection |

### 3.3 Billing & Invoices

| Feature | Description |
|---------|-------------|
| Invoice List | All invoices with filtering (paid, pending, overdue) |
| Invoice Detail | Line items, taxes, due date, payment history |
| PDF Download | Generate printable invoice |
| Payment History | Complete transaction log |
| Auto-Pay Setup | Recurring payment configuration |

### 3.4 Payments

| Feature | Supported Gateways |
|---------|-------------------|
| Online Payment | PayFast, JazzCash, Easypaisa |
| Payment Methods | Credit/Debit Cards, Mobile Wallets, Bank Transfer |
| Receipt Generation | Automatic email with payment confirmation |
| Retry Logic | Failed payment retry with exponential backoff |

### 3.5 Support

| Feature | Description |
|---------|-------------|
| Ticket Creation | Category-based ticket submission |
| Ticket Tracking | Real-time status updates |
| Attachment Upload | Screenshots, documents support |
| Chat History | Full conversation thread |
| SLA Display | Expected response time |

---

## 4. Admin Portal Features

### 4.1 Role-Based Access Control

| Role | Permissions |
|------|-------------|
| **Superadmin** | Full system access, user management, settings |
| **Admin** | All operational features, no system settings |
| **NOC** | Network operations, OLT management, diagnostics |
| **Finance** | Billing, payments, reports, reconciliation |
| **Support** | Ticket management, customer lookup, basic actions |

### 4.2 Admin Dashboard

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ADMIN DASHBOARD                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ Today's     │  │ Active      │  │ Network     │  │ Open        │    │
│  │ Revenue     │  │ Subscribers │  │ Health      │  │ Tickets     │    │
│  │ R 45,230    │  │ 1,245       │  │ 8/8 OLTs    │  │ 12          │    │
│  │ ↑ 12%       │  │ +23 new     │  │ 3 ONUs off  │  │ Avg: 2.4h   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                                          │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐      │
│  │ Monthly Revenue: R 523,450  │  │ Subscriber Status           │      │
│  │ Outstanding: R 89,200       │  │ Active: 1,180 | Suspended: 65│     │
│  │ Collection Rate: 85%        │  │ Total: 1,245                │      │
│  └─────────────────────────────┘  └─────────────────────────────┘      │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │ Recent Payments              │ Recent Tickets               │       │
│  │ • John Doe - R 599 ✓        │ • #1234 - No Internet - Open │       │
│  │ • Jane Smith - R 899 ✓      │ • #1235 - Slow Speed - Prog  │       │
│  └─────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Subscriber Management

| Feature | Description | Actions |
|---------|-------------|---------|
| Subscriber List | Paginated with search & filters | View, Edit, Export |
| Subscriber Details | Full profile, history, ONU info | All CRUD operations |
| Status Management | Active, Suspended, Blocked | Toggle with audit log |
| Package Change | Upgrade/downgrade subscription | Immediate or scheduled |
| ONU Management | Reset, Reboot, Diagnostics | Real-time actions |
| Batch Operations | Bulk suspend, notify, export | CSV upload support |

### 4.4 NOC Operations

| Feature | Description |
|---------|-------------|
| OLT Dashboard | All OLTs with health status, port utilization |
| ONU Monitoring | Per-ONU metrics: Rx power, Tx power, online status |
| Alarm Management | Active alarms, historical log, acknowledgment |
| Provisioning | Add/remove/modify ONU configuration |
| Traffic Analysis | Real-time bandwidth graphs per PON port |
| Diagnostics | Ping, traceroute, optical power check |

### 4.5 Finance Operations

| Feature | Description |
|---------|-------------|
| Invoice Generation | Manual and automated batch invoice creation |
| Payment Processing | Manual payment entry, adjustments, refunds |
| Collection Dashboard | Daily/weekly/monthly collection summary |
| Aging Report | Outstanding by 30/60/90/120+ days |
| Reconciliation | Cross-check with gateway settlements |
| Revenue Analytics | By package, region, payment method |

### 4.6 Support Ticket System

| Feature | Description |
|---------|-------------|
| Ticket Queue | Sorted by priority and SLA breach time |
| Assignment | Manual or auto-assignment rules |
| Escalation | Time-based escalation matrix |
| Templates | Canned responses for common issues |
| Internal Notes | Private comments between agents |
| Resolution Tracking | Time to first response, resolution time |

### 4.7 Settings (Superadmin)

| Section | Configuration Options |
|---------|----------------------|
| Company Info | Name, address, contact, tax ID |
| Billing | Invoice prefix, due days, grace period, late fees |
| Notification Templates | SMS/Email templates for all events |
| Security | Session timeout, MFA, password policy |
| Integrations | Payment gateways, SMS provider, Email SMTP |
| System | Database backup, cache, logs |

---

## 5. Reports & Analytics

### 5.1 Available Reports

| Report | Description | Frequency | Export Formats |
|--------|-------------|-----------|----------------|
| **Revenue Report** | Collections by day/week/month, by gateway | Daily | PDF, Excel, CSV |
| **Subscriber Report** | New, churned, growth rate, demographics | Monthly | PDF, Excel |
| **Usage Report** | Bandwidth consumption, peak hours | Weekly | PDF, Excel |
| **Aging Report** | Outstanding by age bucket (30/60/90/120+) | Daily | PDF, Excel |
| **Collection Report** | Payment efficiency by region/collector | Daily | PDF, Excel |
| **NOC Report** | OLT uptime, ONU issues, alarms | Weekly | PDF |
| **SLA Report** | Ticket response/resolution times | Weekly | PDF, Excel |

### 5.2 Report Parameters

```json
{
  "dateRange": {
    "from": "2025-11-01",
    "to": "2025-11-30"
  },
  "filters": {
    "region": ["islamabad", "rawalpindi"],
    "package": ["GOLD_50M", "SILVER_30M"],
    "status": ["active", "suspended"]
  },
  "groupBy": "week",
  "format": "pdf"
}
```

### 5.3 Scheduled Reports

| Schedule | Reports | Recipients |
|----------|---------|------------|
| Daily 6 AM | Collection Summary, Aging | Finance Team |
| Weekly Monday | NOC Summary, SLA Report | NOC Manager, CTO |
| Monthly 1st | Revenue, Subscriber Growth | Management |

### 5.4 Dashboard Analytics

| Metric | Calculation | Visualization |
|--------|-------------|---------------|
| MRR | Sum of active subscriptions × monthly fee | Line chart (trend) |
| ARPU | Total revenue / Active subscribers | Number + trend |
| Churn Rate | Lost subscribers / Total × 100 | Gauge |
| Collection Rate | Collected / Invoiced × 100 | Progress bar |
| Network Uptime | Online time / Total time × 100 | Percentage |

---

## 6. API Reference

### 6.1 Authentication

All API requests require JWT authentication via Supabase:

```http
Authorization: Bearer <supabase_jwt_token>
```

### 6.2 Customer Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/customer/profile` | Get subscriber profile, package, status |
| `GET` | `/customer/usage/daily` | Daily usage data with date range |
| `GET` | `/customer/usage/monthly` | Monthly aggregated usage |
| `GET` | `/customer/invoices` | List invoices with status filter |
| `GET` | `/customer/invoices/{id}` | Invoice detail with line items |
| `GET` | `/customer/payments` | Payment history |

### 6.3 Payment Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/payments/create` | Create payment intent |
| `POST` | `/payments/verify` | Verify payment status |
| `POST` | `/payments/webhook` | Gateway webhook handler |
| `GET` | `/payments/history` | Payment transaction log |

**Payment Intent Request:**
```json
{
  "invoice_id": "uuid",
  "gateway": "payfast",
  "callback_url": "https://portal.netaxis.pk/payments/success"
}
```

**Payment Intent Response:**
```json
{
  "session_id": "pf_session_123",
  "redirect_url": "https://payfast.io/checkout/pf_session_123",
  "expires_at": "2025-11-29T12:00:00Z"
}
```

### 6.4 Network Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/network/olt/status/{subscriber_id}` | ONU online status |
| `GET` | `/network/olt/power/{subscriber_id}` | Optical power levels |
| `GET` | `/network/olt/traffic/{subscriber_id}` | Real-time traffic stats |
| `POST` | `/network/olt/reboot/{subscriber_id}` | Reboot ONU device |
| `POST` | `/network/olt/set-speed-profile` | Apply bandwidth profile |

**ONU Status Response:**
```json
{
  "online": true,
  "rx_power": -25.3,
  "tx_power": 1.3,
  "down_rate": "30Mbps",
  "up_rate": "10Mbps",
  "last_online": "2025-11-28T12:43:00Z",
  "vendor": "huawei",
  "metadata": {
    "frame": 0,
    "slot": 1,
    "pon_port": 3,
    "onu_id": 12
  }
}
```

### 6.5 Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/subscribers` | List with search, filter, pagination |
| `POST` | `/admin/subscribers` | Create new subscriber |
| `PATCH` | `/admin/subscribers/{id}` | Update subscriber |
| `POST` | `/admin/subscribers/{id}/suspend` | Suspend service |
| `POST` | `/admin/subscribers/{id}/reactivate` | Reactivate service |
| `POST` | `/admin/invoices/generate` | Batch invoice generation |
| `GET` | `/admin/dashboard/revenue` | Revenue dashboard data |
| `GET` | `/admin/dashboard/noc` | NOC dashboard data |
| `GET` | `/admin/dashboard/finance` | Finance dashboard data |

### 6.6 RADIUS Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/radius/update-group` | Update subscriber RADIUS group |
| `POST` | `/radius/coa` | Send Change of Authorization |

**RADIUS Group Update:**
```json
{
  "subscriber_id": "uuid",
  "group": "GOLD_50M"
}
```

### 6.7 Response Envelope

All responses follow standard envelope:

```json
{
  "data": { },
  "meta": {
    "request_id": "uuid",
    "timestamp": "2025-11-28T10:14:24Z"
  }
}
```

**Error Response (RFC 7807):**
```json
{
  "type": "https://api.netaxis.pk/errors/validation",
  "title": "Validation Error",
  "status": 400,
  "detail": "Invoice ID is required",
  "trace_id": "abc-123-def"
}
```

---

## 7. Database Schema

### 7.1 Schema Overview

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│    auth.users   │      │ public.customers│      │public.subscriptions│
│  (Supabase)     │◀────▶│                 │◀────▶│                 │
│  - id           │      │ - id            │      │ - id            │
│  - email        │      │ - user_id (FK)  │      │ - customer_id   │
│  - user_metadata│      │ - tenant_id     │      │ - service_id    │
└─────────────────┘      │ - account_no    │      │ - status        │
                         │ - status        │      │ - start_date    │
                         └─────────────────┘      └────────┬────────┘
                                                           │
                                                           ▼
                         ┌─────────────────┐      ┌─────────────────┐
                         │ billing.payments│◀────▶│billing.invoices │
                         │                 │      │                 │
                         │ - id            │      │ - id            │
                         │ - invoice_id    │      │ - subscription_id│
                         │ - gateway       │      │ - amount        │
                         │ - status        │      │ - status        │
                         └─────────────────┘      └─────────────────┘
```

### 7.2 Core Tables

#### public.customers
```sql
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  tenant_id UUID NOT NULL,
  account_no TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT,
  address TEXT,
  status TEXT CHECK (status IN ('active','suspended','blocked')),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### public.services
```sql
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  down_mbps INT NOT NULL,
  up_mbps INT NOT NULL,
  monthly_fee NUMERIC(12,2) NOT NULL,
  is_active BOOLEAN DEFAULT true
);
```

#### billing.invoices
```sql
CREATE TABLE billing.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id),
  invoice_no TEXT UNIQUE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  tax NUMERIC(12,2) DEFAULT 0,
  status TEXT CHECK (status IN ('draft','pending','paid','overdue','cancelled')),
  due_date DATE NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT now()
);
```

#### billing.payments
```sql
CREATE TABLE billing.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES billing.invoices(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  gateway TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT CHECK (status IN ('initiated','pending','success','failed','refunded')),
  reference TEXT,
  initiated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(invoice_id, gateway, reference)
);
```

#### network.usage_logs
```sql
CREATE TABLE network.usage_logs (
  id BIGSERIAL PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  download_mb BIGINT DEFAULT 0,
  upload_mb BIGINT DEFAULT 0,
  session_id TEXT
);
```

### 7.3 Row-Level Security

```sql
-- Customers can only see their own data
CREATE POLICY "users_own_customer" ON public.customers
  FOR SELECT USING (user_id = auth.uid());

-- Service role has full access for backend operations
CREATE POLICY "service_role_customers" ON public.customers
  FOR ALL USING (auth.role() = 'service_role');
```

### 7.4 Indexes

```sql
CREATE INDEX idx_customers_user_id ON public.customers(user_id);
CREATE INDEX idx_invoices_status ON billing.invoices(status);
CREATE INDEX idx_invoices_due_date ON billing.invoices(due_date);
CREATE INDEX idx_payments_reference ON billing.payments(reference);
CREATE INDEX idx_usage_customer_date ON network.usage_logs(customer_id, recorded_at DESC);
```

---

## 8. Security Architecture

### 8.1 Authentication

| Layer | Mechanism |
|-------|-----------|
| User Authentication | Supabase Auth (Email/Password, OTP, Social) |
| Token Type | JWT (HS256, 1-hour expiry, auto-refresh) |
| API Authentication | Bearer token in Authorization header |
| Backend Verification | Supabase JWKS endpoint validation |

### 8.2 Authorization

| Level | Implementation |
|-------|----------------|
| API Level | NestJS Guards (SupabaseJwtGuard) |
| Database Level | PostgreSQL Row-Level Security (RLS) |
| Admin Roles | user_metadata.role check |
| Feature Flags | Role-based UI rendering |

### 8.3 Payment Security

| Control | Implementation |
|---------|----------------|
| PCI Compliance | Hosted payment pages (no PAN/CVV handling) |
| Webhook Verification | HMAC-SHA256 signature validation |
| Replay Prevention | Nonce + timestamp validation |
| Idempotency | Unique constraint on (invoice_id, gateway, reference) |

### 8.4 Network Security

| Layer | Control |
|-------|---------|
| Transport | TLS 1.3 for all external communication |
| API Gateway | Nginx rate limiting (100 req/min per IP) |
| Internal Services | Private Docker network isolation |
| OLT Access | API key + IP allowlist |
| Secrets | HashiCorp Vault in production |

### 8.5 Data Security

| Data Type | Protection |
|-----------|------------|
| Passwords | Supabase Auth (bcrypt hashing) |
| Payment References | Encrypted at rest (pgcrypto) |
| Logs | Shipped to immutable storage |
| Backups | Encrypted, offsite S3-compatible storage |

---

## 9. Network Integration

### 9.1 Supported OLT Vendors

| Vendor | Models | Protocols |
|--------|--------|-----------|
| **Huawei** | MA5608T, MA5800-X2/X7/X15 | SNMP v2c/v3, SSH, NETCONF |
| **ZTE** | C320, C600 | SNMP, SSH CLI |
| **FiberHome** | AN5516-04/06 | SNMP, Telnet |

### 9.2 OLT Commands

#### Huawei
```
display ont info 0 0 1
display ont optical-info 0 0 1 12
display traffic interface gpon 0/0/1
config terminal -> interface gpon 0/0/1 -> ont reset 12
```

#### ZTE
```
show gpon onu detail gpon-olt_1/2/1:12
show gpon optical-info gpon-onu_1/2/1:12
```

### 9.3 Unified Response Schema

```json
{
  "online": true,
  "rx_power": -25.3,
  "tx_power": 1.3,
  "down_rate": "30Mbps",
  "up_rate": "10Mbps",
  "last_online": "2025-11-28T12:43:00Z",
  "vendor": "huawei",
  "metadata": {
    "frame": 0,
    "slot": 1,
    "pon_port": 3,
    "onu_id": 12
  }
}
```

### 9.4 RADIUS Integration

| Attribute | Purpose |
|-----------|---------|
| `Mikrotik-Rate-Limit` | Bandwidth control (download/upload) |
| `Reply-Message` | Blocked message display |
| `Session-Timeout` | Maximum session duration |
| `Framed-Pool` | IP address pool assignment |

**CoA (Change of Authorization):**
```python
# Disconnect suspended user immediately
send_coa(nas_ip, subscriber_session_id, action="disconnect")

# Update speed profile without disconnect
send_coa(nas_ip, subscriber_session_id, 
         attributes={"Mikrotik-Rate-Limit": "50M/20M"})
```

---

## 10. Payment Gateway Integration

### 10.1 PayFast (South Africa)

| Parameter | Description |
|-----------|-------------|
| Merchant ID | Provided by PayFast |
| Passphrase | HMAC signing key |
| Sandbox URL | `https://sandbox.payfast.co.za` |
| Production URL | `https://www.payfast.co.za` |

**Webhook Verification:**
```typescript
const signature = crypto
  .createHmac('sha256', PAYFAST_PASSPHRASE)
  .update(payloadString)
  .digest('hex');

if (signature !== request.headers['pf-signature']) {
  throw new UnauthorizedException('Invalid signature');
}
```

### 10.2 JazzCash (Pakistan)

| Parameter | Description |
|-----------|-------------|
| Merchant ID | `pp_MerchantID` |
| Password | `pp_Password` |
| Hashkey | HMAC signing key |
| Production URL | `https://payments.jazzcash.com.pk` |

### 10.3 Easypaisa (Pakistan)

| Parameter | Description |
|-----------|-------------|
| Store ID | Merchant store identifier |
| Store Password | Authentication password |
| Hashkey | Request signing key |

### 10.4 Webhook Processing

```
Gateway POST → Verify HMAC → Validate Nonce → Map Reference → Update Invoice
                    ↓              ↓               ↓              ↓
               Log failure    Log failure    Log failure    Success path
                    ↓                                            ↓
              Return 401                                    CoA + Notify
```

### 10.5 Reconciliation

```bash
# Daily reconciliation script
python scripts/reconcile_payments.py --gateway payfast --date 2025-11-28

# Output: discrepancies report
# - Missing in system: 2 transactions
# - Amount mismatch: 1 transaction
# - Action: Manual review required
```

---

## 11. Deployment & Operations

### 11.1 Docker Compose Services

| Service | Image | Ports | Healthcheck |
|---------|-------|-------|-------------|
| frontend | netaxis_frontend | 3100:3000 | HTTP /health |
| backend | netaxis_backend | 9000:9000 | HTTP /api/health |
| network-service | netaxis_network | 9100:9100 | HTTP /health |
| radius-service | netaxis_radius | 1812-1813/udp, 9200 | HTTP /health |
| nginx | nginx:alpine | 80, 443 | - |
| prometheus | prom/prometheus | 9190:9090 | - |
| grafana | grafana/grafana | 3200:3000 | - |
| loki | grafana/loki | 3101:3100 | - |
| redis | redis:7-alpine | 6379:6379 | - |

### 11.2 Startup Command

```bash
# Development
docker-compose up --build

# Production with build args
docker-compose build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx \
  --build-arg NEXT_PUBLIC_API_BASE=https://api.netaxis.pk

docker-compose up -d
```

### 11.3 Environment Variables

```bash
# Required Environment Variables
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Frontend (build-time)
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
NEXT_PUBLIC_API_BASE=https://api.netaxis.pk

# Network Service
NETWORK_SERVICE_API_KEY=<generated-api-key>

# Payment Gateways
PAYFAST_MERCHANT_ID=<merchant-id>
PAYFAST_PASSPHRASE=<passphrase>
PAYMENT_WEBHOOK_SECRET=<webhook-secret>

# Observability
GRAFANA_ADMIN_PASSWORD=<secure-password>
```

### 11.4 SSL/TLS Configuration

```nginx
# /infra/nginx/default.conf
server {
    listen 443 ssl http2;
    server_name netaxis.pk;

    ssl_certificate /etc/nginx/certs/live/netaxis/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/live/netaxis/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

    location / {
        proxy_pass http://frontend:3000;
    }

    location /api/ {
        proxy_pass http://backend:9000/;
    }
}
```

---

## 12. Operational Requirements

### 12.1 Pre-Deployment Checklist

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Supabase project created | ☐ |
| 2 | Database schema deployed (run SQL scripts) | ☐ |
| 3 | Admin user created in Supabase Auth | ☐ |
| 4 | SSL certificates obtained (Let's Encrypt) | ☐ |
| 5 | Payment gateway credentials obtained | ☐ |
| 6 | OLT credentials configured | ☐ |
| 7 | DNS records configured | ☐ |
| 8 | Environment variables set | ☐ |
| 9 | Backup storage configured | ☐ |
| 10 | Monitoring alerts configured | ☐ |

### 12.2 Supabase Setup Steps

```bash
# 1. Create Supabase project at https://supabase.com

# 2. Run schema creation
# Navigate to SQL Editor in Supabase Dashboard
# Execute: supabase/01_schema.sql
# Execute: supabase/02_seed_data.sql (optional demo data)
# Execute: supabase/03_functions.sql
# Execute: supabase/04_admin.sql

# 3. Get API keys from Settings → API
# - anon key (for frontend)
# - service_role key (for backend - KEEP SECRET)

# 4. Create admin user
node scripts/setup-admin-user.js
```

### 12.3 Required Service Packages

#### Backend Package (NestJS)
```json
{
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "@supabase/supabase-js": "^2.0.0",
    "pino": "^8.0.0",
    "pino-http": "^8.0.0"
  }
}
```

#### Frontend Package (Next.js)
```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "@supabase/auth-helpers-nextjs": "^0.8.0",
    "@tanstack/react-query": "^5.0.0",
    "tailwindcss": "^3.4.0"
  }
}
```

### 12.4 Required APIs & Credentials

| Service | Required Credentials | Where to Obtain |
|---------|---------------------|-----------------|
| Supabase | URL, Anon Key, Service Role Key | supabase.com/dashboard |
| PayFast | Merchant ID, Passphrase | payfast.co.za |
| JazzCash | Merchant ID, Password, Hashkey | jazzcash.com.pk |
| Easypaisa | Store ID, Password, Hashkey | easypaisa.com.pk |
| SMS Gateway | API Key, Sender ID | Provider-specific |
| SMTP | Host, Port, User, Password | Email provider |

### 12.5 Hardware Requirements

#### 12.5.1 Minimum Server Specifications by Environment

| Environment | CPU | RAM | Storage | Network | OS |
|-------------|-----|-----|---------|---------|-----|
| **Development** | 2 cores (Intel i5/AMD Ryzen 5+) | 4 GB DDR4 | 20 GB SSD | 10 Mbps | Ubuntu 22.04 LTS |
| **Staging** | 4 cores (Intel Xeon E-2200/AMD EPYC) | 8 GB DDR4 ECC | 50 GB NVMe SSD | 100 Mbps | Ubuntu 22.04 LTS |
| **Production** | 8+ cores (Intel Xeon Gold/AMD EPYC 7003) | 16+ GB DDR4 ECC | 100+ GB NVMe SSD RAID-1 | 1 Gbps dedicated | Ubuntu 22.04 LTS |

#### 12.5.2 Detailed Production Server Requirements

##### Application Server (Primary)
| Component | Specification | Notes |
|-----------|---------------|-------|
| **CPU** | Intel Xeon Gold 6248R (24 cores) or AMD EPYC 7443 (24 cores) | 2.5+ GHz base clock |
| **RAM** | 32 GB DDR4-3200 ECC | Dual-channel recommended |
| **Storage** | 256 GB NVMe SSD (OS) + 500 GB NVMe SSD (Data) | RAID-1 for redundancy |
| **Network** | Dual 1 Gbps NICs | Bonded for failover |
| **Power** | Redundant PSU (750W+) | UPS with 30-min backup |

##### Database Server (if self-hosted instead of Supabase)
| Component | Specification | Notes |
|-----------|---------------|-------|
| **CPU** | Intel Xeon Gold 6248R (24 cores) or AMD EPYC 7543 (32 cores) | High single-thread performance |
| **RAM** | 64 GB DDR4-3200 ECC | More is better for caching |
| **Storage** | 1 TB NVMe SSD RAID-10 | High IOPS critical |
| **Network** | 10 Gbps NIC | Low latency to app servers |
| **Backup** | External SAN/NAS | 2 TB+ for backups |

##### Redis Cache Server
| Component | Specification | Notes |
|-----------|---------------|-------|
| **CPU** | 4 cores (Intel Xeon E-2200) | Single-threaded, low requirements |
| **RAM** | 16 GB DDR4 ECC | Sized to dataset |
| **Storage** | 100 GB NVMe SSD | For RDB/AOF persistence |
| **Network** | 1 Gbps NIC | Low latency critical |

##### Load Balancer / Reverse Proxy
| Component | Specification | Notes |
|-----------|---------------|-------|
| **CPU** | 4 cores | Nginx is lightweight |
| **RAM** | 8 GB DDR4 | Buffer for SSL termination |
| **Storage** | 50 GB SSD | Logs and certificates |
| **Network** | Dual 1 Gbps NICs | External + Internal |

#### 12.5.3 Network Infrastructure Requirements

| Component | Specification | Purpose |
|-----------|---------------|---------|
| **Firewall** | Fortinet FortiGate 60F or Palo Alto PA-440 | Perimeter security, IPS/IDS |
| **Core Switch** | Cisco Catalyst 9300 or Aruba CX 6300 | 10 Gbps backbone |
| **Access Switch** | Cisco Catalyst 9200 or Aruba CX 6100 | Server connectivity |
| **Router** | Cisco ISR 4331 or MikroTik CCR2004 | Internet connectivity, BGP |
| **UPS** | APC Smart-UPS 3000VA | 30-minute runtime minimum |
| **PDU** | Managed PDU with remote power | Per-outlet monitoring |

#### 12.5.4 Cloud Provider Alternatives

##### AWS (Recommended)
| Service | Instance Type | Qty | Purpose |
|---------|--------------|-----|---------|
| **EC2** | t3.large (2 vCPU, 8 GB) | 2 | Application servers |
| **RDS** | db.r6g.large (2 vCPU, 16 GB) | 1 | PostgreSQL (if not Supabase) |
| **ElastiCache** | cache.r6g.large (2 vCPU, 13 GB) | 1 | Redis cluster |
| **ALB** | Application Load Balancer | 1 | Traffic distribution |
| **S3** | Standard storage | - | Backups, static assets |
| **CloudFront** | CDN | - | Static asset delivery |

##### Azure
| Service | Instance Type | Qty | Purpose |
|---------|--------------|-----|---------|
| **VM** | Standard_D4s_v5 (4 vCPU, 16 GB) | 2 | Application servers |
| **Azure Database** | GP_Gen5_4 (4 vCPU, 20 GB) | 1 | PostgreSQL |
| **Azure Cache** | C3 (2.5 GB) | 1 | Redis |
| **App Gateway** | Standard_v2 | 1 | Load balancer |
| **Blob Storage** | LRS | - | Backups |

##### DigitalOcean (Budget Option)
| Service | Instance Type | Qty | Purpose |
|---------|--------------|-----|---------|
| **Droplet** | s-4vcpu-8gb | 2 | Application servers |
| **Managed DB** | db-s-4vcpu-8gb | 1 | PostgreSQL |
| **Managed Redis** | db-s-2vcpu-4gb | 1 | Cache |
| **Load Balancer** | Small | 1 | Traffic distribution |
| **Spaces** | 250 GB | - | Object storage |

#### 12.5.5 Bandwidth & Traffic Estimates

| Subscribers | Daily API Requests | Peak Concurrent | Bandwidth Required |
|-------------|-------------------|-----------------|-------------------|
| 1,000 | 50,000 | 100 | 50 Mbps |
| 5,000 | 250,000 | 500 | 200 Mbps |
| 10,000 | 500,000 | 1,000 | 500 Mbps |
| 25,000 | 1,250,000 | 2,500 | 1 Gbps |
| 50,000 | 2,500,000 | 5,000 | 2 Gbps |

#### 12.5.6 Storage Growth Projections

| Data Type | Per Subscriber/Month | 10K Subscribers/Year | Retention |
|-----------|---------------------|---------------------|-----------|
| Usage Logs | 500 KB | 60 GB | 2 years |
| Invoices | 50 KB | 6 GB | 7 years |
| Payments | 10 KB | 1.2 GB | 7 years |
| Audit Logs | 100 KB | 12 GB | 5 years |
| **Total Growth** | ~660 KB | ~80 GB/year | - |

### 12.6 Scaling Recommendations

#### 12.6.1 Horizontal Scaling Matrix

| Subscribers | Backend Instances | Database | Redis | CDN | Estimated Monthly Cost |
|-------------|------------------|----------|-------|-----|----------------------|
| < 1,000 | 1 | Supabase Free | Single | Optional | $0-50 |
| 1,000 - 5,000 | 2 | Supabase Pro | Single | Recommended | $100-300 |
| 5,000 - 10,000 | 2-4 | Supabase Pro | Single | Required | $300-600 |
| 10,000 - 25,000 | 4-6 | Supabase Team | Cluster (3 nodes) | Required | $600-1,500 |
| 25,000 - 50,000 | 6-8 | Supabase Team | Cluster (5 nodes) | Required | $1,500-3,000 |
| 50,000+ | 8+ | Dedicated Postgres | Cluster (5+ nodes) | Required | $3,000+ |

#### 12.6.2 Auto-Scaling Policies

```yaml
# Kubernetes HPA Configuration
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: netaxis-backend
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: netaxis-backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

#### 12.6.3 Database Scaling Strategy

| Phase | Trigger | Action |
|-------|---------|--------|
| **Phase 1** | < 100 req/s | Single Supabase instance |
| **Phase 2** | 100-500 req/s | Add read replicas |
| **Phase 3** | 500-1000 req/s | Connection pooling (PgBouncer) |
| **Phase 4** | 1000+ req/s | Dedicated Postgres cluster |
| **Phase 5** | 5000+ req/s | Horizontal sharding by tenant |

#### 12.6.4 CDN & Edge Caching

| Provider | Features | Estimated Cost |
|----------|----------|----------------|
| **Cloudflare Pro** | DDoS protection, WAF, CDN | $20/month |
| **AWS CloudFront** | Global edge, S3 integration | Pay-per-use |
| **Fastly** | Real-time purge, edge compute | $50+/month |
| **Bunny CDN** | Budget-friendly, good performance | $10+/month |

---

## 13. Monitoring & Observability

### 13.1 Metrics (Prometheus)

| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Total HTTP requests by method/path/status |
| `http_request_duration_seconds` | Histogram | Request latency distribution |
| `payment_transactions_total` | Counter | Payment attempts by gateway/status |
| `onu_status_checks_total` | Counter | ONU status queries |
| `active_subscribers_gauge` | Gauge | Current active subscriber count |

### 13.2 Dashboards (Grafana)

| Dashboard | Panels |
|-----------|--------|
| **API Overview** | Request rate, latency p50/p95/p99, error rate |
| **Business Metrics** | Revenue, collections, new subscribers |
| **Network Health** | OLT status, ONU online ratio, alarms |
| **Payment Gateway** | Transaction volume, success rate, latency |

### 13.3 Alerts (Alertmanager)

| Alert | Condition | Severity |
|-------|-----------|----------|
| HighErrorRate | Error rate > 5% for 5m | Critical |
| SlowAPI | p95 latency > 500ms for 5m | Warning |
| PaymentFailures | Success rate < 95% for 10m | Critical |
| OLTDown | OLT offline for 2m | Critical |
| DiskSpaceLow | Disk usage > 85% | Warning |

### 13.4 Logging (Loki)

```json
{
  "level": "info",
  "timestamp": "2025-11-28T10:14:24.123Z",
  "context": "PaymentService",
  "message": "Payment completed",
  "request_id": "abc-123",
  "invoice_id": "inv-456",
  "gateway": "payfast",
  "amount": 599.00
}
```

### 13.5 SLOs

| SLO | Target | Measurement |
|-----|--------|-------------|
| API Availability | 99.9% | Successful requests / Total requests |
| API Latency (p95) | < 300ms | 95th percentile response time |
| Payment Success Rate | > 99.5% | Successful payments / Total attempts |
| Ticket First Response | < 4 hours | Time from creation to first response |

---

## 14. Disaster Recovery

### 14.1 Backup Strategy

| Data | Frequency | Retention | Storage |
|------|-----------|-----------|---------|
| Supabase Database | Daily (automatic) | 30 days | Supabase |
| Custom DB Backup | Daily 2 AM | 90 days | S3 |
| Redis Snapshot | Hourly | 7 days | Local + S3 |
| Configuration | On change | Forever | Git |
| Logs | Real-time | 30 days | Loki |

### 14.2 Backup Script

```bash
#!/bin/bash
# scripts/db_backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="netaxis_backup_${DATE}.sql.gz"

# Supabase pg_dump
pg_dump $DATABASE_URL | gzip > /backups/${BACKUP_FILE}

# Upload to S3
aws s3 cp /backups/${BACKUP_FILE} s3://netaxis-backups/${BACKUP_FILE}

# Cleanup local (keep 7 days)
find /backups -mtime +7 -delete
```

### 14.3 Recovery Procedures

| Scenario | RTO | RPO | Procedure |
|----------|-----|-----|-----------|
| Service Crash | 5 min | 0 | Container auto-restart |
| Database Corruption | 1 hour | 24 hours | Restore from backup |
| Complete Failure | 4 hours | 24 hours | Full restore + verification |
| Data Center Loss | 8 hours | 24 hours | Deploy to alternate region |

### 14.4 Recovery Steps

```bash
# 1. Stop services
docker-compose down

# 2. Restore database
gunzip < netaxis_backup_20251128.sql.gz | psql $DATABASE_URL

# 3. Verify data integrity
psql $DATABASE_URL -c "SELECT count(*) FROM public.customers;"

# 4. Restart services
docker-compose up -d

# 5. Health check
curl http://localhost:9000/api/health
```

---

## 15. Appendices

### 15.1 Glossary

| Term | Definition |
|------|------------|
| **OLT** | Optical Line Terminal - Central device distributing fiber to customers |
| **ONU** | Optical Network Unit - Customer premises fiber termination device |
| **RADIUS** | Remote Authentication Dial-In User Service - AAA protocol |
| **CoA** | Change of Authorization - Dynamic session modification |
| **RLS** | Row-Level Security - PostgreSQL access control |
| **MRR** | Monthly Recurring Revenue - Predictable monthly income |
| **ARPU** | Average Revenue Per User - Revenue / Active users |

### 15.2 File Structure

```
netaxis/
├── backend/                 # NestJS API
│   └── src/
│       ├── admin/          # Admin endpoints
│       ├── auth/           # JWT verification
│       ├── billing/        # Invoice management
│       ├── common/         # Guards, decorators
│       ├── network/        # OLT proxy
│       ├── payment/        # Gateway integration
│       └── usage/          # Usage tracking
├── frontend/               # Next.js application
│   └── app/
│       ├── (dashboard)/    # Customer portal
│       ├── admin/          # Admin portal
│       └── login/          # Authentication
├── network-service/        # Python OLT service
├── radius-service/         # Python RADIUS service
├── infra/                  # Infrastructure configs
│   ├── nginx/
│   ├── prometheus/
│   └── loki/
├── scripts/                # Utility scripts
├── supabase/               # Database migrations
└── docs/                   # Documentation
```

### 15.3 Contact & Support

| Role | Responsibility | Escalation |
|------|---------------|------------|
| L1 Support | Basic troubleshooting, ticket creation | L2 Support |
| L2 Support | Technical issues, subscriber problems | NOC |
| NOC | Network issues, OLT/ONU problems | Engineering |
| Finance | Billing disputes, payment issues | Management |
| Engineering | Code issues, deployments | CTO |

### 15.4 Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-29 | Initial release |

---

**Document Classification:** Internal - Technical Leadership  
**Review Cycle:** Quarterly  
**Next Review:** February 2026  
**Document Owner:** Engineering Team  

---

*© 2025 NetAxis Internet Services. All rights reserved.*
