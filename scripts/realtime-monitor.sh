#!/bin/bash

###############################################################################
# NetAxis Real-time Monitor with Auto-Alert
# Monitors CTO activity and highlights issues in real-time
###############################################################################

LOG_FILE="/var/log/nginx/netaxis_access.log"
NetAxis_IP="119.152.232.80"

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║      NetAxis CTO ACTIVITY MONITOR - Real-time with Alerts          ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""
echo "🎯 Watching for NetAxis CTO (119.152.232.80)..."
echo ""
printf "%-20s %-10s %-50s %-10s\n" "Time" "Status" "Path" "Alert"
printf "%-20s %-10s %-50s %-10s\n" "────────────────────" "──────────" "──────────────────────────────────────────────────" "──────────"

tail -f "$LOG_FILE" | while read -r line; do
    # Only show NetAxis customer activity
    if ! echo "$line" | grep -q "$NetAxis_IP"; then
        continue
    fi

    ip=$(echo "$line" | awk '{print $1}')
    time=$(echo "$line" | awk '{print $4}' | sed 's/\[//g')
    path=$(echo "$line" | awk '{print $7}')
    status=$(echo "$line" | awk '{print $9}')

    # Skip static assets
    if echo "$path" | grep -qE "/_next/static|/favicon|\\.woff|\\.png$|\\.jpg$"; then
        continue
    fi

    # Analyze and alert on status
    alert=""
    color=""

    case $status in
        200|304)
            color="\033[0;32m" # Green
            if echo "$path" | grep -q "/admin"; then
                alert="✓ OK"
            fi
            ;;
        307)
            color="\033[0;33m" # Yellow
            alert="→ REDIRECT"
            ;;
        401|403)
            color="\033[0;36m" # Cyan
            alert="🔒 AUTH"
            ;;
        404)
            color="\033[1;33m" # Bold Yellow
            alert="⚠️  NOT FOUND!"
            # Sound alert for 404
            echo -e "\a"
            ;;
        500|502|503)
            color="\033[1;31m" # Bold Red
            alert="🚨 ERROR!"
            # Sound alert for errors
            echo -e "\a\a"
            ;;
        *)
            color="\033[0m"
            ;;
    esac

    # Display with color
    echo -e "${color}$(printf "%-20s %-10s %-50s %-10s" "$time" "$status" "${path:0:50}" "$alert")\033[0m"

    # Special notifications
    if [ "$status" == "404" ]; then
        echo "   └─ 🔍 INVESTIGATING: Path does not exist"
    elif [ "$status" == "401" ]; then
        if echo "$path" | grep -q "/api/"; then
            echo "   └─ ℹ️  Expected: API requires authentication"
        fi
    elif echo "$path" | grep -q "/admin"; then
        echo "   └─ 👨‍💼 Admin panel activity detected"
    fi

done
