# Incident 01: The Black Friday Liveness Death Spiral & Socket Freeze

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Production Kubernetes Cluster (64 Pods) / ASP.NET Core 9  
> **Business Impact**: \$1.4M lost in uncompleted orders over 24 minutes  
> **Competencies Mastered**: Liveness vs. Readiness Probes, SocketsHttpHandler Connection Pooling, Captive DI Dependencies

---

## 🚨 1. The 03:00 AM Crisis Briefing

It is 03:02 AM on Black Friday. The marketing team just pushed a 50% discount flash sale notification to 4.2 million mobile app users.

Traffic surges from 400 RPS to **28,000 RPS** in 90 seconds.

Suddenly, PagerDuty screams. The primary dashboard turns red:

```text
[03:03:12] Pod nova-api-7b4d8-x9k2l restarted (Exit Code 137: OOM / SIGKILL)
[03:03:18] Pod nova-api-7b4d8-m4n1p restarted (Exit Code 137: OOM / SIGKILL)
[03:03:25] 14 of 64 pods reported UNHEALTHY.
[03:03:45] 42 of 64 pods reported UNHEALTHY. Cascading crash loop detected.
[03:04:10] Ingress 503 Service Unavailable: No healthy upstreams available.
```

The on-call engineer restarts the deployment, but pods crash immediately upon startup.

Meanwhile, on the few surviving pods, payment checkout requests are throwing:
```text
System.Net.Sockets.SocketException (99): Cannot assign requested address (Address already in use)
   at System.Net.Http.HttpConnectionPool.ConnectAsync(...)
```
And occasionally:
```text
System.InvalidOperationException: A second operation was started on this context instance before a previous operation completed. Any instance members are not guaranteed to be thread safe.
   at Microsoft.EntityFrameworkCore.Infrastructure.Internal.ConcurrencyDetector.EnterCriticalSection()
```

The CTO joins the bridge:
> *"Why are our pods killing themselves? Why are we running out of IP sockets? And why is DbContext complaining about concurrency when ASP.NET Core requests are isolated? You have 30 minutes before leadership pulls the plug on the campaign."*

---


> 📐 **Derive It (Fermi Mode): Incident Capacity & Blast-Radius Math**
> - **Inputs**: `PeakRPS = 2500`, `DegradedHoldTimeMs = 1200`, `ResourceCeiling = 1000`
> - **Formula**: `InFlightSaturation = PeakRPS * (DegradedHoldTimeMs / 1000)`
> - **Step-by-Step**:
>   1. By Little's Law ($L = \lambda \times W$), $2,500\text{ RPS} \times 1.2\text{ s} = 3,000\text{ concurrent resources demanded}$.
>   2. Because $3,000 > 1,000$ (`ResourceCeiling`), the saturation queue grows at $+2,000\text{ items/sec}$, exhausting host capacity in $< 2\text{ seconds}$.
> - **What-If Sensitivity**: Reduce `DegradedHoldTimeMs` from `1200ms` to `4ms` via the Principal Refactor below — concurrency drops to $2,500 \times 0.004 = 10$ ($1.0\%$ utilization)!

<!-- TELEMETRY_WIDGET: title="01-Incident-Liveness-Death-Spiral" metric1="Primary Latency (ms)" metric2="Resource Saturation (%)" threshold="Critical SLA Ceiling" -->

---

## 🔍 2. Diagnostic Investigation (Your Detective Turn)

Before scrolling to the solution, inspect these 3 snippets found in the codebase:

### Snippet A: Probe Configuration (`Program.cs`)
```csharp
app.MapHealthChecks("/healthz/liveness", new HealthCheckOptions
{
    Predicate = check => true // Runs ALL registered checks (Database, Redis, Azure Key Vault, Payment Gateway)
});
```

### Snippet B: Outbound Payment Client (`PaymentService.cs`)
```csharp
public async Task<PaymentResult> ProcessChargeAsync(PaymentRequest request)
{
    // Developer wanted a clean client per request with distinct headers
    using var client = new HttpClient();
    client.BaseAddress = new Uri("https://api.stripe.com/v1/");
    client.DefaultRequestHeaders.Add("Idempotency-Key", request.TransactionId);

    var response = await client.PostAsJsonAsync("charges", request);
    return await response.Content.ReadFromJsonAsync<PaymentResult>();
}
```

### Snippet C: Cart Cache Singleton (`CatalogCache.cs`)
```csharp
// Registered in DI as: builder.Services.AddSingleton<CatalogCache>();
public class CatalogCache
{
    private readonly AppDbContext _context; // Captured DbContext in Singleton!

    public CatalogCache(AppDbContext context)
    {
        _context = context;
    }

    public async Task<Product> GetProductAsync(int id)
    {
        return await _context.Products.FindAsync(id);
    }
}
```

---


<!-- PREDICT_GATE: Commit your root-cause hypothesis from the diagnostic evidence above before unlocking Section 3 (Deep Engine Internals). -->

## ⚙️ 3. Deep Internals & Root Cause Analysis

