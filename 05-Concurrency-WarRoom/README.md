# Sprint 05 — Concurrency & .NET Runtime: The War Room Edition

> **High-Intensity SEV-1 Incident Simulation Track**  
> 5 Production Disasters. 5 Post-Mortems. Real Crash Dumps. Instant Refactorings.  
> **Pre-requisite**: Complete the standard curriculum in [`05-Concurrency/`](../05-Concurrency/)

---

## 🎯 The War Room Philosophy

In the standard curriculum, you mastered asynchronous state machines, ThreadPool work-stealing, and the .NET 9 Garbage Collector systematically.
In this **War Room Track**, you are thrown directly onto the bridge of an active SEV-1 production disaster at Nova Commerce.

You have 60 minutes before leadership pulls the plug:
1. **The 03:00 AM Crisis Briefing**: Real runtime alerts, threadpool metrics, and core dump traces.
2. **Diagnostic Investigation**: Spot the physical concurrency flaw in C# code, memory layouts, or delegate closures.
3. **Deep Engine Internals**: Why the CLR and CPU physically behaved this way (OS context switches, MESI cache line bouncing, LOH compaction, or copy-on-write trees).
4. **The Architecture Refactor & Scoreboard**: Production-grade code fix with measurable telemetry improvements.
5. **The Socratic Duel**: 3 aggressive questions from Staff Engineers, SRE leads, or the CTO defending your architecture.
6. **The Executive Deliverable**: An Architecture Decision Record (ADR) for your Principal portfolio.

---

## 🗺️ Incident Mapping Matrix

| Incident | Crisis & Symptoms | CLR Runtime Internals Mastered | Standard Modules |
|---|---|---|---|
| 🚨 **[Incident 01](01-Incident-Sync-Over-Async-ThreadPool-Collapse.md)** | **The ThreadPool Starvation Cascade**: 250 threads blocked in `Task.get_Result()`, 14k queued tasks, CPU at 100% | ThreadPool, Hill Climbing, Work-stealing deques, SOS triage | Modules 06, 06A |
| 🚨 **[Incident 02](02-Incident-LOH-Fragmentation-Gen2-Stall.md)** | **The 3-Second LOH Stop-The-World Freeze**: 90KB byte arrays fragmenting heap, Gen 2 GC pauses freeze checkout | Large Object Heap (LOH), Compaction, `ArrayPool<byte>.Shared`, Gen 0/1/2 | Modules 10, 10A, 11 |
| 🚨 **[Incident 03](03-Incident-False-Sharing-CPU-Cache-Meltdown.md)** | **The 64-Byte Cache-Line Bouncing Meltdown**: Multi-threaded metrics counter destroys 80% of CPU throughput | CPU L1/L2 caches, MESI protocol, False Sharing, 64-byte padding | Modules 07, 07A |
| 🚨 **[Incident 04](04-Incident-AsyncLocal-Memory-Leak-Contamination.md)** | **The AsyncLocal 16GB Memory Contamination**: Ambient telemetry dictionary leaking across worker threads | `ExecutionContext` capture, `AsyncLocal<T>` copy-on-write trees, GC roots | Modules 05A, 10A |
| 🚨 **[Incident 05](05-Incident-ConcurrentDictionary-Factory-Storm.md)** | **The GetOrAdd 500-Connection Database Thundering Herd**: Un-synchronized factory delegates slamming database | `ConcurrentDictionary` striped locks, atomic `Lazy<Task<T>>`, CAS | Modules 08, 09 |
