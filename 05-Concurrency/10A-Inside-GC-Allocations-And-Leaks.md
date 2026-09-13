# Inside GC Allocations & Leaks — Root Chains & Diagnostics

> **Runtime Deep Dive**: Memory Retention, GC Roots & SOS Triage  
> Why garbage-collected applications run out of memory, how static events create retention chains, and finding leaks with `!gcroot`.

---

## 1. The Anatomy of a Managed Memory Leak

In C#, you cannot "lose" a pointer as in C/C++. A managed memory leak occurs through **Accidental Retention**:

$$\text{An object is no longer needed by business logic, but a GC Root still holds a reference to it.}$$

```text
[STATIC CLASS / SINGLETON SERVICE] ──► (Holds Strong Reference)
                  │
                  ▼
         [EVENT DELEGATE] ──► (Holds Target Reference to Subscriber)
                  │
                  ▼
    [TRANSIENT CONTROLLER / ENTITY] ──► (Cannot be collected by GC!)
                  │
                  ▼
         [50 MB DATA BUFFER] ──► (Promoted to Gen 2, exhausts RAM!)
```

---

## 2. The 3 Classic Enterprise Memory Leak Patterns

### Pattern 1: The Static Event Subscription Trap
```csharp
public class OrderProcessingService
{
    public OrderProcessingService()
    {
        // FATAL LEAK: Static event holds a strong reference to this transient instance forever!
        GlobalEvents.OnPromotionApplied += HandlePromotion;
    }

    private void HandlePromotion(object? sender, EventArgs e) { ... }
}
```
* **Why it Leaks**: A C# event delegate internally holds two pointers: `MethodInfo` (the method) and `Target` (the instance). Because `GlobalEvents` is static, its delegate list lives forever, preventing the Garbage Collector from freeing `OrderProcessingService`!
* **The Fix**: Implement `IDisposable` and explicitly unsubscribe: `GlobalEvents.OnPromotionApplied -= HandlePromotion;`.

---

### Pattern 2: Hidden Closure Captures
```csharp
public class CacheService
{
    private readonly byte[] _largeBuffer = new byte[10_000_000]; // 10 MB

    public void RegisterWatcher(BackgroundScheduler scheduler)
    {
        int threshold = 42;
        // The lambda captures 'this' because it accesses nothing from CacheService, 
        // but the compiler hoisted the closure context!
        scheduler.Schedule(() => Console.WriteLine(threshold));
    }
}
```

---

### Pattern 3: The Finalizer Queue Bottleneck
```csharp
public class LeakyResource
{
    // DANGER: Defining a finalizer forces two GC cycles!
    ~LeakyResource()
    {
        // Executes on a SINGLE dedicated CLR Finalizer Thread!
    }
}
```
* **Why it hurts**:
  - Objects with finalizers **CANNOT be collected during their first GC cycle**!
  - The GC moves them to the **Finalization Queue**, promoting them from Gen 0 to Gen 1 (or Gen 1 to Gen 2).
  - If the finalizer thread is slow or blocked, uncollected objects accumulate on the heap, driving memory to exhaustion.

---

## 3. Diagnosing Leaks with SOS: The `!gcroot` Command

When an application's working set grows continuously:

### Step 1: Dump Heap Statistics
```text
> !dumpheap -stat
              MT    Count    TotalSize Class Name
00007ffe34211048    12,400   992,000   System.String
00007ffe34289410    45,000   450,000,000 NovaCommerce.Core.OrderPayload
```
* **Analysis**: `OrderPayload` is holding **450 Megabytes** across 45,000 instances!

### Step 2: Grab an Instance Address
```text
> !dumpheap -mt 00007ffe34289410
Address               MT     Size
0000021b40018a40 00007ffe... 10,000
```

### Step 3: Trace the Root Chain (`!gcroot`)
```text
> !gcroot 0000021b40018a40
Thread 1a40:
    ...
    -> 0000021b3ffa1020 NovaCommerce.Services.EventBus (STATIC ROOT!)
    -> 0000021b3ffa1150 System.EventHandler
    -> 0000021b40018a40 NovaCommerce.Core.OrderPayload
```
* **The Diagnosis**: `EventBus` static handler is holding `OrderPayload` in memory. Unsubscribe on dispose!