### Fatal Flaw 1: The Liveness Probe Death Spiral
* **The Mechanics**: 
  * Kubernetes uses **Liveness Probes** to ask: *"Is the process stuck in a deadlock or infinite loop? If yes, kill it with `SIGKILL` (`kill -9`)."*
  * It uses **Readiness Probes** to ask: *"Can this pod receive user traffic right now? If no, temporarily remove it from the load balancer pool."*
* **The Catastrophe**:
  * The team registered the SQL database health check inside the **Liveness** probe.
  * When database CPU reached 98% under the flash sale, SQL response time climbed from 5ms to 2.5s.
  * The Kubelet liveness probe timeout was configured at **2.0s**. The probe timed out!
  * Kubernetes concluded the .NET process was dead and **killed the pod**.
  * Killing 10 pods shifted 100% of the traffic to the remaining 54 pods. The extra load caused SQL queries on those pods to slow down even more.
  * Within 2 minutes, every single pod timed out on its liveness probe and was killed in a **cascading death loop**.

> **Principal Law**: **A Liveness probe must NEVER depend on an external resource (Database, Cache, Network). A Liveness probe must ONLY check internal process viability (e.g., is Kestrel accepting connections and responding in-memory).**

---

### Fatal Flaw 2: Socket Starvation via `new HttpClient()`
* **The Mechanics**:
  * In .NET, `HttpClient` implements `IDisposable`, but disposing it does **NOT** immediately close the underlying OS socket.
  * The underlying TCP socket enters the `TIME_WAIT` state for **240 seconds** (RFC 793 standard) to ensure any lingering delayed packets are drained and do not corrupt future connections.
* **The Catastrophe**:
  * At 28,000 RPS, creating `new HttpClient()` exhausted the OS ephemeral port range (~65,000 available outbound client ports) within 3 seconds.
  * Once ephemeral ports were exhausted, the OS refused to allocate sockets, resulting in `SocketException: Cannot assign requested address`. All outbound payment requests froze.

---

### Fatal Flaw 3: The Captive Dependency Concurrency Crash
* **The Mechanics**:
  * In ASP.NET Core DI:
    * `Transient`: New instance every resolution.
    * `Scoped`: One instance per incoming HTTP request (`HttpContext`).
    * `Singleton`: One instance for the entire application lifetime.
* **The Catastrophe**:
  * `CatalogCache` was registered as `Singleton`, but its constructor accepted `AppDbContext` (which is `Scoped`).
  * When the `Singleton` was instantiated on the first request, it **captured** that single `AppDbContext` instance forever.
  * Under load, 500 concurrent threads accessed `CatalogCache.GetProductAsync()` simultaneously. EF Core's `DbContext` is **explicitly not thread-safe**.
  * The internal `ConcurrencyDetector` threw an exception and corrupted the state machine.

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

### The Refactored Solution

