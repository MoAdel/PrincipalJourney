# Incident 03: The Fail-Closed Redis Rate-Limiter Global API Outage

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Global API Gateway (YARP / ASP.NET Core 9) + Centralized Redis Rate Limiter  
> **Business Impact**: A 4-minute Redis cluster failover dropped 100% of global customer traffic (`HTTP 500 Internal Server Error`) because the rate-limiting middleware lacked a Fail-Open Local Token-Bucket Fallback  
> **Competencies Mastered**: Fail-Open vs. Fail-Closed Security/Traffic Policies, ASP.NET Core `PartitionedRateLimiter`, Local In-Memory Token Bucket Fallback, Circuit-Broken Redis Lua Scripting

---

## 🚨 1. The 05:20 PM Crisis Briefing

The platform team deployed a centralized Redis Sliding-Window Rate Limiter on the API Gateway to protect against abusive scrapers (`limit: 100 req/min per IP`). When the Redis cluster underwent a 4-minute planned patching failover:

```text
[17:20:01] Redis Event: Primary shard failover initiated (Cluster unavailable for 18 seconds, then slow).
[17:20:02] Gateway Alert: Global HTTP 500 rate hit 100.0%! Zero customer requests reaching backend services!
[17:20:15] RED HERRING: On-Call Engineer shouts "All 40 backend microservices just crashed simultaneously!"
[17:20:45] Gateway Logs: StackExchange.Redis.RedisConnectionException: No connection is available to service this operation: EVAL.
```

> 📐 **Derive It (Fermi Mode): Availability Reduction of Serial Fail-Closed Dependencies**
> - **Inputs**: `GatewayAvailability = 0.9999`, `BackendAvailability = 0.9995`, `RedisAvailability = 0.999`, `FailClosed = 1`
> - **Formula**: `CompositeAvailability = GatewayAvailability * BackendAvailability * RedisAvailability`
> - **Step-by-Step**:
>   1. Putting a non-essential infrastructure component (Rate Limiter Redis at `99.9%` SLA = `43.8m/month` downtime) in the **serial, fail-closed critical path** of every API request multiplies availabilities: $0.9999 \times 0.9995 \times 0.999 = 99.84\%$.
>   2. Worse, `StackExchange.Redis` default `syncTimeout = 5000ms` caused every incoming request (`10,000 RPS`) to hang for `5 seconds` waiting for Redis before throwing `RedisTimeoutException` ($L = 10,000 \times 5 = 50,000$ hung requests)!
>   3. **A tool meant to protect availability against scrapers caused a 100% global outage!**
> - **What-If Sensitivity**: Wrapping the Redis rate-limiter check in a **`50ms` timeout + Fail-Open fallback to an In-Memory Local `TokenBucketRateLimiter` (`limit / pod_count`)** decouples API availability from Redis completely (`99.95%` preserved) while still enforcing rate limits locally during Redis failovers!

<!-- TELEMETRY_WIDGET: title="Fail-Closed Rate Limiter Global Outage" metric1="Gateway HTTP 500 Rate (%)" metric2="Redis EVAL Timeout (ms)" threshold="50 ms Max Rate-Limit Check Budget" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Rule out the "All Backends Crashed" Red Herring — check backend pod RPS and health!
kubectl top pods -n prod -l tier=backend
# Output: Backend pods are at 2% CPU and 0 RPS! Requests are dying inside the API Gateway before forwarding!

