# DevOps & CI/CD

## Environments
1. **Dev** – Docker Compose, seeded data.
2. **Staging** – Mirrors production topology, gated by branch protection.
3. **Production** – Multi-region deployment with database replicas per region.

## Pipelines
- **Build**: Triggered on PR -> run unit tests (backend/frontend), lint, type checks, Trivy.
- **Package**: Build Docker images (`backend`, `network-service`, `payment-service`, `frontend`, `radius-service`).
- **Deploy**: On tagged release -> push images to GHCR -> SSH into target, run `docker compose pull && docker compose up -d`.

## Secrets Management
- Use GitHub Environments with required reviewers.
- Production secrets stored in HashiCorp Vault; CI fetches via OIDC.

## Observability
- Prometheus scraping every 15s; alerts routed through Alertmanager -> OpsGenie.
- Loki collects JSON logs; dashboards pre-built in Grafana folder.
- SLOs: API latency p95 < 300 ms, Payment verifier success > 99.5%.

## Backups
- `scripts/db_backup.sh` invoked via cron daily -> uploads to offsite S3-compatible storage.
- Redis snapshot every hour.
- Config backups (Nginx, Radius) weekly.

## Security & Compliance
- Automated dependency scanning (Dependabot + Trivy).
- Container images built as non-root.
- Mandatory 2FA on GitHub + production servers.
- Audit logs shipped to immutable storage (Loki + daily export).
