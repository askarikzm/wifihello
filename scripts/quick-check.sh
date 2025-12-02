#!/bin/bash

###############################################################################
# WANCOM Quick Check - Last 30 Minutes Activity
# Shows recent activity at a glance
# Usage: ./quick-check.sh
###############################################################################

LOG_FILE="/var/log/nginx/wancom_access.log"

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║           WANCOM QUICK CHECK - Last 30 Minutes                    ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""

# Get timestamp from 30 minutes ago
CUTOFF_TIME=$(date -d '30 minutes ago' '+%d/%b/%Y:%H:%M' 2>/dev/null || date -v-30M '+%d/%b/%Y:%H:%M')

# Count recent activity
RECENT_REQUESTS=$(tail -1000 "$LOG_FILE" | wc -l)
RECENT_API=$(tail -1000 "$LOG_FILE" | grep "/api/" | wc -l)
RECENT_LOGIN=$(tail -1000 "$LOG_FILE" | grep "/login" | wc -l)
RECENT_DASHBOARD=$(tail -1000 "$LOG_FILE" | grep "/dashboard" | wc -l)

echo "📊 ACTIVITY SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Total Requests (last 1000):  $RECENT_REQUESTS"
echo "API Calls:                    $RECENT_API"
echo "Login Attempts:               $RECENT_LOGIN"
echo "Dashboard Access:             $RECENT_DASHBOARD"
echo ""

# Show active users
echo "👤 CURRENTLY ACTIVE USERS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
tail -500 "$LOG_FILE" | grep "/dashboard\|/admin" | awk '{print $1}' | sort -u | while read ip; do
    last_seen=$(tail -500 "$LOG_FILE" | grep "$ip" | tail -1 | awk '{print $4}' | sed 's/\[//g')
    req_count=$(tail -500 "$LOG_FILE" | grep "$ip" | wc -l)
    isp=$(whois "$ip" 2>/dev/null | grep -E "netname|descr" | head -1 | sed 's/.*: *//' | cut -c1-35)

    printf "%-18s | Last: %-20s | Requests: %-4s | %s\n" "$ip" "$last_seen" "$req_count" "$isp"
done

if [ $(tail -500 "$LOG_FILE" | grep "/dashboard\|/admin" | awk '{print $1}' | sort -u | wc -l) -eq 0 ]; then
    echo "No active authenticated users in last 500 requests"
fi

echo ""

# Show last 5 important events
echo "🔔 LAST 5 IMPORTANT EVENTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
tail -1000 "$LOG_FILE" | grep -E "/login|/dashboard|/admin" | tail -5 | while read line; do
    time=$(echo "$line" | awk '{print $4}' | sed 's/\[//g')
    ip=$(echo "$line" | awk '{print $1}')
    path=$(echo "$line" | awk '{print $7}')
    status=$(echo "$line" | awk '{print $9}')

    event="Browse"
    if echo "$path" | grep -q "/dashboard"; then event="🔐 Login"; fi
    if echo "$path" | grep -q "/admin"; then event="👨‍💼 Admin"; fi

    printf "%-20s | %-15s | %-12s | %s\n" "$time" "$ip" "$event" "$path"
done
echo ""

# Check if WANCOM customer is online
echo "🇵🇰 WANCOM CUSTOMER STATUS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
WANCOM_ACTIVE=$(tail -500 "$LOG_FILE" | grep "119.152.232.80" | wc -l)

if [ $WANCOM_ACTIVE -gt 0 ]; then
    LAST_WANCOM=$(tail -500 "$LOG_FILE" | grep "119.152.232.80" | tail -1 | awk '{print $4, $7}' | sed 's/\[//g')
    echo "✅ ACTIVE - 119.152.232.80 (PTCL Lahore - WANCOM customer)"
    echo "   Last activity: $LAST_WANCOM"
    echo "   Recent requests: $WANCOM_ACTIVE (in last 500)"
else
    echo "⭕ No recent activity from known WANCOM customer"
fi
echo ""

echo "💡 TIP: Run './watch-live.sh' to see real-time activity"
echo "💡 TIP: Run './track-access.sh' for full daily report"
