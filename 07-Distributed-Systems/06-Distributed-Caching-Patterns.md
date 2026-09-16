# Distributed Caching Strategies & Invalidation Patterns

> "There are only two hard things in Computer Science: cache invalidation and naming things."
> — Phil Karlton

---

## 1. The 5 Core Caching Topologies

```text
┌─────────────────────────┬────────────────────────────────────────────────────────┐
│ Pattern                 │ Architectural Flow & Characteristics                   │
├─────────────────────────┼────────────────────────────────────────────────────────┤
│ 1. Cache-Aside          │ Application manages both DB and Cache explicitly.      │
│    (Lazy Loading)       │ Read: Check Cache -> Miss -> Read DB -> Populate Cache.│
│                         │ Write: Update DB -> Evict / Invalidate Cache Key.      │
├─────────────────────────┼────────────────────────────────────────────────────────┤
│ 2. Read-Through         │ Application treats Cache as primary store. Cache engine│
│                         │ automatically loads data from DB on a cache miss.      │
├─────────────────────────┼────────────────────────────────────────────────────────┤
│ 3. Write-Through        │ Application writes to Cache. Cache synchronously writes│
│                         │ to DB before acknowledging write. High write latency.  │
├─────────────────────────┼────────────────────────────────────────────────────────┤
│ 4. Write-Behind         │ Application writes to Cache. Cache buffers writes and  │
│    (Write-Back)         │ asynchronously flushes to DB in batches. Extreme risk  │
│                         │ of data loss if cache node crashes before flush!       │
├─────────────────────────┼────────────────────────────────────────────────────────┤
│ 5. Refresh-Ahead        │ Cache engine automatically refreshes keys approaching  │
│                         │ expiration based on read access frequency algorithms.  │
└─────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 2. Invalidation: Update Cache vs Evict Key?

When modifying database state, should the application update the cache value or evict the key?

```csharp
// ANTI-PATTERN: Updating the cache directly after DB update
await _db.Orders.UpdateAsync(order);
await _cache.SetAsync(cacheKey, order); // DANGEROUS! RACE CONDITION!
```

### Why Updating the Cache Fails (The Concurrency Race)
Imagine two concurrent requests modifying the same order:
1. **Thread 1** writes update `Status = Shipped` to SQL.
2. **Thread 2** writes update `Status = Delivered` to SQL.
3. Due to network scheduling, **Thread 2** updates the cache first (`Delivered`).
4. **Thread 1**'s delayed network packet arrives and updates the cache second (`Shipped`).
5. **Result**: SQL contains `Delivered`, but Redis permanently contains stale `Shipped`!

### The Principal Rule: Always Evict (`DEL`)
```csharp
// PRINCIPAL STANDARD: Atomic Invalidation
await _db.SaveChangesAsync(ct);
await _cache.KeyDeleteAsync(cacheKey); // Evict! Next read pulls fresh authoritative SQL state.
```

---

## 3. Formal & Verified References

* [Azure Architecture Center: Cache-Aside Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside)
* [Martin Fowler: Two Hard Things in Computer Science](https://martinfowler.com/bliki/TwoHardThings.html)
* [Redis Documentation: Client-side Caching & Invalidation](https://redis.io/docs/latest/develop/use/client-side-caching/)
