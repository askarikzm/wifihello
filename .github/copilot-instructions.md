# WANCOM ISP Customer Portal - Copilot Instructions

## Project Overview
Multi-service monorepo for ISP operations including customer portal, billing, payments, RADIUS AAA, and OLT/ONU management.

## Tech Stack
- **Backend**: NestJS 10+ with TypeScript, Supabase Auth + PostgreSQL
- **Frontend**: Next.js 15 App Router, TailwindCSS, ShadCN components
- **Network Service**: Python FastAPI for OLT/ONU management
- **RADIUS Service**: Python with pyrad for AAA
- **Database**: Supabase (PostgreSQL with RLS)
- **Monitoring**: Prometheus, Grafana, Loki

## Code Standards

### TypeScript/NestJS
- Use strict TypeScript with proper typing
- Follow NestJS module structure (controller, service, module, dto)
- Use ConfigService for environment variables
- Apply guards for authentication (@UseGuards(SupabaseJwtGuard))
- Use Pino logger for structured logging

### Next.js
- Use App Router conventions
- Server components by default, 'use client' only when needed
- Use createSupabaseServerClient for server-side auth
- Use createSupabaseBrowserClient for client components

### Python
- Follow PEP 8 style guide
- Use type hints
- Use structlog for logging
- Use async/await for I/O operations

## Key Directories
```
backend/src/
  ├── billing/      # Invoice generation, packages
  ├── payment/      # Gateway integrations (PayFast, JazzCash, Easypaisa)
  ├── notification/ # SMS/Email notifications
  ├── support/      # Ticket system
  ├── admin/        # Admin dashboard endpoints
  └── network/      # OLT/ONU proxy

frontend/app/
  ├── dashboard/    # Customer dashboard
  ├── payments/     # Payment flow
  ├── support/      # Support tickets
  └── admin/        # Admin portal

network-service/app/
  └── drivers/      # OLT vendor drivers

radius-service/app/
  └── handlers.py   # RADIUS packet handlers
```

## Development Commands
```bash
# Backend
cd backend && npm run start:dev

# Frontend
cd frontend && npm run dev

# Network Service
cd network-service && uvicorn app.main:app --reload

# Full stack
docker compose up --build
```

## Environment Variables
See `.env.example` for required configuration:
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- Payment gateway credentials (PAYFAST_*, JAZZCASH_*, EASYPAISA_*)
- SMS/Email configuration
- Network service API key

## Testing
- Backend: `npm run test` (Jest)
- Frontend: `npm run test` (Jest + React Testing Library)
- Python: `pytest`

## Important Patterns

### Payment Processing
- All webhooks verified via HMAC signatures
- Idempotency enforced via unique constraints
- Audit logging for all payment events

### RADIUS Authentication
- PAP/CHAP support
- Speed profiles from packages table
- Suspension check before auth

### OLT Integration
- Vendor-agnostic driver interface
- Real SSH commands for each vendor
- Caching for ONU status queries
