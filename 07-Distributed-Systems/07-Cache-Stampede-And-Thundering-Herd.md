# Cache Stampede & Thundering Herd: The XFetch Algorithm

> "A cache stampede is not caused by slow databases; it is caused by the sudden simultaneous expiration of a single hot key under thousands of concurrent requests."

---

## 1. The Anatomy of a Cache Stampede (Thundering Herd)

Consider a key `product:iphone16` cached in Redis with a 1-hour TTL, serving 25,000 requests per second.
Querying the database and computing the JSON response takes 400 milliseconds.

```text
At 12:00:00 PM: Key expires in Redis.
At 12:00:00.010 PM: 250 concurrent requests arrive in 10ms -> ALL CACHE MISS!
At 12:00:00.020 PM: 500 requests hit SQL Server simultaneously with identical queries!
At 12:00:00.100 PM: 2,500 requests exhaust SQL Server connection pool!
Result: Database CPU spikes to 100%, query times degrade to 15s, and the API crashes.
```

---

## 2. Comparison of Mitigation Strategies

```text
┌───────────────────────────┬────────────────────────────────────────────────────────┐
│ Strategy                  │ Trade-offs & Production Viability                      │
├───────────────────────────┼────────────────────────────────────────────────────────┤
│ 1. Distributed Mutex      │ Only 1 thread computes; others wait for lock release.  │
│    (Locking / SETNX)      │ Latency penalty for waiting threads; risk of deadlocks │
│                           │ if worker crashes holding the lock.                    │
├───────────────────────────┼────────────────────────────────────────────────────────┤
│ 2. Background Refresh     │ Cron job updates key before expiry. Works well for     │
│    (Proactive Pre-warm)   │ known predictable keys; fails for ad-hoc queries.      │
├───────────────────────────┼────────────────────────────────────────────────────────┤
│ 3. Probabilistic Early    │ GOLD STANDARD. As key nears expiration, requests       │
│    Expiration (XFetch)    │ probabilistically trigger early background recomputation│
│                           │ based on computation time. Zero lock contention!       │
└───────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 3. The XFetch Algorithm (Vattani, Chierichetti, Lowenstein - VLDB 2015)

Instead of checking `if (now > expiry)`, XFetch calculates a dynamic probabilistic boundary:

$$\Delta - eta \cdot \delta \cdot \ln(r) > 	ext{expiry} - 	ext{now}$$

Where:
* $\Delta$: Time taken to recompute the value (in seconds, measured dynamically).
* $eta$: Aggressiveness constant ($eta > 0$, default $eta = 1.0$).
* $\delta$: Expiration delta window.
* $r$: Uniform random variable $r \in (0, 1)$.
* As $	ext{expiry} - 	ext{now} 	o 0$, the probability of recomputation smoothly approaches $100\%$. **Only ONE early client executes the refresh while all other clients continue receiving fast cached reads!**

### C# .NET 9 Implementation of XFetch
```csharp
public sealed class ProbabilisticCache
{
    private readonly IDatabase _redis;
    private static readonly Random _rng = Random.Shared;

    public ProbabilisticCache(IConnectionMultiplexer multiplexer)
    {
        _redis = multiplexer.GetDatabase();
    }

    public async Task<T> GetOrSetAsync<T>(
        string key, 
        Func<Task<(T Value, TimeSpan Duration)>> factory, 
        TimeSpan ttl, 
        double beta = 1.0)
    {
        var cached = await _redis.StringGetAsync(key);
        if (cached.HasValue)
        {
            var envelope = JsonSerializer.Deserialize<CacheEnvelope<T>>(cached!);
            var remainingTtl = (envelope!.ExpiresAtUtc - DateTime.UtcNow).TotalSeconds;

            // XFetch Probabilistic Check
            var r = _rng.NextDouble();
            var shouldRefreshEarly = -(envelope.ComputeTimeSeconds * beta * Math.Log(r)) > remainingTtl;

            if (!shouldRefreshEarly)
            {
                return envelope.Value;
            }
        }

        // Recompute Value
        var stopwatch = Stopwatch.StartNew();
        var (freshValue, computeDuration) = await factory();
        stopwatch.Stop();

        var newEnvelope = new CacheEnvelope<T>(
            freshValue, 
            DateTime.UtcNow.Add(ttl), 
            stopwatch.Elapsed.TotalSeconds);

        await _redis.StringSetAsync(key, JsonSerializer.Serialize(newEnvelope), ttl);
        return freshValue;
    }

    private sealed record CacheEnvelope<T>(T Value, DateTime ExpiresAtUtc, double ComputeTimeSeconds);
}
```

---

## 4. Formal & Verified References

* [Vattani, Chierichetti, Lowenstein (2015): Optimal Probabilistic Cache Stampede Prevention (VLDB)](https://www.vldb.org/pvldb/vol8/p886-vattani.pdf)
* [Wikipedia: Cache Stampede & XFetch](https://en.wikipedia.org/wiki/Cache_stampede)
* [Microsoft Learn: Cache-Aside Pattern and Concurrency Pitfalls](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside)
