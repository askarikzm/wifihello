# NetAxis Access Tracking Scripts

These scripts help you monitor visitor activity, logins, and API usage on your NetAxis ISP platform.

## 📊 Available Scripts

### 1. Quick Check - `./quick-check.sh`
**Shows the last 30 minutes of activity at a glance**

```bash
cd /var/www/netaxis/scripts
./quick-check.sh
```

**What it shows:**
- Total requests in last 1000 log entries
- API calls count
- Login attempts
- Dashboard access
- Currently active authenticated users
- Last 5 important events (login/dashboard/admin)
- NetAxis customer status (119.152.232.80)

**Best for:** Quick status check before/after client meetings

---

### 2. Full Daily Report - `./track-access.sh [date]`
**Complete analysis of all activity for a specific date**

```bash
# Today's report
./track-access.sh

# Yesterday's report
./track-access.sh "29/Nov/2025"

# Specific date
./track-access.sh "28/Nov/2025"
```

**What it shows:**
- Overall statistics (requests, visitors, API calls)
- Authenticated users with ISP information
- Top 10 API endpoints by usage
- Pakistani customers breakdown
- Recent activity timeline
- Saves report to `/var/www/netaxis/logs/`

**Best for:** End-of-day analysis, client reporting

---

### 3. Live Monitor - `./watch-live.sh`
**Real-time activity as it happens**

```bash
./watch-live.sh
# Press Ctrl+C to stop
```

**What it shows:**
- Live stream of incoming requests
- Color-coded events:
  - 🔐 **Yellow** - Login attempts
  - ✓ **Green** - Dashboard access
  - 👨‍💼 **Purple** - Admin access
  - 📡 **Cyan** - API calls
- Real-time alerts for important events
- ISP information for authenticated users

**Best for:** Watching client evaluate the platform in real-time

---

## 🎯 Common Use Cases

### Before Client Meeting
```bash
./quick-check.sh
```
Shows if they're currently using the platform

### After Bug Fix Announcement
```bash
./watch-live.sh
```
Watch them test the fixes in real-time

### Daily Summary Report
```bash
./track-access.sh > /tmp/daily-report.txt
cat /tmp/daily-report.txt
```

### Check Yesterday's Activity
```bash
./track-access.sh "$(date -d 'yesterday' +%d/%b/%Y)"
```

---

## 📁 Log Files

- **Current logs:** `/var/log/nginx/netaxis_access.log`
- **Rotated logs:** `/var/log/nginx/netaxis_access.log.1`
- **Reports saved to:** `/var/www/netaxis/logs/access-report-*.txt`

---

## 🔍 Understanding the Output

### IP Address: 119.152.232.80
- **ISP:** PTCL (Pakistan Telecom)
- **Location:** Lahore
- **Network:** HSI Pool on Lahore BRAS-1
- **Note:** This is your NetAxis customer/evaluator

### Authentication Indicators
- **Dashboard Access:** User is logged in ✓
- **API Calls > 10:** Active usage
- **Session > 1 hour:** Serious evaluation

### Pakistani ISPs to Watch
- **PTCL** - Main customer base
- **Cybernet** - Private ISP users
- **Jazz/Mobilink** - Mobile users
- **Worldcall** - Regional ISP

---

## 🚀 Pro Tips

1. **Set up a cron job for daily reports:**
   ```bash
   # Add to crontab
   0 23 * * * /var/www/netaxis/scripts/track-access.sh > /var/www/netaxis/logs/daily-$(date +\%Y\%m\%d).txt
   ```

2. **Quick customer check:**
   ```bash
   ./quick-check.sh | grep "NetAxis CUSTOMER"
   ```

3. **Watch for specific IP:**
   ```bash
   tail -f /var/log/nginx/netaxis_access.log | grep "119.152.232.80"
   ```

4. **Count today's logins:**
   ```bash
   grep "$(date +%d/%b/%Y)" /var/log/nginx/netaxis_access.log | grep "/dashboard" | wc -l
   ```

---

## 📞 Support

If you see suspicious activity or need help interpreting the data, check the patterns:

- **Good Signs:** Dashboard access, API calls, long sessions
- **Red Flags:** Admin login attempts from unknown IPs, repeated 401s, path traversal attempts
- **Normal:** Static asset 404s, bot crawlers (Google, AWS)

---

**Last Updated:** November 30, 2025
