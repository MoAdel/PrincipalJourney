# Concurrency & Runtime Production Release Checklist

> **The Principal Production Go/No-Go Release Gate**  
> 10 Mandatory Pillars before deploying concurrent .NET workloads to Production.

---

## 📋 The 10 Production Pillars

### 1. Zero Sync-Over-Async Invariant
- [ ] Roslyn Analyzer `Microsoft.VisualStudio.Threading.Analyzers` installed with `VSTHRD002` treated as a **Build Error**.
- [ ] Zero invocations of `.Result`, `.Wait()`, or `.GetAwaiter().GetResult()` in application and middleware code.
- [ ] No synchronous blocking inside constructors or property getters (use asynchronous factory methods).

### 2. Async Lifecycle & Method Signatures
- [ ] 100% of asynchronous methods return `Task`, `Task<T>`, `ValueTask`, or `ValueTask<T>`.
- [ ] **`async void` is strictly prohibited** (except UI event handlers); unhandled exceptions in `async void` crash the OS process!
- [ ] No `Task.Run()` calls inside ASP.NET Core request processing pipelines (it steals worker threads from Kestrel to execute CPU work on the same thread pool).

### 3. Non-Blocking Synchronization
- [ ] Zero traditional OS kernel locks (`lock (obj)`, `Monitor.Enter`) held across asynchronous `await` points.
- [ ] Asynchronous throttling implemented exclusively via **`SemaphoreSlim`** with `await WaitAsync(cancellationToken)`.
- [ ] All semaphore releases wrapped in strict `try { ... } finally { semaphore.Release(); }` blocks.

### 4. Bounded Queues & Backpressure
- [ ] All producer-consumer queues use **`System.Threading.Channels`** with explicit capacity limits (`CreateBounded<T>`).
- [ ] Zero usage of unbounded `ConcurrentQueue<T>` or `List<T>` for background workloads without backpressure.
- [ ] Queue full behavior explicitly handles spikes (`BoundedChannelFullMode.Wait` or `DropOldest`).

### 5. False Sharing & Hardware Cache Alignment
- [ ] High-frequency counters updated concurrently across multiple CPU cores are padded to **64 bytes** using `[StructLayout(LayoutKind.Explicit)]`.
- [ ] Verified via profiling that multi-threaded metric variables do not share physical cache lines.

### 6. Large Object Heap (LOH) Hygiene
- [ ] Zero buffers $\ge 85,000$ bytes allocated on the per-request managed heap.
- [ ] Heavy binary operations rent buffers from **`ArrayPool<byte>.Shared`** or **`MemoryPool<byte>.Shared`**.
- [ ] All rented arrays returned with `clearArray: true` in `finally` blocks.

### 7. Garbage Collector & Container Configuration
- [ ] Containerized microservices running on .NET 9 have **DATAS enabled** (`GarbageCollectionAdaptationMode=1`).
- [ ] High-throughput services verified running **Server GC** (`ServerGarbageCollection=true`).
- [ ] Kubernetes memory limits configured with at least **30% headroom** above peak managed heap size to account for thread stacks and native socket buffers.

### 8. Ambient State & Context Flow
- [ ] `AsyncLocal<T>` variables store only small, immutable types (Strings, GUIDs, Integers).
- [ ] Zero large entity graphs, request bodies, or mutable lists stored in `AsyncLocal<T>`.
- [ ] All static event subscriptions implement clean unsubscription via `IDisposable`.

### 9. Safe `ValueTask<T>` Consumption
- [ ] `ValueTask<T>` awaited strictly once.
- [ ] Zero concurrent awaits on the same `ValueTask` instance.
- [ ] Converted to `Task` via `.AsTask()` whenever multiple awaits or `Task.WhenAll` are required.

### 10. Production Diagnostics Readiness
- [ ] Diagnostic tools (`dotnet-dump`, `dotnet-trace`, `dotnet-counters`, `dotnet-gcdump`) installed or accessible via sidecar containers.
- [ ] Linux core dump generation enabled (`COMPlus_DbgEnableMiniDump=1` or `DOTNET_DbgEnableMiniDump=1`).
- [ ] Telemetry tracks `threadpool-queue-length`, `threadpool-thread-count`, and `cpu-usage`.
