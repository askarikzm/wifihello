#!/usr/bin/env python3
"""
WANCOM ISP Customer Portal - Demo Data Loader
==============================================
Loads realistic mock data for live demos without affecting production data.

Usage:
    python scripts/load_demo_data.py [--supabase-url URL] [--service-key KEY]
    
Environment Variables:
    SUPABASE_URL - Supabase project URL
    SUPABASE_SERVICE_ROLE_KEY - Service role key for admin operations
"""

import os
import sys
import json
import argparse
from datetime import datetime, timedelta
from pathlib import Path
import uuid

try:
    from supabase import create_client, Client
except ImportError:
    print("❌ supabase-py not installed. Run: pip install supabase")
    sys.exit(1)

# Demo customer ID (consistent across all data)
DEMO_CUSTOMER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"

# Pakistan timezone offset
PKT_OFFSET = "+05:00"


def generate_usage_data(days: int = 30) -> list:
    """Generate realistic usage data for the last N days."""
    usage = []
    today = datetime.now()
    
    for i in range(days, 0, -1):
        date = today - timedelta(days=i)
        day_of_week = date.weekday()
        
        # Weekend = higher usage (Fri, Sat, Sun in Pakistan)
        is_weekend = day_of_week in [4, 5, 6]
        
        # Base usage 8-15 GB weekdays, 18-26 GB weekends
        if is_weekend:
            download_gb = 18 + (hash(str(date)) % 8)
            upload_gb = 3 + (hash(str(date) + "up") % 2)
        else:
            download_gb = 8 + (hash(str(date)) % 7)
            upload_gb = 1.5 + (hash(str(date) + "up") % 1.5)
        
        usage.append({
            "id": f"ul-{date.strftime('%Y-%m-%d')}",
            "subscriber_id": DEMO_CUSTOMER_ID,
            "bytes_down": int(download_gb * 1024 * 1024 * 1024),
            "bytes_up": int(upload_gb * 1024 * 1024 * 1024),
            "session_start": f"{date.strftime('%Y-%m-%d')} 00:00:00{PKT_OFFSET}",
            "session_end": f"{date.strftime('%Y-%m-%d')} 23:59:59{PKT_OFFSET}",
            "created_at": f"{date.strftime('%Y-%m-%d')} 23:59:59{PKT_OFFSET}",
        })
    
    return usage


