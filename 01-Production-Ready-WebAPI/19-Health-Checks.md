# 19 - Health Checks & Container Orchestration Probes

> "A health check is not an informational webpage for humans.
>
> It is an automated life-or-death signal consumed by container orchestrators (Kubernetes, Azure Container Apps) to route traffic, restart deadlocks, and isolate failures."

---

# Why Should a Principal Engineer Care?

In modern cloud-native architectures, applications run behind load balancers and container orchestrators (Kubernetes, Azure Container Apps, AWS ECS).

If you implement health checks carelessly:
- **Death Spiral Outage**: A transient database slowdown causes Kubernetes to fail Liveness probes and kill all API pods simultaneously.
- **Traffic Routing to Dead Pods**: Traffic continues hitting deadlocked or uninitialized pods, producing 502/504 errors for customers.
- **Dependency DDOS**: 200 microservice pods polling the database every 3 seconds for health checks generate thousands of useless SQL queries per second.

As a Principal Engineer, you design a **three-tier health probe architecture** separating **Startup, Liveness, and Readiness**.

---

# Production Story

Saturday.

03:30 AM.

The primary database instance experiences a momentary 10-second I/O pause during an automated backup snapshot.

Nova Commerce's 60 Kubernetes pods were configured with a single naive health check endpoint:

```
GET /health (Executes: SELECT 1 FROM Orders)
```

Both Kubernetes **Liveness** and **Readiness** probes were pointed to this single URL.

### The Cascading Catastrophe:
1. When the database paused for 10 seconds, the `/health` queries timed out.
2. Kubernetes concluded: *"All 60 application pods are dead! Restart them immediately!"*
3. Kubernetes terminated all 60 healthy pods simultaneously.
4. When new pods started up, they all tried to establish initial database connection pools at the exact same instant, crushing the database CPU to 100%.
5. The database could not respond to new startup queries in time, causing the new pods to fail their liveness probes and get killed again.

The entire cluster entered an infinite **CrashLoopBackOff Death Spiral**.

What should have been a 10-second transient database blip turned into a 4-hour complete production outage.

The root cause was pointing Liveness probes to external dependencies.

---

# The Three Types of Container Probes

A Principal Engineer establishes three distinct probe contracts:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Startup Probe (/health/startup)                                          │
│    • Purpose: Has the application completed initialization?                 │
│    • Checks: DI graph build, EF Core migrations, warm-up caches              │
│    • Failure Action: Kubernetes waits (or restarts if failureThreshold hit) │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. Liveness Probe (/health/live)                                            │
│    • Purpose: Is the process deadlocked or completely hung?                 │
│    • Checks: Process responsiveness, thread-pool sanity (IN-MEMORY ONLY)     │
│    • NEVER checks: Databases, Redis, external APIs!                         │
│    • Failure Action: Kubernetes KILLS the container and restarts it         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. Readiness Probe (/health/ready)                                          │
│    • Purpose: Can this pod accept incoming user traffic right now?         │
│    • Checks: Database connectivity, Redis cache, essential dependencies    │
│    • Failure Action: Removes pod from load balancer pool (DOES NOT KILL IT) │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# Implementing Probes in ASP.NET Core

In ASP.NET Core, use **Tags** to separate Liveness from Readiness:

### Step 1: Register Health Checks in `Program.cs`

```csharp
builder.Services.AddHealthChecks()
    // 1. Liveness check: Fast, in-memory, 0 external calls
    .AddCheck("self", () => HealthCheckResult.Healthy("Process is running"), tags: ["live"])

    // 2. Readiness checks: External dependencies with strict timeouts
    .AddSqlServer(
        connectionString: builder.Configuration.GetConnectionString("SqlDatabase")!,
        healthQuery: "SELECT 1;",
        name: "sql-database",
        failureStatus: HealthStatus.Unhealthy,
        tags: ["ready"],
        timeout: TimeSpan.FromSeconds(2))

    .AddRedis(
        redisConnectionString: builder.Configuration.GetConnectionString("Redis")!,
        name: "redis-cache",
        failureStatus: HealthStatus.Degraded, // Cache down = Degraded, not Unhealthy!
        tags: ["ready"],
        timeout: TimeSpan.FromSeconds(1));
```

