# Incident 01: The 20-Million-Row TempDB Sort Spill

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Microsoft SQL Server 2022 Enterprise / Azure SQL Managed Instance (32 vCores, 128GB RAM)  
> **Business Impact**: Database IOPS throttled at 20,000/20,000; TempDB disk space at 98%; p99 search latency jumps from 12ms to 38,500ms  
> **Competencies Mastered**: Execution Plan Reading, Cost-Based Optimizer, Cardinality Mismatch, Workspace Memory Grants, Sort Spills Level 1 & 2

---

## 🚨 1. The 03:00 AM Crisis Briefing

At 02:45 AM, an offshore merchant inventory synchronization job triggers:

```http
GET /api/v1/merchants/8421/orders/export?startDate=2026-01-01&status=Shipped
```

Within 90 seconds, Azure Monitor fires a critical alert:

```text
[02:46:12] SQL Server Warning: tempdb data file size increased by 42 GB in 60 seconds!
[02:46:30] Storage Alert: Disk Write Queue Length: 114. IOPS throttled at 100% capacity.
[02:46:48] Alert: Worktable & Sort Warning: Sort spilled to tempdb (Level 2). Pages written: 4,120,500.
[02:47:05] Customer Order Placement API p99 latency spikes from 15ms to 42,000ms!
```

The Lead DBA awakens in a panic:
> *"TempDB is almost completely full! The disk is thrashing. Someone is running a massive sorting query that spilled millions of pages into tempdb. Kill the session!"*

You check `sys.dm_exec_requests` and see:
```text
session_id: 92 | wait_type: IO_COMPLETION | granted_memory_kb: 1,024 KB | ideal_memory_kb: 4,800,000 KB
Query: SELECT OrderId, CustomerId, TotalAmount, CreatedAt FROM Orders 
       WHERE MerchantId = @p0 AND Status = @p1 
       ORDER BY CreatedAt DESC;
```

---


> 📐 **Derive It (Fermi Mode): Incident Capacity & Blast-Radius Math**
> - **Inputs**: `PeakRPS = 2500`, `DegradedHoldTimeMs = 1200`, `ResourceCeiling = 1000`
> - **Formula**: `InFlightSaturation = PeakRPS * (DegradedHoldTimeMs / 1000)`
> - **Step-by-Step**:
>   1. By Little's Law ($L = \lambda \times W$), $2,500\text{ RPS} \times 1.2\text{ s} = 3,000\text{ concurrent resources demanded}$.
>   2. Because $3,000 > 1,000$ (`ResourceCeiling`), the saturation queue grows at $+2,000\text{ items/sec}$, exhausting host capacity in $< 2\text{ seconds}$.
> - **What-If Sensitivity**: Reduce `DegradedHoldTimeMs` from `1200ms` to `4ms` via the Principal Refactor below — concurrency drops to $2,500 \times 0.004 = 10$ ($1.0\%$ utilization)!

<!-- TELEMETRY_WIDGET: title="01-Incident-TempDb-Sort-Spill" metric1="Primary Latency (ms)" metric2="Resource Saturation (%)" threshold="Critical SLA Ceiling" -->

---

## 🔍 2. Diagnostic Investigation

Analyze the execution plan and index definition:

```sql
-- Existing Index on Orders:
CREATE NONCLUSTERED INDEX IX_Orders_MerchantId ON Orders (MerchantId);

-- Query executed:
SELECT OrderId, CustomerId, TotalAmount, CreatedAt 
FROM Orders 
WHERE MerchantId = 8421 AND Status = 'Shipped'
ORDER BY CreatedAt DESC;
```

### The Fatal Execution Plan:
1. **Index Seek** on `IX_Orders_MerchantId`.
2. **Key Lookup** on `PK_Orders` for `Status`, `TotalAmount`, and `CreatedAt` (450,000 rows!).
3. **Cardinality Estimation Error**: The optimizer estimated **120 rows** would match `Status = 'Shipped'` based on old statistics. It granted only **1,024 KB of workspace memory**.
4. **Sort Operator**: The query actually returned **450,000 rows** requiring **850 MB of memory**!
5. **The Spill**: Because the granted memory (1 MB) was far smaller than the actual data (850 MB), the engine had to write and re-read the intermediate sort runs to physical disk in `tempdb` (**Level 2 Sort Spill**), choking the entire storage controller!

---


<!-- PREDICT_GATE: Commit your root-cause hypothesis from the diagnostic evidence above before unlocking Section 3 (Deep Engine Internals). -->

