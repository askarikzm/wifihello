# API Contracts

## Authentication

Authentication is delegated entirely to Supabase Auth (email/password, OTP, social). The frontend obtains a Supabase JWT and includes it on every backend request via `Authorization: Bearer <token>`. NestJS verifies the token with Supabase JWKS and Postgres RLS enforces final access, so the core API no longer exposes login/refresh endpoints.

## Customer Dashboard

- `GET /customer/profile` → subscriber demographics, package, expiry
- `GET /customer/usage/daily?from=2025-11-01&to=2025-11-28`
- `GET /customer/usage/monthly?months=6`
- `GET /customer/invoices?status=overdue`
- `GET /customer/invoices/{id}`
- `GET /customer/payments?limit=50`

## Payments

### POST /payments/create
```json
{ "invoice_id": "uuid", "gateway": "payfast", "callback_url": "https://portal/thanks" }
```
Response: session id + redirect url.

### POST /payments/verify
```json
{ "invoice_id": "uuid", "provider_reference": "pf_123" }
```

### POST /payments/webhook
HMAC header `X-WANCOM-SIGNATURE`. Generic payload:
```json
{ "gateway": "payfast", "event": "payment.completed", "data": { ... } }
```

### GET /payments/history
Supports pagination + filters by status, gateway.

## Network / OLT

- `GET /network/olt/status/{subscriber_id}`
- `GET /network/olt/power/{subscriber_id}`
- `GET /network/olt/traffic/{subscriber_id}`
- `POST /network/olt/reboot/{subscriber_id}` (body: `{ "reason": "string" }`)
- `POST /network/olt/set-speed-profile`
```json
{ "subscriber_id": "uuid", "profile": "30M/10M" }
```

## Admin

- `GET /admin/subscribers?region=lahore&status=overdue`
- `POST /admin/subscribers/create`
- `PATCH /admin/subscribers/update/{id}`
- `POST /admin/invoices/generate`
- `POST /admin/subscribers/block`
- `POST /admin/subscribers/unblock`

## RADIUS Integration

- `POST /radius/update-group`
```json
{ "subscriber_id": "uuid", "group": "SILVER_20M" }
```
- `POST /radius/coa`
```json
{ "subscriber_id": "uuid", "reason": "payment_success" }
```

## Common Response Envelope

```json
{
  "data": {},
  "meta": {
    "request_id": "uuid",
    "timestamp": "2025-11-28T10:14:24Z"
  }
}
```

Errors follow RFC7807 problem+json with `trace_id`.
