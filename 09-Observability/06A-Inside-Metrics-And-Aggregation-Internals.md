# CLR Internals: Metrics Aggregation, Histogram Buckets & Thread-Local Accumulators

Metrics must run on the critical hot path of every API, database query, and queue worker. If recording a metric incurs locks or GC allocations, the monitoring system degrades the very system it is designed to observe.

---

## 1. Inside `System.Diagnostics.Metrics` Architecture

```mermaid
graph TD
    subgraph AppCode ["Application Hot Path (Thread 1..N)"]
        Counter[Counter.Add(1)]
        Histogram[Histogram.Record(45.2)]
    end

    subgraph CLR_Internals ["CLR Runtime Metrics Engine"]
        TL[ThreadLocal / Lock-Free Accumulator]
        Buckets[Exponential / Explicit Histogram Buckets]
    end

    subgraph ExporterCollection ["Collection Cycle (Every 10-60 Seconds)"]
        Listener[MeterListener.Collect()]
        OTLP[OtlpMetricExporter]
    end

    Counter -->|Lock-Free Interlocked Add| TL
    Histogram -->|Binary Search Bucket Index| Buckets
    TL & Buckets -.->|Harvest Values on Collection Interval| Listener
    Listener --> OTLP
```

### The 4 Core Instrument Types

| Instrument Type | Monotonic? | In-Memory Representation | Primary Use Case |
|---|---|---|---|
| **`Counter<T>`** | Yes (Non-negative) | 64-bit integer (`Interlocked.Add`) | Request counts, completed orders, error occurrences |
| **`UpDownCounter<T>`** | No (Can decrease) | 64-bit signed integer | Active connections, in-flight jobs, queue length |
| **`ObservableGauge<T>`** | N/A (Callback driven) | Read on collection demand | Memory usage, thread pool thread count |
| **`Histogram<T>`** | N/A (Distribution) | Array of bucket counters | Request duration (latency), payload byte sizes |

---

## 2. Lock-Free Metric Accumulation

How does `Counter.Add()` avoid cross-thread contention on multi-core 64-core processors?

In the CLR BCL implementation (`System.Diagnostics.Metrics`):
1. **Thread-Local / Striped Accumulators**: Instead of a single shared atomic integer that causes CPU cache line bouncing (false sharing), high-throughput counters partition writes into striped accumulators.
2. **Lock-Free Updates**: Threads perform CAS (`Interlocked.CompareExchange`) or atomic adds (`Interlocked.Add`) on their respective striped slot.
3. **Lazy Harvesting**: Only when the `MeterListener` triggers an export tick (e.g., every 15 seconds) does the runtime freeze and sum the striped accumulators into a single exported delta value.

---

## 3. Histogram Bucket Boundaries & Memory Profiling

Histograms do not store raw latency floating-point numbers; doing so would require unbounded memory. Instead, they classify values into predefined **bucket counters**.

```text
Values: [ 12ms, 45ms, 85ms, 120ms, 450ms, 1200ms ]

Default Explicit Buckets (ms):
[ 0..5 ]    : 0
[ 5..10 ]   : 0
[ 10..25 ]  : 1  (12ms)
[ 25..50 ]  : 1  (45ms)
[ 50..100 ] : 1  (85ms)
[ 100..250 ]: 1  (120ms)
[ 250..500 ]: 1  (450ms)
[ 500..1000]: 0
[ 1000..+Inf]: 1 (1200ms)
```

### The Bucket Search Algorithm
When `histogram.Record(val)` is executed:
1. The runtime executes a fast binary search or lookup table across the configured bucket boundary array to find the matching bucket index $K$.
2. The counter at index $K$ is incremented atomically: `Interlocked.Increment(ref _buckets[k])`.
3. The sum and total count are updated: `Interlocked.Add(ref _sum, val)` and `Interlocked.Increment(ref _count)`.

> [!TIP]
> **Customizing Histogram Boundaries in .NET 9**:
> The default bucket boundaries are designed for generic HTTP durations (up to 10 seconds). For sub-millisecond database queries or cache lookups, configure explicit custom view boundaries in `WithMetrics`:
> ```csharp
> metrics.AddView("cache.lookup.duration", new ExplicitBucketHistogramConfiguration
> {
>     Boundaries = new double[] { 0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 25.0, 50.0 }
> });
> ```
