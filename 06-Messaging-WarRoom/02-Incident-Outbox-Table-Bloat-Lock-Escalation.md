# Incident 02: The Transactional Outbox Polling Lock-Escalation Meltdown

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: SQL Server 2022 / ASP.NET Core 9 Order Service + Outbox Relay Worker  
> **Business Impact**: `INSERT INTO OutboxMessages` during customer checkout blocked for 15s (`LCK_M_IX`); 62% checkout failure rate  
> **Competencies Mastered**: Transactional Outbox Indexing, `UPDLOCK, READPAST, ROWLOCK` Concurrent Polling, Clustered Index Hotspotting, Partitioned Cleanup vs. `DELETE` Lock Escalation

---

## 🚨 1. The 11:30 AM Crisis Briefing

Six weeks after launching the **Transactional Outbox Pattern**, customer checkouts (`INSERT INTO Orders` + `INSERT INTO OutboxMessages`) began timing out every 60 seconds:

```text
[11:30:02] Checkout Alert: SQL CommandTimeout on INSERT INTO OutboxMessages (WaitType: LCK_M_IX)!
[11:30:18] RED HERRING: Storage Admin says "Disk latency is only 0.4ms; the network between AKS and SQL must be dropping packets!"
[11:31:00] DBA Triage: OutboxMessages table has 48,000,000 processed rows; Hourly Cleanup Job is holding an Exclusive (X) Table Lock!
```

> 📐 **Derive It (Fermi Mode): Unindexed Outbox Polling Scan + Cleanup Lock Escalation**
> - **Inputs**: `OutboxRows = 48000000`, `RowSizeBytes = 1024`, `DeleteBatchRows = 500000`, `LockEscalationThreshold = 5000`
> - **Formula**: `TableSizeGB = (OutboxRows * RowSizeBytes) / (1024 * 1024 * 1024)`
> - **Step-by-Step**:
>   1. Over 6 weeks at `15 msg/sec`, `OutboxMessages` accumulated $48,000,000$ rows ($\approx 45.7\text{ GB}$) with `ProcessedAtUtc IS NOT NULL`.
>   2. First, the Outbox Relay polled `SELECT TOP 100 * FROM OutboxMessages WHERE ProcessedAtUtc IS NULL ORDER BY CreatedAtUtc` every `250ms` **without a filtered index** (`WHERE ProcessedAtUtc IS NULL`), scanning millions of processed pages!
>   3. Second, an hourly cleanup job ran `DELETE FROM OutboxMessages WHERE ProcessedAtUtc < DATEADD(day, -7, GETUTCDATE())`, touching `500,000` rows in one transaction. Crossing `5,000` row locks triggered **SQL Server Lock Escalation to an Exclusive (`X`) Table Lock**, blocking 100% of live checkout `INSERT`s for 28 seconds!
> - **What-If Sensitivity**: Adding a **Filtered Index (`WHERE ProcessedAtUtc IS NULL`)** reduces the active B-Tree to **only the 50–200 unprocessed rows in flight (`< 64 KB` in RAM!)**, and chunking deletes to `TOP (2500)` (or switching partitions) keeps lock count strictly below `5,000` (`0ms` checkout blocking)!

<!-- TELEMETRY_WIDGET: title="Outbox Lock Escalation & Checkout Freeze" metric1="Checkout INSERT Latency (ms)" metric2="Active Outbox Row Locks" threshold="5000 Lock Escalation Ceiling" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Identify the exact blocker session and lock mode on OutboxMessages
sqlcmd -S sql-prod -U sa -P "$SA_PASS" -Q "
SELECT blocking_session_id, wait_type, wait_time, resource_description
FROM sys.dm_os_waiting_tasks WHERE wait_type LIKE 'LCK%';"

# Step 2: Check index size and missing filtered index on OutboxMessages
sqlcmd -S sql-prod -U sa -P "$SA_PASS" -Q "
EXEC sp_spaceused 'dbo.OutboxMessages';"
```

### Observed Culprit SQL Snippet
```sql
-- ❌ ANTI-PATTERN 1: Unfiltered index includes 48M already-processed rows!
CREATE INDEX IX_Outbox_CreatedAt ON OutboxMessages (CreatedAtUtc);

-- ❌ ANTI-PATTERN 2: Unbounded DELETE escalates to Exclusive (X) Table Lock!
DELETE FROM OutboxMessages WHERE ProcessedAtUtc < DATEADD(day, -7, SYSUTCDATETIME());
```

<!-- PREDICT_GATE: Commit your hypothesis: Why did network/disk metrics look idle (0.4ms) while `INSERT`s timed out at 15s, and how do Filtered Indexes + `READPAST` + chunked deletes make Outbox overhead zero? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. Why Filtered Indexes (`WHERE ProcessedAtUtc IS NULL`) Are Mandatory for Outboxes
* An Outbox table is `99.999%` historical processed rows and `0.001%` active pending rows.
* A standard index on `(ProcessedAtUtc, CreatedAtUtc)` still maintains B-Tree leaf nodes for all 48M processed rows.
* A **Filtered Index (`WHERE ProcessedAtUtc IS NULL`)** in SQL Server (or **Partial Index** in PostgreSQL) physically removes the entry from the B-Tree the instant `SET ProcessedAtUtc = SYSUTCDATETIME()` commits! The index stays permanently tiny (`< 10 pages`), fitting entirely in L2/L3 cache!

### 2. Multi-Worker Concurrency with `WITH (UPDLOCK, ROWLOCK, READPAST)`
* When multiple Outbox relay pods poll concurrently, `WITH (UPDLOCK, ROWLOCK, READPAST)` (or `FOR UPDATE SKIP LOCKED` in PostgreSQL) locks the 100 claimed rows at the row level and causes competing workers to **skip over locked rows instantly without waiting**!

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```sql
-- 1. Create Filtered Index containing ONLY unprocessed messages (permanently < 1MB!)
CREATE NONCLUSTERED INDEX IX_OutboxMessages_Unprocessed
ON dbo.OutboxMessages (CreatedAtUtc ASC)
INCLUDE (Id, EventType, PayloadJson, TraceParent)
WHERE ProcessedAtUtc IS NULL;