```csharp
// =========================================================================
// 1. ARCHITECTURAL HEALTH PROBE SEGREGATION (Program.cs)
// =========================================================================

builder.Services.AddHealthChecks()
    // Liveness: Ultra-lightweight in-memory check only
    .AddCheck("self", () => HealthCheckResult.Healthy(), tags: new[] { "live" })
    // Readiness: Checks external dependencies with strict timeouts
    .AddNpgSql(
        connectionString: builder.Configuration.GetConnectionString("Database")!,
        name: "postgres-readiness",
        timeout: TimeSpan.FromSeconds(1.5),
        tags: new[] { "ready" });

var app = builder.Build();

// Liveness: Kubernetes restarts pod ONLY if the .NET runtime itself is frozen
app.MapHealthChecks("/healthz/liveness", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("live")
});

// Readiness: Kubernetes pulls pod out of traffic rotation if DB is overloaded
app.MapHealthChecks("/healthz/readiness", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready")
});

// =========================================================================
// 2. RESILIENT POOLED HTTP CLIENT WITH DNS REFRESH (PaymentService.cs)
// =========================================================================

builder.Services.AddHttpClient("PaymentGateway", client =>
{
    client.BaseAddress = new Uri("https://api.stripe.com/v1/");
    client.Timeout = TimeSpan.FromSeconds(5);
})
.ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
{
    // Reuses connections to prevent socket exhaustion
    PooledConnectionLifetime = TimeSpan.FromMinutes(2), // Rotates every 2m to respect DNS changes
    PooledConnectionIdleTimeout = TimeSpan.FromMinutes(1),
    MaxConnectionsPerServer = 200
});

// =========================================================================
// 3. CAPTIVE DEPENDENCY PREVENTION (ServiceCollectionExtensions.cs)
// =========================================================================

// Enable strict scope validation in ALL environments (including Staging/Prod)
builder.Host.UseDefaultServiceProvider((context, options) =>
{
    options.ValidateScopes = true;
    options.ValidateOnBuild = true; // Throws compile-time exception if Singleton captures Scoped!
});
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (The Incident) | After (The Principal Architecture) | Validation & Rollback Procedure |
|---|---|---|---|
| **Pod Recovery under DB Spike** | 100% Pod Cascade Crash Loop | 0 Pod Crashes; Pods temporarily drop out of LB pool | Validate in canary shadow traffic for 30m; rollback via feature flag if p99 regresses > 10%. |
| **Active TCP Sockets under 28k RPS** | 64,800+ (`TIME_WAIT` Exhaustion) | **180 Stable Pooled Sockets** | Validate in canary shadow traffic for 30m; rollback via feature flag if p99 regresses > 10%. |
| **Outbound Payment Latency (p99)** | Timed out / Socket Error (99) | **42 ms** | Validate in canary shadow traffic for 30m; rollback via feature flag if p99 regresses > 10%. |
| **DbContext Concurrency Exceptions** | 1,420 / minute | **0 (Zero)** | Validate in canary shadow traffic for 30m; rollback via feature flag if p99 regresses > 10%. |

---

## 🛡️ 5. The Socratic Duel: Defend Your Decisions

Practice answering these 3 aggressive questions as if you were in front of the Architecture Review Board:

### Question 1 (The Infra Engineer):
> *"Why did you set `PooledConnectionLifetime` to 2 minutes instead of `Infinite`? If we keep the connection open forever, wouldn't we eliminate all TCP handshakes and get maximum speed?"*

**The Principal Defense**:
> *"If `PooledConnectionLifetime` is `Infinite`, the client will cache the target IP address indefinitely. In modern cloud environments (e.g., Azure Traffic Manager, AWS ALBs, or external APIs like Stripe), DNS records rotate dynamically during blue-green deployments or regional failovers. If you never rotate the pooled connection, your application will continue hammering a decommissioned IP address even though DNS updated hours ago. A 2-minute lifetime balances TCP reuse efficiency with cloud DNS agility."*

---

### Question 2 (The Junior/Senior Engineer):
> *"Why can't we just call `IHttpClientFactory.CreateClient()` every single time inside a loop instead of configuring `SocketsHttpHandler`?"*

**The Principal Defense**:
> *"`IHttpClientFactory` solves the socket exhaustion problem by managing an internal pool of `HttpMessageHandler` objects with a default 2-minute rotation. However, in high-throughput hot paths (20k+ RPS), instantiating the top-level `HttpClient` wrapper allocates memory on every request. Configuring a named or typed client backed by a fine-tuned `SocketsHttpHandler` gives us explicit control over `MaxConnectionsPerServer`, connection pooling, and connection timeouts without redundant allocations."*

---

### Question 3 (The DevOps Lead):
> *"If the database goes down completely, why shouldn't the Liveness probe kill the container? The app can't do anything without the database anyway!"*

**The Principal Defense**:
> *"Killing an app container because its database is down is an anti-pattern known as a **Fate-Sharing Death Spiral**. If the database has a momentary 10-second blip or lock freeze, killing 64 pods means that when the database recovers, all 64 pods will restart simultaneously, storming the database with 64 concurrent connection pool initializations, cold caches, and authentication handshakes, knocking the database down again. By delegating database health to the **Readiness probe**, pods remain alive and warm, stop accepting traffic until the database recovers, and resume servicing requests instantly without a thundering herd restart."*

---


### Question (The FinOps / Cost Axis):
> *"A vendor or team proposed throwing 10x hardware / enterprise cluster licensing ($18,000/month) at this problem instead of refactoring the architecture. Defend the 80%-good / Principal mechanical fix."*

**The Principal Defense**:
> *"Scaling hardware vertically against a non-linear mechanical bottleneck (lock escalation, LOH fragmentation, or $O(N^2)$ scans) burns $216,000/year while only delaying the crash by minutes under peak load. The refactoring above eliminates the root allocation/locking contention at **$0/month additional infrastructure cost**, improving efficiency by two orders of magnitude."*

---

## 📜 6. The Executive Deliverable: ADR-001

```markdown
# ADR-001: Separation of Container Probes & Outbound Connection Pooling

## Context
During the 2026 Black Friday flash sale, Nova Commerce suffered a SEV-1 outage due to liveness probe cascading crashes and outbound TCP socket exhaustion.

## Decision
1. **Segregate Probes**:
   - `/healthz/liveness` is strictly in-memory (`HealthCheckResult.Healthy()`).
   - `/healthz/readiness` evaluates external dependencies (PostgreSQL, Redis) with a strict 1.5s timeout.
2. **Mandate Connection Pooling**:
   - Outbound HTTP traffic must use `IHttpClientFactory` with `SocketsHttpHandler` configured (`PooledConnectionLifetime = 2m`).
   - Forbid direct `new HttpClient()` instantiation in production code.
3. **Compile-Time Scope Validation**:
   - Enable `ValidateScopes` and `ValidateOnBuild` across all hosting environments.

## Consequences & Trade-offs
- **Positive**: Eliminates pod restart cascades; caps outbound sockets under 200; prevents captive DI concurrency bugs.
- **Negative**: Kubernetes will not restart pods if an internal deadlock occurs outside Kestrel's thread pool (mitigated by worker thread pool starvation metrics).
```