## ⚙️ 3. Deep Engine Internals: Why it Happened

### 1. Memory Grants are Fixed at Compile Time
* When a query requires an in-memory Sort or Hash operation, it requests a **Memory Grant** *before* execution begins.
* The memory grant size is calculated solely based on **Estimated Rows $\times$ Estimated Row Size**.
* Once execution begins, the engine **cannot dynamically expand the memory grant**! If rows exceed the grant, it is forced to spill to `tempdb`.

### 2. Physical Sort Elimination via B-Trees
* Relational engines do not need to sort in memory if the data is **already physically stored in the requested sort order**!
* An index defined with `(MerchantId, Status, CreatedAt DESC)` allows the storage engine to navigate the B-Tree leaf pages sequentially, streaming rows directly in `CreatedAt DESC` order with **zero memory grant, zero sort operator, and zero tempdb usage**!

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

### The Refactored Solution:

```sql
-- 1. Create a composite covering index that provides physical sort order:
CREATE NONCLUSTERED INDEX IX_Orders_Merchant_Status_CreatedAt
ON Orders (MerchantId, Status, CreatedAt DESC)
INCLUDE (CustomerId, TotalAmount);

-- 2. Update column statistics with full scan:
UPDATE STATISTICS Orders IX_Orders_Merchant_Status_CreatedAt WITH FULLSCAN;
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (The Incident) | After (B-Tree Seek Refactor) | Validation & Rollback Procedure |
|---|---|---|---|
| **Query Latency** | **42,000 ms** (Disk Throttled) | **3.8 ms (Instantaneous)** | Validate in canary shadow traffic for 30m; rollback via feature flag if p99 regresses > 10%. |
| **TempDB Disk Spills** | 4,120,500 Pages (~33 GB) | **0 Pages (0 Bytes)** | Validate in canary shadow traffic for 30m; rollback via feature flag if p99 regresses > 10%. |
| **Workspace Memory Grant** | 1,024 KB (Under-allocated) | **0 KB (Streaming; No Sort Needed)** | Validate in canary shadow traffic for 30m; rollback via feature flag if p99 regresses > 10%. |
| **Logical Reads** | 452,000 Reads (Key Lookups) | **1,250 Reads (Covering Seek)** | Validate in canary shadow traffic for 30m; rollback via feature flag if p99 regresses > 10%. |

---

## 🛡️ 5. The Socratic Duel

### Question 1 (The DBA):
> *"Why not just increase the minimum query memory grant database-wide to 50 MB using `sp_configure 'min memory per query'`?"*

**The Principal Defense**:
> *"Increasing minimum query memory grant database-wide is catastrophic for an OLTP workload. If every simple query is forced to allocate 50 MB of memory, our server will exhaust its total query workspace memory when only 50 concurrent requests arrive, forcing all subsequent requests into `RESOURCE_SEMAPHORE` wait queues. We solve memory grant issues by designing covering indexes that eliminate sort operators, not by wasting gigabytes of RAM on bad plans."*

---


### Question (The FinOps / Cost Axis):
> *"A vendor or team proposed throwing 10x hardware / enterprise cluster licensing ($18,000/month) at this problem instead of refactoring the architecture. Defend the 80%-good / Principal mechanical fix."*

**The Principal Defense**:
> *"Scaling hardware vertically against a non-linear mechanical bottleneck (lock escalation, LOH fragmentation, or $O(N^2)$ scans) burns $216,000/year while only delaying the crash by minutes under peak load. The refactoring above eliminates the root allocation/locking contention at **$0/month additional infrastructure cost**, improving efficiency by two orders of magnitude."*

---

## 📜 6. The Executive Deliverable: ADR-001

```markdown
# ADR-001: Mandatory Covering Sort Indexes on High-Volume Exports

## Context
A SEV-1 outage occurred when an unindexed order export spilled 33GB into tempdb, exhausting storage IOPS.

## Decision
1. All queries involving `ORDER BY` on tables exceeding 500,000 rows must be supported by an index whose key column sequence matches the query's sort order.
2. Projection columns must be placed in the `INCLUDE` clause to eliminate Key Lookups.
3. Enforce automated CI linting checking execution plans for Sort Spills.

## Consequences
- **Positive**: Complete elimination of tempdb sort spills; query latency reduced from 42s to 3ms.
- **Negative**: Adds ~40MB index storage overhead per 1M rows.
```
