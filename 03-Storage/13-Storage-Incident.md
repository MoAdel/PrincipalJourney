# 13 - Production Incident Post-Mortem: The 50GB Memory Leak

> "When an application allocates a 2 GB byte array on a 32 GB server, it doesn't just consume memory.
>
> It fractures the Large Object Heap, freezes garbage collection threads, and cascades into total service unavailability."

---


> 📐 **Derive It (Fermi Mode): Capacity, Throughput & Memory Envelope**
> - **Inputs**: `TargetRPS = 2000`, `OperationLatencyMs = 8`, `PayloadKB = 16`
> - **Formula**: `ConcurrentInFlightMemoryMB = (TargetRPS * (OperationLatencyMs / 1000) * PayloadKB) / 1024`
> - **Step-by-Step**:
>   1. Concurrent in-flight operations by Little's Law: $L = 2,000 \times 0.008\text{ s} = 16\text{ active operations}$.
>   2. Steady-state buffer footprint: $16 \times 16\text{ KB} = 256\text{ KB}$ ($0.25\text{ MB}$).
> - **What-If Sensitivity**: If downstream contention degrades `OperationLatencyMs` from `8ms` to `4,000ms`, concurrency spikes $500\times$ to $8,000\text{ in-flight operations}$ ($128\text{ MB}$ + thread/socket exhaustion). Always verify how your lab holds under $10\times$ latency degradation!


# Incident Overview

| Field | Detail |
|---|---|
| **Incident Title** | Nova Commerce Catalog Import Cluster Out-Of-Memory Cascade |
| **Severity** | SEV-1 (Critical Cluster Outage) |
| **Date / Time** | Thursday, Sep 17, 2026 — 14:45 UTC to 17:15 UTC |
| **Duration** | 2 Hours 30 Minutes |
| **Financial Impact** | $185,000 in delayed catalog merchant launches; 4,200 merchant support tickets |
| **Incident Commander** | Principal Infrastructure Architect |

---

# Incident Timeline

```
14:45 UTC ──► 20 large retail merchants initiate automated bulk catalog imports (files: 500MB to 2.5GB CSV/JSON).
14:52 UTC ──► Web API pods report RAM usage jumping from 1.2 GB to 28 GB within 7 minutes.
14:58 UTC ──► Kubernetes OOMKiller terminates 14 out of 16 API pods simultaneously.
15:05 UTC ──► Remaining 2 pods experience 100% CPU lockup due to continuous Gen 2 Full GC sweeps.
15:20 UTC ──► Automated HPA scales cluster to 40 nodes; new nodes crash within 90 seconds of receiving traffic.
15:45 UTC ──► Principal Architect declares SEV-1, enables emergency ingress payload rate-limiting (413 Payload Too Large).
16:15 UTC ──► Root cause identified: Controller used `MemoryStream.ToArray()` on incoming file uploads.
16:45 UTC ──► Hotfix deployed replacing `MemoryStream` with direct `System.IO.Pipelines` stream parser and SAS tickets.
17:15 UTC ──► Cluster memory stabilizes at 450 MB per pod; all catalog uploads successfully processing.
```

---

# Root Cause Analysis (The 5 Whys)

1. **Why did the API pods crash?**  
   Because the Linux kernel OOMKiller terminated the processes when RAM reached the 32 GB container limit.
2. **Why was RAM consumption so high?**  
   Because 20 concurrent file uploads each allocated 500 MB to 2.5 GB byte arrays in memory simultaneously.
3. **Why were large byte arrays allocated?**  
   Because the endpoint executed `await file.CopyToAsync(memoryStream)` followed by `memoryStream.ToArray()`.
4. **Why did this degrade the entire server instead of just those 20 requests?**  
   Because allocations $> 85,000$ bytes land on the **Large Object Heap (LOH)**. LOH memory fragmentation forced the CLR into continuous, blocking Gen 2 Full Garbage Collection pauses.
5. **Why were files routed through the Web API in the first place?**  
   Because the architecture lacked a Direct Client-to-Storage upload mechanism using SAS tokens.

---

# Permanent Corrective Actions

| Action Item | Owner | Target Date | Status |
|---|---|---|---|
| Enforce strict 10 MB maximum request body limit on all synchronous API endpoints | Security Eng | Day 0 (Immediate) | ✅ Done |
| Deploy Direct Client-to-Storage User Delegation SAS ticket architecture for all bulk uploads | Principal Arch | Day 1 | ✅ Done |
| Refactor all internal file stream parsers to `System.IO.Pipelines.PipeReader` | Platform Team | Day 3 | ✅ Done |
| Add memory profiling regression tests in CI with BenchmarkDotNet verifying zero LOH allocations | QA / Performance | Day 5 | ✅ Done |
