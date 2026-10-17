# 03 — Multi-Region Tier Classification, RPO/RTO Math & SLA Envelopes

---

## 1. Enterprise Service Tiering Matrix

Not every microservice deserves multi-region Active-Active infrastructure. Classify services strictly by business criticality:

| Tier | Representative Workloads | Target RTO | Target RPO | Architecture Pattern | Relative Infra Cost Multiplier |
|---|---|---|---|---|---|
| **Tier-0 (Mission Critical)** | Identity/Token Validation, Payment Authorization, Edge Routing, Core Ledger | `< 2 minutes` (Automated) | `0 sec` (Ledger) / `< 5 sec` (Session) | Global Anycast Edge + Tenant-Pinned Active-Active or Sync Quorum | `2.5x – 3.5x` |
| **Tier-1 (Revenue Critical)** | Order Placement, Product Catalog, Search, Inventory | `< 15 minutes` | `< 30 seconds` | Active-Passive Warm Standby (Async DB Geo-Replica + Pre-scaled K8s) | `1.4x – 1.8x` |
| **Tier-2 (Operational)** | Internal Admin Portal, Invoice PDF Generator, Monthly Analytics | `< 4 hours` | `< 1 hour` | Pilot Light / Infrastructure-as-Code (`Bicep`/`Terraform`) + Cross-Region Geo-Redundant Backup (`GRS`) | `1.1x` |

> 📐 **Derive It (Fermi Mode): Un-Replicated WAL Data Loss Window (`RPO`) Under Async Geo-Replication**
> - **Inputs**: `PeakWriteTPS = 4000`, `AvgTransactionLogKB = 6`, `CrossRegionLinkBandwidthMbps = 100`, `TransientCongestionSec = 12`
> - **Formula**: `DataAtRiskMB = ((PeakWriteTPS * AvgTransactionLogKB) / 1024) * TransientCongestionSec`
> - **Step-by-Step**:
>   1. Primary region generates transaction log (WAL) at $4,000 \times 6\text{ KB} = 24,000\text{ KB/s} \approx 23.44\text{ MB/s}$ ($187.5\text{ Mbps}$).
>   2. If the cross-region WAN link throttles to $100\text{ Mbps}$ ($12.5\text{ MB/s}$) for $12\text{ seconds}$ right before the primary region suffers a catastrophic power outage, replication lag accumulates at $(23.44 - 12.5) \times 12\text{ s} = 131.3\text{ MB}$ of un-shipped WAL!
>   3. Forcing an immediate hard failover (`FORCE_ALLOW_DATA_LOSS`) orphans $\frac{131.3\text{ MB}}{6\text{ KB/tx}} \approx 22,400\text{ committed transactions}$!
> - **What-If Sensitivity**: For Tier-0 financial ledgers where losing *even one* committed transaction violates regulatory law, you must either use **3-Region Synchronous Paxos/Raft Quorum** (e.g., `us-east-1`, `us-east-2`, `us-central-1` within `12ms` RTT) OR queue unresolved edge intents in durable multi-region storage before returning HTTP `202 Accepted`.
