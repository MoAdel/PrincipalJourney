# 04 — Active-Active (Tenant-Pinned Cells) vs. Active-Passive Topologies

> "True multi-master Active-Active where any region can mutate the exact same row concurrently is a distributed systems trap.95% of companies that claim 'Active-Active' actually run **Tenant-Pinned Sharded Active-Active**."

---

## 1. The Three Multi-Region Patterns Compared

```text
PATTERN A: Active-Passive (Warm Standby)
  [Region 1: US-East (100% R/W)] ──(Async WAL Stream)──► [Region 2: US-West (Read-Only Standby)]

PATTERN B: Tenant-Pinned Active-Active (Cell Architecture — Principal Recommended!)
  • US Customers ──► [Region 1: US-East (100% R/W for US Tenants)] ──(Async DR Backup)──► [Region 2]
  • EU Customers ──► [Region 2: EU-West (100% R/W for EU Tenants)] ──(Async DR Backup)──► [Region 1]
  (Both regions are ACTIVE at 100%, but each tenant has a SINGLE deterministic home write region!)

PATTERN C: Multi-Master Global Active-Active (Any Row, Any Region)
  [Region 1 (R/W)] ◄══(CRDT / LWW Conflict Resolution OR 80ms Paxos Lock)══► [Region 2 (R/W)]
```

| Evaluation Axis | Pattern A: Active-Passive Warm Standby | Pattern B: Tenant-Pinned Active-Active (Cells) | Pattern C: Multi-Master Unpinned Active-Active | Validation & Rollback |
|---|---|---|---|---|
| **Write Latency** | Fast (`< 5ms` local region) | **Fastest** (`< 5ms` local to tenant's home region) | Either **Slow** (`75ms+` sync Paxos) or **Lossy** (LWW conflicts) | Benchmark $p99$ write latency from US and EU probes. |
| **Split-Brain Conflict Risk** | Low (Only 1 active primary; guarded by lease fencing) | **Zero under normal ops** (Each tenant only writes in 1 home region!) | **Extreme** (Concurrent writes to same key across regions collide) | Chaos partition test between regions during concurrent writes. |
| **Idle Compute Waste** | Medium (`30–50%` standby overhead in Region 2) | **Low** (Both regions serve live production traffic daily!) | Low compute waste, high DB RU/licensing cost | Track regional CPU/RU utilization weekly. |
| **Compliance / Data Residency (GDPR)** | Hard (Single global primary holds all data) | **Native** (EU tenant cell pinned strictly inside EU region) | Hard (Replicates all rows globally) | Automated compliance check verifies EU `TenantId` rows never leave EU storage. |
