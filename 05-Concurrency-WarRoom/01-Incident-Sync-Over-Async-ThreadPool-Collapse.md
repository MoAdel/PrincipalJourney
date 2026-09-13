# Incident 01: The ThreadPool Starvation Cascade

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Azure Container Apps (32 Pods, 8 vCores each) running .NET 9 Web API  
> **Business Impact**: \$410,000 lost in 10 minutes; 100% CPU pinned across all nodes; 96.4% of requests failing with 504 Gateway Timeout  
> **Competencies Mastered**: ThreadPool Mechanics, Hill Climbing Algorithm, SOS Core Dump Analysis, Sync-Over-Async Elimination

---

## 🚨 1. The 03:00 AM Crisis Briefing

At 20:34 UTC on Cyber Friday, a senior engineer deploys commit `7c4b2a` to log tenant identity in a custom middleware:

```text
[20:34:50] Ingress Alert: /api/v1/orders p99 latency spikes from 18ms to 29,400ms!
[20:35:10] CPU Alarm: 32 AKS nodes jump from 14% to 100.0% CPU utilization simultaneously!
[20:35:25] Kubernetes Event: Pod readiness probe failed (HTTP timeout after 2.0s). Pods marked Unready.
[20:35:45] Ingress Gateway: 504 Gateway Timeout on 96.4% of incoming traffic. Complete platform blackout!
```

The engineering manager suggests:
> *"The servers are overwhelmed! Scale from 32 to 96 pods immediately!"*

They scale to 96 pods. The new pods boot up, receive traffic for 10 seconds, and immediately spike to 100% CPU and freeze!

---

## 🔍 2. Diagnostic Investigation

You capture a live process dump with `dotnet-dump` and run SOS commands:

```text
> !threadpool
CPU utilization: 100%
Worker Thread: Total: 250, Running: 250, Idle: 0, MaxLimit: 32767, MinLimit: 8
Work Request in Queue: 14,820
--------------------------------------
Number of Timers: 42
Completion Port Thread: Total: 4, Free: 4, MaxLimit: 1000, MinLimit: 8
```

Inspect the managed stack traces across all threads:

```text
> ~*e !clrstack
OS Thread: 0x4f2a (Managed Thread 42)
Child SP       IP Function
00007ffe34a1   System.Threading.Tasks.Task.GetResultCore(Boolean)
00007ffe3560   System.Threading.Tasks.Task`1.get_Result()
00007ffe35c0   NovaCommerce.Api.Middleware.TenantLoggingMiddleware.InvokeAsync(...)
```

### The Fatal Code (`TenantLoggingMiddleware.cs`):
```csharp
public async Task InvokeAsync(HttpContext context)
{
    // Calling .Result inside an async pipeline!
    var tenant = _tenantResolver.GetTenantDetailsAsync(context).Result; // BLOCKS WORKER THREAD!
    context.Items["Tenant"] = tenant;
    await _next(context);
}
```

---

## ⚙️ 3. Deep Engine Internals: Why it Happened

### 1. The ThreadPool Starvation Trap
* `GetTenantDetailsAsync` initiates an asynchronous database read.
* Calling `.Result` blocks the calling ThreadPool worker thread synchronously.
* When the database responds, the continuation task (`MoveNext()`) is queued to the ThreadPool.
* But all 250 worker threads are **already blocked** on `.Result`!
* The continuation sits in the queue behind 14,820 waiting requests.

### 2. The Hill Climbing Trap
* Why doesn't the ThreadPool spawn 500 new threads immediately?
* The **Hill Climbing algorithm** measures throughput against thread count. Because CPU is at 100% (from thread context-switching), the algorithm assumes the CPU is saturated with real compute and throttles thread injection to **only 1 to 2 threads per second**!
* It would take **over 2 hours** to inject enough threads to clear the 14,820 queued items!

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

### The Refactored Solution:

```csharp
// =========================================================================
// 1. PURE ASYNC ALL THE WAY DOWN (TenantLoggingMiddleware.cs)
// =========================================================================
public class TenantLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ITenantResolver _tenantResolver;

    public TenantLoggingMiddleware(RequestDelegate next, ITenantResolver tenantResolver)
    {
        _next = next;
        _tenantResolver = tenantResolver;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Zero thread blocking: Yields thread back to ThreadPool during I/O wait!
        var tenant = await _tenantResolver.GetTenantDetailsAsync(context);

        context.Items["Tenant"] = tenant;
        await _next(context);
    }
}
```

### Automated CI Prevention Gate (`Directory.Build.props`):
```xml
<ItemGroup>
  <PackageReference Include="Microsoft.VisualStudio.Threading.Analyzers" Version="17.10.*">
    <PrivateAssets>all</PrivateAssets>
  </PackageReference>
</ItemGroup>
<PropertyGroup>
  <!-- VSTHRD002: Avoid problem synchronous waits (.Result, .Wait()) -->
  <WarningsAsErrors>$(WarningsAsErrors);VSTHRD002</WarningsAsErrors>
</PropertyGroup>
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (The Incident) | After (Pure Async Refactor) |
|---|---|---|
| **Active Worker Threads** | **250 threads (Saturated)** | **18 threads** |
| **Queued Work Items** | 14,820 items | **0 items** |
| **CPU Utilization** | **100.0%** (Context switching) | **12.4%** |
| **p99 Request Latency** | 29,400 ms (Timeouts) | **14 ms** |

---

## 🛡️ 5. The Socratic Duel

### Question 1 (The Senior Developer):
> *"Why not just call `Task.Run(() => GetTenantDetailsAsync(context)).Result` to avoid deadlocking the calling thread?"*

**The Principal Defense**:
> *"Wrapping a task in `Task.Run` and then calling `.Result` does not solve starvation—it multiplies it! Now, instead of blocking 1 thread, you block **2 separate ThreadPool worker threads**: the calling thread is blocked on `.Result`, and a second thread is dispatched to execute `GetTenantDetailsAsync`. You consume twice as many threads from the exact same shared pool, accelerating starvation by 200%. The only valid architecture is asynchronous all the way down: `await` without blocking."*

---

## 📜 6. The Executive Deliverable: ADR-001

```markdown
# ADR-001: Strict Prohibition of Synchronous Task Blocking

## Context
A total platform outage occurred when a `.Result` invocation in middleware triggered a 250-thread ThreadPool starvation cascade.

## Decision
1. Strictly forbid `.Result`, `.Wait()`, and `.GetAwaiter().GetResult()` across the entire solution.
2. Treat Roslyn Analyzer rule `VSTHRD002` as a fatal compilation error in CI/CD pipelines.
3. Configure Prometheus alerts on `dotnet_threadpool_queue_length > 50`.

## Consequences
- **Positive**: Complete elimination of sync-over-async thread starvation; predictable low CPU utilization.
- **Negative**: Requires all helper methods in the call stack to be declared asynchronous.
```
