# 10B — Inside `System.Threading.Channels`, Lock-Free Ring Buffers & Backpressure

> "An `UnboundedChannel<T>` or `ConcurrentQueue<T>` in an HTTP ingestion endpoint is a ticking OOM bomb. If producers are faster than consumers, memory grows to infinity unless you enforce bounded backpressure."

---

## 1. Why `System.Threading.Channels` Replaces `BlockingCollection<T>`

`BlockingCollection<T>` blocks OS threads synchronously using kernel wait handles (`WaitHandle`), causing immediate ThreadPool starvation under async workloads. `System.Threading.Channels` is a 100% asynchronous, allocation-optimized producer/consumer pipeline built on `ValueTask<T>`.

```text
[Kestrel HTTP Producers] ──WriteAsync()──► ┌─────────────────────────────────────┐
                                           │ BoundedChannel<TelemetryEvent>      │
                                           │ Capacity: 10,000 (Ring Buffer)      │
                                           │ SingleReader: true (Lock-Free Fast) │
                                           └──────────────────┬──────────────────┘
                                                              │ ReadAllAsync()
                                                              ▼
                                           [BackgroundService Batch Consumer]
```

### Choosing `BoundedChannelFullMode`: Architectural Trade-Off Matrix

| `BoundedChannelFullMode` | Behavior When Buffer is Full | Ideal Use Case | Danger / Second-Order Effect | Validation & Rollback |
|---|---|---|---|---|
| **`Wait` (Default)** | `WriteAsync` returns an incomplete `ValueTask` until space frees up. | Financial orders, Transactional Outbox staging, audit logs (Zero data loss allowed). | Backpressures upstream Kestrel requests; must pair with short cancellation timeout (`500ms` -> HTTP `429`/`503`). | Load test with consumer paused; verify HTTP `503 Retry-After` triggers instead of pod hang. |
| **`DropOldest`** | Evicts the oldest unread item at the head of the queue to insert the newest item. | Real-time stock tickers, IoT sensor temperature readings, live UI telemetry. | Silent loss of historical transitions if downstream DB stalls. | Emit OpenTelemetry counter `channel.dropped_items` and alert if rate > 1%. |
| **`DropWrite`** | Silently discards the incoming item being written and completes immediately. | Non-critical debug logs, analytics clickstream events. | Loses the newest spike data during incidents. | Track drop counter in Prometheus. |

> 📐 **Derive It (Fermi Mode): Sizing Bounded Channel Capacity for Batch Flushing**
> - **Inputs**: `PeakIngestionRPS = 25000`, `MaxDBFlushStallSec = 2.0`, `EventStructBytes = 256`
> - **Formula**: `RequiredCapacity = PeakIngestionRPS * MaxDBFlushStallSec`
> - **Step-by-Step**:
>   1. To absorb a $2.0\text{ second}$ transient database commit stall at $25,000\text{ events/s}$ without dropping data or stalling HTTP producers:
>      $$\text{Capacity} = 25,000 \times 2.0 = 50,000\text{ items}$$
>   2. Memory footprint of pre-allocated ring buffer: $50,000 \times 256\text{ bytes} = 12,800,000\text{ bytes} \approx 12.2\text{ MB}$ (completely safe in Gen 2/POH).
> - **What-If Sensitivity**: If `UnboundedChannel` were used during a 10-minute downstream database outage ($600\text{ s}$), the queue would accumulate $25,000 \times 600 = 15,000,000\text{ objects} \approx 3.84\text{ GB}$, crashing the pod with `OutOfMemoryException` and losing **all 15 million in-memory events** permanently!

---

## 2. Production Micro-Batched Channel Consumer with Graceful Drain

```csharp
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace PrincipalJourney.Messaging.Channels;

public readonly record struct AuditRecord(Guid Id, string TenantId, string Action, long TimestampTicks);

public sealed class HighThroughputAuditChannel : BackgroundService
{
    private readonly Channel<AuditRecord> _channel;
    private readonly ILogger<HighThroughputAuditChannel> _logger;

    public HighThroughputAuditChannel(ILogger<HighThroughputAuditChannel> logger)
    {
        _logger = logger;
        // SingleReader = true allows the runtime to omit reader-side lock synchronization
        _channel = Channel.CreateBounded<AuditRecord>(new BoundedChannelOptions(capacity: 50_000)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = false,
            AllowSynchronousContinuations = false // NEVER hijack producer thread to run consumer work!
        });
    }

    public ValueTask<bool> TryEnqueueWithTimeoutAsync(AuditRecord record, TimeSpan timeout, CancellationToken ct)
    {
        if (_channel.Writer.TryWrite(record))
        {
            return ValueTask.FromResult(true); // Fast synchronous path (0 allocations)
        }

        return EnqueueSlowPathAsync(record, timeout, ct);
    }

    private async ValueTask<bool> EnqueueSlowPathAsync(AuditRecord record, TimeSpan timeout, CancellationToken ct)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(timeout);
        try
        {
            await _channel.Writer.WriteAsync(record, cts.Token);
            return true;
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            // Backpressure threshold breached: caller should return HTTP 429/503 Retry-After
            return false;
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var batch = new List<AuditRecord>(capacity: 500);
        var reader = _channel.Reader;

        try
        {
            while (await reader.WaitToReadAsync(stoppingToken))
            {
                // Drain up to 500 items synchronously while available in buffer
                while (batch.Count < 500 && reader.TryRead(out var item))
                {
                    batch.Add(item);
                }

                if (batch.Count > 0)
                {
                    await FlushBatchToStorageAsync(batch, stoppingToken);
                    batch.Clear();
                }
            }
        }
        catch (OperationCanceledException)
        {
            // SIGTERM received: complete writer and drain remaining buffered items before exit!
            _channel.Writer.TryComplete();
            while (reader.TryRead(out var remaining))
            {
                batch.Add(remaining);
                if (batch.Count >= 500)
                {
                    await FlushBatchToStorageAsync(batch, CancellationToken.None);
                    batch.Clear();
                }
            }
            if (batch.Count > 0)
            {
                await FlushBatchToStorageAsync(batch, CancellationToken.None);
            }
        }
    }

    private Task FlushBatchToStorageAsync(List<AuditRecord> records, CancellationToken ct)
    {
        _logger.LogDebug("Flushed batch of {Count} audit records.", records.Count);
        return Task.CompletedTask;
    }
}
```
