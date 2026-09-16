# The Idempotent Consumer Pattern: De-duplication Architecture

> "Because message brokers only guarantee At-Least-Once delivery, every consumer in an enterprise architecture must be mathematically idempotent."

---

## 1. The Physics of Duplicate Delivery

In distributed messaging, message duplication occurs in standard, non-exceptional conditions:
1. **Consumer Crash After Processing**: A worker processes an order, bills the customer, but crashes right before sending the ACK to the broker.
2. **Network Timeout on ACK**: The worker sends the ACK, but a router drops the TCP packet. The broker's lock timer expires and the broker re-dispatches the message to a different worker.
3. **Partition Rebalancing**: In Kafka or RabbitMQ clusters, consumer group rebalancing redistributes partitions, causing uncommitted offsets to be re-read.

Therefore, an application must never assume a message arrives only once.

---

## 2. Architectural Deduplication Strategies

```text
┌────────────────────────────────┬─────────────────────────────────────────────────┐
│ Strategy                       │ Principal Evaluation & Trade-Offs               │
├────────────────────────────────┼─────────────────────────────────────────────────┤
│ 1. Natural Domain Idempotency  │ BEST PRACTICE. Update operations designed as    │
│    (State Invariants)          │ state machines: `UPDATE Orders SET Status='Paid'│
│                                │ WHERE Id=@Id AND Status='Pending'`. Executing it│
│                                │ 10 times results in 1 state change.             │
├────────────────────────────────┼─────────────────────────────────────────────────┤
│ 2. Relational Deduplication    │ Strongest consistency. Insert unique `MessageId`│
│    Table (Inbox Pattern)       │ into `ProcessedMessages` table in same DB       │
│                                │ transaction as the business operation. Duplicate│
│                                │ throws unique constraint violation.             │
├────────────────────────────────┼─────────────────────────────────────────────────┤
│ 3. Redis Sliding Window Lock   │ Ultra-fast (<1ms). `SET lock:msgId 1 EX 86400 NX`│
│    (Distributed Cache Key)     │ Prevents concurrent processing. Slight risk of  │
│                                │ duplicate work if Redis node fails over.        │
└────────────────────────────────┴─────────────────────────────────────────────────┘
```

---

## 3. High-Performance C# .NET 9 Idempotent Consumer (The Inbox Pattern)

```csharp
public sealed class OrderPlacedConsumer : IConsumer<OrderPlacedEvent>
{
    private readonly AppDbContext _db;
    private readonly ILogger<OrderPlacedConsumer> _logger;

    public OrderPlacedConsumer(AppDbContext db, ILogger<OrderPlacedConsumer> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task Consume(ConsumeContext<OrderPlacedEvent> context)
    {
        var messageId = context.MessageId ?? throw new InvalidOperationException("Missing MessageId");

        // 1. Begin local database transaction
        await using var tx = await _db.Database.BeginTransactionAsync(context.CancellationToken);

        try
        {
            // 2. Atomic Inbox Check via Unique Constraint
            var inboxRecord = new ProcessedInboxMessage
            {
                MessageId = messageId,
                ConsumerType = nameof(OrderPlacedConsumer),
                ProcessedOnUtc = DateTime.UtcNow
            };

            _db.ProcessedInboxMessages.Add(inboxRecord);
            await _db.SaveChangesAsync(context.CancellationToken);
        }
        catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
        {
            // DUPLICATE DETECTED!
            _logger.LogWarning("Duplicate message {MessageId} detected. Skipping execution.", messageId);
            await tx.RollbackAsync(context.CancellationToken);
            return; // ACK immediately to remove from broker
        }

        // 3. Execute Core Business Logic
        await AllocateInventoryAsync(context.Message.OrderId, context.CancellationToken);

        // 4. Commit atomic unit of work
        await tx.CommitAsync(context.CancellationToken);
    }
}
```

---

## 4. Formal & Verified References

* [Enterprise Integration Patterns: Idempotent Receiver](https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html)
* [MassTransit Documentation: Outbox & Inbox Deduplication](https://masstransit.io/documentation/configuration/middleware/outbox)
* [Martin Fowler: Idempotent Consumer Pattern](https://martinfowler.com/articles/patterns-of-distributed-systems/idempotent-receiver.html)
