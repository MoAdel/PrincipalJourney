# Incident 04: The AsyncLocal 16GB Memory Contamination

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Multi-Tenant Microservice running .NET 9 on AKS  
> **Business Impact**: Memory grew from 300MB to 16GB in 12 hours; cross-tenant data privacy violation; pods crashing in OOM loops  
> **Competencies Mastered**: `ExecutionContext` Flow & Capture, `AsyncLocal<T>` Copy-On-Write Trees, Ambient State Leaks, `ExecutionContext.SuppressFlow`

---

## 🚨 1. The 03:00 AM Crisis Briefing

At 06:15 AM, Nova Commerce's Security Operations Center (SOC) flags a severe data privacy violation:

```text
[SECURITY ALERT]: Tenant "Nike Store" received telemetry logs containing order data 
and customer PII belonging to Tenant "Adidas Retail"!
Cross-tenant contamination detected in AuditService logs!
```

Simultaneously, the operations team reports:
```text
[06:16:10] Kubernetes Alert: Pod nova-orders-9d41 exceeded 16,384 MB RAM (Limit: 16 GB)!
[06:16:15] Linux OOM Killer executed. Pod killed with Exit Code 137.
[06:16:40] New pod restarts, hits 4GB RAM within 45 minutes!
```

The CISO and CTO demand immediate answers:
> *"Why is one customer's private data leaking into another customer's session? And why is our order service consuming 16 Gigabytes of RAM doing simple JSON processing?!"*

---

## 🔍 2. Diagnostic Investigation

You inspect the heap dump in SOS using `!dumpheap -stat`:

```text
> !dumpheap -stat
              MT    Count    TotalSize Class Name
00007ffe34211048    2,450,000  196,000,000 System.String
00007ffe34289410      420,000 12,400,000,000 System.Collections.Generic.Dictionary`2[[System.String],[System.Object]]
```

**12.4 Gigabytes are consumed by 420,000 `Dictionary<string, object>` instances!**

Run `!gcroot` on one of the dictionaries:

```text
> !gcroot 0000021b40018a40
Thread 0x1f44:
    -> System.Threading.ExecutionContext
    -> System.Threading.AsyncLocalValueMap
    -> NovaCommerce.Core.Telemetry.AmbientContext.CurrentBag
```

### The Fatal Code (`AmbientContext.cs`):

```csharp
public static class AmbientContext
{
    // FATAL ARCHITECTURAL FLAW: Mutable dictionary stored in AsyncLocal!
    private static readonly AsyncLocal<Dictionary<string, object>> _currentBag = new();

    public static Dictionary<string, object> Current => 
        _currentBag.Value ??= new Dictionary<string, object>();

    public static void SetData(string key, object value)
    {
        Current[key] = value;
    }
}
```

---

## ⚙️ 3. Deep Engine Internals: Why it Happened

### 1. `ExecutionContext` Flows Downward Across Threads
* When an asynchronous operation or fire-and-forget task is spawned (`Task.Run` or background timers), the runtime **captures the calling thread's `ExecutionContext`** and attaches it to the child task.
* In an ASP.NET Core request, when background queue workers were spawned, they **captured the HTTP request's `AsyncLocal` dictionary**.

### 2. The Cross-Tenant Contamination
* Because developers mutated the dictionary in-place (`Current[key] = value`), child threads shared the exact same dictionary reference!
* If a background worker processed an event for Tenant B while holding the captured context of Tenant A, Tenant A's customer IDs and billing data were appended to Tenant B's telemetry stream!

### 3. The 16GB Memory Leak
* Every captured dictionary remained strongly rooted in memory as long as the background worker lived.
* Because the background worker was a long-lived Singleton service, **every HTTP request's telemetry dictionary was retained permanently on the heap**, promoting to Gen 2 and exhausting 16 GB of RAM!

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

### The Refactored Solution:

```csharp
// =========================================================================
// 1. IMMUTABLE VALUE TYPES IN ASYNCLOCAL (AmbientContext.cs)
// =========================================================================

public readonly record struct TenantContext(string TenantId, string CorrelationId);

public static class AmbientContext
{
    // Store ONLY immutable value records; NEVER mutable collections!
    private static readonly AsyncLocal<TenantContext> _current = new();

    public static TenantContext Current
    {
        get => _current.Value;
        set => _current.Value = value; // Copy-on-write creates a clean new value
    }
}

// =========================================================================
// 2. SUPPRESS CONTEXT FLOW FOR BACKGROUND WORKERS (BackgroundDispatcher.cs)
// =========================================================================

public class BackgroundDispatcher
{
    public void EnqueueWork(Action work)
    {
        // Suppress flow so background workers NEVER inherit request context or tenant data!
        using (ExecutionContext.SuppressFlow())
        {
            ThreadPool.QueueUserWorkItem(_ => work());
        }
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (Mutable AsyncLocal) | After (Immutable Record + SuppressFlow) |
|---|---|---|
| **Process Memory Footprint** | **16,384 MB (OOM Crash)** | **280 MB (Stable)** |
| **Gen 2 Heap Allocations** | 12.4 GB in dictionaries | **0 Bytes (Ephemeral Stack/Gen 0)** |
| **Cross-Tenant Data Leaks** | Continuous contamination | **0 Leaks (100% Isolated Context)** |
| **Context Capture CPU Overhead** | High | **18% faster task dispatch** |

---

## 🛡️ 5. The Socratic Duel

### Question 1 (The Security Auditor):
> *"Why not just call `AsyncLocal.Value = null` at the end of every HTTP request?"*

**The Principal Defense**:
> *"Relying on manual cleanup in a middleware `finally` block is fragile. If an unhandled exception or thread abort occurs before the cleanup code runs, the context will still be captured by any background tasks spawned earlier. More fundamentally, child async branches take their own snapshot of the context tree at the moment they are spawned. Cleaning up the parent does not clear the child branches. The robust architecture is **using immutable value records and suppressing context flow on background task dispatchers**, ensuring context contamination is physically impossible by design."*

---

## 📜 6. The Executive Deliverable: ADR-004

```markdown
# ADR-004: Ambient Context Immutability & Context Flow Suppression

## Context
A major security breach and 16GB memory leak occurred when mutable dictionaries stored in `AsyncLocal` leaked across asynchronous threads.

## Decision
1. Forbid storing mutable collections, byte arrays, or entities inside `AsyncLocal<T>`.
2. Restrict `AsyncLocal<T>` exclusively to lightweight immutable structs (`TenantContext`).
3. Enforce `ExecutionContext.SuppressFlow()` on all background worker queues and thread pool dispatches.

## Consequences
- **Positive**: Complete elimination of cross-tenant data contamination; memory usage reduced from 16GB to 280MB.
- **Negative**: Background tasks cannot access ambient HTTP context and must receive required IDs via explicit parameters.
```
