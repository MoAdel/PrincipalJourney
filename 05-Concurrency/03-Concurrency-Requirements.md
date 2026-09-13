# Concurrency Requirements & Operational Constraints

> **Sprint 05 Technical Specification**  
> System: Nova Commerce Core Transaction & Ingestion Engine  
> Target Runtime: .NET 9 LTS on Linux (x64 / ARM64) & Windows Server 2025

---

## 1. Enterprise Business Drivers

Nova Commerce's high-frequency flash sales process massive spikes in simultaneous shopper activity:
- **Peak Concurrency**: 120,000 concurrent shopping sessions.
- **Order Processing Rate**: 45,000 orders/minute.
- **Telemetry Ingestion**: 1,000,000 events/second buffered in memory.
- **Container Memory Limits**: 512 MB hard memory limit per pod in Kubernetes.

---

## 2. Non-Functional Concurrency SLAs

| Metric | Target SLA | 95th Percentile (p95) | 99th Percentile (p99) | Critical Failure Gate |
|---|---|---|---|---|
| **Async Overhead Latency** | < 0.2 ms | < 0.8 ms | < 2.0 ms | > 5.0 ms |
| **Garbage Collector Pause Time** | < 2.0 ms | < 5.0 ms | < 10.0 ms (Gen 2) | > 50.0 ms |
| **ThreadPool Queue Wait Time** | 0.0 ms (Immediate) | < 1.0 ms | < 5.0 ms | > 50.0 ms |
| **Memory Allocation on Read Hot Paths** | **0 Bytes** (Zero Alloc) | < 128 Bytes | < 512 Bytes | > 4 KB |
| **CPU Time in Context Switching** | < 3% of CPU | < 6% of CPU | < 10% of CPU | > 20% of CPU |

---

## 3. Operational & Architectural Invariants

### CONC-REQ-01: Zero Sync-Over-Async Invariant
* **Requirement**: Blocking on asynchronous tasks via `.Result`, `.Wait()`, or `.GetAwaiter().GetResult()` is **strictly prohibited** across 100% of production code.
* **Verification**: Enforced via Roslyn Analyzer `VSTHRD002` (Avoid problem synchronous waits) and automated CI build failure gates.
* **Invariant**: Asynchronous all the way down.

### CONC-REQ-02: Zero Large Object Heap (LOH) Allocations on Request Paths
* **Requirement**: No per-request allocation may exceed **85,000 bytes** (which triggers immediate placement onto the uncompacted Large Object Heap).
* **Mechanism**: Large buffers for image processing, reporting, and file ingestion must be rented from **`ArrayPool<byte>.Shared`** or **`MemoryPool<byte>.Shared`** and strictly returned in `finally` blocks.

### CONC-REQ-03: Zero Unbounded In-Memory Queues (Mandatory Backpressure)
* **Requirement**: Producer-consumer background queues must never be unbounded.
* **Mechanism**: Use **`System.Threading.Channels`** configured with `BoundedChannelOptions` and `BoundedChannelFullMode.Wait` or `DropOldest`.
* **Invariant**: The system must apply backpressure to upstream producers rather than silently exhausting container memory.

### CONC-REQ-04: False Sharing Elimination on Shared Hot Counters
* **Requirement**: Multi-threaded metrics counters, rate limiters, and statistical buckets accessed across multiple CPU cores must be padded to **64 bytes** (the CPU L1/L2 cache line width).
* **Mechanism**: Apply explicit layout padding via `[StructLayout(LayoutKind.Explicit)]` and 64-byte boundaries to prevent cache-line bouncing.

### CONC-REQ-05: Non-Blocking Lock Primitives for Async Workloads
* **Requirement**: Traditional OS kernel locks (`lock (obj)`, `Monitor.Enter`, `Mutex`) must never be held across `await` points.
* **Mechanism**: If mutual exclusion is required across asynchronous operations, use **`SemaphoreSlim(1, 1)`** with `await WaitAsync()`.

### CONC-REQ-06: Bounded Execution Context Ambient Storage
* **Requirement**: Storing unbounded dictionaries, large entity graphs, or mutable states in `AsyncLocal<T>` is strictly forbidden.
* **Mechanism**: `AsyncLocal<T>` must be restricted strictly to lightweight, immutable identifiers (e.g., `CorrelationId`, `TenantId`, `CancellationToken`).
