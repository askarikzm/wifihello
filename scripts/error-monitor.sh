#!/bin/bash

###############################################################################
# WANCOM Error Monitor
# Watches for error responses (4xx, 5xx) in real-time
# Highlights critical issues for immediate attention
###############################################################################

LOG_FILE="/var/log/nginx/wancom_access.log"

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║           WANCOM ERROR MONITOR - Real-time 4xx/5xx Tracking       ║"
echo "║           Press Ctrl+C to stop                                    ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""
echo "🔴 Watching for errors..."
echo ""
printf "%-20s %-18s %-10s %-50s\n" "Time" "IP Address" "Status" "Path"
printf "%-20s %-18s %-10s %-50s\n" "────────────────────" "──────────────────" "──────────" "──────────────────────────────────────────────────"

# Follow the log file and filter for errors
tail -f "$LOG_FILE" | while read -r line; do
    # Parse the log line
    ip=$(echo "$line" | awk '{print $1}')
    time=$(echo "$line" | awk '{print $4}' | sed 's/\[//g')
    path=$(echo "$line" | awk '{print $7}')
    status=$(echo "$line" | awk '{print $9}')

    # Skip static assets
    if echo "$path" | grep -qE "/_next/|/favicon|\\.js$|\\.css$|\\.woff|\\.png$|\\.jpg$"; then
        continue
    fi

    # Only show error status codes
    if [[ $status =~ ^4[0-9][0-9]$ ]] || [[ $status =~ ^5[0-9][0-9]$ ]]; then
        # Color code based on severity
        if [[ $status == "404" ]]; then
            echo -e "\033[1;33m$(printf "%-20s %-18s %-10s %-50s" "$time" "$ip" "$status" "${path:0:50}")\033[0m ⚠️  NOT FOUND"
        elif [[ $status == "401" ]] || [[ $status == "403" ]]; then
            echo -e "\033[0;36m$(printf "%-20s %-18s %-10s %-50s" "$time" "$ip" "$status" "${path:0:50}")\033[0m 🔒 AUTH"
        elif [[ $status =~ ^5[0-9][0-9]$ ]]; then
            echo -e "\033[1;31m$(printf "%-20s %-18s %-10s %-50s" "$time" "$ip" "$status" "${path:0:50}")\033[0m ❌ SERVER ERROR"

            # Check if it's the WANCOM customer
            if [ "$ip" == "119.152.232.80" ]; then
                echo "   └─ 🚨 ALERT: WANCOM CUSTOMER ENCOUNTERED SERVER ERROR!"
            fi
        else
            echo "$(printf "%-20s %-18s %-10s %-50s" "$time" "$ip" "$status" "${path:0:50}")"
        fi
    fi
done
