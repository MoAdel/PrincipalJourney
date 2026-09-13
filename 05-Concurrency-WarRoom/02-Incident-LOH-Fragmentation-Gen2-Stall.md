# Incident 02: The 3-Second LOH Stop-The-World Freeze

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Kubernetes Pods on AKS (4 vCores, 1GB RAM Limit)  
> **Business Impact**: Checkout API freezing for 3.5 seconds every 2 minutes; Kubernetes OOM container kills; p99 latency spikes  
> **Competencies Mastered**: Large Object Heap (LOH > 85KB), Gen 2 Stop-The-World Compaction, Memory Fragmentation, `ArrayPool<byte>.Shared`

---

## 🚨 1. The 03:00 AM Crisis Briefing

During peak flash sales, customer checkouts regularly freeze for 3 to 4 seconds:

```text
[14:15:10] Azure Monitor Alert: Pod nova-api-7b8f experienced 3,420 ms pause in GC!
[14:15:14] Kestrel Warning: HTTP request timed out after 5,000 ms.
[14:17:30] Kubernetes Warning: Pod nova-api-7b8f terminated by OOM Killer (Memory exceeded 1024 MB).
[14:17:35] Prometheus Alert: dotnet_gc_pause_ratio_timestamp: 48% of total CPU time spent in GC pauses!
```

The on-call engineer checks total managed memory:
> *"The live managed heap is only 180 MB! Why did Kubernetes kill the pod for exceeding 1,024 MB? And why are all threads frozen for 3.5 seconds?!"*

---

## 🔍 2. Diagnostic Investigation

You capture a memory dump and inspect the GC heap in SOS:

```text
> !eeheap -gc
Number of GC Heaps: 4
------------------------------
Small object heap memory: 84,210,400 bytes (80 MB)
Large object heap memory: 812,450,120 bytes (774 MB)
------------------------------
Total GC Heap Size: 896,660,520 bytes (855 MB)
```

**774 Megabytes are trapped on the Large Object Heap (LOH)!**

Inspect the top allocated types on the LOH:
```text
> !dumpheap -stat -min 85000
              MT    Count    TotalSize Class Name
00007ffe34201048    8,450   804,200,000 System.Byte[]
```

Trace the allocation site in application code:

```csharp
public async Task<byte[]> GenerateInvoicePdfAsync(OrderDetails order)
{
    // FATAL ALLOCATION: Allocates a new 92,000 byte array on EVERY invoice request!
    byte[] buffer = new byte[92_000]; // >= 85,000 Bytes -> ALLOCATED DIRECTLY ON LOH!
    
    await _pdfRenderer.RenderToBufferAsync(order, buffer);
    return buffer;
}
```

---

## ⚙️ 3. Deep Engine Internals: Why it Happened

### 1. The 85,000-Byte Threshold
* In .NET, any object **$\ge 85,000$ bytes** bypasses Generations 0 and 1 completely and lands on the **Large Object Heap (LOH)**.
* **The Rule**: The LOH is **ONLY collected during a Generation 2 collection** (a full Stop-The-World GC).
* Every invoice generated forced the GC closer to a full Gen 2 collection, pausing all application threads for **over 3 seconds**!

### 2. LOH Fragmentation
* Unlike Gen 0 and Gen 1, the LOH is **NOT compacted by default** because moving large multi-megabyte objects across memory is too expensive for the CPU.
* Allocating slightly different sized byte arrays (e.g. 92,000 bytes, then 96,000 bytes, then 94,000 bytes) leaves **free-memory holes**.
* Even though 400 MB was technically "free", the holes were fragmented into small pockets. When a new 95,000-byte array was requested, the allocator couldn't find a contiguous 95KB hole and was forced to request new virtual memory from the OS, expanding process memory until Kubernetes **killed the container for OOM**!

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

### The Refactored Solution:

```csharp
// =========================================================================
// ZERO-ALLOCATION LOH HYGIENE: Rent from ArrayPool<byte>.Shared
// =========================================================================

public async Task RenderInvoicePdfAsync(OrderDetails order, Stream outputStream)
{
    // Rent an existing buffer from the pool (0 Bytes LOH allocation!)
    byte[] buffer = ArrayPool<byte>.Shared.Rent(minimumLength: 96_000);
    try
    {
        int bytesWritten = await _pdfRenderer.RenderToBufferAsync(order, buffer);

        // Stream the exact written slice directly to network socket
        await outputStream.WriteAsync(buffer.AsMemory(0, bytesWritten));
    }
    finally
    {
        // Return buffer to pool; clearArray: true prevents data leaks
        ArrayPool<byte>.Shared.Return(buffer, clearArray: true);
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (Direct Heap Allocation) | After (ArrayPool Pooling) |
|---|---|---|
| **LOH Memory Footprint** | **774 MB (Fragmented)** | **< 2.5 MB (Stable Pool)** |
| **Gen 2 Stop-The-World Pauses** | **3,420 ms every 2 mins** | **0 ms (Zero LOH Gen 2 Triggers)** |
| **Container OOM Kills** | 14 restarts / day | **0 restarts** |
| **p99 Invoice Latency** | 4,200 ms | **18 ms** |

---

## 🛡️ 5. The Socratic Duel

### Question 1 (The Senior Engineer):
> *"Why not just configure `GCSettings.LargeObjectHeapCompactionMode = GCLargeObjectHeapCompactionMode.CompactOnce` so the GC compacts the LOH on every collection?"*

**The Principal Defense**:
> *"Forcing LOH compaction on every collection is architectural suicide for a high-throughput API. Compacting the LOH requires the Garbage Collector to physically copy hundreds of megabytes of large objects across memory and update every pointer reference in the entire application while all threads are paused. Doing so would turn a 3-second pause into an 8-second freeze! The solution is **not compacting the garbage—the solution is not creating the garbage in the first place** by reusing buffers via `ArrayPool<byte>.Shared`."*

---

## 📜 6. The Executive Deliverable: ADR-002

```markdown
# ADR-002: Mandatory Buffer Pooling for Payloads Exceeding 85,000 Bytes

## Context
A SEV-1 outage occurred when 92KB PDF buffer allocations fragmented the Large Object Heap, triggering 3.5-second Gen 2 GC freezes and Kubernetes OOM container kills.

## Decision
1. Strictly forbid raw allocations of byte arrays or buffers $\ge 85,000$ bytes on request processing paths.
2. Mandate the use of `ArrayPool<byte>.Shared` with strict return semantics in `finally` blocks.
3. Stream PDF and media exports directly to output streams using `ReadOnlyMemory<byte>` without intermediate array cloning.

## Consequences
- **Positive**: Complete elimination of LOH fragmentation; GC pause times reduced from 3.5s to <2ms.
- **Negative**: Requires careful tracking of rented buffer lifetimes to prevent double-return errors.
```
