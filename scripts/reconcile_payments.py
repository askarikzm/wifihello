"""Reconciliation script to compare gateway settlements with internal payments."""
from __future__ import annotations

import asyncio
import datetime as dt
from dataclasses import dataclass

import httpx

@dataclass
class GatewayRecord:
    invoice_id: str
    reference_id: str
    amount: float
    status: str
    settled_at: dt.datetime


async def fetch_payfast_settlements(client: httpx.AsyncClient) -> list[GatewayRecord]:
    resp = await client.get("https://api.payfast.co.za/settlements")
    resp.raise_for_status()
    rows = resp.json().get("data", [])
    return [
        GatewayRecord(
            invoice_id=row["custom_str1"],
            reference_id=row["pf_ref"],
            amount=float(row["amount"],),
            status=row["status"],
            settled_at=dt.datetime.fromisoformat(row["settled_at"]),
        )
        for row in rows
    ]


async def reconcile():
    async with httpx.AsyncClient(timeout=30) as client:
        records = await fetch_payfast_settlements(client)
        # TODO: fetch local DB payments and compare
        print(f"Fetched {len(records)} payfast settlements")


if __name__ == "__main__":
    asyncio.run(reconcile())