-- 2. Concurrent Lock-Free Polling Claim Query (SQL Server)
WITH NextBatch AS (
    SELECT TOP (100) Id, EventType, PayloadJson, TraceParent, ProcessedAtUtc
    FROM dbo.OutboxMessages WITH (UPDLOCK, ROWLOCK, READPAST)
    WHERE ProcessedAtUtc IS NULL
    ORDER BY CreatedAtUtc ASC
)
UPDATE NextBatch
SET ProcessedAtUtc = SYSUTCDATETIME()
OUTPUT INSERTED.Id, INSERTED.EventType, INSERTED.PayloadJson, INSERTED.TraceParent;

-- 3. Safe Non-Escalating Chunked Retention Purge (< 5,000 locks)
SET DEADLOCK_PRIORITY LOW;
DELETE TOP (2500) FROM dbo.OutboxMessages WITH (ROWLOCK)
WHERE ProcessedAtUtc < DATEADD(day, -3, SYSUTCDATETIME());
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (Unfiltered Index + Bulk Delete) | After (Filtered Index + `READPAST` + `TOP 2500` Purge) | Validation & Rollback Procedure |
|---|---|---|---|
| **Outbox Poll Logical Reads** | `612,000 pages` (`4.8 GB` scanned/poll) | **`3 pages`** (`24 KB` in-memory seek) | Verify `SET STATISTICS IO ON` reads `< 10` pages at 50M rows. |
| **Checkout `INSERT` Blocking during Purge** | `28,000 ms` (`LCK_M_IX` timeout) | **`0.0 ms`** (Zero lock escalation) | Run purge loop concurrently with 2,000 RPS checkout benchmark. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why don't we just `DELETE` the Outbox row immediately as soon as the relay publishes it to RabbitMQ, instead of setting `ProcessedAtUtc`?"*

**The Principal Defense**:
> *"Deleting rows immediately solves table size, or keeping a 48-hour retention window with **Daily Sliding Window Partitioning (`ALTER TABLE SWITCH PARTITION` + `TRUNCATE TABLE WITH (PARTITIONS (1))`)** gives us the best of both worlds: we retain 48 hours of published payload history for debugging broker losses, and dropping 10 million old rows via `TRUNCATE PARTITION` is a `2ms` metadata operation with zero row locks and zero transaction log bloat!"*

### Question 2 (The Second-Order Failure Mode):
> *"In the `WITH NextBatch AS (...) UPDATE NextBatch SET ProcessedAtUtc = SYSUTCDATETIME()` query above, what happens if the pod crashes 5 milliseconds AFTER committing the `UPDATE` but BEFORE publishing the `OUTPUT` messages to RabbitMQ?"*

**The Principal Defense**:
> *"Great catch! Marking `ProcessedAtUtc` *before* broker ACK converts `At-Least-Once` into `At-Most-Once`! In production, either: (A) Hold the SQL transaction (`UPDLOCK, READPAST`) open across the `1–2ms` broker publish and commit `ProcessedAtUtc` *after* broker `BasicAck`, OR (B) Use a two-phase lease column (`LockedUntilUtc = DATEADD(second, 30, SYSUTCDATETIME())`) and only set `ProcessedAtUtc` after broker confirmation!"*

### Question 3 (The FinOps / Cost Axis):
> *"Storing `PayloadJson` (`NVARCHAR(MAX)`) for 10M messages/day in Enterprise SQL Server costs $3,200/month in licensed vCore IOPS and storage. Defend the 80%-good optimization."*

**The Principal Defense**:
> *"Never store uncompressed pretty-printed JSON in high-throughput Outbox tables. Compressing the payload using **GZip / Brotli (`COMPRESS(PayloadJson)` or `VARBINARY(MAX)`)** + aggressive 24-hour partition truncation cuts Outbox storage and WAL IOPS by **82%**, saving $2,600/month on the existing SQL license."*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-0602 — Transactional Outbox Lock-Escalation Meltdown

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 2 minutes | **Mitigation Latency (TTM)**: 11 minutes

## Five Whys Root Cause Chain
1. **Why did 62% of checkouts fail?** -> `INSERT INTO OutboxMessages` timed out waiting for an `IX` table lock.
2. **Why could `INSERT` not acquire an `IX` table lock?** -> The hourly cleanup job held an incompatible `X` (Exclusive) table lock.
3. **Why did the cleanup job acquire a Table Lock?** -> `DELETE WHERE ProcessedAtUtc < ...` modified 500,000 rows in one statement, crossing the 5,000-lock escalation threshold.
4. **Why was database CPU already at 85% before the delete?** -> The relay polled every 250ms without a filtered index (`WHERE ProcessedAtUtc IS NULL`).
5. **Why did network/storage look innocent?** -> Logical reads (in-memory buffer pool scans) and lock waits consume zero physical disk IOPS.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Deploy Filtered Index `WHERE ProcessedAtUtc IS NULL` + `TOP (2500)` chunked purge | Order Team | Query plan test asserts `Index Seek` on filtered index |
| P1 | Disable Table Lock Escalation on `OutboxMessages` (`ALTER TABLE SET (LOCK_ESCALATION = DISABLE)`) | DBA | Schema migration applied |
```
