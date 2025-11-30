# WANCOM RADIUS AAA Service

Enterprise RADIUS Authentication, Authorization, and Accounting service for WANCOM ISP.

## Features

- **Authentication (PAP/CHAP)**: Validates subscriber credentials against Supabase
- **Authorization**: Assigns speed profiles based on active subscription packages
- **Accounting**: Logs usage data (Start, Interim-Update, Stop) to Supabase
- **Suspension Logic**: Rejects auth for suspended/blocked subscribers or overdue invoices
- **Duplicate Protection**: Handles duplicate RADIUS packets gracefully

## Architecture

```
[NAS/BRAS/OLT] --RADIUS--> [RADIUS Service] --API--> [Supabase Postgres]
                                  |
                                  +--> Audit Logs
                                  +--> Usage Logs
```

## Configuration

Environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `RADIUS_SECRET` | Shared secret for RADIUS clients | (required) |
| `RADIUS_AUTH_PORT` | Authentication port | 1812 |
| `RADIUS_ACCT_PORT` | Accounting port | 1813 |
| `SUPABASE_URL` | Supabase project URL | (required) |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | (required) |
| `DEFAULT_DNS_PRIMARY` | Primary DNS server | 8.8.8.8 |
| `DEFAULT_DNS_SECONDARY` | Secondary DNS server | 8.8.4.4 |
| `SESSION_TIMEOUT` | Default session timeout (seconds) | 86400 |
| `INTERIM_INTERVAL` | Interim update interval (seconds) | 300 |

## Running

```bash
# Development
python -m app.main

# Docker
docker build -t wancom-radius .
docker run -p 1812:1812/udp -p 1813:1813/udp --env-file .env wancom-radius
```

## Testing

```bash
# Using radtest (from freeradius-utils)
radtest testuser testpass localhost 0 testing123

# Using radclient
echo "User-Name=testuser,User-Password=testpass" | radclient localhost auth testing123
```

## Security Notes

- RADIUS secrets should be strong (32+ characters)
- Use encrypted connections to Supabase
- Rotate secrets periodically
- Monitor for brute-force attempts
