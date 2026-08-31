# 12A - Inside Exception Handling & Diagnostics Internals

> "An unhandled exception is not just an error.
>
> It is an abrupt change in execution flow that unwinds the call stack, resets memory buffers, and tests your pipeline's error recovery boundaries."

---

# Why This Chapter Exists

When an unhandled exception occurs deep in your repository:

```
Database Query Throws SqlException
                │
                ▼
Repository Method Aborts
                │
                ▼
Service Method Aborts
                │
                ▼
Controller Action Aborts
                │
                ▼
Pipeline Unwinds...
```

What actually happens inside the ASP.NET Core runtime and the .NET Common Language Runtime (CLR)?

- How does `ExceptionHandlerMiddleware` catch the exception and reset the response pipeline?
- How does `IExceptionHandler` chain multiple handlers in sequence?
- How does `ExceptionDispatchInfo` preserve the original stack trace without mutating it?
- What happens to pending response buffers and open database connections?

Understanding these mechanics is essential for diagnosing low-level pipeline bugs, memory leaks, and connection exhaustion during production outages.

---

# The Exception Handling Pipeline Mechanics

```
                         HTTP Request
                              │
                              ▼
                ┌───────────────────────────┐
                │ ExceptionHandlerMiddleware│
                └─────────────┬─────────────┘
                              │
                    try { await _next(); }
                              │
                              ▼
                ┌───────────────────────────┐
                │    Downstream Pipeline    │
                │  (Auth, Routing, Endpoints)
                └─────────────┬─────────────┘
                              │
                   [ Exception Thrown! ]
                              │
                              ▼
                 catch (Exception exception)
                              │
                              ▼
                   Clear Response Buffers
                     (Reset StatusCode)
                              │
                              ▼
                 Iterate IExceptionHandler[]
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
     Handler 1.TryHandleAsync()     Handler 2.TryHandleAsync()
       [Returns false]                [Returns true]
                                             │
                                             ▼
                                  Write ProblemDetails
                                             │
                                             ▼
                                     HTTP 500 Response
```

---

# 1. Inside `ExceptionHandlerMiddleware`

Let's look at the simplified internal implementation of ASP.NET Core's `ExceptionHandlerMiddleware`:

```csharp
public class ExceptionHandlerMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IExceptionHandler[] _handlers;
    private readonly IProblemDetailsService? _problemDetailsService;

    public async Task Invoke(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            // 1. If response has already started streaming, we cannot handle it safely
            if (context.Response.HasStarted)
            {
                LogResponseAlreadyStarted(ex);
                throw; // Rethrow to let server abort socket
            }

            // 2. Clear headers and reset response
            context.Response.Clear();
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;

            // 3. Execute IExceptionHandler chain
            var handled = false;
            foreach (var handler in _handlers)
            {
                if (await handler.TryHandleAsync(context, ex, context.RequestAborted))
                {
                    handled = true;
                    break;
                }
            }

            // 4. Fallback if no handler claimed the exception
            if (!handled)
            {
                ExceptionDispatchInfo.Capture(ex).Throw();
            }
        }
    }
}
```

Notice the crucial details:
- If a handler returns `true`, the loop terminates and the exception is considered handled.
- If no handler returns `true`, `ExceptionDispatchInfo.Capture(ex).Throw()` rethrows the original exception without corrupting the call stack.

---

# 2. How the CLR Handles Exception Unwinding

Why is throwing an exception in .NET significantly more expensive than standard method returns?

```
Call Stack:
[ Method A ] ──► [ Method B ] ──► [ Method C ] ──► [ Throw Exception ]
```

When `throw new InvalidOperationException()` executes:

1. **Two-Pass Exception Handling in CLR**:
   - **First Pass (Search Phase)**: The CLR walks up the stack frames looking for a compatible `catch` block (evaluating exception filters like `when (...)`).
   - **Second Pass (Unwind Phase)**: The CLR walks back up the stack, executing all `finally` blocks and `using` disposal blocks in reverse order.
2. **Stack Frame Capture**: The runtime captures metadata (instruction pointers, method tokens, line numbers from PDBs) for every single stack frame between the throw site and the catch site.
3. **Garbage Collection Overhead**: The exception object and its internal `StackTrace` array are allocated on the managed heap.

### Benchmark Comparison (Rough Magnitude):
- Returning a `Result<T>` struct: **~1.2 nanoseconds, 0 bytes allocated**.
- Throwing and catching an `Exception`: **~2,500 nanoseconds, ~1,500 bytes allocated**.

Under high concurrency (e.g. 30,000 requests/sec), throwing exceptions for expected business conditions will rapidly trigger Gen 0/1 GC pauses and saturate CPU cores.

---

# 3. Preserving Stack Traces with `ExceptionDispatchInfo`

In legacy .NET code, developers often wrote:

```csharp
try
{
    await ExecuteAsync();
}
catch (Exception ex)
{
    _logger.LogError(ex, "Failed");
    throw ex; // BUG: Resets the stack trace to this line!
}
```

When you write `throw ex;`, the CLR resets the stack trace, erasing the original origin of the error.

Using `throw;` preserves the stack trace, but only works within the lexical `catch` block.

If you need to capture an exception and rethrow it asynchronously or on another thread:

```csharp
var edi = ExceptionDispatchInfo.Capture(exception);

// Later, on another thread or task:
edi.Throw(); // Preserves the exact original stack trace and appends dispatch information
```

ASP.NET Core uses `ExceptionDispatchInfo` throughout its internal task scheduling and middleware pipeline.

---

# 4. Stream Buffering & `Response.Clear()`

When an exception occurs during request execution:

```
Middleware A ──► Middleware B ──► Controller Action (wrote partial JSON to response stream)
```

If buffering was enabled (or default body stream):
- `context.Response.Clear()` resets the response buffer, clearing any partial content that was written before the exception occurred.
- It resets HTTP response headers (Content-Type, Content-Length).
- It sets `StatusCode = 500`.

However, if the controller flushed the stream (`await Response.Body.FlushAsync()`), the TCP packet containing the `HTTP/1.1 200 OK` header has already traveled over the wire.

At that point, `Response.Clear()` will throw an `InvalidOperationException: The response has already started, the response headers cannot be modified.`

### Principal Engineering Rule:
In streaming APIs (e.g., SSE, file exports, chunked JSON arrays), wrap the stream writer in defensive exception handlers, and write an in-stream terminal error token if the protocol supports it, or close the connection immediately.

---

# Internal Diagnostics Checklist

- [ ] `app.UseExceptionHandler()` is placed at the very top of the middleware pipeline (before routing, authentication, and endpoint dispatch).
- [ ] Multiple `IExceptionHandler` implementations are registered in order of specificity (e.g. `ValidationExceptionHandler` before `GlobalExceptionHandler`).
- [ ] Unhandled exceptions are logged with `TraceIdentifier` to correlate with client ProblemDetails responses.
- [ ] No `throw ex;` exists anywhere in the codebase; always use `throw;` or `ExceptionDispatchInfo`.
- [ ] Exceptions are never used for routine business validation flow control.

---

# Self Assessment

1. Describe the two phases of CLR exception handling (Search Phase and Unwind Phase).
2. What is the difference between `throw;`, `throw ex;`, and `ExceptionDispatchInfo.Capture(ex).Throw()`?
3. Why does `ExceptionHandlerMiddleware` verify `context.Response.HasStarted` before clearing the response?
4. How does the `IExceptionHandler` chain decide whether to continue calling subsequent handlers or stop?