# Step 2: Check API Gateway exception logs
kubectl logs -n prod -l app=api-gateway --tail=50 | grep "Redis"
```

### Observed Culprit Code Snippet
```csharp
// ❌ FAIL-CLOSED SERIAL REDIS DEPENDENCY WITH 5,000ms DEFAULT TIMEOUT:
app.Use(async (context, next) =>
{
    string ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    // If Redis is unreachable or slow, this throws RedisException -> HTTP 500 for 100% of users!
    long count = (long)await redisDb.StringIncrementAsync($"rl:{ip}");
    if (count > 100)
    {
        context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        return;
    }
    await next();
});
```

<!-- PREDICT_GATE: Commit your hypothesis: When should a security/traffic control Fail-Closed vs. Fail-Open, and how do we fall back to per-pod in-memory rate limiting in < 5ms when Redis hiccups? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. Fail-Open vs. Fail-Closed Decision Matrix
* **Authentication / Authorization (`JwtBearer`, BOLA check)**: **MUST FAIL CLOSED**. If you cannot verify who the caller is or whether they own the bank account, reject the request (`401/403/503`).
* **Rate Limiting / Feature Flag Polling / Analytics / Non-Critical Enrichment**: **MUST FAIL OPEN (or Degrade to Local In-Memory State)**. If the centralized Redis counter is unreachable for 30 seconds, switch immediately to a local in-process `PartitionedRateLimiter` (`PerPodLimit = GlobalLimit / ActivePodCount`)!

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System;
using System.Collections.Concurrent;
using System.Threading;
using System.Threading.RateLimiting;
using System.Threading.Tasks;
using StackExchange.Redis;

namespace PrincipalJourney.SystemDesign.WarRoom;

public sealed class ResilientHybridRateLimiter(IConnectionMultiplexer redis)
{
    private readonly ConcurrentDictionary<string, TokenBucketRateLimiter> _localFallbackLimiters = new();

    public async ValueTask<bool> IsAllowedAsync(string clientKey, int globalPerMinuteLimit, int estimatedPodCount)
    {
        try
        {
            var db = redis.GetDatabase();
            if (redis.IsConnected)
            {
                // Fast non-blocking Redis atomic sliding counter with strict 25ms timeout budget
                using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(25));
                long current = await db.StringIncrementAsync($"rl:{clientKey}:{DateTime.UtcNow:yyyyMMddHHmm}").WaitAsync(cts.Token);
                if (current == 1)
                {
                    _ = db.KeyExpireAsync($"rl:{clientKey}:{DateTime.UtcNow:yyyyMMddHHmm}", TimeSpan.FromMinutes(2), CommandFlags.FireAndForget);
                }
                return current <= globalPerMinuteLimit;
            }
        }
        catch
        {
            // Redis timed out (>25ms) or disconnected -> Degrade gracefully to local pod memory limiter!
        }

        // Local Fail-Open / Degraded In-Memory Enforcement (Divides global limit across pods)
        int perPodLimit = Math.Max(5, globalPerMinuteLimit / Math.Max(1, estimatedPodCount));
        var localLimiter = _localFallbackLimiters.GetOrAdd(clientKey, static (_, limit) =>
            new TokenBucketRateLimiter(new TokenBucketRateLimiterOptions
            {
                TokenLimit = limit,
                TokensPerPeriod = limit,
                ReplenishmentPeriod = TimeSpan.FromMinutes(1),
                AutoReplenishment = true,
                QueueLimit = 0
            }), perPodLimit);

        using var lease = localLimiter.AttemptAcquire(1);
        return lease.IsAcquired;
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (Unprotected Redis Increment) | After (25ms Budget + Local In-Memory TokenBucket Fallback) | Validation & Rollback Procedure |
|---|---|---|---|
| **Customer Success Rate During Redis Outage** | `0.0%` (`100%` HTTP 500) | **`100.0%`** (Zero failed legitimate requests) | Chaos test stops Redis container under k6 load; assert HTTP 200 rate remains `100%`. |
| **Rate-Limit Enforcement During Redis Outage** | Broken (Throws 500) | **Active Locally** (`GlobalLimit / PodCount` per pod) | Verify abusive IP exceeding `PerPodLimit` still receives `HTTP 429` while Redis is stopped! |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"In your original broken code, look closely at `await redisDb.StringIncrementAsync($"rl:{ip}")` — even when Redis WAS healthy, what massive bug was sitting right there?"*

**The Principal Defense**:
> *"The original code called `StringIncrementAsync($"rl:{ip}")` **without a time bucket suffix or `EXPIRE` TTL**! That meant once a legitimate customer made 100 requests over an entire week, their counter hit `101` and **permanently blocked their IP with `429` forever** (and leaked Redis keys forever)! Furthermore, calling `INCR` followed by a separate `EXPIRE` non-atomically can still leak an immortal key if the pod crashes between the two lines — always embed the minute window in the key name (`rl:{ip}:{yyyyMMddHHmm}`) or execute `INCR + EXPIRE` inside an atomic Lua script."*

### Question 2 (The Second-Order Failure Mode):
> *"What happens to `_localFallbackLimiters` (`ConcurrentDictionary<string, TokenBucketRateLimiter>`) if a botnet attacks from 500,000 spoofed IPs while Redis is down?"*

**The Principal Defense**:
> *"An unbounded `ConcurrentDictionary` keyed by untrusted client IP will grow to 500,000 entries and cause an `OutOfMemoryException`! In production, wrap the local fallback limiters in a **Bounded LRU / Size-Limited `MemoryCache` (`SizeLimit = 10_000`, `SlidingExpiration = 2m`)** or hash the IP into a fixed array of **`4,096` pre-allocated striped `TokenBucketRateLimiter` buckets** (`_stripedBuckets[Crc32(ip) & 4095]`) which uses **constant $O(1)$ memory (`< 500 KB`)** regardless of how many million IPs attack!"*

### Question 3 (The FinOps / Cost Axis):
> *"Calling Redis synchronously over the network on every single HTTP request at `50,000 RPS` requires a 6-shard Redis Enterprise cluster ($3,600/month) and adds `0.8ms` to every call. Defend the 80%-good alternative at 10% of the cost."*

**The Principal Defense**:
> *"With round-robin load balancing (or consistent hashing at the L4/L7 edge), you don't need synchronous per-request Redis calls for standard IP rate limiting! Use **In-Memory Local Rate Limiting (`ASP.NET Core RateLimiterMiddleware` with `PerPodLimit = GlobalLimit / PodCount`)** for `99%` of routes (`$0/month`, `0.0001ms` latency), and reserve Redis-backed distributed rate limiting strictly for high-value, low-RPS endpoints like `/login`, `/password-reset`, and `/checkout`!"*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-1003 — Fail-Closed Redis Rate-Limiter Global Outage

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 1 minute | **Mitigation Latency (TTM)**: 8 minutes

## Five Whys Root Cause Chain
1. **Why did 100% of API requests return HTTP 500?** -> The rate-limiting middleware threw unhandled `RedisConnectionException`.
2. **Why did Redis throw an exception?** -> The Redis cluster was undergoing a planned shard failover.
3. **Why did a rate-limiter failover take down the entire API?** -> The middleware was written Fail-Closed without a `try/catch` or local in-memory fallback.
4. **Why did gateway threads hang for 5 seconds per request?** -> Default `StackExchange.Redis` `syncTimeout` is 5,000ms.
5. **Why did on-call think all 40 backend services crashed?** -> The gateway returned `500` instead of `503` and emitted no backend span.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Implement 25ms timeout + Striped In-Memory `TokenBucketRateLimiter` fallback | Gateway Team | Chaos test kills Redis during load test; asserts 0 HTTP 500s |
| P1 | Move general IP rate limiting to local in-memory middleware; use Redis only for `/auth` & `/checkout` | Platform Team | Redis RPS reduced by 94% |
```
