# Garbage Collector Internals — Generations, LOH & .NET 9 DATAS

> **Core Concept**: Physical Memory Management in CoreCLR  
> How the generational Garbage Collector manages heaps, the danger of LOH fragmentation, and the .NET 9 DATAS revolution.

---

## 1. The Generational Hypothesis & Heap Anatomy

The .NET Garbage Collector is an automatic, tracing, generational, compacting memory manager based on a fundamental statistical truth:

$$\text{The Generational Hypothesis: Most objects die very shortly after allocation.}$$

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MANAGED GC HEAP ANATOMY                            │
├──────────────────────────┬──────────────────────────┬───────────────────────┤
│ GENERATION 0 (Ephemeral) │ GENERATION 1 (Buffer)    │ GENERATION 2 (Tenured)│
│ • Newly allocated objects│ • Survived 1 GC cycle    │ • Long-lived objects  │
│ • Collected in ~100 µs   │ • Collected in ~1 ms     │ • Singletons, caches  │
│ • Fits in CPU L2/L3 cache│ • Serves as a buffer     │ • Full GC (Stop-World)│
└──────────────────────────┴──────────────────────────┴───────────────────────┘
┌─────────────────────────────────────────────────────┬───────────────────────┐
│ LARGE OBJECT HEAP (LOH: Objects >= 85,000 Bytes)    │ PINNED OBJECT HEAP    │
│ • Large byte arrays, giant strings, bitmaps         │ • Native I/O buffers  │
│ • Never compacted by default (High fragmentation!)  │ • Unmovable memory    │
└─────────────────────────────────────────────────────┴───────────────────────┘
```

---

## 2. The 3 Phases of Garbage Collection

When an allocation threshold is reached:
1. **Mark Phase**:
   - The engine pauses application threads (Safe Points).
   - Traverses **GC Roots** (Stack pointers, CPU registers, static fields, GC handles).
   - Walks the object graph, marking every reachable object as alive.
2. **Plan Phase**:
   - Analyzes heap fragmentation.
   - Decides whether **Compaction** (relocating objects to make memory contiguous) is worth the CPU cost, or if **Sweeping** (adding dead spaces to free lists) is sufficient.
3. **Sweep / Compact Phase**:
   - **Sweep**: Adds dead memory to a linked free list.
   - **Compact**: Relocates surviving objects together, updating every pointer in the application to the new memory addresses!

---

## 3. Server GC vs. Workstation GC

```text
┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│            WORKSTATION GC            │  │              SERVER GC               │
├──────────────────────────────────────┤  ├──────────────────────────────────────┤
│ • 1 Managed Heap                     │  │ • 1 Managed Heap PER CPU CORE        │
│ • Runs on calling thread / background│  │ • 1 Dedicated OS GC Thread PER CORE  │
│ • Optimized for low latency & UI     │  │ • Maximum multi-threaded throughput  │
│ • Low memory footprint               │  │ • Can consume large RAM in containers│
└──────────────────────────────────────┘  └──────────────────────────────────────┘
```

---

## 4. The .NET 9 Revolution: DATAS GC

Prior to .NET 9, **Server GC** had a major flaw in Kubernetes containers:
If you ran Server GC on an 8-core node, the GC initialized **8 separate heaps**, allocating dozens of megabytes per heap regardless of actual traffic. Small microservices easily breached **512 MB container memory limits**!

### What is DATAS? (Dynamic Adaptation to Application Sizes)
Enabled by default in .NET 9 for Server GC:
* The GC dynamically adjusts the **number of active heaps and heap sizes** based on real-time application throughput and memory demand!
* If traffic is low, it scales down to 1 or 2 active heaps.
* When a flash sale arrives, it instantly expands across all available cores.
* **Result**: **40% to 70% reduction in working-set memory consumption** in Kubernetes pods without sacrificing throughput!

```xml
<!-- RuntimeHostConfigurationOption in .csproj -->
<PropertyGroup>
  <!-- Explicitly enable .NET 9 DATAS GC -->
  <GarbageCollectionAdaptationMode>1</GarbageCollectionAdaptationMode>
</PropertyGroup>
```

---

## 5. The Large Object Heap (LOH) Fragmentation Hazard

Any object exceeding **85,000 bytes** (e.g., `new byte[85001]` or large JSON strings) is allocated directly onto the **Large Object Heap (LOH)**.

### Why the LOH is Dangerous:
1. **LOH is Collected ONLY during Gen 2 Full GCs**: Frequent LOH allocations force frequent Gen 2 collections, pausing application threads!
2. **LOH is Not Compacted by Default**: Sweeping creates holes (free-space gaps).
3. If you allocate an 86 KB array, free it, and then allocate an 87 KB array, the 87 KB array cannot fit in the 86 KB hole!
4. The LOH expands indefinitely, fragmenting virtual memory until the application throws an **`OutOfMemoryException`**, even when 60% of memory is free!

> **The Principal Rule**:
> Never allocate raw byte arrays $\ge 85,000$ bytes on the request path. Always rent them from **`ArrayPool<byte>.Shared`**.