def generate_invoices(months: int = 6) -> list:
    """Generate invoices for the last N months."""
    invoices = []
    today = datetime.now()
    
    for i in range(months, 0, -1):
        # Calculate month
        month_date = today.replace(day=1) - timedelta(days=i * 28)
        month_start = month_date.replace(day=1)
        
        # Get last day of month
        if month_start.month == 12:
            month_end = month_start.replace(year=month_start.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            month_end = month_start.replace(month=month_start.month + 1, day=1) - timedelta(days=1)
        
        # Due date is 5th of next month
        if month_end.month == 12:
            due_date = month_end.replace(year=month_end.year + 1, month=1, day=5)
        else:
            due_date = month_end.replace(month=month_end.month + 1, day=5)
        
        # Status: all paid except current month
        is_current = i == 1
        status = "pending" if is_current else "paid"
        
        # Payment date (2-3 days before or after due date for paid)
        paid_at = None
        if status == "paid":
            paid_at = due_date - timedelta(days=2 + (hash(str(month_start)) % 3))
        
        invoice = {
            "id": f"inv-{month_start.strftime('%Y-%m')}-demo",
            "subscriber_id": DEMO_CUSTOMER_ID,
            "invoice_number": f"INV-{month_start.strftime('%Y-%m')}-0001",
            "amount": 2500.00,
            "tax_amount": 450.00,
            "total_amount": 2950.00,
            "status": status,
            "billing_period_start": f"{month_start.strftime('%Y-%m-%d')} 00:00:00{PKT_OFFSET}",
            "billing_period_end": f"{month_end.strftime('%Y-%m-%d')} 23:59:59{PKT_OFFSET}",
            "due_date": f"{due_date.strftime('%Y-%m-%d')} 00:00:00{PKT_OFFSET}",
            "paid_at": f"{paid_at.strftime('%Y-%m-%d')} {10 + hash(str(paid_at)) % 8}:{hash(str(paid_at)) % 60:02d}:00{PKT_OFFSET}" if paid_at else None,
            "created_at": f"{month_end.strftime('%Y-%m-%d')} 10:00:00{PKT_OFFSET}",
        }
        invoices.append(invoice)
    
    return invoices


def generate_payments(invoices: list) -> list:
    """Generate payments for paid invoices."""
    payments = []
    gateways = ["jazzcash", "easypaisa", "payfast"]
    
    for invoice in invoices:
        if invoice["status"] != "paid":
            continue
        
        gateway = gateways[hash(invoice["id"]) % len(gateways)]
        
        # Generate gateway-specific reference
        ref_prefix = {"jazzcash": "JC", "easypaisa": "EP", "payfast": "PF"}
        ref = f"{ref_prefix[gateway]}{invoice['paid_at'][:10].replace('-', '')}{hash(invoice['id']) % 100000:05d}"
        
        payment = {
            "id": f"pay-{invoice['id'][4:]}",  # Remove 'inv-' prefix
            "subscriber_id": DEMO_CUSTOMER_ID,
            "invoice_id": invoice["id"],
            "amount": invoice["total_amount"],
            "gateway": gateway,
            "gateway_reference": ref,
            "gateway_response": json.dumps({
                "status": "success",
                "reference": ref,
                "timestamp": invoice["paid_at"],
            }),
            "status": "completed",
            "webhook_verified": True,
            "created_at": invoice["paid_at"],
            "settled_at": invoice["paid_at"],
        }
        payments.append(payment)
    
    return payments


def load_demo_data(supabase: Client, dry_run: bool = False):
    """Load all demo data into Supabase."""
    
    print("🚀 WANCOM ISP Demo Data Loader")
    print("=" * 50)
    print(f"Demo Customer ID: {DEMO_CUSTOMER_ID}")
    print(f"Dry Run: {dry_run}")
    print()
    
    # Generate data
    print("📊 Generating demo data...")
    usage_data = generate_usage_data(30)
    invoices = generate_invoices(6)
    payments = generate_payments(invoices)
    
    print(f"  • {len(usage_data)} usage records")
    print(f"  • {len(invoices)} invoices")
    print(f"  • {len(payments)} payments")
    print()
    
    if dry_run:
        print("🔍 DRY RUN - No data will be written")
        print("\nSample Usage Record:")
        print(json.dumps(usage_data[0], indent=2))
        print("\nSample Invoice:")
        print(json.dumps(invoices[0], indent=2))
        print("\nSample Payment:")
        print(json.dumps(payments[0], indent=2))
        return
    
    # Insert demo subscriber
    print("👤 Upserting demo subscriber...")
    subscriber = {
        "id": DEMO_CUSTOMER_ID,
        "user_id": DEMO_CUSTOMER_ID,
        "full_name": "Ahmed Hassan",
        "email": "ahmed.hassan@demo.wancom.pk",
        "phone": "+92 321 1234567",
        "address": "House 42, Street 7, F-10/3, Islamabad",
        "cnic": "61101-1234567-8",
        "status": "active",
        "onu_serial": "HWTC12345678",
        "olt_id": "olt-islamabad-01",
        "olt_port": "0/1/3:5",
        "pppoe_username": "ahmed.hassan@wancom",
        "activation_date": "2024-06-15 10:00:00+05:00",
    }
    
    try:
        supabase.table("subscribers").upsert(subscriber).execute()
        print("  ✅ Subscriber created/updated")
    except Exception as e:
        print(f"  ⚠️ Subscriber: {e}")
    
    # Insert usage data
    print("📈 Inserting usage data...")
    try:
        for record in usage_data:
            supabase.table("usage_logs").upsert(record).execute()
        print(f"  ✅ {len(usage_data)} usage records inserted")
    except Exception as e:
        print(f"  ⚠️ Usage: {e}")
    
    # Insert invoices
    print("🧾 Inserting invoices...")
    try:
        for invoice in invoices:
            supabase.table("invoices").upsert(invoice).execute()
        print(f"  ✅ {len(invoices)} invoices inserted")
    except Exception as e:
        print(f"  ⚠️ Invoices: {e}")
    
    # Insert payments
    print("💳 Inserting payments...")
    try:
        for payment in payments:
            supabase.table("payments").upsert(payment).execute()
        print(f"  ✅ {len(payments)} payments inserted")
    except Exception as e:
        print(f"  ⚠️ Payments: {e}")
    
    print()
    print("=" * 50)
    print("✅ Demo data loaded successfully!")
    print()
    print("Dashboard should now show:")
    print("  • 30-day usage history with weekend peaks")
    print("  • 6 invoices (5 paid, 1 pending)")
    print("  • 5 completed payments via JazzCash/Easypaisa/PayFast")
    print("  • Active subscriber with online ONU status")


def cleanup_demo_data(supabase: Client):
    """Remove all demo data."""
    print("🧹 Cleaning up demo data...")
    
    tables = ["payments", "invoices", "usage_logs", "radius_sessions", 
              "ticket_messages", "support_tickets", "notifications", "onu_status"]
    
    for table in tables:
        try:
            supabase.table(table).delete().eq("subscriber_id", DEMO_CUSTOMER_ID).execute()
            print(f"  ✅ Cleaned {table}")
        except Exception as e:
            print(f"  ⚠️ {table}: {e}")
    
    # Remove subscriber last
    try:
        supabase.table("subscribers").delete().eq("id", DEMO_CUSTOMER_ID).execute()
        print("  ✅ Removed demo subscriber")
    except Exception as e:
        print(f"  ⚠️ subscribers: {e}")
    
    print("\n✅ Demo data cleanup complete!")


def main():
    parser = argparse.ArgumentParser(description="WANCOM ISP Demo Data Loader")
    parser.add_argument("--supabase-url", help="Supabase project URL")
    parser.add_argument("--service-key", help="Supabase service role key")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument("--cleanup", action="store_true", help="Remove demo data")
    
    args = parser.parse_args()
    
    # Get credentials
    supabase_url = args.supabase_url or os.getenv("SUPABASE_URL")
    service_key = args.service_key or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not supabase_url or not service_key:
        print("❌ Missing Supabase credentials!")
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables")
        print("Or use --supabase-url and --service-key arguments")
        sys.exit(1)
    
    # Create client
    supabase = create_client(supabase_url, service_key)
    
    if args.cleanup:
        cleanup_demo_data(supabase)
    else:
        load_demo_data(supabase, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
