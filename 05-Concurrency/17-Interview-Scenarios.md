# Principal Interview Scenarios — Concurrency & Systems Architecture

> **Staff & Principal Technical System Design Interview Scenarios**  
> How to approach complex concurrency, lock-free data structures, and runtime scalability challenges during Principal-level interviews.

---

## Scenario 1: The 500,000 RPS Lock-Free Token Bucket Rate Limiter

### The Prompt:
> *"Design an in-memory, thread-safe rate limiter in .NET capable of enforcing a 10,000 requests/second limit across 500,000 incoming requests/second. The solution must never use heavy locks (`lock`, `Monitor`), must have sub-microsecond latency, and must accurately replenish tokens based on elapsed time without background timer drift."*

### The Principal Solution Architecture:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                   LOCK-FREE TOKEN BUCKET CAS ARCHITECTURE                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ State packed into a single 64-bit primitive:                                │
│ • High 32 Bits: TokenCount (Integer)                                        │
│ • Low 32 Bits:  LastReplenishedTimestampSeconds (Integer)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ Updates execute via atomic CAS loop (Interlocked.CompareExchange)           │
│ Zero locks, zero context switches, zero heap allocations!                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

```csharp
public class LockFreeTokenBucket
{
    private readonly int _capacity;
    private readonly int _refillPerSecond;

    // Single 64-bit variable stores both Tokens (upper 32) and LastRefillSec (lower 32)
    // Allows 100% atomic CAS update without any lock!
    private long _state;

    public LockFreeTokenBucket(int capacity, int refillPerSecond)
    {
        _capacity = capacity;
        _refillPerSecond = refillPerSecond;
        _state = PackState(capacity, GetCurrentSeconds());
    }

    public bool TryConsume()
    {
        long initial, updated;
        do
        {
            initial = Interlocked.Read(ref _state);
            UnpackState(initial, out int tokens, out int lastSec);

            int nowSec = GetCurrentSeconds();
            if (nowSec > lastSec)
            {
                int newTokens = (nowSec - lastSec) * _refillPerSecond;
                tokens = Math.Min(_capacity, tokens + newTokens);
                lastSec = nowSec;
            }

            if (tokens <= 0) return false; // Rate limited!

            tokens--; // Deduct token
            updated = PackState(tokens, lastSec);
        }
        while (Interlocked.CompareExchange(ref _state, updated, initial) != initial);

        return true; // Allowed
    }

    private static long PackState(int tokens, int seconds) => ((long)tokens << 32) | (uint)seconds;
    private static void UnpackState(long state, out int tokens, out int seconds)
    {
        tokens = (int)(state >> 32);
        seconds = (int)state;
    }
    private static int GetCurrentSeconds() => (int)(Stopwatch.GetTimestamp() / Stopwatch.Frequency);
}
```

---

## Scenario 2: High-Performance Lock-Free Ring Buffer (LMAX Disruptor Style)

### The Prompt:
> *"We are building an ultra-low latency matching engine in .NET that must process financial orders in under 500 nanoseconds. Standard queues (`ConcurrentQueue<T>`) are too slow due to node allocations and cache-miss pointer chasing. How do you design a zero-allocation, lock-free ring buffer?"*

### The Principal Solution Architecture:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                 LMAX DISRUPTOR-STYLE CACHE-ALIGNED RING BUFFER              │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Pre-allocated fixed array (Power of 2: e.g. 65,536 elements)              │
│ • Masking bitwise index: index = sequence & (Capacity - 1)                  │
│ • Producer and Consumer sequence pointers padded to 64 bytes (No False Share)│
│ • Zero dynamic memory allocation during operation                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Key Architectural Decisions:
1. **Power-of-Two Modulo Elimination**:
   - Instead of expensive CPU division `index % capacity`, use bitwise AND: `sequence & (capacity - 1)`. Takes **1 CPU clock cycle**.
2. **Cache-Padded Sequence Cursors**:
   - `_producerCursor` and `_consumerCursor` are stored in separate padded structs to prevent L1 cache bouncing.
3. **Pre-allocated In-Place Slots**:
   - Pre-allocate the entire array of order structs at boot. Producers write in-place into the existing array slots; zero garbage collector pressure!

---

## Scenario 3: 1,000,000 Metrics/Sec In-Memory Aggregator

### The Prompt:
> *"Our telemetry microservice receives 1,000,000 events/second across 64 CPU cores. We need to aggregate counts, p50, and p99 latencies without locking or exhausting RAM. How do you design this?"*

### The Principal Solution Architecture:
1. **Thread-Local / Core-Partitioned Striping**:
   - Do NOT update a single global counter! 64 cores contending on one variable will freeze the memory bus.
   - Allocate an array of 64 counter buckets: `[64]`. Each core updates its own **thread-local padded bucket** without any cross-core contention ($O(1)$ native memory access).
2. **HdrHistogram (High Dynamic Range Histogram)**:
   - Use an in-memory `HdrHistogram` with fixed memory allocation (e.g., 256 KB) to record latencies from 1 microsecond to 1 hour with 3 significant figures of precision.
3. **Background Reader Harvesting**:
   - A single background thread sweeps across the 64 buckets once every second, sums the counts, snapshots the histogram, and resets the buckets.
