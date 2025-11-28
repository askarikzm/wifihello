# OLT / ONU Integration Guide

## Vendors
- **Huawei MA5608/MA5800** – SNMP v2c/v3 OIDs for optical power, upstream/downstream counters; SSH commands such as `display ont info`, `display ont optical-info`, `display traffic interface`. Authentication via per-OLT credentials stored in Vault.
- **ZTE C320/C600** – SNMP + CLI (`show gpon onu detail`, `show optic`), response normalized to unified schema.
- **FiberHome** – Extend `adapters/fiberhome.py` to implement the same interface.

## Unified JSON Response
```json
{
  "online": true,
  "rx_power": -25.3,
  "tx_power": 1.3,
  "down_rate": "30Mbps",
  "up_rate": "10Mbps",
  "last_online": "2025-11-28T12:43:00Z",
  "vendor": "huawei",
  "metadata": {
    "frame": 0,
    "slot": 1,
    "pon_port": 3,
    "onu_id": 12
  }
}
```

## Service Responsibilities
1. `/olt/{subscriber_id}/status` – Combines SNMP status + ONU authentication state from RADIUS.
2. `/olt/{subscriber_id}/power` – Raw optical levels + thresholds.
3. `/olt/{subscriber_id}/traffic` – 5 min average throughput + historical counters.
4. `/olt/{subscriber_id}/reboot` – Issues CLI reboot via SSH with audit logging.
5. `/olt/{subscriber_id}/apply-profile` – Applies templates defined in `profiles/*.yaml`.

## Security Controls
- API key (`OLT_API_KEY`) validated on every request.
- Allow-list backend IP ranges only.
- Commands executed via dedicated technical user with role-based privileges.
- Every action appended to `audit_logs` with request id + CLI transcript hash.

## Polling vs On-Demand
- Scheduled poller runs via Celery beat every 5 minutes for health metrics.
- On-demand calls (dashboard load) fetch cached values (<30s) to avoid OLT overload.
- Critical alerts (Rx power below -28 dBm) push notifications via Slack/SMS.
