# Principal Interview Scenarios — Database Systems Architecture

> **Staff & Principal Technical System Design Interview Scenarios**  
> How to approach complex database design and concurrency challenges during Principal-level interviews.

---

## Scenario 1: The High-Throughput Financial Ledger

### The Prompt:
> *"Design a relational database schema and concurrency model for a digital wallet handling 20,000 financial transfers per second. The system must guarantee strict double-entry bookkeeping (debit must equal credit), never allow an account balance to drop below zero, and survive server crashes with zero data loss."*

### The Principal Solution Architecture:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    IMMUTABLE DOUBLE-ENTRY LEDGER SCHEMA                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Transactions Table:                                                         │
│ • Id (BIGINT IDENTITY / UUIDv7) - Clustered PK                              │
│ • CorrelationId (UUID) - Unique Index for Idempotency                       │
│ • Status (TINYINT: Pending, Posted, Rejected)                               │
│ • CreatedAt (DATETIME2)                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ LedgerEntries Table (Immutable Append-Only):                                │
│ • Id (BIGINT IDENTITY / UUIDv7) - Clustered PK                              │
│ • TransactionId (BIGINT) - FK                                               │
│ • AccountId (BIGINT) - FK                                                   │
│ • Amount (DECIMAL(18,4)) - Positive for Credit, Negative for Debit          │
│ • SequenceNumber (INT)                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Key Architectural Decisions:
1. **The Ledger is Purely Append-Only**:
   - Never update an account balance row in place under high concurrency! Updating `Accounts.Balance = Balance - Amount` locks the account row, creating a massive serialization bottleneck.
   - All balance changes are inserted as **immutable journal entries**.
2. **Current Balance via Snapshot Materialization**:
   - Maintain a materialized `AccountBalances` cache table updated asynchronously via Change Data Capture (CDC) or message queues.
3. **Atomic Verification within Transaction**:
   - When a transfer occurs, use an explicit transaction with **RowVersion / Optimistic Concurrency** or intentional row locks (`SELECT Balance FROM Accounts WITH (UPDLOCK, ROWLOCK) WHERE AccountId = @Id`).
   - Sum of `Amount` for any `TransactionId` must equal `0.0000` (Double-entry validation constraint).

---

## Scenario 2: Multi-Tenant SaaS Database Partitioning

### The Prompt:
> *"We have 15,000 enterprise B2B tenants. 99% are small businesses with 50 orders/day, but 5 enterprise tenants generate 80% of our total database load (100,000 orders/day each). How do you architect the database layer to prevent "noisy neighbor" problems while minimizing operational cost?"*

### The Principal Solution Architecture:

```text
                               ┌─────────────────────────────┐
                               │   TENANT ROUTER MIDDLEWARE  │
                               └──────────────┬──────────────┘
                                              │
                    ┌─────────────────────────┴────────────────────────┐
                    ▼                                                  ▼
      [SHARED MULTI-TENANT POOL]                           [ISOLATED ENTERPRISE PODS]
      • 14,995 Small Tenants                              • 5 Huge "Whale" Tenants
      • Single Database Instance                          • Dedicated Single-Tenant DBs
      • Partitioned by TenantId                           • Dedicated IOPS & CPU
      • Row-Level Security (RLS)                          • Custom Backup / Restore SLAs
```

#### Key Architectural Decisions:
1. **Hybrid Multi-Tenant Model (Pooled + Silo)**:
   - Do NOT create 15,000 separate databases! Managing 15,000 connection pools and running schema migrations across 15,000 databases is an operational nightmare.
   - Use a **Pooled Database** with `TenantId` discriminator column and **Row-Level Security (RLS)** for the 99% of small tenants.
   - For the 5 noisy enterprise giants, route their connections to **Dedicated Silo Databases**.
2. **Dynamic Connection String Resolution**:
   - Application implements `ITenantStore` resolved per HTTP request:
```csharp
public class TenantConnectionFactory
{
    public string GetConnectionString(string tenantId) => tenantId switch
    {
        "tenant-enterprise-walmart" => _config["ConnectionStrings:WalmartDedicated"],
        "tenant-enterprise-target"  => _config["ConnectionStrings:TargetDedicated"],
        _                           => _config["ConnectionStrings:SharedMultiTenantPool"]
    };
}
```

---

## Scenario 3: Hot-Row Inventory Lock Contention

### The Prompt:
> *"During a sneaker flash sale, 50,000 shoppers attempt to purchase a shoe with only 500 units in stock within the first 5 seconds. If every checkout runs `UPDATE Products SET Stock = Stock - 1 WHERE Id = 42`, the database locks up immediately. How do you solve this?"*

### The Principal Solution Architecture:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                 DISTRIBUTED INVENTORY SHARD BUCKETS (SLOTTED)               │
├─────────────────────────────────────────────────────────────────────────────┤
│ ProductInventoryBuckets Table:                                              │
│ • ProductId: 42, BucketId: 0, AvailableStock: 50                            │
│ • ProductId: 42, BucketId: 1, AvailableStock: 50                            │
│ • ProductId: 42, BucketId: 2, AvailableStock: 50                            │
│ ...                                                                         │
│ • ProductId: 42, BucketId: 9, AvailableStock: 50                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ Total Stock: 500 Units split across 10 distinct physical rows!              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Key Architectural Decisions:
1. **Inventory Slot Bucketing**:
   - Instead of a single row representing the stock of Product 42, partition the stock across **10 independent bucket rows**.
   - When a checkout arrives, select a random bucket: `BucketId = Random.Shared.Next(0, 10)`.
   - Update only that specific bucket row!
   - Reduces row lock contention by **90%**!
2. **Redis In-Memory Atomic Reservation**:
   - Alternatively, offload reservation completely to Redis using an atomic Lua script:
```lua
local current = redis.call('GET', KEYS[1])
if tonumber(current) >= tonumber(ARGV[1]) then
    redis.call('DECRBY', KEYS[1], ARGV[1])
    return 1
else
    return 0
end
```
   - Persist reservations to the relational database asynchronously via Kafka / background batches.
