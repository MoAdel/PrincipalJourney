# 23 - Production Incident Post-Mortem: The Black Friday Cascade

> "A good engineer resolves an incident.
>
> A Principal Engineer redesigns the system so the entire class of failure becomes impossible."

---

# Incident Overview

| Field | Detail |
|---|---|
| **Incident Title** | Nova Commerce Global Checkout Cascade & Payment Loop Outage |
| **Severity** | SEV-1 (Critical Revenue Impact) |
| **Date / Time** | Friday, Nov 27, 2026 — 11:15 UTC to 13:45 UTC |
| **Duration** | 2 Hours 30 Minutes |
| **Financial Impact** | ~$380,000 in lost gross merchandise value; $42,000 in disputed charge fees |
| **Incident Commander** | Principal Software Engineer |

---

# Incident Timeline

```
11:15 UTC ──► Flash Sale begins. Traffic surges to 35,000 requests/sec.
11:22 UTC ──► Database I/O latency increases from 4ms to 850ms.
11:25 UTC ──► Kubernetes Liveness probes time out; orchestrator begins killing all 60 API pods.
11:32 UTC ──► New pods restart, hit SQL connection pool limits, fail liveness probes again (CrashLoopBackOff).
11:45 UTC ──► Customers click "Retry" on mobile apps; 3,200 duplicate orders submitted.
12:05 UTC ──► API nodes exhaust all outbound TCP ephemeral ports (SocketException 10048).
12:30 UTC ──► Principal Engineer declares SEV-1, enables traffic shedding, decouples probes.
13:15 UTC ──► Hotfix deployed with in-memory liveness probe, typed HttpClient, and idempotency cache.
13:45 UTC ──► Latency stabilizes to 45ms; all pods healthy; incident resolved.
```

---

# The Four Compounding Root Causes

This catastrophic failure was not caused by a single bug. It was a **cascading multi-system failure** triggered by four interconnected design flaws:

### 1. The Liveness Probe Death Spiral
- **Flaw**: Kubernetes Liveness probe pointed to `/health`, which executed `SELECT 1 FROM Orders`.
- **Failure**: When database I/O spiked, the query took 3 seconds, exceeding the 1-second probe timeout.
- **Impact**: Kubernetes terminated all healthy pods, turning a slight database delay into a total cluster outage.

### 2. Socket Exhaustion in Tax Calculation Service
- **Flaw**: Third-party tax calculation client instantiated `using var client = new HttpClient()` per request.
- **Failure**: 35,000 req/sec created over 50,000 sockets stuck in `TIME_WAIT` state.
- **Impact**: Kestrel ran out of OS ephemeral ports, preventing all outbound calls to payment processors.

### 3. GC Memory Pressure from Unstructured Logging
- **Flaw**: Hot-path logging used string interpolation:
  `_logger.LogInformation($"Processing order {order.Id} for customer {order.CustomerId} with amount {order.Total}");`
- **Failure**: Allocated over 800 MB/sec of heap garbage, keeping GC Gen 0/1 threads permanently active.
- **Impact**: CPU pinned at 100%, causing thread-pool starvation and Kestrel request queuing.

### 4. Non-Idempotent Checkout Retries
- **Flaw**: `POST /api/v1/orders` lacked idempotency key deduplication.
- **Failure**: Frustrated users clicked "Submit Order" multiple times during timeout delays.
- **Impact**: Payment processor charged duplicate credit cards, generating thousands of customer support escalations.

---

# Diagnostic Evidence & Triage Commands

During the incident, the Principal Engineer executed the following diagnostic steps:

### 1. Investigating Socket Exhaustion (Linux Container Shell)
```bash
# Count sockets by TCP state:
netstat -nat | awk '{print $6}' | sort | uniq -c | sort -n

# Output during incident:
#     14 LISTEN
#    182 ESTABLISHED
#  54821 TIME_WAIT    <-- ROOT CAUSE: Socket Exhaustion!
```

### 2. Investigating GC Allocations (`dotnet-dump`)
```bash
# Capture memory dump from high-CPU pod:
dotnet-dump collect -p 1

# Analyze top allocated types:
dotnet-dump analyze dump_20261127.dmp
> dumpheap -stat

# Output:
# MT                 Count     TotalSize Class Name
# 00007ff8a12b       842910    53946240  System.String
# 00007ff8a12e       421455    26973120  System.Object[]
# (Over 65% of heap was string formatting arrays from ILogger calls)
```

---

# The 5 Whys Root Cause Analysis

1. **Why did checkout fail?**  
   Because the Web API pods entered CrashLoopBackOff and exhausted TCP sockets.
2. **Why did pods enter CrashLoopBackOff?**  
   Because Kubernetes killed them when the `/health` endpoint timed out.
3. **Why did `/health` time out?**  
   Because it was querying the database, which was under heavy load.
4. **Why was the database under heavy load?**  
   Because 60 restarted pods simultaneously attempted to rebuild connection pools and customers were retrying duplicate orders.
5. **Why were duplicate orders submitted?**  
   Because the checkout API lacked idempotency keys, allowing multiple `POST` requests to execute identical charges.

---

# Corrective Actions & Architectural Remediations

| Action Item | Owner | Target Date | Status |
|---|---|---|---|
| Decouple Kubernetes Liveness probe to fast in-memory `self` check | Principal Eng | Day 0 (Immediate) | ✅ Done |
| Refactor all outbound HTTP integrations to typed clients via `IHttpClientFactory` | Senior Eng | Day 1 | ✅ Done |
| Replace all string-interpolated logging with `[LoggerMessage]` source generators | Feature Team | Day 3 | ✅ Done |
| Implement `Idempotency-Key` filter with Redis distributed locks for all financial endpoints | Lead Architect | Day 5 | ✅ Done |
| Add Polly circuit breaker and jittered retries to Tax Calculation integration | Senior Eng | Day 5 | ✅ Done |

---

# Key Lessons for Principal Engineers

1. **Never allow health probes to create death spirals**: Liveness must NEVER depend on external infrastructure.
2. **Never create `HttpClient` directly in request pipelines**: Always pool sockets via `IHttpClientFactory` or `SocketsHttpHandler`.
3. **Idempotency is mandatory for all mutating financial operations**: Networks will fail; clients will retry; your API must make retries safe.
4. **Logs are telemetry, not strings**: String allocations in hot paths can overwhelm garbage collection and destroy application throughput.
