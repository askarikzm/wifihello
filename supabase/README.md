# NetAxis Supabase Setup Guide

## Quick Start

### Step 1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign in or create an account
3. Click "New Project"
4. Fill in:
   - **Organization**: Select or create one
   - **Project Name**: `netaxis-portal`
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
5. Click "Create new project" and wait for provisioning (~2 minutes)

### Step 2: Get Your API Keys

Once the project is ready:

1. Go to **Settings** → **API**
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGciOi...` (for frontend)
   - **service_role key**: `eyJhbGciOi...` (for backend - keep secret!)

### Step 3: Run SQL Scripts

Go to **SQL Editor** in your Supabase dashboard and run these scripts **in order**:

1. **01_schema.sql** - Creates all tables, RLS policies, and triggers
2. **02_seed_data.sql** - Creates service packages and helper functions
3. **03_functions.sql** - Creates API functions and views

### Step 4: Create Demo User

1. Go to **Authentication** → **Users**
2. Click **Add user** → **Create new user**
3. Fill in:
   - **Email**: `demo@netaxis.pk`
   - **Password**: `demo123456`
   - **Auto Confirm User**: ✅ Checked
4. Click **Create user**

### Step 5: Initialize Demo Data

After creating the demo user, go to **SQL Editor** and run:

```sql
select setup_demo_user('demo@netaxis.pk');
```

This creates:
- Customer profile
- Active subscription (Fiber Plus 50 Mbps)
- ONU mapping
- 4 invoices (3 paid, 1 pending)
- 30 days of usage data

### Step 6: Update Environment Variables

SSH to your server and update the `.env` file:

```bash
cd /var/www/netaxis
nano .env
```

Update these values:

```env
# Replace with your actual Supabase values
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_JWT_SECRET=your-jwt-secret-from-settings

# Also update frontend env vars (same URL and anon key)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

To get the JWT secret:
1. Go to **Settings** → **API** → **JWT Settings**
2. Copy the **JWT Secret**

### Step 7: Restart Services

```bash
cd /var/www/netaxis
docker restart netaxis-frontend netaxis-backend
```

### Step 8: Test Login

1. Go to https://netaxis.linkservex.com/login
2. Login with:
   - **Email**: `demo@netaxis.pk`
   - **Password**: `demo123456`

---

## Database Schema Overview

### Core Tables

| Schema | Table | Purpose |
|--------|-------|---------|
| public | customers | Customer accounts linked to auth.users |
| public | services | Internet packages (speeds, pricing) |
| public | subscriptions | Customer subscriptions to services |
| public | olt_devices | OLT network equipment |
| public | onu_mapping | Customer ONU connections |
| billing | invoices | Monthly billing records |
| billing | payments | Payment transactions |
| network | usage_logs | Bandwidth usage tracking |

### Row Level Security (RLS)

All tables have RLS enabled:
- Customers can only see their own data
- Service accounts can access cross-tenant data
- Admin users have elevated permissions

### API Functions

| Function | Purpose |
|----------|---------|
| `get_customer_profile(user_id)` | Get customer details with subscription |
| `get_customer_invoices(user_id, limit)` | Get billing history |
| `get_customer_usage(user_id, days)` | Get usage data |
| `get_monthly_summary(user_id)` | Get current month stats |

---

## Troubleshooting

### "User not found" error
Make sure you created the user in Authentication before running `setup_demo_user()`

### RLS policy errors
Check that the user has a corresponding `customers` record

### Connection errors
Verify your SUPABASE_URL and keys in `.env`

### JWT validation fails
Make sure SUPABASE_JWT_SECRET matches the value in Supabase dashboard

---

## Security Notes

⚠️ **Never commit** the `.env` file to git

⚠️ **Never expose** the `service_role` key to the frontend

⚠️ The `service_role` key bypasses RLS - use only in backend

⚠️ For production, change the demo password immediately
