# 09 — Hands-On Labs: Zero-Downtime Schema Evolution & Billion-Row Backfills

---


> 📐 **Derive It (Fermi Mode): Capacity, Throughput & Memory Envelope**
> - **Inputs**: `TargetRPS = 2000`, `OperationLatencyMs = 8`, `PayloadKB = 16`
> - **Formula**: `ConcurrentInFlightMemoryMB = (TargetRPS * (OperationLatencyMs / 1000) * PayloadKB) / 1024`
> - **Step-by-Step**:
>   1. Concurrent in-flight operations by Little's Law: $L = 2,000 \times 0.008\text{ s} = 16\text{ active operations}$.
>   2. Steady-state buffer footprint: $16 \times 16\text{ KB} = 256\text{ KB}$ ($0.25\text{ MB}$).
> - **What-If Sensitivity**: If downstream contention degrades `OperationLatencyMs` from `8ms` to `4,000ms`, concurrency spikes $500\times$ to $8,000\text{ in-flight operations}$ ($128\text{ MB}$ + thread/socket exhaustion). Always verify how your lab holds under $10\times$ latency degradation!


## Lab 1: Reproducing and Defeating the `Sch-M` Blocking Chain in SQL Server 2022
1. Start the `principal-sqlserver` container and seed `1,000,000` rows into `dbo.Orders`.
2. In **Terminal 1**, start a transaction holding a shared query lock (`BEGIN TRAN; SELECT COUNT(*) FROM dbo.Orders WITH (HOLDLOCK); WAITFOR DELAY '00:00:45';`).
3. In **Terminal 2**, execute a naive `ALTER INDEX ... REBUILD WITH (ONLINE = ON)`.
4. In **Terminal 3**, execute a simple `SELECT TOP 1 * FROM dbo.Orders WHERE OrderId = 1` — observe that even a single-row point lookup is completely frozen behind Terminal 2's waiting `Sch-M` lock!
5. Inspect `sys.dm_tran_locks` and `sys.dm_os_waiting_tasks` to view the blocking chain.
6. Kill Terminal 2 and re-run with `WAIT_AT_LOW_PRIORITY (MAX_DURATION = 0 MINUTES, ABORT_AFTER_WAIT = SELF)` — verify Terminal 3's point lookups execute in `< 1ms` with zero blocking!

---

## Lab 2: Benchmarking Lock Escalation at 2,500 vs. 10,000 Rows
1. Run an `UPDATE TOP (10000)` inside a transaction and inspect `SELECT resource_type, request_mode, COUNT(*) FROM sys.dm_tran_locks GROUP BY resource_type, request_mode`.
2. Observe the transition from `KEY`/`PAGE` locks to a single `OBJECT` `X` (Exclusive Table) lock once the 5,000-lock threshold is crossed.
3. Run the `AdaptiveBackfillOrchestrator` (`BatchSize = 2,500`, `DEADLOCK_PRIORITY LOW`) while running `k6` checkout traffic (`500 RPS`) — verify `p99` checkout latency remains `< 12ms`.
