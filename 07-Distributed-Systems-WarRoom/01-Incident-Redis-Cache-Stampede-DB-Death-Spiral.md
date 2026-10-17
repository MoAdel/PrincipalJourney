# Incident 01: The Hot-Key TTL Expiration Cache Stampede & DB Death Spiral

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Redis 7.2 Cluster + SQL Server Primary / 60-Pod Catalog API (`45,000 RPS`)  
> **Business Impact**: Every 15 minutes on the dot, SQL Server CPU hits 100% and `THREADPOOL` starvation drops 100% of API requests for 40 seconds  
> **Competencies Mastered**: Cache Stampede (Dogpiling), `HybridCache` (.NET 9 Single-Flight Stampede Protection), Probabilistic Early Expiration (XFetch), Stale-While-Revalidate

---

## 🚨 1. The 12:00 PM Crisis Briefing

On launch day of the flagship homepage promotion, a deterministic `15-minute` outage cycle began at `12:00:00`, `12:15:00`, `12:30:00`, and `12:45:00`:

```text
[12:15:00.010] Redis Metric: Key 'catalog:homepage:featured-v1' expired (TTL = 900s).
[12:15:00.250] RED HERRING: DBA shouts "Someone scheduled a malicious cron job every 15 minutes that runs 9,000 identical complex joins!"
[12:15:01.100] SQL Alert: Worker threads exhausted (wait_type: THREADPOOL); CPU 100%; Connection Pool Blackout!
```

> 📐 **Derive It (Fermi Mode): Concurrent Cache-Miss Stampede Multiplier**
> - **Inputs**: `HomepageRPS = 36000`, `SqlRebuildDurationMs = 250`, `MaxSqlWorkerThreads = 1024`
> - **Formula**: `ConcurrentMissQueries = HomepageRPS * (SqlRebuildDurationMs / 1000)`
> - **Step-by-Step**:
>   1. At `12:15:00.000`, the single hot key `catalog:homepage:featured-v1` expired in Redis.
>   2. Rebuilding the homepage aggregate query in SQL Server takes `250ms` ($0.25\text{ s}$).
>   3. During the `250ms` window before the first pod finishes querying SQL and writes the result back to Redis, Little's Law dictates that $L = 36,000\text{ RPS} \times 0.25\text{ s} = 9,000\text{ concurrent requests}$ all see `cache == null`!
>   4. All 60 pods immediately fire **9,000 identical heavy SQL queries simultaneously**, overwhelming SQL Server's `1,024` worker threads ($8.8\times$ overload) and stretching query time from `250ms` to `30,000ms`!
> - **What-If Sensitivity**: Adding **.NET 9 `HybridCache` (In-Process L1 + Redis L2 + Single-Flight `StampedeProtection`)** coalesces all concurrent misses per pod so 60 pods fire at most `60` queries (or `1` query with distributed lock + background soft-TTL refresh), keeping SQL CPU at `< 4%`!

<!-- TELEMETRY_WIDGET: title="15-Minute TTL Cache Stampede Cycle" metric1="Concurrent SQL Miss Queries" metric2="SQL Server CPU (%)" threshold="1024 Max SQL Worker Threads" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Rule out the "Cron Job" Red Herring — check client_app_name and query_hash in SQL DMVs
sqlcmd -S sql-prod -U sa -P "$SA_PASS" -Q "
SELECT TOP 5 query_hash, COUNT(*) AS concurrent_executions, MIN(text) AS sample_sql
FROM sys.dm_exec_requests CROSS APPLY sys.dm_exec_sql_text(sql_handle)
GROUP BY query_hash ORDER BY concurrent_executions DESC;"
# Output: 1,024 identical active executions of 'SELECT ... FROM CatalogFeaturedItems' from Catalog.Api pods!

