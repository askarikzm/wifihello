# PTA Audit Log Exporter - Technical Documentation

## Overview

The PTA Audit Log Exporter is a NestJS microservice module for generating PTA-compliant audit log exports for NetAxis ISP. It supports automated and on-demand generation of regulatory reports required for Pakistan telecommunications compliance.

## Regulatory Framework

This module implements requirements from:
- Pakistan Telecommunication (Re-organization) Act, 1996
- CTDISR 2020 (Critical Telecom Data & Infrastructure Security Rules)
- PTA Data Retention and Security Guidelines

## Features

### Export Types Supported

| Export Type | Description | Max Range |
|-------------|-------------|-----------|
| `IPDR_DAILY` | Daily IP Detail Records for NAT/CGN logging | 1 day |
| `IPDR_RANGE` | Custom date range IPDR export | 31 days |
| `RADIUS_AUTH_LOGS` | Authentication events (success/failure) | 90 days |
| `SUBSCRIBER_ACTIVATION_DEACTIVATION` | Subscriber lifecycle events | 365 days |
| `KYC_VERISYS_LOGS` | KYC verification audit trail | 365 days |
| `COMPLAINTS_SUMMARY` | Customer complaint records | 365 days |
| `OLT_ALARMS` | Network device alarms | 31 days |
| `LI_ACCESS_LOGS` | Lawful Interception access audit | 365 days |

### Output Formats

- **CSV**: Comma-separated values with PTA-compliant headers
- **XLSX**: Excel workbook with metadata sheet
- **PDF**: Formatted report (limited to 500 rows, full data in CSV/XLSX)
- **ALL**: Bundle containing all three formats

### File Naming Convention

```
NetAxis_<REGION_CODE>_AUDIT_<TYPE>_<YYYYMMDD>_<HHMMSS>.zip
```

Example: `NetAxis_PK-ISB_AUDIT_IPDR_DAILY_20241202_023015.zip`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AuditExportModule                         │
├─────────────────────────────────────────────────────────────┤
│  Controllers                                                 │
│  ├── AuditExportAdminController    (POST/GET /admin/...)    │
│  ├── AuditExportController         (GET /audit-export/...)  │
│  └── AuditExportInternalController (POST /internal/...)     │
├─────────────────────────────────────────────────────────────┤
│  Services                                                    │
│  ├── AuditExportService        → Main orchestrator          │
│  ├── AuditExportTemplateService → Template management       │
│  ├── AuditExportGeneratorService → CSV/XLSX/PDF generation  │
│  ├── AuditExportStorageService   → File storage             │
│  ├── AuditExportAccessLogService → Audit trail              │
│  └── AuditExportSchedulerService → Cron scheduling          │
├─────────────────────────────────────────────────────────────┤
│  Guards                                                      │
│  ├── PtaComplianceGuard    → Requires PTA role              │
│  └── AuditExportRoleGuard  → Permission-based access        │
├─────────────────────────────────────────────────────────────┤
│  Repository                                                  │
│  └── AuditExportRepository → Supabase data access           │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Admin Endpoints (Requires PTA_COMPLIANCE_OFFICER or SUPER_ADMIN)

#### Create Export Run
```http
POST /admin/audit-export/runs
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "exportType": "IPDR_DAILY",
  "format": "csv",
  "startDate": "2024-12-01T00:00:00.000Z",
  "endDate": "2024-12-02T00:00:00.000Z"
}
```

#### List Export Runs
```http
GET /admin/audit-export/runs?exportType=IPDR_DAILY&status=COMPLETED&limit=20
Authorization: Bearer <jwt>
```

#### Get Export Run Details
```http
GET /admin/audit-export/runs/{id}
Authorization: Bearer <jwt>
```

#### Get Download URL
```http
GET /admin/audit-export/files/{fileId}/download-url?expiresIn=3600
Authorization: Bearer <jwt>
```

#### List Templates
```http
GET /admin/audit-export/templates
Authorization: Bearer <jwt>
```

#### Create Schedule
```http
POST /admin/audit-export/schedules
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "exportType": "IPDR_DAILY",
  "frequency": "DAILY",
  "formats": ["csv", "xlsx"],
  "notifyEmails": ["compliance@netaxis.pk"]
}
```

### View Endpoints (Requires VIEW_ONLY_AUDIT or higher)

#### Download File
```http
GET /audit-export/files/{fileId}/download
Authorization: Bearer <jwt>
```

#### Verify File Integrity
```http
GET /audit-export/files/{fileId}/verify
Authorization: Bearer <jwt>
```

### Internal Endpoints (Requires API Key)

```http
POST /internal/audit-export/schedules/reload
x-internal-api-key: <key>

POST /internal/audit-export/schedules/{id}/execute
x-internal-api-key: <key>

GET /internal/audit-export/health
```

## RBAC (Role-Based Access Control)

| Role | Permissions |
|------|-------------|
| `SUPER_ADMIN` | All operations including delete |
| `PTA_COMPLIANCE_OFFICER` | Create, view, download, manage templates & schedules |
| `NOC_MANAGER` | View and download only |
| `VIEW_ONLY_AUDIT` | View only (no downloads) |

