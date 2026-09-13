# Resources — Curated CLR Runtime Literature & Tooling

> **Authoritative Literature, CoreCLR Source Code & Diagnostic Tooling**  
> Essential reading and diagnostics for the Principal Systems Performance Engineer.

---

## 📚 Essential Books & Publications

1. **Pro .NET Memory Management: For Better Code, Performance, and Scalability** — *Konrad Kokosa*  
   The definitive, 1,000-page authoritative bible on CoreCLR internal memory management, allocations, and the Garbage Collector.
2. **Concurrency in C# Cookbook (3rd Edition)** — *Stephen Cleary*  
   Practical patterns for async/await, Task Parallel Library, Channels, and dataflow pipelines.
3. **The Art of Multiprocessor Programming** — *Maurice Herlihy, Nir Shavit*  
   The foundational textbook on hardware memory models, cache coherency (MESI), and lock-free data structures.
4. **Systems Performance: Enterprise and the Cloud (2nd Edition)** — *Brendan Gregg*  
   Operating system scheduling, CPU caches, context switching, and low-level kernel tracing.

---

## 🔬 CoreCLR Upstream Source Code References

For true Principal mastery, read the actual C++ and C# source code powering .NET 9:

* **Managed ThreadPool**: [`src/libraries/System.Private.CoreLib/src/System/Threading/ThreadPool.cs`](https://github.com/dotnet/runtime)  
  Inspect the Hill Climbing algorithm and work-stealing queue implementations.
* **The Garbage Collector Engine**: [`src/coreclr/gc/gc.cpp`](https://github.com/dotnet/runtime)  
  The 45,000-line C++ engine implementing Gen 0/1/2, LOH, POH, and .NET 9 DATAS.
* **Async Method Builder**: [`src/libraries/System.Private.CoreLib/src/System/Runtime/CompilerServices/AsyncTaskMethodBuilder.cs`](https://github.com/dotnet/runtime)  
  How the runtime allocates or avoids allocating Tasks during state machine execution.

---

## 🛠️ Diagnostic & Profiling Tooling

### CLI Diagnostic Tools:
```bash
# Collect full process core dump
dotnet-dump collect -p <PID>

# Collect CPU sampling profile (Generates speedscope flamegraphs)
dotnet-trace collect -p <PID> --providers Microsoft-DotNETCore-SampleProfiler

# Monitor real-time GC heaps, threadpool queues, and CPU
dotnet-counters monitor -p <PID> --counters System.Runtime

# Collect fast lightweight GC heap snapshot
dotnet-gcdump collect -p <PID>
```

### Essential SOS Debugger Commands:
```text
> !threadpool          # Worker thread saturation, queue length, completion port status
> !clrstack            # Managed call stacks of the current thread
> ~*e !clrstack        # Managed call stacks across ALL threads in the process
> !dumpheap -stat      # Summary of all heap allocations sorted by total memory
> !dumpheap -mt <MT>   # List all individual instances of a specific class
> !gcroot <Address>    # Trace the reference chain to find why an object cannot be collected
> !dumpasync           # Inspect all active Task asynchronous state machines
```
