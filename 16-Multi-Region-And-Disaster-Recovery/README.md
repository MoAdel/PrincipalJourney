# Sprint 16: Multi-Region Architecture, Geo-Replication & Disaster Recovery

> **Competency Track**: RPO/RTO Engineering, Active-Active (Tenant-Pinned Cells) vs. Active-Passive, PACELC Cross-Region Replication, Lease Fencing against Split-Brain, Global Anycast Routing, and Automated DR GameDays.

---

## Complete Chapter Navigation Manifest (`01`–`11`)

| # | Chapter | Core Focus |
|---|---|---|
| **01** | [`01-Story.md`](./01-Story.md) | When `us-east-1` Went Dark: Split-Brain Writes, Zombie DNS & Cold-Cache Collapse. |
| **02** | [`02-Learning-Objectives.md`](./02-Learning-Objectives.md) | Principal Multi-Region & DR Competency Matrix. |
| **03** | [`03-Multi-Region-DR-Requirements.md`](./03-Multi-Region-DR-Requirements.md) | Tier-0/1/2 classification, RPO/RTO SLAs, and WAL data-at-risk math (`📐 Derive It`). |
| **04** | [`04-Active-Active-vs-Active-Passive-Topologies.md`](./04-Active-Active-vs-Active-Passive-Topologies.md) | Warm Standby vs. Tenant-Pinned Cells vs. Multi-Master trade-off matrix. |
| **05** | [`05-Cross-Region-Data-Replication-And-PACELC.md`](./05-Cross-Region-Data-Replication-And-PACELC.md) | Consensus Lease & Epoch Fencing in C# to make Split-Brain mathematically impossible. |
| **06** | [`06-Global-Traffic-Routing-And-Failover-Draining.md`](./06-Global-Traffic-Routing-And-Failover-Draining.md) | BGP Anycast L7 Edge vs. DNS TTL traps, `PooledConnectionLifetime`, and failover load shedding. |
| **07** | [`07-Automated-DR-GameDays-And-Chaos-Failover.md`](./07-Automated-DR-GameDays-And-Chaos-Failover.md) | Copy-pasteable 5-step regional evacuation runbook & GameDay scorecard. |
| **08** | [`08-Hands-On-Multi-Region-Labs.md`](./08-Hands-On-Multi-Region-Labs.md) | Simulating network partitions, lease fencing, and DNS socket pooling traps. |
| **09** | [`09-Production-Incident-Post-Mortem.md`](./09-Production-Incident-Post-Mortem.md) | Post-Mortem: Asymmetric Standby Cloud Quota Collapse During Regional Failover. |
| **10** | [`10-Principal-Multi-Region-Defense-Questions.md`](./10-Principal-Multi-Region-Defense-Questions.md) | Speed-of-Light `RPO=0` Board Defense & Standby FinOps Unit Economics. |
| **11** | [`11-Summary.md`](./11-Summary.md) | The 10 Invariant Laws of Multi-Region Architecture. |
