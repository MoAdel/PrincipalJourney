# Production Incident Post-Mortem: The Split-Brain Balance Desync

| Field | Value |
|---|---|
| **Incident ID** | INC-9812-SEV1 |
| **Date & Time** | 2026-07-22 02:15:00 UTC |
| **Duration** | 2 hours 14 minutes |
| **Impact** | $280,000 in duplicate balance liquidations; 1,420 customer accounts corrupted. |
| **Lead Investigator** | Tarek (Principal Systems Architect) |

---

## 1. Executive Summary

At 02:15 UTC, an undersea fiber cut partitioned `us-east-1` (Primary) from `eu-central-1` (Replica). 
Because the European Redis replica was configured with a 2-node failover monitor (lacking an odd-numbered quorum), it promoted itself to master after 5 seconds of packet loss. 
Both regions accepted concurrent writes for the same customer wallets. When WAN connectivity restored at 02:23 UTC, asynchronous replication used Last-Write-Wins (LWW) to overwrite state, causing massive financial discrepancies.

---

## 2. Root Cause Analysis (5 Whys)

1. **Why were accounts double-spent?**
   Two master nodes simultaneously approved transactions for the same account balances.
2. **Why were there two master nodes?**
   The EU replica promoted itself to master while the US master was still actively processing writes.
3. **Why did the replica promote itself?**
   It detected a heartbeat timeout and lacked a quorum check to verify if it was in the majority partition.
4. **Why was there no quorum check?**
   The cluster topology had only 2 nodes across 2 regions ($N=2$), making majority quorum mathematically impossible.
5. **Why was a balance system designed as AP?**
   The architectural specification prioritized zero-latency local writes over linearizable financial consistency.

---

## 3. Corrective Actions & Architectural Invariants

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Immediate & Permanent Remediation                                      │
├────────────────────────────────────────────────────────────────────────┤
│ 1. 3-Region Quorum Architecture: Added a lightweight third witness     │
│    node in a third cloud region (`us-west-2`) to guarantee N=3, Q=2.   │
│ 2. Fencing Tokens: Implemented monotonic tokens on all wallet locks.   │
│ 3. CP Financial Boundary: Migrated financial wallet balances from AP   │
│    Redis replication to a linearizable CP database (Azure SQL Sync AG)│
│    while keeping product catalog on AP Redis.                          │
└────────────────────────────────────────────────────────────────────────┘
```
