# 06 - High-Performance Streaming with System.IO.Pipelines

> "`System.IO.Stream` was designed for synchronous, single-buffer byte operations.
>
> `System.IO.Pipelines` was engineered to power Kestrel's asynchronous, zero-allocation, memory-pooled network and streaming engine."

---

# Why Should a Principal Engineer Care?

When parsing continuous streams of data (e.g. streaming JSON, multipart uploads, CSV feeds, network protocols):

### The Traditional `Stream` Flaws:
```csharp
// FATAL FLAW: Requires allocating byte[] buffers, copying data repeatedly across arrays,
// and handling partial message framing manually.
byte[] buffer = new byte[4096];
int bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length);
```
1. **Buffer Management & Allocation**: Repeated `byte[]` allocations thrash GC Gen 0/1.
2. **Buffer Copying**: If a JSON delimiter spans across two `ReadAsync` buffers, you must allocate a third array, copy both halves, and stitch them together.
3. **Synchronization & Backpressure**: Streams have no built-in backpressure signaling between reader and writer threads.

**`System.IO.Pipelines`** solves this by separating **Memory Management**, **Backpressure**, and **Parsing** into a high-performance decoupled pipeline.

---

# The Architecture of System.IO.Pipelines

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. PipeWriter (Producer / Ingestion Thread)                                 │
│    • Gets pooled memory: writer.GetMemory(minimumSize)                      │
│    • Writes data from network socket / stream                               │
│    • Advances: writer.Advance(bytesWritten)                                 │
│    • Flushes & signals reader: await writer.FlushAsync()                    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                Memory Segments (ReadOnlySequence<byte>)
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. PipeReader (Consumer / Parser Thread)                                    │
│    • Awaits data: ReadResult result = await reader.ReadAsync()              │
│    • Inspects contiguous or non-contiguous buffer: result.Buffer            │
│    • Advances parse position: reader.AdvanceTo(consumed, examined)          │
│    • Zero buffer copying across chunks!                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# Processing a Stream Line-by-Line with Zero Allocation

```csharp
public async Task ProcessCatalogStreamAsync(PipeReader reader)
{
    while (true)
    {
        ReadResult result = await reader.ReadAsync();
        ReadOnlySequence<byte> buffer = result.Buffer;

        while (TryReadLine(ref buffer, out ReadOnlySequence<byte> line))
        {
            // Process the line as Span/ReadOnlySequence without allocating strings!
            ProcessLine(line);
        }

        // Tell the pipe what was fully parsed (consumed) and what was checked (examined):
        reader.AdvanceTo(buffer.Start, buffer.End);

        if (result.IsCompleted) break;
    }

    await reader.CompleteAsync();
}

private static bool TryReadLine(ref ReadOnlySequence<byte> buffer, out ReadOnlySequence<byte> line)
{
    // Look for '\n' in the sequence:
    SequencePosition? position = buffer.PositionOf((byte)'\n');
    if (position == null)
    {
        line = default;
        return false;
    }

    line = buffer.Slice(0, position.Value);
    buffer = buffer.Slice(buffer.GetPosition(1, position.Value));
    return true;
}
```

### Why This Is Fast:
- **Zero Heap Allocations**: Memory comes directly from pooled `MemoryPool<byte>`.
- **Zero Buffer Copies**: Slicing a `ReadOnlySequence<byte>` creates a lightweight struct pointer, not a new array!
- **Automatic Framing**: If a line spans two separate network packets, `ReadOnlySequence<byte>` links them together seamlessly.

---

# Common Mistakes

❌ **Forgetting to Call `reader.AdvanceTo()`**
```csharp
// BUG: If you don't advance the reader, subsequent ReadAsync() calls return the exact same data in an infinite loop!
```
✅ **Always call `reader.AdvanceTo(consumed, examined)`.**

❌ **Passing `buffer.Start` for Both Consumed and Examined When No Data was Matched**
```csharp
// DISASTER: Causes an infinite busy loop because the reader never waits for new bytes to arrive!
```
✅ **Pass `buffer.Start` as consumed and `buffer.End` as examined when waiting for more data.**

---

# Architect's Decision

### Scenario
Nova Commerce processes 10,000 continuous CSV merchant catalog uploads per hour (up to 1 GB each).

### Decision:
1. **Parser Engine**: Replace all legacy `StreamReader` and `MemoryStream` loops with `System.IO.Pipelines.PipeReader`.
2. **Memory Recycling**: Use `MemoryPool<byte>.Shared` to maintain $O(1)$ flat memory consumption across 10,000 concurrent streaming feeds.
3. **Performance Impact**: GC allocations reduced by 98%; throughput increased by 4x.

---

# Learning Resources & References

### Authoritative Documentation
- [System.IO.Pipelines in .NET — Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/standard/io/pipelines)
- [David Fowler: An Introduction to System.IO.Pipelines](https://devblogs.microsoft.com/dotnet/system-io-pipelines-high-performance-io-in-net/)
