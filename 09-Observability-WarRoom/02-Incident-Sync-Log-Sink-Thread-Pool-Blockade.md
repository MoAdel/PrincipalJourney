# Incident 02: The Synchronous Network Log Sink ThreadPool Blockade

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: ASP.NET Core 9 Payment API / Serilog HTTP / Elasticsearch Log Sink  
> **Business Impact**: When the internal Elasticsearch logging cluster stalled for 10 seconds, 100% of customer Payment API requests timed out!  
> **Competencies Mastered**: Non-Blocking Telemetry Invariant, Synchronous `ILogger` Pipeline Execution, Bounded Background Batching (`BoundedChannelFullMode.DropWrite`), STDOUT Container Logging (`Console` JSON $ightarrow$ DaemonSet Collector)

---

## 🚨 1. The 06:15 PM Crisis Briefing

At `18:15:00`, the internal Elasticsearch / Logstash cluster underwent a yellow/red shard rebalancing pause. Instantly, the tier-0 **Payment Authorization API** (which should have zero functional dependency on logging!) went completely dark:

```text
[18:15:02] Infra Event: Elasticsearch logging cluster ingest queue full (HTTP 429 / TCP Backpressure).
[18:15:06] RED HERRING: Payment Lead yells "The Payment Database must be locked up — all API calls are hanging!"
[18:15:15] Payment Pod Alert: .NET ThreadPool Queue Length jumped from 0 to 18,400! CPU dropped to 3%!
```

> 📐 **Derive It (Fermi Mode): Synchronous Log Flush Starving the Kestrel ThreadPool**
> - **Inputs**: `PaymentRPS = 1500`, `LogsPerRequest = 4`, `SinkTimeoutSec = 5`, `WorkerThreadsPerPod = 64`
> - **Formula**: `TimeToFreezePodMs = (WorkerThreadsPerPod / PaymentRPS) * 1000`
> - **Step-by-Step**:
>   1. In .NET, `ILogger.LogInformation(...)` is a **synchronous void method** (`void Log<TState>(...)`).
>   2. A misconfigured custom log sink (or unbuffered synchronous Console/Network lock when stdout pipe buffer `64 KB` fills up) blocked the calling Kestrel request thread waiting for the network log sink to acknowledge!
>   3. At `1,500 RPS` across 10 pods (`150 RPS/pod`), all `64` worker threads on a pod hit `_logger.LogInformation` and blocked within $\frac{64}{150} = 0.42\text{ seconds}$ (`426 milliseconds`)!
>   4. **An observability outage caused a 100% Tier-0 Payment outage!**
> - **What-If Sensitivity**: Decoupling application logging via an **Asynchronous Bounded Ring Buffer (`DropWrite` when full)** or writing asynchronous JSON to container `stdout` scraped by a node-level **OpenTelemetry Collector / FluentBit DaemonSet** guarantees **`0.00ms` network blocking on Kestrel threads** even if Elasticsearch is unplugged completely!

