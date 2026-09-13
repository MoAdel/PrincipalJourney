# Learning Objectives — Concurrency, Threading & .NET Runtime Internals

> **Sprint 05 Competency Matrix**  
> Target Level: Senior Software Engineer → Principal Systems Performance Engineer & CLR Specialist

---

## The 5-Level Mastery Model

```text
Level 1: Understand  ──►  Why does the abstraction exist?
Level 2: Implement   ──►  Can you build it and tune it in code?
Level 3: Analyze     ──►  What is the physical runtime/engine behavior?
Level 4: Optimize    ──►  How do you eliminate CPU contention, cache bouncing & GC pressure?
Level 5: Principal   ──►  Can you define enterprise standards and defend runtime trade-offs?
```

---

## 🎯 Competency Matrix

| Domain | Level 1: Understand | Level 2: Implement | Level 3: Analyze (Internals) | Level 4: Optimize | Level 5: Principal Judgment |
|---|---|---|---|---|---|
| **Async State Machines** | Why `async`/`await` exists; non-blocking asynchronous I/O | Writing robust async pipelines without deadlocks | Compiled `IAsyncStateMachine` struct, `MoveNext()` branches, `AsyncTaskMethodBuilder` | Zero-allocation `ValueTask<T>` on synchronously completing hot paths | Defining enterprise async guidelines (e.g. why `Task.Run` is forbidden in ASP.NET Core request paths) |
| **Context Flow** | Difference between `ExecutionContext` and `SynchronizationContext` | Scoping ambient data using `AsyncLocal<T>` | `ExecutionContext.Capture()` & `Restore()`, copy-on-write state dictionary trees | Suppressing execution context flow (`ExecutionContext.SuppressFlow()`) for hot paths | Diagnosing cross-thread memory leaks and async context contamination |
| **ThreadPool Engine** | ThreadPool architecture: Worker Threads vs IOCP | Sizing min/max threads and queueing tasks | Hill Climbing rate equation, Global FIFO queue, Local LIFO work-stealing deques | Eliminating Sync-Over-Async starvation (`.Result`, `.Wait()`, blocking locks) | Capacity planning: mapping ThreadPool concurrency to CPU hardware cores |
| **Memory Models & Lock-Free** | CPU cache levels (L1/L2/L3), memory reordering | Atomic counters and state flags with `Interlocked` | MESI cache coherency protocol, acquire/release memory fences, `Volatile.Read/Write` | Eliminating **False Sharing** using 64-byte cache line alignment & struct padding | Selecting lock-free CAS algorithms vs fine-grained pessimistic locks |
| **Synchronization Primitives** | Trade-offs of Monitor, SemaphoreSlim, ReaderWriterLockSlim | Throttling concurrent async operations with `SemaphoreSlim` | OS kernel wait handles (`Futex` on Linux, `Event` on Windows) vs user-mode spin-waits | Producer-Consumer pipelines using `System.Threading.Channels` with backpressure | Designing non-blocking architectures that prevent lock convoying and priority inversion |
| **Garbage Collector** | Generational hypothesis (Gen 0, 1, 2, LOH, POH) | Configuring GC modes: Server GC vs Workstation GC | Mark, Sweep, Compact phases; free lists; Ephemeral segments vs regions; .NET 9 DATAS | Eliminating Gen 2 Stop-The-World pauses and preventing Large Object Heap fragmentation | Balancing throughput vs memory density in Kubernetes container limits |
| **High-Performance Memory** | Stack vs Heap allocations; value types vs reference types | Slicing buffers with `Span<T>` and `Memory<T>` | Object layout in 64-bit CLR (MethodTable 8B + SyncBlock 8B = 16B header), `ref struct` | Reusing buffers with `ArrayPool<T>`, eliminating boxing and zero-copy parsing | Designing zero-allocation serialization and network packet processing pipelines |

---

## 🏆 Definition of Done for Sprint 05

You have successfully mastered Sprint 05 when you can:

1. **Dissect Asynchronous IL**:
   - Decompile an `async Task<T>` method into its physical `IAsyncStateMachine` struct, trace the state transitions, and explain every memory allocation.
2. **Diagnose ThreadPool Starvation**:
   - Given a process core dump (`dotnet-dump`), inspect `!threadpool` and `!clrstack`, identify the sync-over-async blocking lock, and trace the starvation cascade.
3. **Eliminate False Sharing**:
   - Identify CPU cache-line bouncing using hardware counters or benchmark profiling, and apply 64-byte cache alignment padding to restore peak throughput.
4. **Implement Lock-Free Data Structures**:
   - Build a thread-safe, lock-free ring buffer or stack using `Interlocked.CompareExchange` without race conditions or memory tearing.
5. **Tune the .NET 9 Garbage Collector**:
   - Configure and defend Server GC vs Workstation GC and the .NET 9 **DATAS** engine for high-density containerized microservices.
6. **Build Zero-Allocation Pipelines**:
   - Implement a high-speed data parser using `ReadOnlySpan<char>` and `ArrayPool<byte>`, achieving **0 Bytes GC allocation** on the critical request path.
7. **Defend Runtime Architecture**:
   - Answer the **Principal Defense Scenarios** against Staff Engineers, CTOs, and runtime performance specialists with mathematical rigor.
