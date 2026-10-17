# 06 — Backfilling Billion-Row Tables Without Lock Escalation or Replica Lag

> "In SQL Server, acquiring 5,000 row/page locks in a single statement triggers Lock Escalation, converting fine-grained row locks into an Exclusive (`X`) Table Lock that halts the entire table."

---

## 1. The Mechanics of Lock Escalation & Transaction Log Bloat

> 📐 **Derive It (Fermi Mode): Batch Size vs. Lock Escalation & WAL/Log Flush Rate**
> - **Inputs**: `TotalRows = 1000000000`, `SafeBatchSize = 2500`, `RowBytesModified = 120`, `TargetLogThroughputMBps = 30`, `BatchDurationMs = 25`
> - **Formula**: `BatchesPerSec = (TargetLogThroughputMBps * 1024 * 1024) / (SafeBatchSize * RowBytesModified)`
> - **Step-by-Step**:
>   1. **Lock Escalation Ceiling**: SQL Server escalates to an `X` table lock at $\sim 5,000$ locks per HoBT (Heap or B-Tree). Setting `SafeBatchSize = 2,500` rows guarantees we stay well below `5,000` locks even when updating 1 nonclustered index alongside the clustered key!
>   2. **WAL / Transaction Log Generation**: Each batch of `2,500` rows writes $2,500 \times 120\text{ B} = 300\text{ KB}$ of log records.
>   3. To cap transaction log shipping / read-replica redo bandwidth at $30\text{ MB/s}$ (leaving $70\%$ headroom for live traffic), max batches/sec = $\frac{30\text{ MB/s}}{0.3\text{ MB/batch}} = 100\text{ batches/s}$ ($250,000\text{ rows/sec}$).
>   4. Total time to backfill $1\text{ billion rows}$ safely at $250,000\text{ rows/s}$: $\frac{10^9}{250,000} = 4,000\text{ seconds} \approx 66.7\text{ minutes}$ with **zero lock escalation** and **zero read-replica lag**!
> - **What-If Sensitivity**: If you run `UPDATE Orders SET ...` in batches of `100,000` rows, each batch acquires $>100,000$ locks -> immediate Table Lock Escalation + $30\text{ MB}$ synchronous commit stall!

---

## 2. Production Keyset-Paginated & Lag-Throttled C# Backfill Worker

```csharp
using System;
using System.Data;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;

namespace PrincipalJourney.DataEvolution;

public sealed class AdaptiveBackfillOrchestrator(
    string connectionString,
    ILogger<AdaptiveBackfillOrchestrator> logger)
{
    private const int SafeBatchSize = 2_500; // Strictly < 5,000 SQL Server lock escalation threshold

    public async Task ExecuteBackfillAsync(long startOrderId, long maxOrderId, CancellationToken ct)
    {
        long currentCursorId = startOrderId;

        const string batchUpdateSql = @"
            SET DEADLOCK_PRIORITY LOW; -- Always sacrifice backfill worker if contention occurs with live checkout!
            SET LOCK_TIMEOUT 1000;

            UPDATE TOP (@BatchSize) o
            SET o.ShippingTier = CASE WHEN o.TotalAmount >= 100 THEN 'EXPRESS' ELSE 'STANDARD' END
            FROM dbo.Orders o WITH (ROWLOCK) -- Hint ROWLOCK and stay < 2,500 rows
            WHERE o.OrderId > @CursorId
              AND o.OrderId <= @UpperBoundId
              AND o.ShippingTier IS NULL;";

        while (currentCursorId < maxOrderId && !ct.IsCancellationRequested)
        {
            long upperBoundId = Math.Min(currentCursorId + SafeBatchSize, maxOrderId);

            await using var conn = new SqlConnection(connectionString);
            await conn.OpenAsync(ct);

            // 1. Check AlwaysOn Replica Redo Queue Lag before firing next batch
            long redoQueueKb = await conn.ExecuteScalarAsync<long?>(
                @"SELECT COALESCE(MAX(redo_queue_size), 0) FROM sys.dm_hadr_database_replica_states WHERE is_local = 0;") ?? 0;

            if (redoQueueKb > 50_000) // > 50 MB replica lag: throttle back automatically!
            {
                logger.LogWarning("Replica redo queue at {RedoKb} KB; pausing backfill for 2s...", redoQueueKb);
                await Task.Delay(TimeSpan.FromSeconds(2), ct);
                continue;
            }

            // 2. Execute bounded keyset range update
            int rowsAffected = await conn.ExecuteAsync(new CommandDefinition(
                batchUpdateSql,
                new { BatchSize = SafeBatchSize, CursorId = currentCursorId, UpperBoundId = upperBoundId },
                commandTimeout: 5,
                cancellationToken: ct));

            currentCursorId = upperBoundId;

            // Yield brief breathing room for OLTP log flushes
            await Task.Delay(TimeSpan.FromMilliseconds(15), ct);
        }
    }
}
```
