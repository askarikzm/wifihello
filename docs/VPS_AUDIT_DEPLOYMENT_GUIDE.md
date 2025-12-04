# VPS Audit Script — Deployment & Analysis Guide

> **Version:** 1.0  
> **Last Updated:** December 2025  
> **Maintainer:** NetAxis Infrastructure Team

---

## Synopsis

`vps_inventory.sh` is an all-in-one diagnostic script that audits a Linux VPS for disk usage, CPU/memory health, running services, open ports, Docker state, Nginx/Node.js configuration, and common security indicators. It produces a timestamped log suitable for operational review and compliance reporting.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Root or sudo access** | The script invokes privileged commands. |
| **Bash 4+** | Standard on modern distros (Ubuntu 20.04+, Debian 11+, RHEL 8+). |
| **Common utilities** | `df`, `du`, `ps`, `ss`, `journalctl`, `docker` (if auditing containers). |
| **SSH client** | For remote upload and execution. |

---

## Step 1 — Upload the Script

### Option A: SCP from Local Machine

```bash
scp vps_inventory.sh user@<SERVER_IP>:/root/
```

> **Tip:** Replace `user` with your SSH username (often `root` or a sudo-enabled account) and `<SERVER_IP>` with the target host.

### Option B: Manual Copy

If SCP is unavailable, paste the script contents into a new file on the server:

```bash
ssh user@<SERVER_IP>
nano /root/vps_inventory.sh   # paste contents, save
```

---

## Step 2 — Prepare & Execute

```bash
# SSH into the VPS (if not already connected)
ssh user@<SERVER_IP>

# Make executable and run
chmod +x /root/vps_inventory.sh
sudo /root/vps_inventory.sh
```

⏱ **Runtime:** Varies with disk size and container count—typically 30 seconds to 5 minutes.

---

## Step 3 — View the Output

The script streams progress to the terminal **and** writes a persistent log:

```
/root/vps_audit_YYYY-MM-DD_HH-MM.log
```

To review after completion:

```bash
less /root/vps_audit_2025-12-04_09-30.log   # adjust timestamp
```

> **Tip:** Use `/keyword` inside `less` to search; press `q` to exit.

---

## Step 4 — Analyze Key Sections

| Section | What to Look For |
|---------|------------------|
| **DISK USAGE & STORAGE AUDIT** | Partitions above 80 %, giant directories, oversized logs. |
| **CPU & MEMORY REPORT** | Processes consuming excessive CPU/RAM, OOM events. |
| **RUNNING SERVICES & PORTS** | Unexpected listeners, rogue daemons, unrecognized PIDs. |
| **NETWORK AUDIT** | Unusual outbound connections, high packet counts. |
| **DOCKER AUDIT** | Dangling images, stopped containers, volume bloat. |
| **NGINX & NODE.JS AUDIT** | Config syntax errors, stale PM2 processes, log rotation issues. |
| **SECURITY & VULNERABILITY CHECKS** | Repeated failed SSH logins, sudo misuse, suspicious cron jobs. |

---

## Step 5 — Detection Checklist

Use the following as a quick-scan guide:

- [ ] **Disk:** Any mount > 85 % used?
- [ ] **Disk:** Directories > 5 GB that shouldn't be?
- [ ] **CPU:** Any single process > 80 % sustained?
- [ ] **Memory:** Swap usage > 50 %?
- [ ] **Ports:** Unexpected listeners on 0.0.0.0 or public IPs?
- [ ] **Docker:** Dangling images > 2 GB?
- [ ] **Security:** > 50 failed SSH attempts from single IP?
- [ ] **Logs:** Files > 1 GB in `/var/log`?

---

## Step 6 — Remediation Best Practices

### Disk Space

```bash
# Purge old journals
sudo journalctl --vacuum-time=7d

# Remove unused Docker assets
docker system prune -af --volumes

# Truncate a runaway log (use with caution)
sudo truncate -s 0 /var/log/large.log
```

### High CPU / Memory

```bash
# Identify top consumers
top -b -n1 | head -20

# Restart misbehaving service
sudo systemctl restart <service>
```

### Rogue Ports

```bash
# Find process on suspect port
sudo ss -tulpn | grep :<PORT>

# Kill if unauthorized
sudo kill -9 <PID>
```

### Failed Logins

```bash
# Review auth log
sudo grep 'Failed password' /var/log/auth.log | tail -50

# Block offending IP via UFW
sudo ufw deny from <IP>
```
---

## Warnings

| ⚠️ Warning | Guidance |
|-----------|----------|
| **Running as root** | Audit scripts require elevated access; review the script before execution on production hosts. |
| **Docker prune** | `docker system prune -af --volumes` removes **all** unused data—confirm nothing critical is orphaned. |
| **Log truncation** | Truncating logs loses historical data; rotate or archive first if compliance requires retention. |
| **Firewall changes** | Blocking IPs may disrupt legitimate users; cross-check before applying. |

---

## Final Audit Completion Checklist

Before marking the audit **complete**, confirm:

- [ ] Log file saved to a central location or ticketing system.
- [ ] All critical findings triaged (P0/P1 remediated or escalated).
- [ ] Disk utilization < 80 % on all mounts.
- [ ] No unauthorized services listening on public interfaces.
- [ ] Docker images/volumes pruned; remaining assets justified.
- [ ] Failed-login sources reviewed and blocked if malicious.
- [ ] Remediation actions documented in change log.
- [ ] Next audit scheduled (recommended: weekly or per-deployment).

---

## Appendix: Sample Cron for Automated Audits

```cron
# Run weekly at 03:00 Sunday, email summary
0 3 * * 0 /root/vps_inventory.sh | mail -s "Weekly VPS Audit" ops@netaxis.local
```

---

*End of Guide*
