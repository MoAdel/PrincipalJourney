# Summary — The 10 Invariant Laws of Principal Concurrency & Runtime

> **Executive Synthesis & Mental Models**  
> Core architectural axioms to internalize for lifelong systems design.

---

## 🏛️ The 10 Invariant Laws

### Law 1: The Asynchronous Completeness Law
Asynchrony is infectious by design. You cannot "safely bridge" async code with synchronous blocking (`.Result`, `.Wait()`, `.GetAwaiter().GetResult()`). Synchronous waits in high-concurrency server pipelines inevitably trigger catastrophic ThreadPool starvation cascades.

### Law 2: The ThreadPool Conservation Law
Worker threads are an expensive, shared hardware resource. Never block a ThreadPool thread with synchronous I/O, `Thread.Sleep`, or un-signaled wait handles. Never call `Task.Run` on Web API request paths to perform CPU work in the same pool.

### Law 3: The 64-Byte Hardware Cache Invariant
Multi-threaded shared counters and cursors must be padded to **64 bytes** (or 128 bytes for ARM64). Two independent variables residing on the same cache line trigger the MESI protocol into continuous invalidation storms, destroying up to 95% of multi-core throughput.

### Law 4: The 85KB LOH Boundary Law
Never allocate buffers exceeding **85,000 bytes** on the per-request heap. Objects $\ge 85,000$ bytes enter the uncompacted Large Object Heap (LOH), fragmenting virtual memory and forcing Stop-The-World Gen 2 GC pauses. Rent large buffers from **`ArrayPool<byte>.Shared`**.

### Law 5: The Backpressure Invariant
Every in-memory queue must have a hard, bounded physical limit. Unbounded queues do not solve capacity problems; they merely convert upstream latency into out-of-memory container crashes. Use **`System.Threading.Channels`** with backpressure.

### Law 6: The Thread Affinity Law
Never hold thread-affine synchronization primitives (`Monitor`, `lock`, `Mutex`) across asynchronous `await` points. An `await` can resume on a completely different OS thread. Mutual exclusion across async scopes belongs exclusively to **`SemaphoreSlim`**.

### Law 7: The ValueTask Selectivity Rule
Do not use `ValueTask<T>` as a default return type. `ValueTask<T>` is a 16-byte struct intended strictly for extreme hot paths where **$\ge 80\%$ of invocations complete synchronously**. Never await a `ValueTask` multiple times or concurrently.

### Law 8: The Ambient State Hygiene Law
`AsyncLocal<T>` uses copy-on-write trees that flow across all child async calls. Never store large mutable objects, entity graphs, or request bodies in `AsyncLocal<T>`, as they will be strongly rooted in memory across thread transitions.

### Law 9: The Memory Hierarchy Axiom
CPUs are blindingly fast; memory is painfully slow. A CPU instruction takes <0.5 ns; a main memory cache miss takes ~100 ns (200x slower). Real-world performance engineering is the art of structuring memory to maximize **L1/L2 data cache residency** using `Span<T>` and sequential memory layouts.

### Law 10: The Container Sizing Reality
The managed GC heap is only a fraction of total process memory. In containerized microservices, factor in **Thread Stacks (1MB per thread)**, JIT compilation heaps, and native socket buffers. Run .NET 9 **DATAS GC** to dynamically adapt heap sizes to real-world memory limits.
