# NADRA Verisys KYC Integration

## Overview

This document describes the NADRA Verisys CNIC verification integration for the WANCOM ISP Customer Portal. The implementation provides identity verification capabilities as required by Pakistani regulatory frameworks (PTRA 1996, PTA KYC Rules, CTDISR).

## Table of Contents

1. [Architecture](#architecture)
2. [Database Schema](#database-schema)
3. [API Contract](#api-contract)
4. [Configuration](#configuration)
5. [Security Considerations](#security-considerations)
6. [Regulatory Compliance](#regulatory-compliance)
7. [Usage Guide](#usage-guide)
8. [Troubleshooting](#troubleshooting)

---

## Architecture

### Module Structure

The Verisys integration is implemented as a **self-contained NestJS module** that can be optionally included or excluded based on client requirements.

```
backend/src/verisys/
├── verisys.module.ts       # Module definition
├── verisys.service.ts      # Core business logic
├── kyc.controller.ts       # API endpoints
├── dto/
│   ├── verify-cnic.dto.ts  # Request DTOs
│   └── kyc-response.dto.ts # Response DTOs
├── interfaces/
│   └── verisys.interface.ts # Type definitions
└── *.spec.ts               # Unit tests
```

### Data Flow

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Customer       │      │  NestJS         │      │  NADRA          │
│  Portal         │─────▶│  Backend        │─────▶│  Verisys API    │
│  (Next.js)      │      │  (VerisysModule)│      │  (HTTPS/VPN)    │
└─────────────────┘      └─────────────────┘      └─────────────────┘
                                │
                                ▼
                         ┌─────────────────┐
                         │  Supabase       │
                         │  PostgreSQL     │
                         │  - kyc.verifications
                         │  - kyc.audit_logs
                         │  - kyc.rate_limits
                         └─────────────────┘
```

---

## Database Schema

### Tables

#### `kyc.verifications`
Primary table storing CNIC verification records.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Reference to auth.users |
| customer_id | UUID | Reference to customers (optional) |
| cnic_hash | TEXT | SHA-256 hash of CNIC (never store raw) |
| cnic_last4 | TEXT | Last 4 digits for reference |
| verification_status | ENUM | PENDING, VERIFIED, FAILED, EXPIRED |
| nadra_name | TEXT | Name as per NADRA |
| nadra_father_husband_name | TEXT | Father/husband name |
| nadra_dob | DATE | Date of birth |
| nadra_permanent_address | TEXT | Permanent address |
| nadra_present_address | TEXT | Present address |
| nadra_response_code | TEXT | NADRA response code |
| nadra_reference_id | TEXT | NADRA transaction ID |
| consent_given | BOOLEAN | User consent flag |
| consent_timestamp | TIMESTAMPTZ | When consent was given |
| created_at | TIMESTAMPTZ | Record creation time |
| verified_at | TIMESTAMPTZ | Verification completion time |

#### `kyc.audit_logs`
Immutable audit trail for compliance (UPDATE/DELETE triggers blocked).

| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL | Primary key |
| actor_user_id | UUID | Who performed the action |
| action | TEXT | Action type (VERIFY_INITIATED, etc.) |
| entity_id | UUID | Related verification ID |
| status | TEXT | SUCCESS, FAILURE, ERROR |
| metadata | JSONB | Additional context |
| created_at | TIMESTAMPTZ | Timestamp |

#### `kyc.rate_limits`
Rate limiting per user per day.

| Column | Type | Description |
|--------|------|-------------|
| user_id | UUID | User ID |
| date | DATE | Date of attempts |
| attempt_count | INTEGER | Number of attempts |
| blocked_until | TIMESTAMPTZ | Block expiry (optional) |

### Row Level Security (RLS)

- **Users**: Can only view their own KYC records
- **Admins**: Can view all records (via `kyc.is_admin()` function)
- **Service Role**: Full access for backend operations

---

## API Contract

### Customer Portal Endpoints

#### GET `/api/kyc/status`
Get current user's KYC status.

**Response:**
```json
{
  "kycStatus": "UNVERIFIED",
  "cnicLast4": null,
  "verifiedAt": null,
  "kycRequired": true,
  "canVerify": true,
  "remainingAttempts": 3,
  "message": "Your identity has not been verified yet."
}
```

#### POST `/api/kyc/verify-cnic`
Submit CNIC for verification.

**Request:**
```json
{
  "cnic": "42101-1234567-1",
  "cnicIssueDate": "2020-01-15",
  "cnicExpiryDate": "2030-01-15",
  "consent": true
}
```

**Response (Success):**
```json
{
  "success": true,
  "status": "VERIFIED",
  "verificationId": "uuid",
  "message": "Your CNIC has been successfully verified",
  "verifiedAt": "2024-11-30T12:00:00Z",
  "attemptNumber": 1,
  "remainingAttempts": 2
}
```

**Response (Failure):**
```json
{
  "success": false,
  "status": "FAILED",
  "verificationId": "uuid",
  "message": "CNIC could not be verified. Please check your details.",
  "attemptNumber": 1,
  "remainingAttempts": 2
}
```

#### GET `/api/kyc/history`
Get user's verification history.

### Admin Endpoints

#### GET `/api/kyc/admin/list`
List all KYC verifications (paginated).

**Query Parameters:**
- `status`: Filter by status (VERIFIED, FAILED, PENDING)
- `search`: Search by name, account, CNIC last 4
- `page`: Page number
- `limit`: Items per page
- `startDate`, `endDate`: Date range filter

#### GET `/api/kyc/admin/detail/:id`
Get detailed KYC record (includes NADRA data).

#### GET `/api/kyc/admin/audit-logs`
Get audit logs for compliance review.

#### POST `/api/kyc/admin/verify/:userId`
Verify CNIC on behalf of a customer.

---

## Configuration

### Environment Variables

Add to `.env`:

```bash
# NADRA Verisys Configuration (Required for KYC module)
VERISYS_BASE_URL=https://nadra-verisys-endpoint.gov.pk
VERISYS_CLIENT_ID=your-client-id
VERISYS_CLIENT_SECRET=your-client-secret
VERISYS_TIMEOUT_MS=10000
VERISYS_VERIFY_ENDPOINT=/cnic/verify
VERISYS_MAX_RETRIES=2
VERISYS_RETRY_DELAY_MS=1000
VERISYS_MAX_ATTEMPTS_PER_DAY=3

# Feature Flags
KYC_REQUIRED_FOR_ACTIVATION=true
KYC_EXPIRY_DAYS=365
```

### Feature Toggle

If `VERISYS_BASE_URL` is not set, the module will be disabled:

```typescript
// In service
if (!this.isModuleEnabled()) {
  throw new HttpException('KYC service not configured', 503);
}
```

---

## Security Considerations

### CNIC Handling

1. **Never store raw CNIC** - Only SHA-256 hash and last 4 digits
2. **Never log CNIC** - Only log `cnic_last4` or `cnic_hash`
3. **Input validation** - Strict regex validation for CNIC format
4. **Consent tracking** - Store consent timestamp and IP

### NADRA Communication

1. **TLS encryption** - All communication over HTTPS
2. **VPN/IPsec** - Assumed to be configured at infrastructure level
3. **Timeouts** - Configurable timeout to prevent hanging
4. **Retries** - Limited retries with exponential backoff
5. **Credentials** - Stored in environment variables, never in code

### Rate Limiting

- Maximum 3 verification attempts per user per day
- Configurable via `VERISYS_MAX_ATTEMPTS_PER_DAY`
- Prevents abuse and excessive API costs

### Audit Trail

- All KYC operations are logged
- Audit logs are **immutable** (UPDATE/DELETE blocked by trigger)
- Includes: actor, action, timestamp, IP, metadata

---

## Regulatory Compliance

### PTRA 1996 (Pakistan Telecommunication Re-organization Act)

✅ **Subscriber Identification**: CNIC-based verification  
✅ **Record Retention**: All verification records stored with audit trail  
✅ **Data Security**: Encrypted storage, hashed CNIC  

### PTA KYC Rules

✅ **Identity Verification**: NADRA Verisys integration  
✅ **Consent**: User consent required and recorded  
✅ **Non-biometric Verification**: Verisys meta-data only  

### CTDISR (Classification & Registration of Telecom Devices)

✅ **Subscriber Records**: Full verification data stored  
✅ **PTA Inspection Ready**: Audit logs exportable, KYC detail accessible  
✅ **Traceability**: Complete verification history maintained  

### PTA Inspection Readiness

The system supports:

1. **Export KYC records** - CSV export from admin panel
2. **Audit log access** - Full history of all KYC operations
3. **Verification proof** - NADRA reference IDs stored
4. **Consent documentation** - Timestamp and IP recorded

---

## Usage Guide

### For Customers

1. Log in to customer portal
2. Navigate to Dashboard → Identity Verification
3. Enter CNIC number (format: XXXXX-XXXXXXX-X)
4. Check consent checkbox
5. Click "Verify My CNIC"
6. Wait for NADRA verification (instant)
7. View result

### For Administrators

1. Access Admin Portal → KYC Management
2. View all verification records
3. Search/filter by status, date, customer
4. Click on record to view NADRA details
5. Export records for compliance reports

### Gating Service Activation

To require KYC before service activation, set:

```bash
KYC_REQUIRED_FOR_ACTIVATION=true
```

Then in your activation service:

```typescript
// In network/provisioning service
async activateService(userId: string) {
  const isVerified = await this.verisysService.isKycVerified(userId);
  if (!isVerified) {
    throw new HttpException('KYC verification required', 403);
  }
  // Proceed with activation
}
```

---

## Troubleshooting

### Common Issues

#### "KYC verification service is not configured"
- **Cause**: `VERISYS_BASE_URL` not set
- **Fix**: Add Verisys configuration to environment

#### "Daily verification limit exceeded"
- **Cause**: User exceeded 3 attempts
- **Fix**: Wait until next day or admin can reset

#### "Verification service temporarily unavailable"
- **Cause**: NADRA API unreachable
- **Fix**: Check VPN/network connectivity, verify credentials

#### NADRA Response Codes

| Code | Meaning |
|------|---------|
| 00 | Success |
| 01 | Invalid CNIC format |
| 02 | CNIC not found |
| 03 | CNIC blocked |
| 04 | CNIC expired |
| 05 | Authentication failed |
| 06 | Service unavailable |
| 09 | Timeout |

### Logs

Check NestJS logs for Verisys operations:

```bash
docker logs wancom_backend_1 | grep -i verisys
```

---

## Module Exclusion

If a client does not require KYC, remove from `app.module.ts`:

```typescript
// Comment out or remove
// VerisysModule,
```

The module is designed for **optional inclusion** with no dependencies on other modules.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-11-30 | Initial implementation |

---

## Contact

For NADRA Verisys integration support:
- NADRA Support: https://www.nadra.gov.pk
- PTA Guidelines: https://www.pta.gov.pk

For WANCOM implementation:
- Technical: tech@wancom.pk
- Compliance: compliance@wancom.pk
