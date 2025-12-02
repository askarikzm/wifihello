#!/bin/bash

###############################################################################
# WANCOM Access Tracking Script
# Monitors visitor activity, logins, and API usage
# Usage: ./track-access.sh [date]
# Example: ./track-access.sh "30/Nov/2025"
###############################################################################

# Default to today's date
DATE_FILTER="${1:-$(date +%d/%b/%Y)}"
LOG_FILE="/var/log/nginx/wancom_access.log"
LOG_FILE_OLD="/var/log/nginx/wancom_access.log.1"

# Check which log file to use
if grep -q "$DATE_FILTER" "$LOG_FILE" 2>/dev/null; then
    ACTIVE_LOG="$LOG_FILE"
elif grep -q "$DATE_FILTER" "$LOG_FILE_OLD" 2>/dev/null; then
    ACTIVE_LOG="$LOG_FILE_OLD"
else
    echo "No logs found for date: $DATE_FILTER"
    exit 1
fi

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║           WANCOM ACCESS REPORT - $DATE_FILTER                    "
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""

# Overall Statistics
echo "📊 OVERALL STATISTICS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
total_requests=$(grep "$DATE_FILTER" "$ACTIVE_LOG" | wc -l)
unique_ips=$(grep "$DATE_FILTER" "$ACTIVE_LOG" | awk '{print $1}' | sort -u | wc -l)
api_calls=$(grep "$DATE_FILTER" "$ACTIVE_LOG" | grep "/api/" | wc -l)
login_views=$(grep "$DATE_FILTER" "$ACTIVE_LOG" | grep "/login" | wc -l)
dashboard_views=$(grep "$DATE_FILTER" "$ACTIVE_LOG" | grep "/dashboard" | wc -l)

echo "Total Requests:     $total_requests"
echo "Unique Visitors:    $unique_ips"
echo "API Calls:          $api_calls"
echo "Login Page Views:   $login_views"
echo "Dashboard Access:   $dashboard_views"
echo ""

# Authenticated Users
echo "🔐 AUTHENTICATED USERS (Dashboard Access)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "%-18s %-12s %-12s %-30s\n" "IP Address" "Dashboard" "API Calls" "ISP"
printf "%-18s %-12s %-12s %-30s\n" "──────────────────" "────────────" "────────────" "──────────────────────────────"

grep "$DATE_FILTER" "$ACTIVE_LOG" | grep "/dashboard" | awk '{print $1}' | sort -u | while read ip; do
    dash_count=$(grep "$DATE_FILTER" "$ACTIVE_LOG" | grep "$ip" | grep "/dashboard" | wc -l)
    api_count=$(grep "$DATE_FILTER" "$ACTIVE_LOG" | grep "$ip" | grep "/api/" | wc -l)
    isp=$(whois "$ip" 2>/dev/null | grep -E "netname|descr" | head -1 | sed 's/.*: *//' | cut -c1-30)

    if [ $dash_count -gt 0 ]; then
        printf "%-18s %-12s %-12s %-30s\n" "$ip" "$dash_count" "$api_count" "$isp"
    fi
done
echo ""

# Top API Endpoints
echo "📈 TOP 10 API ENDPOINTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "%-50s %8s\n" "Endpoint" "Calls"
printf "%-50s %8s\n" "──────────────────────────────────────────────────" "────────"
grep "$DATE_FILTER" "$ACTIVE_LOG" | grep "/api/" | awk '{print $7}' | sed 's/\?.*//g' | sort | uniq -c | sort -rn | head -10 | while read count endpoint; do
    printf "%-50s %8s\n" "$endpoint" "$count"
done
echo ""

# Pakistani ISPs
echo "🇵🇰 PAKISTANI CUSTOMERS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "%-18s %-10s %-10s %-30s\n" "IP Address" "Requests" "API Calls" "ISP"
printf "%-18s %-10s %-10s %-30s\n" "──────────────────" "──────────" "──────────" "──────────────────────────────"

grep "$DATE_FILTER" "$ACTIVE_LOG" | awk '{print $1}' | sort -u | while read ip; do
    isp=$(whois "$ip" 2>/dev/null | grep -E "netname|descr" | head -1 | sed 's/.*: *//')

    # Check if Pakistani ISP
    if echo "$isp" | grep -qiE "PTCL|Pakistan|Cybernet|Jazz|Mobilink|Worldcall|Nayatel"; then
        req_count=$(grep "$DATE_FILTER" "$ACTIVE_LOG" | grep "$ip" | wc -l)
        api_count=$(grep "$DATE_FILTER" "$ACTIVE_LOG" | grep "$ip" | grep "/api/" | wc -l)
        isp_short=$(echo "$isp" | cut -c1-30)
        printf "%-18s %-10s %-10s %-30s\n" "$ip" "$req_count" "$api_count" "$isp_short"
    fi
done
echo ""

# Recent Activity (last 20 lines)
echo "🕐 RECENT ACTIVITY (Last 20 Requests)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
grep "$DATE_FILTER" "$ACTIVE_LOG" | tail -20 | awk '{print $4, $1, $7, $9}' | sed 's/\[//g' | while read line; do
    echo "$line"
done
echo ""

# Save summary to file
REPORT_FILE="/var/www/wancom/logs/access-report-$(date +%Y%m%d-%H%M%S).txt"
mkdir -p /var/www/wancom/logs
cat > "$REPORT_FILE" << EOF
WANCOM Access Report - $DATE_FILTER
Generated: $(date)

Total Requests: $total_requests
Unique Visitors: $unique_ips
API Calls: $api_calls
Login Views: $login_views
Dashboard Access: $dashboard_views

Report saved to: $REPORT_FILE
EOF

echo "💾 Report saved to: $REPORT_FILE"