# Step 2: Monitor Redis keyspace misses per second at the 15-minute mark
redis-cli info stats | grep keyspace_misses
```

### Observed Culprit Code Snippet
```csharp
// ❌ CLASSIC CACHE-ASIDE WITHOUT SINGLE-FLIGHT STAMPEDE PROTECTION:
public async Task<HomepageDto> GetHomepageAsync(CancellationToken ct)
{
    var json = await _redis.GetStringAsync("catalog:homepage:featured-v1", ct);
    if (json is not null) return JsonSerializer.Deserialize<HomepageDto>(json)!;

    // 9,000 concurrent threads enter this block during the 250ms window after TTL expires!
    var dto = await _db.LoadHeavyHomepageAggregateAsync(ct);
    await _redis.SetStringAsync("catalog:homepage:featured-v1", JsonSerializer.Serialize(dto),
        new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(15) }, ct);
    return dto;
}
```

<!-- PREDICT_GATE: Commit your hypothesis: Why did 9,000 identical SQL queries fire in a 250ms window every 15 minutes, and how do .NET 9 `HybridCache` + Soft/Hard TTL Stale-While-Revalidate eliminate this? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. Why Standard Cache-Aside Fails Under High Concurrency
* Standard `Get -> If Null -> Query DB -> Set` has no coordination between the moment `Get` returns `null` and `Set` completes (`W = 250ms`). Under high $\lambda$ (`36,000 RPS`), thousands of callers stampede the database.

### 2. Two-Tier Defense: .NET 9 `HybridCache` + Logical Soft-TTL (Stale-While-Revalidate)
1. **Single-Flight Coalescing (`HybridCache`)**: Guarantees that if 500 concurrent requests on a pod ask for `"catalog:homepage:featured-v1"` at the exact same microsecond, **only 1 task** executes the factory delegate while the other 499 `await` the exact same `ValueTask<T>` result!
2. **Soft TTL vs. Hard Physical TTL**: Store a `RefreshesAtUtc` timestamp inside the cached envelope (e.g., Soft TTL = `14m`, Hard Redis TTL = `60m`). When a request sees `UtcNow > RefreshesAtUtc`, it acquires a non-blocking `TryAcquireRevalidationLock` and refreshes the cache in the background while **all 36,000 RPS continue receiving the warm cached value in `0.1ms` with zero waiting**!

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Caching.Hybrid;

namespace PrincipalJourney.DistributedSystems.WarRoom;

public sealed class StampedeProofCatalogCache(
    HybridCache hybridCache,
    ICatalogRepository repository)
{
    private static readonly HybridCacheEntryOptions CacheOptions = new()
    {
        Expiration = TimeSpan.FromMinutes(15),           // L2 Redis TTL
        LocalCacheExpiration = TimeSpan.FromMinutes(2)   // L1 In-Memory TTL
    };

    public async ValueTask<HomepageDto> GetHomepageAsync(CancellationToken ct)
    {
        // HybridCache automatically coalesces concurrent in-flight misses per key (Single-Flight)!
        return await hybridCache.GetOrCreateAsync(
            key: "catalog:homepage:featured-v1",
            state: repository,
            factory: static async (repo, token) => await repo.LoadHeavyHomepageAggregateAsync(token),
            options: CacheOptions,
            cancellationToken: ct);
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (Naive Cache-Aside) | After (`.NET 9 HybridCache` Single-Flight) | Validation & Rollback Procedure |
|---|---|---|---|
| **SQL Queries on TTL Expiry (`36k RPS`)** | `9,000 concurrent queries` (`100%` DB CPU) | **`1 query per pod`** (or `1` total with distributed lease) | k6 fires 5,000 RPS as key is deleted via `redis-cli DEL`; assert SQL executions <= pod count. |
| **p99 Homepage Latency at 15m Mark** | `30,000 ms` (Timeout) | **`1.4 ms`** | Monitor `http_server_request_duration_seconds` across TTL boundary. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why not just set the Redis TTL to `Infinite` (never expire) so there is never a TTL stampede?"*

**The Principal Defense**:
> *"Infinite TTL without an eviction/invalidation strategy turns stale data bugs into permanent production corruption, and fails to protect you when Redis scales, reboots, or evicts a shard! Even if you invalidate explicitly on write, deleting a hot key (`DEL catalog:homepage`) at `36,000 RPS` triggers the **exact same 9,000-query stampede** unless reads are coalesced via Single-Flight (`HybridCache`) or updated in-place via `SET`!"*

### Question 2 (The Second-Order Failure Mode):
> *"What happens if 10,000 distinct product keys are all pre-warmed at 00:00:00 with `TTL = 15 minutes`, causing all 10,000 keys to expire at the exact same second at 00:15:00?"*

**The Principal Defense**:
> *"Single-Flight coalesces requests for the *same* key, but if 10,000 *different* keys expire simultaneously (**Synchronized TTL Avalanche**), 10,000 distinct single-flight queries still hit SQL at once! Always add **Random TTL Jitter** (`TimeSpan.FromMinutes(15) + TimeSpan.FromSeconds(Random.Shared.Next(-90, 90))`) when writing batches of keys so expirations spread uniformly across a 3-minute window."*

### Question 3 (The FinOps / Cost Axis):
> *"Redis Enterprise traffic for `36,000 RPS` of `45 KB` JSON payloads is saturating 13 Gbps of network bandwidth and costing $6,400/month in Redis shards. Defend the 80%-good alternative at 15% of the cost."*

**The Principal Defense**:
> *"Fetching a `45 KB` homepage payload from remote Redis over the network `36,000` times per second transfers `1.62 GB/sec` (`13 Gbps`) of identical bytes! By using `.NET 9 HybridCache` with a **`30-second` L1 In-Process Memory Cache (`LocalCacheExpiration`)** + **Redis Pub/Sub invalidation**, `99.9%` of reads are served from local pod RAM in `0.002ms` (`0 bytes` network I/O), shrinking our Redis cluster from 12 shards ($6,400/mo) to 2 shards ($900/mo)!"*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-0701 — Hot-Key TTL Cache Stampede & SQL Death Spiral

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 1 minute | **Mitigation Latency (TTM)**: 14 minutes

## Five Whys Root Cause Chain
1. **Why did SQL Server freeze every 15 minutes?** -> 9,000 identical queries arrived within 250ms, exhausting all 1,024 worker threads.
2. **Why did 9,000 queries fire in 250ms?** -> The hot homepage Redis key expired every 15m (`TTL = 900s`) under 36,000 RPS.
3. **Why didn't the cache stop the 2nd through 9,000th request?** -> Raw `IDistributedCache` Cache-Aside has no Single-Flight request coalescing.
4. **Why did the DBA suspect a malicious cron job?** -> The outage occurred on an exact 15-minute schedule (`12:00, 12:15, 12:30`).
5. **Why wasn't L1 in-memory caching used?** -> Engineers feared stale data across 60 pods without knowing `HybridCache` supports L1+L2 coherence.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Migrate raw `IDistributedCache` hot paths to `.NET 9 HybridCache` with TTL jitter | Catalog Team | `NetArchTest` flags direct `IDistributedCache.Get*` in Controllers |
| P1 | Add SQL `THREADPOOL` wait alert & single-flight stampede k6 test | SRE Team | Load test deletes hot key under 5k RPS |
```
