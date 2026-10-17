# Production Incident Post-Mortem — The ThreadPool Starvation Collapse

> **Incident Severity**: **SEV-1 (Total Service Blackout)**  
> **Date**: Cyber Friday, 20:34 UTC  
> **Duration**: 10 minutes  
> **Impacted Services**: Nova Commerce Web API, Checkout Gateway, Mobile App  
> **Financial Impact**: \$410,000 in dropped transactions; 9,800 active sessions dropped

---


> 📐 **Derive It (Fermi Mode): Capacity, Throughput & Memory Envelope**
> - **Inputs**: `TargetRPS = 2000`, `OperationLatencyMs = 8`, `PayloadKB = 16`
> - **Formula**: `ConcurrentInFlightMemoryMB = (TargetRPS * (OperationLatencyMs / 1000) * PayloadKB) / 1024`
> - **Step-by-Step**:
>   1. Concurrent in-flight operations by Little's Law: $L = 2,000 \times 0.008\text{ s} = 16\text{ active operations}$.
>   2. Steady-state buffer footprint: $16 \times 16\text{ KB} = 256\text{ KB}$ ($0.25\text{ MB}$).
> - **What-If Sensitivity**: If downstream contention degrades `OperationLatencyMs` from `8ms` to `4,000ms`, concurrency spikes $500\times$ to $8,000\text{ in-flight operations}$ ($128\text{ MB}$ + thread/socket exhaustion). Always verify how your lab holds under $10\times$ latency degradation!


## 1. Executive Summary

At 20:34 UTC on Cyber Friday, Nova Commerce experienced a total platform outage across all 32 production pods within 45 seconds of a routine hotfix deployment.
Incoming customer requests timed out after 30 seconds with `504 Gateway Timeout`.
The root cause was **ThreadPool Starvation** triggered by a single synchronous wait (`.Result`) on an asynchronous method inside a custom tenant authorization middleware.
Under high traffic (24,000 RPS), all available ThreadPool worker threads blocked synchronously.
The continuations required to complete the tasks were queued behind the blocked threads.
Because the ThreadPool's Hill Climbing algorithm only injects 1 to 2 new threads per second under high CPU, the system entered an unrecoverable starvation deadlock.

---

## 2. Incident Timeline

| Time (UTC) | Event |
|---|---|
| **20:30:00** | System operating smoothly at 24,000 RPS. P99 latency: 18ms. ThreadPool: 18 active threads. |
| **20:34:00** | Hotfix commit `7c4b2a` ("Add tenant logging to middleware") finishes rollout to all 32 AKS pods. |
| **20:34:30** | Middleware invokes `GetTenantDetailsAsync(context).Result`. Calling worker threads block. |
| **20:34:50** | Sockets pile up. Active worker threads hit pool limit (250 / 250). |
| **20:35:10** | ThreadPool queue exceeds 14,000 waiting work items. CPU reaches 100% due to OS context switching. |
| **20:35:25** | Kubernetes Readiness probes (`/healthz/ready`) time out. Ingress marks all 32 pods as Unready! |
| **20:35:40** | Total blackout. Ingress controllers return `504 Gateway Timeout` for 96.4% of incoming traffic. |
| **20:38:00** | Principal Engineer connects via `kubectl exec`, collects process dump using `dotnet-dump`. |
| **20:40:00** | SOS debugger `!threadpool` confirms 250 threads blocked in `Task.get_Result()`. |
| **20:42:00** | Emergency rollback deployed, replacing `.Result` with `await`. |
| **20:44:00** | Rollout complete. Thread count drops to 18; queue drops to 0; p99 latency normalizes to 14ms. |
| **20:45:00** | Incident officially closed. |

---

## 3. 5-Whys Root Cause Analysis

1. **Why did the application return 504 Gateway Timeouts?**  
   Kubernetes ingress controllers could not reach healthy pods because all 32 pods failed readiness health checks.
2. **Why did health checks fail?**  
   Kestrel could not process health check requests because the .NET ThreadPool had zero available worker threads.
3. **Why were all 250 worker threads consumed?**  
   Every incoming HTTP request blocked its assigned worker thread on `Task.get_Result()`.
4. **Why couldn't the tasks complete?**  
   The asynchronous database continuation required a worker thread to execute, but all worker threads were already blocked waiting for that continuation.
5. **Why was `.Result` called instead of `await`?**  
   A senior engineer called `.Result` to bypass making a helper method asynchronous, unaware that ASP.NET Core request pipelines under high concurrency enter ThreadPool starvation cascades.

---

## 4. Preventative Architectural Guardrails

### Action Item 1: Compiler Build Gates (Roslyn Analyzers)
* **Action**: Added `Microsoft.VisualStudio.Threading.Analyzers` to `Directory.Build.props`.
* **Effect**: Enforced `VSTHRD002` (Avoid synchronous waits) as a **compilation error**. Any commit containing `.Result` or `.Wait()` fails the CI build automatically.

### Action Item 2: Telemetry Alerts on ThreadPool Queue Length
* **Action**: Configured Prometheus alerting rule on `dotnet_threadpool_queue_length > 50` for 10 seconds.
* **Effect**: Alerts on early signs of starvation minutes before health checks fail.

### Action Item 3: Health Checks on Dedicated Thread Pool
* **Action**: Configured Kubernetes liveness and readiness probes to run on separate unblocked sockets with strict timeouts.
