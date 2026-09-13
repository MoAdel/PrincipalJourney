# Incident 05: The GetOrAdd 500-Connection Database Thundering Herd

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: .NET 9 Microservices / PostgreSQL Database Cluster  
> **Business Impact**: Database connection pool exhausted in 2 seconds; primary database CPU hit 100%; 500 duplicate expensive queries executed simultaneously  
> **Competencies Mastered**: `ConcurrentDictionary` Striped Locking, Factory Delegate Concurrency, Thundering Herd (Cache Stampede), Atomic `Lazy<Task<T>>`

---

## 🚨 1. The 03:00 AM Crisis Briefing

At 10:00 AM, Nova Commerce launches a flash discount on the trending "Cyber Sneaker":

```text
[10:00:02] Ingress Traffic: 15,000 requests/sec target GET /api/v1/products/sneaker-42.
[10:00:04] PostgreSQL Alarm: Active database connections surge from 24 to 800 (Pool Exhausted)!
[10:00:06] Database CPU: 100.0% utilization. Lock wait-time spikes to 12,000 ms.
[10:00:15] Web API Logs: System.InvalidOperationException: Timeout expired obtaining connection from pool.
[10:00:20] Customer App: 504 Gateway Timeout across the entire catalog.
```

The database administrator checks active queries:
> *"Why is the database running the exact same query `SELECT * FROM Products WHERE Id = 42` 500 times in parallel?! Don't we have an in-memory cache in front of this?!"*

---

## 🔍 2. Diagnostic Investigation

Inspect the product catalog caching service:

```csharp
public class ProductCacheService
{
    private readonly ConcurrentDictionary<int, ProductDetails> _cache = new();
    private readonly AppDbContext _db;

    public ProductDetails GetProduct(int productId)
    {
        // "ConcurrentDictionary is thread-safe, so this only runs once, right?"
        return _cache.GetOrAdd(productId, id =>
        {
            // FATAL CONCURRENCY MISTAKE: Factory delegate is NOT thread-safe!
            return _db.Products
                .Include(p => p.Discounts)
                .Include(p => p.Reviews)
                .First(p => p.Id == id);
        });
    }
}
```

### The Fatal Flaw:
* In `ConcurrentDictionary<TKey, TValue>`, the factory delegate is **NOT executed under the striped bucket lock**!
* If 500 concurrent threads arrive during a cache miss:
  1. All 500 threads check the dictionary and see the key does not exist.
  2. **All 500 threads execute the factory lambda function simultaneously!**
  3. 500 threads open 500 separate database connections and execute 500 identical heavy queries with joins.
  4. The dictionary picks one result and discards the other 499, but the database has already collapsed!

$$\text{This is the THUNDERING HERD (Cache Stampede) problem caused by misusing ConcurrentDictionary!}$$

---

## ⚙️ 3. Deep Engine Internals: Why it Happened

### Why Doesn't `ConcurrentDictionary` Lock the Delegate?
* If `ConcurrentDictionary` executed the factory delegate under its internal bucket lock, any developer writing slow I/O, database queries, or nested locks inside that delegate would **block all other keys mapping to that bucket lock**.
* More dangerously, if the delegate attempted to read another key from the dictionary, it would cause an immediate **Engine Deadlock**!
* Therefore, the runtime intentionally executes the factory delegate **outside the lock**, guaranteeing dictionary liveness at the cost of duplicate executions under contention.

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

### The Refactored Solution: Atomic `Lazy<Task<T>>` Caching

```csharp
public class ThreadSafeProductCache
{
    // The value stored is a Lazy<Task<T>>!
    private readonly ConcurrentDictionary<int, Lazy<Task<ProductDetails>>> _cache = new();
    private readonly IServiceProvider _serviceProvider;

    public ThreadSafeProductCache(IServiceProvider serviceProvider) => _serviceProvider = serviceProvider;

    public async Task<ProductDetails> GetProductAsync(int productId)
    {
        // 1. GetOrAdd creates a lightweight Lazy wrapper (near-zero allocation)
        var lazyTask = _cache.GetOrAdd(productId, id =>
        {
            return new Lazy<Task<ProductDetails>>(async () =>
            {
                // ONLY ONE THREAD EXECUTES THIS DATABASE CALL!
                using var scope = _serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                return await db.Products
                    .AsNoTracking()
                    .Include(p => p.Discounts)
                    .FirstAsync(p => p.Id == id);
            }, 
            LazyThreadSafetyMode.ExecutionAndPublication // Guarantees single thread execution!
            );
        });

        try
        {
            // 2. All 500 threads await the EXACT SAME Task instance!
            return await lazyTask.Value;
        }
        catch
        {
            // 3. If database fails, evict lazy wrapper so next request can retry
            _cache.TryRemove(productId, out _);
            throw;
        }
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (Naive `GetOrAdd`) | After (Atomic `Lazy<Task<T>>`) |
|---|---|---|
| **Simultaneous DB Queries on Cache Miss** | **500 parallel queries** | **1 single query (Zero stampede)** |
| **Active DB Connection Peak** | 800 (Pool Exhaustion) | **4 active connections** |
| **Database CPU Utilization** | **100.0%** | **4.2%** |
| **p99 Flash Sale Latency** | 18,400 ms (Timeouts) | **2.1 ms** |

---

## 🛡️ 5. The Socratic Duel

### Question 1 (The Senior Engineer):
> *"Why not just put a `SemaphoreSlim` around the database call instead of using `Lazy<Task<T>>` inside `ConcurrentDictionary`?"*

**The Principal Defense**:
> *"Using a single global `SemaphoreSlim` serializes ALL product queries across the entire catalog. If Product 42 is loading, no one can load Product 100 or Product 200, creating an artificial bottleneck. Using a dictionary of semaphores requires managing semaphore creation, locking, and memory disposal, which easily leaks memory. Storing `Lazy<Task<T>>` directly in the `ConcurrentDictionary` provides **per-key single-execution locks with zero global contention**: requests for Product 42 share one single database call, while requests for Product 100 execute independently in parallel with zero friction."*

---

## 📜 6. The Executive Deliverable: ADR-005

```markdown
# ADR-005: Elimination of Cache Stampedes via Atomic Lazy Task Evaluation

## Context
A major database outage occurred during a flash sale when `ConcurrentDictionary.GetOrAdd` executed 500 duplicate queries simultaneously, exhausting connection pools.

## Decision
1. Forbid executing expensive I/O operations directly inside `ConcurrentDictionary.GetOrAdd` factory delegates.
2. Mandate the `ConcurrentDictionary<TKey, Lazy<Task<T>>>` pattern with `LazyThreadSafetyMode.ExecutionAndPublication` for in-memory caches.
3. Evict failed lazy tasks in `catch` blocks to prevent permanent caching of transient database errors.

## Consequences
- **Positive**: 100% elimination of cache stampedes; database queries capped to exactly 1 per cache miss.
- **Negative**: Adds minor syntactic complexity wrapping return types in `Lazy<Task<T>>`.
```