## Database Schema

### Tables (in `pta_audit` schema)

- `audit_export_template` - Export template definitions
- `audit_export_run` - Export execution records
- `audit_export_file` - Generated file metadata
- `audit_export_access_log` - Immutable access audit trail
- `audit_export_schedule` - Scheduled export configurations

### Key Features

1. **Row Level Security (RLS)**: Tenant isolation enforced at database level
2. **Immutable Audit Log**: Hash chain for tamper detection
3. **Soft Deletes**: Data preserved for compliance

## File Integrity

### ZIP Bundle Contents

```
NetAxis_PK-ISB_AUDIT_IPDR_DAILY_20241202_023015.zip
├── NetAxis_PK-ISB_AUDIT_IPDR_DAILY_20241202_023015.csv
├── MANIFEST.json
└── README.txt
```

### Manifest Structure

```json
{
  "version": "1.0",
  "generatedAt": "2024-12-02T02:30:15.000Z",
  "generator": "NetAxis ISP PTA Audit Exporter v1.0",
  "exportRunId": "uuid",
  "exportType": "IPDR_DAILY",
  "dateRange": {
    "start": "2024-12-01T00:00:00.000Z",
    "end": "2024-12-02T00:00:00.000Z"
  },
  "regionCode": "PK-ISB",
  "files": [
    {
      "filename": "NetAxis_PK-ISB_AUDIT_IPDR_DAILY_20241202_023015.csv",
      "size": 1234567,
      "sha256": "abc123...",
      "rowCount": 10000,
      "mimeType": "text/csv"
    }
  ],
  "totalRecords": 10000,
  "integrityHash": "def456..."
}
```

## Configuration

### Environment Variables

```env
# Storage
AUDIT_EXPORT_ENCRYPTION_ENABLED=false

# Internal API
INTERNAL_API_KEY=your-secure-api-key

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-key
```

## Scheduling

### Default Schedule Times

| Frequency | Cron Expression | Description |
|-----------|-----------------|-------------|
| DAILY | `0 2 * * *` | 2 AM daily |
| WEEKLY | `0 2 * * 1` | 2 AM every Monday |
| MONTHLY | `0 2 1 * *` | 2 AM on 1st of month |

## Usage Examples

### TypeScript Client

```typescript
import { AuditExportService } from './audit-export';

// Create export
const result = await auditExportService.createExportRun(
  {
    exportType: AuditExportType.IPDR_DAILY,
    format: ExportFormat.CSV,
    startDate: '2024-12-01T00:00:00.000Z',
    endDate: '2024-12-02T00:00:00.000Z',
  },
  userId,
  tenantId,
  ipAddress,
);

// Get download URL
const { url, expiresAt } = await auditExportService.getDownloadUrl(
  fileId,
  userId,
);
```

### cURL Examples

```bash
# Create export
curl -X POST https://api.netaxis.pk/admin/audit-export/runs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "exportType": "IPDR_DAILY",
    "format": "csv",
    "startDate": "2024-12-01T00:00:00.000Z",
    "endDate": "2024-12-02T00:00:00.000Z"
  }'

# Download file
curl -X GET "https://api.netaxis.pk/audit-export/files/$FILE_ID/download" \
  -H "Authorization: Bearer $TOKEN" \
  -o export.zip
```

## Security Considerations

1. **Access Control**: All endpoints require authentication and appropriate roles
2. **Audit Trail**: Every access is logged with IP address, user agent, and hash chain
3. **File Integrity**: SHA-256 hashes for all generated files
4. **Encryption**: Optional AES-256-CBC encryption for stored files
5. **Signed URLs**: Time-limited download URLs (default 1 hour)
6. **RLS**: Database-level tenant isolation

## Troubleshooting

### Common Issues

1. **Export fails with "No data found"**
   - Verify date range is valid
   - Check if data exists in source tables
   - Verify tenant_id filter

2. **Permission denied**
   - Check user has appropriate role in `admin_roles` table
   - Verify JWT token is valid

3. **Schedule not executing**
   - Check schedule is active (`is_active = true`)
   - Verify consecutive_failures < 5
   - Check scheduler service logs

### Logs

```bash
# View scheduler logs
docker logs netaxis-backend 2>&1 | grep AuditExportScheduler

# View generator logs
docker logs netaxis-backend 2>&1 | grep AuditExportGenerator
```

## Migration Guide

### Applying Migrations

```bash
# Apply schema migration
psql $DATABASE_URL -f supabase/migrations/20241202001_pta_audit_export.sql

# Apply seed data
psql $DATABASE_URL -f supabase/migrations/20241202002_pta_audit_export_seed.sql
```

## Dependencies

```json
{
  "@nestjs/schedule": "^4.0.0",
  "exceljs": "^4.4.0",
  "pdfkit": "^0.15.0",
  "archiver": "^7.0.0"
}
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-12-02 | Initial release |

## Support

For technical support, contact:
- Email: tech@netaxis.pk
- Internal: #compliance-tech Slack channel
