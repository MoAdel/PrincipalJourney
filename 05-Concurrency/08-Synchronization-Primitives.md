# Synchronization Primitives — Locks, Semaphores & Channels

> **Core Concept**: Choosing the Right Synchronization Primitive  
> When to use user-mode spin locks, hybrid monitors, async semaphores, and high-performance bounded Channels.

---

## 1. The Taxonomy of Synchronization Primitives

The .NET runtime offers multiple tiers of synchronization, ranging from pure user-mode CPU spins to heavy OS kernel transitions:

```text
┌─────────────────────────┬───────────────────┬──────────────────┬─────────────────┐
│        Primitive        │   Wait Type       │ Async-Friendly?  │ Typical Latency │
├─────────────────────────┼───────────────────┼──────────────────┼─────────────────┤
│ Interlocked (CAS)       │ Hardware CPU      │ N/A (Atomic)     │ < 1 ns          │
│ SpinLock / SpinWait     │ User-Mode Spin    │ NO ❌            │ ~5 - 15 ns      │
│ Monitor (lock keyword)  │ Hybrid (Spin+Wait)│ NO ❌            │ ~20 - 50 ns     │
│ ReaderWriterLockSlim    │ Hybrid            │ NO ❌            │ ~40 - 80 ns     │
│ SemaphoreSlim           │ Hybrid (Async)    │ YES ✅ (WaitAsync)│ ~50 - 150 ns    │
│ Mutex / AutoResetEvent  │ OS Kernel Handle  │ NO ❌            │ ~1,000 - 3,000ns│
│ Channel<T>              │ Async Queue       │ YES ✅ (Backpres) │ ~50 - 200 ns    │
└─────────────────────────┴───────────────────┴──────────────────┴─────────────────┘
```

---

## 2. Why You Cannot `await` Inside a `lock` Statement

The C# compiler produces an immediate compiler error if you attempt:
```csharp
lock (_syncObj)
{
    await DoSomethingAsync(); // COMPILER ERROR: CS1996
}
```

### Why? Thread Affinity!
* `Monitor.Enter(obj)` is strictly **Thread-Affine**: the CLR records the OS Thread ID in the object's SyncBlock header.
* When an asynchronous operation awaits, execution pauses. The continuation can resume on a **completely different OS thread**!
* If a different thread attempted to call `Monitor.Exit(obj)`, the CLR would throw `SynchronizationLockException`!

---

## 3. The Modern Async Standard: `SemaphoreSlim`

To enforce mutual exclusion or throttle concurrency across asynchronous workflows, use **`SemaphoreSlim`**:

```csharp
public class ThrottledPaymentGateway
{
    // Throttle to a maximum of 10 concurrent requests to prevent bank rate-limiting
    private readonly SemaphoreSlim _throttler = new(initialCount: 10, maxCount: 10);

    public async Task<PaymentReceipt> ProcessPaymentAsync(PaymentRequest request, CancellationToken ct)
    {
        // ASYNC WAIT: Releases thread while waiting in queue (Zero ThreadPool Starvation!)
        await _throttler.WaitAsync(ct);
        try
        {
            return await CallBankApiAsync(request, ct);
        }
        finally
        {
            _throttler.Release(); // Releases slot for the next waiting request
        }
    }
}
```

---

## 4. High-Performance Pipelines: `System.Threading.Channels`

In modern .NET architecture, `System.Threading.Channels` has superseded `BlockingCollection<T>` as the gold standard for **Producer-Consumer** background processing.

### Why Channels are Superior:
1. **Fully Asynchronous**: Readers and writers use `await channel.Reader.ReadAsync()` and `await channel.Writer.WriteAsync()`. Zero blocked OS threads!
2. **Built-in Backpressure**: Prevents producers from flooding memory.
3. **Zero-Allocation**: Highly optimized lock-free ring buffers internally.

```csharp
// THE PRINCIPAL PATTERN: Bounded Channel with Backpressure
public class EventIngestionPipeline
{
    private readonly Channel<TelemetryEvent> _channel;

    public EventIngestionPipeline(int capacity = 10_000)
    {
        var options = new BoundedChannelOptions(capacity)
        {
            FullMode = BoundedChannelFullMode.Wait, // Applies backpressure: Producer waits when full!
            SingleReader = false,
            SingleWriter = false
        };
        _channel = Channel.CreateBounded<TelemetryEvent>(options);
    }

    public async ValueTask PublishAsync(TelemetryEvent evt, CancellationToken ct)
    {
        // Pauses gracefully if queue reaches 10,000 items
        await _channel.Writer.WriteAsync(evt, ct);
    }

    public async Task StartConsumerAsync(CancellationToken ct)
    {
        // Asynchronously streams items as they arrive
        await foreach (var evt in _channel.Reader.ReadAllAsync(ct))
        {
            await ProcessBatchAsync(evt);
        }
    }
}
```
