# Production Hands-On Frontend Labs (5 Scenarios)

---


> 📐 **Derive It (Fermi Mode): Capacity, Throughput & Memory Envelope**
> - **Inputs**: `TargetRPS = 2000`, `OperationLatencyMs = 8`, `PayloadKB = 16`
> - **Formula**: `ConcurrentInFlightMemoryMB = (TargetRPS * (OperationLatencyMs / 1000) * PayloadKB) / 1024`
> - **Step-by-Step**:
>   1. Concurrent in-flight operations by Little's Law: $L = 2,000 \times 0.008\text{ s} = 16\text{ active operations}$.
>   2. Steady-state buffer footprint: $16 \times 16\text{ KB} = 256\text{ KB}$ ($0.25\text{ MB}$).
> - **What-If Sensitivity**: If downstream contention degrades `OperationLatencyMs` from `8ms` to `4,000ms`, concurrency spikes $500\times$ to $8,000\text{ in-flight operations}$ ($128\text{ MB}$ + thread/socket exhaustion). Always verify how your lab holds under $10\times$ latency degradation!


## Lab 1: Zero-Leak RxJS Autocomplete Search Stream
- **Objective**: Implement a search autocomplete input using `debounceTime(300)`, `distinctUntilChanged()`, `switchMap()`, and `takeUntilDestroyed()`.
- **Verification**: Simulate 1,000 rapid keystrokes; prove via Chrome DevTools that only 1 network request executes and 0 subscriptions remain after unmounting.

## Lab 2: Custom `@Memoize` Decorator
- **Objective**: Author a TypeScript method decorator caching return values based on stringified parameter arguments.
- **Verification**: Execute heavy matrix computations and prove subsequent calls execute in 0.01ms via cache hit.

## Lab 3: Mutex-Protected 401 Refresh Interceptor
- **Objective**: Build an HTTP interceptor that queues concurrent 401 requests and replays them after a single token refresh.
- **Verification**: Fire 20 parallel API calls with an expired token; verify that `/auth/refresh` is called exactly once.

## Lab 4: Role-Based Structural Security Directive
- **Objective**: Build an Angular `*appHasRole="['Admin', 'Auditor']"` directive (or React equivalent) removing unauthorized elements from the DOM.
- **Verification**: Inspect the DOM in DevTools; verify that hidden elements are completely removed, not merely set to `display: none`.

## Lab 5: Profiling & Eliminating Re-Render Cascades
- **Objective**: Refactor a laggy 5,000-row table from Default change detection to `OnPush` with memoized callbacks.
- **Verification**: Measure rendering latency before and after using React DevTools Profiler; prove reduction from 45ms to <2ms.
