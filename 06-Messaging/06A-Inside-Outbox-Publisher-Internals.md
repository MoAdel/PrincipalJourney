# Inside Outbox Publisher Internals: Polling vs CDC & Lock Contention

> "A naive outbox poller executes `SELECT * FROM Outbox` every 500ms, destroying database buffer pools and creating massive lock contention. A Principal Architect uses non-blocking row locks or Change Data Capture."

---

## 1. High-Performance SQL Query: `READPAST` & `SKIP LOCKED`

When multiple instances of an Outbox Worker run concurrently to dispatch messages, they must not block each other or lock user transactions:

### SQL Server: `WITH (UPDLOCK, READPAST)`
```sql
-- SQL Server High-Throughput Batch Claim
WITH CTE AS (
    SELECT TOP (@BatchSize) Id, EventType, Payload
    FROM OutboxMessages WITH (UPDLOCK, READPAST)
    WHERE ProcessedOnUtc IS NULL
    ORDER BY CreatedOnUtc ASC
)
UPDATE CTE
SET ProcessedOnUtc = SYSUTCDATETIME()
OUTPUT inserted.Id, inserted.EventType, inserted.Payload;
```
* `UPDLOCK`: Places update locks on selected rows so other workers skip them.
* `READPAST`: Skips rows currently locked by other concurrent transactions, eliminating blocking!

### PostgreSQL: `FOR UPDATE SKIP LOCKED`
```sql
-- PostgreSQL Equivalent
SELECT id, event_type, payload
FROM outbox_messages
WHERE processed_on_utc IS NULL
ORDER BY created_on_utc ASC
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

---

## 2. Polling Publisher vs Change Data Capture (CDC)

```text
┌───────────────────────────┬─────────────────────────────┬───────────────────────────┐
│ Feature                   │ Polling Publisher (Worker)  │ Change Data Capture (CDC) │
├───────────────────────────┼─────────────────────────────┼───────────────────────────┤
│ Mechanism                 │ Background worker queries   │ Debezium / Kafka Connect  │
│                           │ DB table periodically.      │ tails DB transaction log. │
│ Latency                   │ 100ms - 1,000ms (Poll interval)│ < 50ms (Near real-time) │
│ Database CPU Impact       │ Constant read overhead      │ Minimal (Reads WAL log)   │
│ Operational Complexity    │ Very Low (Pure C# code)     │ High (Requires Kafka/Debezium)│
│ Best For                  │ Low to Moderate throughput  │ High throughput (>10k/sec)│
│                           │ (< 5,000 msgs/sec)          │ enterprise platforms      │
└───────────────────────────┴─────────────────────────────┴───────────────────────────┘
```

---

## 3. High-Throughput C# .NET 9 Background Service Implementation

```csharp
public sealed class OutboxPublisherWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IMessageBusSender _busSender;
    private readonly ILogger<OutboxPublisherWorker> _logger;

    public OutboxPublisherWorker(
        IServiceScopeFactory scopeFactory, 
        IMessageBusSender busSender, 
        ILogger<OutboxPublisherWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _busSender = busSender;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var messagesPublished = await PublishBatchAsync(stoppingToken);
                
                // Adaptive backoff: if no work was found, sleep 500ms; if work was found, loop immediately
                if (messagesPublished == 0)
                {
                    await Task.Delay(500, stoppingToken);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Error occurred while executing Outbox batch dispatch.");
                await Task.Delay(2000, stoppingToken);
            }
        }
    }

    private async Task<int> PublishBatchAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // 1. Claim batch with non-blocking row locks
        var messages = await db.OutboxMessages
            .FromSqlInterpolated($"SELECT TOP (50) * FROM OutboxMessages WITH (UPDLOCK, READPAST) WHERE ProcessedOnUtc IS NULL ORDER BY CreatedOnUtc ASC")
            .ToListAsync(ct);

        if (messages.Count == 0) return 0;

        foreach (var msg in messages)
        {
            // 2. Publish to AMQP Broker
            await _busSender.PublishAsync(msg.EventType, msg.Payload, ct);
            msg.ProcessedOnUtc = DateTime.UtcNow;
        }

        // 3. Mark processed in SQL
        await db.SaveChangesAsync(ct);
        return messages.Count;
    }
}
```

---

## 4. Formal & Verified References

* [Debezium: Reliable Change Data Capture for Transactional Outbox](https://debezium.io/documentation/reference/stable/configuration/outbox-event-router.html)
* [Microsoft Learn: SQL Server Locking Hints (READPAST & UPDLOCK)](https://learn.microsoft.com/en-us/sql/t-sql/queries/hints-transact-sql-table)
* [PostgreSQL Documentation: The Locking Clause (SKIP LOCKED)](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
