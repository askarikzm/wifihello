# WANCOM ISP Customer Portal
## Pakistan Telecommunication Authority (PTA) Compliance Overview

### 1. Executive Summary
WANCOM proposes to deliver a unified ISP operations platform covering subscriber self-care, billing, AAA, network access, and compliance tooling. The system is designed to meet the Pakistan Telecommunication (Re-organisation) Act, 1996 (PTRA 1996) and associated Rules/Regulations administered by the Pakistan Telecommunication Authority (PTA). The implementation aligns with the Cybersecurity Technical and Data Security Requirements (CTDISR) through layered security controls, auditable processes, and regulatory reporting.

### 2. Regulatory Alignment Snapshot
| Regulation / Requirement | Relevant Clauses | Wancom Control Coverage |
| --- | --- | --- |
| PTRA 1996 (Sections 4, 5, 20, 31) | Licensing obligations, quality of service, consumer protection, confidentiality | Centralized subscriber management, SLA dashboards, consent-driven data processing, encryption audited via CTDISR controls |
| PTA Rules & Regulations (Consumer Protection, QoS, CPP, Licensing) | Complaint resolution, billing transparency, call/data retention | Built-in ticketing, invoice lifecycle with tamper-proof audit logs, retention policies configurable by license tier |
| CTDISR (Govt. of Pakistan) | Access control, data-at-rest/in-transit, monitoring, incident response | Supabase-based auth with MFA support, TLS 1.3, encryption at rest, Prometheus/Grafana/Loki stack for observability, incident playbooks |

### 3. Key Benefits for PTA Certification
1. **End-to-end Governance:** Modular architecture covers customer onboarding, RADIUS AAA, network NOC, payments, and compliance logs under a single audit surface.
2. **Data Sovereignty:** All customer and billing records persist in Supabase (PostgreSQL) hosted within PTA-approved regions. Optional on-premise deployment supports local data residency mandates.
3. **Security Posture by Design:** Zero-trust auth via Supabase JWT + role-based guards, encrypted APIs, RBAC for admin functions, and intrusion monitoring mapped to CTDISR.
4. **Regulatory Reporting:** Built-in KPI dashboards (revenue, usage, QoS metrics) with export features allowing PTA audit submissions and CPP consumer notifications.
5. **Incident & Complaint Workflow:** Integrated support/ticketing module ensures PTA-mandated resolution timelines with SLA timers, escalation matrix, and digital acknowledgement.

### 4. Security & Compliance Controls (CTDISR Mapping)
| CTDISR Control Domain | Implementation Evidence |
| --- | --- |
| Identity & Access Management | Supabase Auth, JWT guards, admin role verification (AdminRoleGuard), separation of customer vs admin portals, forced HTTPS via Nginx. |
| Data Protection | PostgreSQL encrypted at rest, TLS 1.3 for APIs, object storage policies, masking of PII in logs, configurable data retention scripts. |
| Network Security | Containers bound to localhost; only Nginx (80/443) exposed. RADIUS traffic limited, network-service interacts with ONUs via API keys, Prometheus alerts on anomalies. |
| Monitoring & Incident Response | Pino structured logs, Loki log aggregation, Prometheus metrics/alerting, Grafana dashboards for SLA, scheduled backup scripts, webhook-based incident notifications. |
| Physical & Environmental | Cloud/on-prem options adhere to PTA hosting guidelines; documentation available for data center certifications (ISO 27001, etc.). |

### 5. PTA Regulatory Requirements Coverage
1. **License Compliance (Section 20 PTRA):** Provides subscriber registration, KYC (Verisys optional module), and real-time service suspension/resumption to honour licensing terms.
2. **Consumer Protection Regulations:** Transparent billing (invoice portal), dispute workflow via support tickets, SMS/email notification templates for service changes.
3. **Quality of Service (QoS) Regulations:** Usage analytics, throttling controls, outage reporting, SLA metrics exported to PTA format.
4. **Confidentiality & Lawful Interception:** Audit-ready logs with role-based access; APIs prepared for lawful intercept integration without violating privacy policies.
5. **Data Retention Obligations:** Configurable retention scripts (scripts/db_backup.sh) ensure backups and archival consistent with PTA-prescribed timelines.

### 6. Risk Management
| Risk | Mitigation |
| --- | --- |
| Unauthorized access | MFA support, RBAC, per-module guards, centralized logging for anomaly detection. |
| Data breach | Encryption, secret rotation, network isolation, vulnerability scans tied to CI/CD. |
| SLA non-compliance | Automated monitoring, alert thresholds, escalation runbooks, nightly backups to prevent data loss. |
| Regulatory updates | Modular policy configuration; compliance dashboard to track upcoming PTA circulars. |

### 7. Documentation & Evidence Set
- Architecture diagrams (docs/architecture.md)
- Database schema and retention policies (docs/database-schema.md)
- Payment flow with audit requirements (docs/payment-flow.md)
- Testing strategy and penetration testing report placeholders (docs/testing-strategy.md)
- Backup & DR scripts (`scripts/db_backup.sh`)
- KYC/Verisys optional module design (docs/olt-integration.md and KYC SQL migrations)

### 8. Conclusion
WANCOM’s platform demonstrates clear conformity with PTA requirements under PTRA 1996 and adheres to CTDISR security expectations. The solution’s layered security, governance tooling, and reporting capabilities provide a transparent compliance baseline for licensing, consumer protection, QoS management, and cybersecurity oversight.

For certification submissions, WANCOM can furnish:
- Detailed SOPs for onboarding, ticketing, and incident management
- Vulnerability assessment reports and hardening guides
- SLA performance exports and consumer communication templates

**Prepared for:** Pakistan Telecommunication Authority (PTA)

**Prepared by:** WANCOM Compliance & Security Team
