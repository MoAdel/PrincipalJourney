# High-Performance Memory — Span, Memory & ArrayPool

> **Core Concept**: Zero-Allocation Memory Engineering  
> How `Span<T>`, `Memory<T>`, `ref struct`, and `ArrayPool<T>` eliminate heap allocations on extreme hot paths.

---

## 1. The Physical Anatomy of `Span<T>`

`Span<T>` is a contiguous view over arbitrary physical memory—whether that memory lives on the managed heap, on the thread stack, or in unmanaged native memory:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        PHYSICAL SPAN<T> STRUCT                         │
├────────────────────────────────┬───────────────────────────────────────┤
│ ByReference<T> _pointer        │ 64-bit native pointer to first byte   │
│ int _length                    │ 32-bit count of elements              │
└────────────────────────────────┴───────────────────────────────────────┘
```

```csharp
// Span can point to ANY memory type with zero allocation:
Span<byte> fromHeapArray = new byte[100];            // Managed Heap
Span<byte> fromStack     = stackalloc byte[100];     // Thread Stack (0 GC!)
Span<byte> fromNative    = new Span<byte>(nativePtr, 100); // Native C Buffer
```

---

## 2. The `ref struct` Boundary: Why Span Cannot Be Awaited

`Span<T>` is declared as a **`ref struct`**:
```csharp
public readonly ref struct Span<T> { ... }
```

### The Invariant:
* A `ref struct` **can ONLY exist on the thread stack**.
* It can never be boxed, cannot be stored in a normal class or dictionary, cannot implement interfaces, and **CANNOT be used across an `await` boundary**!
* **Why?** An `await` can resume on a different thread. If a `Span` survived an await, it would point to a dead stack frame, corrupting memory!

---

## 3. `Memory<T>`: The Async-Friendly Cousin

When you need to pass a slice of memory across asynchronous methods or store it in a class:

```text
┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│               Span<T>                │  │              Memory<T>               │
├──────────────────────────────────────┤  ├──────────────────────────────────────┤
│ • ref struct (Stack ONLY)            │  │ • Standard readonly struct           │
│ • Synchronous execution ONLY         │  │ • Can be stored in heap classes      │
│ • Fast pointer access                │  │ • Can cross `await` boundaries!      │
│ • Cannot cross `await`               │  │ • Access Span via: `memory.Span`     │
└──────────────────────────────────────┘  └──────────────────────────────────────┘
```

```csharp
public async Task ProcessChunkAsync(ReadOnlyMemory<byte> buffer)
{
    // Access fast Span synchronously within each chunk
    ReadOnlySpan<byte> span = buffer.Span;
    ValidateChecksum(span);

    // Can be safely passed to an async I/O method!
    await _stream.WriteAsync(buffer);
}
```

---

## 4. `ArrayPool<T>`: Reusing Large Buffers

Allocating temporary 32 KB or 64 KB buffers for JSON parsing or socket serialization creates intense Gen 0/Gen 1 GC churn.
Use **`ArrayPool<T>.Shared`** to rent and reuse buffers:

```csharp
public async Task<int> ParsePayloadAsync(Stream socketStream)
{
    // 1. Rent a buffer from the thread-safe global pool
    byte[] buffer = ArrayPool<byte>.Shared.Rent(minimumLength: 16_384);
    try
    {
        // 2. WARNING: The rented array might be larger than 16,384 bytes (e.g. 32,768)!
        // Always slice to the actual bytes read!
        int bytesRead = await socketStream.ReadAsync(buffer.AsMemory(0, 16_384));

        ReadOnlySpan<byte> payload = buffer.AsSpan(0, bytesRead);
        return ProcessBytes(payload);
    }
    finally
    {
        // 3. ALWAYS return to pool in finally!
        // clearArray: true prevents sensitive customer data from leaking to the next renter!
        ArrayPool<byte>.Shared.Return(buffer, clearArray: true);
    }
}
```

### The 3 Golden Rules of ArrayPool:
1. **Never Assume Exact Size**: `Rent(100)` can return an array of 128 or 256 bytes. Always track the actual logical length.
2. **Never Touch After Return**: Writing to an array after returning it corrupts the next thread that rents it.
3. **Always Return in `finally`**: Forgetting to return causes array pool starvation, forcing the pool to allocate new arrays and defeating the entire purpose.
