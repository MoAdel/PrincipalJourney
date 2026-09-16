# In-Memory Message Pipelines with `System.Threading.Channels`

> "When pushing every small item to an external message broker kills performance and inflates cloud bills, use `System.Threading.Channels` as an ultra-high-throughput local backpressure buffer."

---

## 1. Why `System.Threading.Channels` Over `ConcurrentQueue<T>`?

`System.Threading.Channels` was introduced into the .NET runtime specifically to replace `ConcurrentQueue<T>` and `BlockingCollection<T>` for asynchronous producer-consumer pipelines:

```text
┌───────────────────────────────────┬────────────────────────────────────────────────────────┐
│ Feature                           │ System.Threading.Channels (.NET 9)                     │
├───────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Async / Await Support             │ Native zero-allocation `ValueTask<T>` Read/Write APIs. │
│ Built-in Backpressure             │ Strict bounded capacity limits with selectable modes.   │
│ Thread Synchronization Overhead   │ Lock-free linked ring buffer; zero lock contention.    │
│ Single-Producer / Single-Consumer │ Specialized optimizations when `SingleReader=true`.    │
└───────────────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 2. Backpressure Modes

```csharp
var options = new BoundedChannelOptions(capacity: 10_000)
{
    FullMode = BoundedChannelFullMode.Wait, // Block producer asynchronously when buffer is full
    SingleWriter = false,
    SingleReader = true
};
var channel = Channel.CreateBounded<LogEntry>(options);
```

* `BoundedChannelFullMode.Wait`: Asynchronously pauses the writer (`await WriteAsync`) until consumers drain items. **Zero data loss.**
* `BoundedChannelFullMode.DropOldest`: Discards the oldest item to accommodate new writes. Ideal for real-time video/telemetry feeds.
* `BoundedChannelFullMode.DropWrite`: Discards the incoming item immediately.

---

## 3. High-Throughput Batching Consumer (.NET 9 C# 13)

```csharp
public sealed class ChannelBatchProcessor<T> : BackgroundService
{
    private readonly ChannelReader<T> _reader;
    private readonly Func<List<T>, Task> _batchSink;
    private const int BatchSize = 250;
    private static readonly TimeSpan FlushTimeout = TimeSpan.FromMilliseconds(50);

    public ChannelBatchProcessor(ChannelReader<T> reader, Func<List<T>, Task> batchSink)
    {
        _reader = reader;
        _batchSink = batchSink;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var batch = new List<T>(BatchSize);

        while (await _reader.WaitToReadAsync(ct))
        {
            var timeoutCts = new CancellationTokenSource(FlushTimeout);
            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(ct, timeoutCts.Token);

            try
            {
                while (batch.Count < BatchSize && _reader.TryRead(out var item))
                {
                    batch.Add(item);
                }

                if (batch.Count >= BatchSize)
                {
                    await _batchSink(batch);
                    batch.Clear();
                }
            }
            catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
            {
                // Flush timeout expired; flush partial batch
                if (batch.Count > 0)
                {
                    await _batchSink(batch);
                    batch.Clear();
                }
            }
        }
    }
}
```

---

## 4. Formal & Verified References

* [Stephen Toub: An Introduction to System.Threading.Channels](https://devblogs.microsoft.com/dotnet/an-introduction-to-system-threading-channels/)
* [Microsoft Learn: Channel<T> Class Reference](https://learn.microsoft.com/en-us/dotnet/api/system.threading.channels.channel-1)
* [David Fowler: Asynchronous Programming in .NET - Channels Guidance](https://github.com/davidfowl/AspNetCoreDiagnosticScenarios/blob/master/AsyncGuidance.md)
