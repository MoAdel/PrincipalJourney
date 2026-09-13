# High-Throughput Concurrent Collections — Striped Locking & Traps

> **Core Concept**: Thread-Safe Collections Internals  
> How `ConcurrentDictionary<K, V>` achieves lock-free reads and striped writes, and the dangerous `GetOrAdd` delegate execution storm.

---

## 1. `ConcurrentDictionary<TKey, TValue>` Internal Architecture

`ConcurrentDictionary` is one of the most sophisticated data structures in the BCL:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONCURRENTDICTIONARY STRIPED LOCKS                       │
│                   concurrencyLevel = Environment.ProcessorCount * 2         │
├─────────────────────────────────────────────────────────────────────────────┤
│ Lock 0 ──► Protects Buckets [0, 4, 8, 12, 16...]                            │
│ Lock 1 ──► Protects Buckets [1, 5, 9, 13, 17...]                            │
│ Lock 2 ──► Protects Buckets [2, 6, 10, 14, 18...]                           │
│ Lock 3 ──► Protects Buckets [3, 7, 11, 15, 19...]                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Read Invariant: 100% Lock-Free!
* Reads (`TryGetValue`, indexer read, `ContainsKey`) acquire **zero locks**.
* Internal bucket nodes are linked lists with volatile pointers. Readers traverse nodes using volatile memory reads, achieving near-hardware memory speed.

### The Write Invariant: Striped Locks
* Instead of a single giant lock covering the whole dictionary, it allocates a collection of locks (**Striped Locking**).
* Writing to Key A (Bucket 0) locks **only Lock 0**. Key B (Bucket 1) can be written concurrently by another core on **Lock 1** with zero contention!

---

## 2. The Dangerous `GetOrAdd` Factory Storm Trap

Many senior developers write caching code like this:

```csharp
// FATAL ANTI-PATTERN: The GetOrAdd Illusion
public async Task<UserProfile> GetProfileAsync(string userId)
{
    return _profileCache.GetOrAdd(userId, id =>
    {
        // "This will only run once per userId, right?"
        return CallExpensiveDatabase(id); // WRONG! RUNS MULTIPLE TIMES!
    });
}
```

### Why does it fail under load?
* In `ConcurrentDictionary`, the factory delegate is **NOT executed inside the lock**! (Executing an arbitrary delegate inside the lock could cause deadlocks if the delegate calls other locks).
* If 100 concurrent requests arrive for the exact same `userId` during a cache miss:
  1. All 100 threads see that the key does not exist.
  2. **All 100 threads execute `CallExpensiveDatabase(id)` simultaneously!**
  3. The dictionary only accepts one result and discards the other 99, but the database was slammed with 100 duplicate queries!

---

## 3. The Principal Solution: Atomic `Lazy<T>` Caching

To guarantee that the factory delegate executes **exactly once**, wrap the value in a `Lazy<T>` with `LazyThreadSafetyMode.ExecutionAndPublication`:

```csharp
public class ThreadSafeCache<TKey, TValue> where TKey : notnull
{
    private readonly ConcurrentDictionary<TKey, Lazy<Task<TValue>>> _cache = new();

    public async Task<TValue> GetOrAddAsync(TKey key, Func<TKey, Task<TValue>> factory)
    {
        // 1. Instantiates a lightweight Lazy wrapper (near-zero allocation)
        var lazy = _cache.GetOrAdd(key, k => new Lazy<Task<TValue>>(
            () => factory(k),
            LazyThreadSafetyMode.ExecutionAndPublication // Guarantees single execution!
        ));

        try
        {
            // 2. Only ONE thread executes the factory task; others await the exact same task!
            return await lazy.Value;
        }
        catch
        {
            // Evict failed task so future requests can retry
            _cache.TryRemove(key, out _);
            throw;
        }
    }
}
```

---

## 4. `ConcurrentQueue<T>` vs. `ConcurrentBag<T>`

```text
┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│          ConcurrentQueue<T>          │  │           ConcurrentBag<T>           │
├──────────────────────────────────────┤  ├──────────────────────────────────────┤
│ • Lock-free circular ring buffers    │  │ • Thread-local list per thread       │
│ • Strict FIFO ordering               │  │ • Unordered bag                      │
│ • Constant high throughput           │  │ • Stealing overhead across threads   │
│ • Best for general Producer-Consumer │  │ • Best ONLY when producer = consumer │
└──────────────────────────────────────┘  └──────────────────────────────────────┘
```

> **Principal Directive**: Default to **`ConcurrentQueue<T>`** or **`Channel<T>`**. Avoid `ConcurrentBag<T>` for cross-thread queuing; when items are produced on Thread A and consumed on Thread B, `ConcurrentBag` suffers heavy cross-thread stealing lock overhead.