---

### Step 2: Map Endpoints with Tag Predicates

```csharp
var app = builder.Build();

// Liveness Endpoint (Consumed by K8s Liveness Probe):
app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("live"),
    ResponseWriter = WriteSimpleResponse
});

// Readiness Endpoint (Consumed by K8s Readiness Probe):
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready"),
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
});
```

---

# Health Check Statuses: Healthy, Degraded, Unhealthy

A Principal Engineer distinguishes between **Degraded** and **Unhealthy**:

| Status | HTTP Status | Meaning | Action by Orchestrator |
|---|---|---|---|
| **Healthy** | 200 OK | All core and non-core systems operational. | Pod receives full traffic. |
| **Degraded** | 200 OK | Core database is up, but optional cache or analytics is down. App operates in fallback mode. | Pod continues receiving traffic. |
| **Unhealthy** | 503 Service Unavailable | Core database is unreachable; use cases cannot succeed. | Pod is temporarily removed from the load balancer. |

### Example: Redis Cache Failure as `Degraded`
If Redis goes down, Nova Commerce can still process orders by falling back to direct SQL queries. Marking the pod `Unhealthy` would take the entire store offline unnecessarily!

---

# Common Mistakes

❌ **Checking External Databases in `/health/live` (Liveness Probes)**
```csharp
// DISASTER: A database outage causes orchestrators to reboot all application pods continuously.
```
✅ **Liveness probes MUST be 100% in-memory self-checks.**

❌ **Running Heavy SQL Queries in Health Checks**
```csharp
healthQuery: "SELECT COUNT(*) FROM Orders" // ANTI-PATTERN: Scans whole table every 5 seconds!
```
✅ **Use lightweight queries: `SELECT 1;`.**

❌ **Missing Strict Timeouts on Health Checks**
```csharp
// If a dependency hangs for 60s, the health check blocks, causing K8s probe timeouts.
```
✅ **Set aggressive timeouts (1 to 2 seconds maximum) on all external dependency checks.**

---

# Architect's Decision

### Scenario
Nova Commerce runs 80 container pods on Azure Container Apps with high traffic.

### Standard Configuration:
1. **Startup Probe**: `/health/ready` (Initial delay: 5s, period: 5s, failure threshold: 10).
2. **Liveness Probe**: `/health/live` (In-memory `self` check, period: 10s, timeout: 1s, restart pod on failure).
3. **Readiness Probe**: `/health/ready` (SQL Server, Redis, period: 5s, timeout: 2s, remove from load balancer on 503).
4. **Caching**: Use a 3-second in-memory cache on Readiness check results to prevent 80 pods from hammering SQL Server simultaneously.

---

# Principal Thinking

| Level | Perspective | Focus |
|---|---|---|
| **Junior** | Endpoint | "I added `app.MapHealthChecks("/health")` so I can see if it's up." |
| **Senior** | Integration | "I configured SQL and Redis health checks with JSON responses." |
| **Principal** | Orchestration & Failure Cascades | "How do our probes prevent death spirals? Why are Liveness and Readiness decoupled? How do we handle degraded modes without shedding unnecessary traffic?" |

---

# Learning Resources & References

### Authoritative Documentation
- [Health checks in ASP.NET Core — Microsoft Learn](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks)
- [Kubernetes Best Practices: Liveness and Readiness Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [AspNetCore.Diagnostics.HealthChecks Community Repository](https://github.com/Xabaril/AspNetCore.Diagnostics.HealthChecks)

---

# Self Assessment

1. Why must a Kubernetes Liveness probe NEVER check external dependencies like databases or caches?
2. What is the fundamental difference in orchestrator behavior when a Liveness probe fails vs when a Readiness probe fails?
3. What is the purpose of a Startup probe during application boot and database migration execution?
4. When should a dependency failure return `HealthStatus.Degraded` (HTTP 200) instead of `HealthStatus.Unhealthy` (HTTP 503)?
5. How does caching health check results prevent thousands of container instances from overloading backend infrastructure?
