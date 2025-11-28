# Payment Flow & Reconciliation

## Sequence
1. Customer selects invoice → `/payments/create`.
2. Backend validates invoice status, amount → delegates to payment service.
3. Payment service initializes gateway-specific payload, returns redirect url.
4. Customer completes payment on hosted page.
5. Gateway hits service webhook → service verifies signature → notifies backend.
6. Backend marks invoice `paid`, extends expiry, schedules Celery job to unblock RADIUS and send notifications.
7. Audit log entry stored with correlation id.

## Duplicate & Failure Handling
- Idempotency key = `invoice_id + gateway` stored in Redis for 10 minutes.
- Webhook replay detection using signature timestamp + nonce table.
- Failed payments keep invoice unpaid but log failure reason + increments `payment_retry_count`.

## Reconciliation Script (`scripts/reconcile_payments.py`)
- Runs hourly per gateway.
- Fetches unsettled transactions from provider API.
- Cross-checks local `payments` table.
- Emits discrepancies via email + dashboard widget.

## Settlement & Ledger
- Summary table `daily_collections` computed nightly for financial reporting.
- Admin report `/reports/revenue` pulls aggregated data per region, gateway.

## Security
- All outgoing requests signed with hashed payload + TLS 1.2+.
- Webhook endpoints enforce static IP allow-list + HMAC.
- Sensitive references stored encrypted-at-rest via Postgres `pgcrypto` extension.