<!-- TELEMETRY_WIDGET: title="Log Sink Backpressure Freezing Payment API" metric1="ThreadPool Queue Length" metric2="Payment API CPU (%)" threshold="100 Max ThreadPool Queue" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Rule out the "Payment Database Locked" Red Herring — capture live thread stacks in 500ms!
kubectl exec -n prod deploy/payment-api -- dotnet-stack report -p 1 | grep -A 8 "System.Threading.Monitor.Wait"
# Output: 64 threads blocked inside:
#   System.Threading.Monitor.ObjWait()
#   MyCustomNetworkLogSink.Emit(LogEvent)
#   Microsoft.Extensions.Logging.Logger.Log()
```

### Observed Culprit Code Snippet
```csharp
// ❌ SYNCHRONOUS BLOCKING I/O INSIDE AN ILoggerProvider / SINK:
public void Write(LogEvent logEvent)
{
    lock (_syncLock) // ❌ Serializes all 64 Kestrel threads on a single lock!
    {
        // ❌ Blocks the HTTP request thread if the logging server is slow!
        _httpClient.PostAsync(_elasticUrl, new StringContent(Format(logEvent))).GetAwaiter().GetResult();
    }
}
```

<!-- PREDICT_GATE: Commit your hypothesis: Why did Payment API CPU drop to 3% while latency hit 30,000ms, and why must observability pipelines ALWAYS fail open (`DropWrite` / `DropOldest`) rather than backpressuring customer transactions? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. The Cardinal Rule of Observability: Never Backpressure the Business Path
* For business transactions (Orders, Payments), backpressure (`BoundedChannelFullMode.Wait`) protects data integrity.
* For **telemetry** (Logs, Traces, Metrics), the rule is the **exact opposite**: if the telemetry collector is down or full, **drop telemetry (`DropWrite` / `DropOldest`) in `< 50 nanoseconds` and let the payment succeed**!

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Logs;
using OpenTelemetry.Trace;

namespace PrincipalJourney.Observability.WarRoom;

public static class NonBlockingObservabilitySetup
{
    public static IServiceCollection AddNonBlockingPrincipalTelemetry(this IServiceCollection services)
    {
        services.AddOpenTelemetry()
            .WithTracing(tracing =>
            {
                tracing.AddAspNetCoreInstrumentation()
                       .AddOtlpExporter(otlp =>
                       {
                           // Export via non-blocking background BatchExportProcessor (drops if queue > 2048)
                           otlp.ExportProcessorType = ExportProcessorType.Batch;
                           otlp.BatchExportProcessorOptions = new BatchExportProcessorOptions<Activity>
                           {
                               MaxQueueSize = 4096,
                               ScheduledDelayMilliseconds = 2000,
                               ExporterTimeoutMilliseconds = 5000,
                               MaxExportBatchSize = 512
                           };
                       });
            });

        return services;
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (Sync Network Log Sink) | After (Async OTel Batch Processor / Stdout DaemonSet) | Validation & Rollback Procedure |
|---|---|---|---|
| **Payment API Latency When Log Cluster Dies** | `30,000 ms` (`100%` Outage) | **`4.2 ms`** (`0.0%` Customer Impact) | Chaos test blackholes OTel Collector IP via `iptables -j DROP`; assert Payment API p99 changes by `< 0.5ms`. |
| **Kestrel Thread Contention on Logging** | `18,400` queued threads | **`0`** | Monitor `ThreadPool.QueueLength` and `Monitor.LockContentionCount`. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why not just replace `.GetAwaiter().GetResult()` inside the log sink with `_ = Task.Run(() => _httpClient.PostAsync(...))` (fire-and-forget)?"*

**The Principal Defense**:
> *"Unbounded `Task.Run()` fire-and-forget on every log statement at `1,500 RPS` ($	imes 4	ext{ logs/req} = 6,000	ext{ tasks/sec}$) during an Elasticsearch outage queues **360,000 hung `Task` closures and `HttpRequestMessage` buffers per minute** onto the .NET ThreadPool and Managed Heap! That still starves the ThreadPool and crashes the pod with `OutOfMemoryException` in 90 seconds! You must use a **fixed-size Bounded Ring Buffer (`MaxQueueSize = 4096`)** that drops excess items in $O(1)$ without allocating tasks."*

### Question 2 (The Second-Order Failure Mode):
> *"Wait — what if a compliance regulation requires that `SecurityAudit` events (like admin privilege changes) MUST NEVER be dropped even if the log collector is down?"*

**The Principal Defense**:
> *"Compliance audit trails are **domain data, not diagnostic logs**! Never send regulatory compliance events through `ILogger`! Regulatory audit records must be written transactionally to the database (`AuditLedger` table / Transactional Outbox) in the same ACID transaction as the state mutation. If the audit write fails, the admin action itself rolls back."*

### Question 3 (The FinOps / Cost Axis):
> *"Our developers log 6 `LogInformation` JSON payloads per HTTP request across 10,000 RPS, generating 38 TB/month of logs costing $76,000/month in log ingestion. Defend the 80%-good alternative at 10% of the cost."*

**The Principal Defense**:
> *"Logging 6 `Information` lines per successful `200 OK` request at `10,000 RPS` is pure financial waste. We switch to **Canonical Log Lines (1 single summary event per request) + Tail-Sampled Distributed Tracing**: keep `100%` of `4xx/5xx` errors and slow requests (`> 500ms`), and sample `1%` of fast `200 OK` requests at the OTel Collector. Ingestion drops from `38 TB/mo` to `2.4 TB/mo`, saving **$71,200/month** while retaining 100% of error diagnostics!"*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-0902 — Synchronous Log Sink ThreadPool Blockade

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 1 minute | **Mitigation Latency (TTM)**: 9 minutes

## Five Whys Root Cause Chain
1. **Why did Payment API time out completely?** -> All 64 worker threads per pod were blocked waiting on a monitor lock.
2. **Why was the lock held for 5+ seconds?** -> The thread holding the lock was doing a synchronous HTTP POST to Elasticsearch.
3. **Why did Elasticsearch stall?** -> Shard rebalancing filled its ingestion queue.
4. **Why did an observability tool stall a Tier-0 payment path?** -> Custom log sink performed synchronous network I/O instead of writing to a bounded drop-on-full memory buffer or container stdout.
5. **Why didn't staging catch it?** -> Staging never simulated a slow/unreachable log collector.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Remove synchronous network sink; use OTel BatchProcessor / stdout JSON + DaemonSet collector | Platform Team | Chaos test drops collector traffic during k6 load test |
| P1 | Enable `[LoggerMessage]` source-generated logging and drop verbose `Information` logs in prod | Payment Team | Verified 88% reduction in log byte volume |
```
