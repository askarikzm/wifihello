#!/bin/bash

###############################################################################
# WANCOM Live Activity Monitor
# Shows real-time visitor activity as it happens
# Usage: ./watch-live.sh
# Press Ctrl+C to stop
###############################################################################

LOG_FILE="/var/log/nginx/wancom_access.log"

clear
echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║           WANCOM LIVE ACTIVITY MONITOR                            ║"
echo "║           Press Ctrl+C to stop                                    ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""
echo "🔴 LIVE - Watching for new requests..."
echo ""
printf "%-20s %-18s %-50s %-6s\n" "Time" "IP Address" "Page/Endpoint" "Status"
printf "%-20s %-18s %-50s %-6s\n" "────────────────────" "──────────────────" "──────────────────────────────────────────────────" "──────"

# Function to get ISP for IP
get_isp() {
    local ip=$1
    # Check cache first
    if [ -f "/tmp/isp_cache_${ip}" ]; then
        cat "/tmp/isp_cache_${ip}"
    else
        isp=$(whois "$ip" 2>/dev/null | grep -E "netname|descr" | head -1 | sed 's/.*: *//' | cut -c1-20)
        echo "$isp" > "/tmp/isp_cache_${ip}"
        echo "$isp"
    fi
}

# Highlight function
highlight_important() {
    local line=$1

    # Highlight logins
    if echo "$line" | grep -q "/login"; then
        echo -e "\033[1;33m$line\033[0m 🔐 LOGIN"
        return
    fi

    # Highlight dashboard
    if echo "$line" | grep -q "/dashboard"; then
        echo -e "\033[1;32m$line\033[0m ✓ DASHBOARD"
        return
    fi

    # Highlight admin
    if echo "$line" | grep -q "/admin"; then
        echo -e "\033[1;35m$line\033[0m 👨‍💼 ADMIN"
        return
    fi

    # Highlight API calls
    if echo "$line" | grep -q "/api/"; then
        echo -e "\033[1;36m$line\033[0m 📡 API"
        return
    fi

    # Regular request
    echo "$line"
}

# Follow the log file in real-time
tail -f "$LOG_FILE" | while read -r line; do
    # Parse the log line
    ip=$(echo "$line" | awk '{print $1}')
    time=$(echo "$line" | awk '{print $4}' | sed 's/\[//g')
    path=$(echo "$line" | awk '{print $7}')
    status=$(echo "$line" | awk '{print $9}')

    # Skip static assets
    if echo "$path" | grep -qE "/_next/|/favicon|\.js$|\.css$|\.woff|\.png$|\.jpg$"; then
        continue
    fi

    # Format and display
    output=$(printf "%-20s %-18s %-50s %-6s" "$time" "$ip" "${path:0:50}" "$status")
    highlight_important "$output"

    # Alert on important events
    if echo "$path" | grep -q "/dashboard"; then
        isp=$(get_isp "$ip")
        echo "   └─ 🎯 USER LOGGED IN: $isp ($ip)"
    fi

    if echo "$path" | grep -q "/admin"; then
        isp=$(get_isp "$ip")
        echo "   └─ ⚠️  ADMIN ACCESS: $isp ($ip)"
    fi
done
