# Testing Strategy

## Test Pyramid
- **Unit**: pytest for backend modules, vitest/jest for frontend components.
- **Service**: FastAPI TestClient + mocked network/payment adapters.
- **Integration**: Docker Compose profile `tests` spins up Postgres/Redis + services.
- **Load**: Locust scripts hitting `/auth/login`, `/customer/usage/*`, `/payments/create`.
- **Security**: OWASP ZAP for API fuzzing, custom rate-limit tests.

## Backend Tooling
- `pytest`, `pytest-asyncio`, `coverage`, `schemathesis` for OpenAPI validation.
- SNMP/SSH mocks via `pytest-mock` + `asyncssh` fake server.

## Frontend Tooling
- `@testing-library/react` for components.
- `playwright` for E2E flows (login, pay invoice, open ticket).
- `msw` (Mock Service Worker) to stub API responses.

## Automation Hooks
- CI pipeline enforces `coverage >= 85%` for backend, `>= 80%` for frontend.
- Load tests scheduled weekly via GitHub Actions workflow dispatch.

## Test Data Management
- `scripts/seed_data.py` inserts demo subscribers, invoices, RADIUS entries.
- Sensitive fields (CNIC, contact) anonymized for staging/test exports.
