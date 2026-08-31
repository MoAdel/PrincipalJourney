# 11A - Inside the Logging Architecture & High-Performance Internals

> "Logging is not text output.
>
> It is an asynchronous, filtered, structured event pipeline operating on the hot path of your application."

---

# Why This Chapter Exists

When your application executes:

```csharp
_logger.LogInformation("Order {OrderId} created for Customer {CustomerId}", orderId, customerId);
```

What actually happens inside the runtime?

- Who parses the template `"Order {OrderId} created for Customer {CustomerId}"`?
- Where are the parameters stored before being dispatched?
- How does the runtime check if `Information` is enabled before allocating anything?
- How do Scopes travel across asynchronous `await` boundaries?
- How does `LoggerMessageAttribute` eliminate boxing and heap allocations entirely?

As a Principal Engineer, understanding these internal mechanics enables you to design high-throughput systems that remain observable without sacrificing CPU, memory, or thread-pool capacity.

---

# The Complete Runtime Logging Pipeline

```
Application Call (_logger.LogInformation)
                     │
                     ▼
             IsEnabled(LogLevel)  ──[False]──► (Early Return - 0 Cost)
                     │
                  [True]
                     ▼
          FormattedLogValues Struct
         (Extracts keys and values)
                     │
                     ▼
              ILogger.Log<TState>()
                     │
                     ▼
             Logger<T> Wrapper
                     │
                     ▼
          MessageLogger / Composite
                     │
      ┌──────────────┼──────────────┐
      ▼              ▼              ▼
ConsoleLogger   OTLPLogger    SeqLogger
      │              │              │
      ▼              ▼              ▼
(Sync/Async)   (OTel Batch)   (HTTP Batch)
```

Every single log entry flows through this exact sequence.

---

# 1. How `ILogger<T>` Resolves Under the Hood

When you inject `ILogger<OrderService>` into your service constructor:

```csharp
public class OrderService(ILogger<OrderService> logger) { ... }
```

In the Dependency Injection container:

```csharp
// Registered in AddLogging():
services.TryAdd(ServiceDescriptor.Singleton(typeof(ILogger<>), typeof(Logger<>)));
```

`Logger<T>` is simply a generic wrapper around `ILogger`:

```csharp
public class Logger<T> : ILogger<T>
{
    private readonly ILogger _logger;

    public Logger(ILoggerFactory factory)
    {
        // Category Name is derived from TypeName:
        _logger = factory.CreateLogger(TypeNameHelper.GetTypeDisplayName(typeof(T)));
    }

    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, 
        Exception? exception, Func<TState, Exception?, string> formatter)
    {
        _logger.Log(logLevel, eventId, state, exception, formatter);
    }

    public bool IsEnabled(LogLevel logLevel) => _logger.IsEnabled(logLevel);

    public IDisposable? BeginScope<TState>(TState state) where TState : notnull
        => _logger.BeginScope(state);
}
```

Notice:
`Logger<T>` does not create log sinks. It delegates everything to an internal `ILogger` created by `ILoggerFactory` with the category name equal to `typeof(T).FullName`.

---

# 2. Inside `ILoggerFactory` and Logger Caching

When `factory.CreateLogger("NovaCommerce.Orders.OrderService")` is called:

```
ILoggerFactory (LoggerFactory)
      │
      ├── Dictionary<string, Logger> _loggers (Cache)
      │
      ├── List<ILoggerProvider> _providers
      │
      └── LoggerFilterOptions (Rules)
```

1. **Category Cache Lookup**: `LoggerFactory` maintains a thread-safe cache (`ConcurrentDictionary<string, Logger>`). If the logger for that category was already created, it returns the cached instance.
2. **Provider Dispatch**: For each registered `ILoggerProvider`, it calls `provider.CreateLogger(categoryName)`.
3. **Composite Logger Creation**: It bundles all provider loggers into a single composite logger (`MessageLogger[]`).
4. **Filter Rule Application**: It evaluates `LoggerFilterOptions` (from `appsettings.json`) to assign the minimum `LogLevel` for each provider/category pair.

---

# 3. What Happens During `LogInformation`?

Consider the extension method:

```csharp
_logger.LogInformation("Processing order {OrderId}", orderId);
```

Under the hood, this compiles to:

```csharp
public static void LogInformation(this ILogger logger, string message, params object?[] args)
{
    logger.Log(LogLevel.Information, 0, new FormattedLogValues(message, args), null, _messageFormatter);
}
```

### The Allocation Problem:
1. `params object?[] args`: Allocates a new array on the heap.
2. Value types (e.g. `int`, `Guid`, `double`) are boxed to `object`.
3. `FormattedLogValues`: Parses the format string `"{OrderId}"` to extract property names.
4. `_messageFormatter`: A static delegate that executes string replacement to format the final message.

If `Information` level is enabled, this cost is paid on every invocation.

---

# 4. The `IsEnabled` Fast-Path

Before formatting or dispatching, `ILogger` checks:

```csharp
if (!logger.IsEnabled(LogLevel.Debug))
{
    return; // Fast exit!
}
```

However, if you used string interpolation:

```csharp
// DISASTER: String interpolation runs BEFORE LogDebug is called!
_logger.LogDebug($"Customer details: {JsonSerializer.Serialize(customer)}");
```

Here, `JsonSerializer.Serialize(customer)` and the string interpolation **run unconditionally**, allocating memory and burning CPU even when `Debug` is completely disabled in production!

### The Principal Rule:
Never evaluate expressions or execute serialization inside log argument lists without explicit `IsEnabled` guards or lazy delegates.

```csharp
if (_logger.IsEnabled(LogLevel.Debug))
{
    _logger.LogDebug("Customer details: {Customer}", JsonSerializer.Serialize(customer));
}
```

---

# 5. How `[LoggerMessage]` Source Generator Achieves Zero Allocation

In .NET 6+, Microsoft introduced the `[LoggerMessage]` source generator.

When you declare:

```csharp
public static partial class LogExtensions
{
    [LoggerMessage(
        EventId = 501, 
        Level = LogLevel.Information, 
        Message = "Order {OrderId} placed with amount {Amount}")]
    public static partial void OrderPlaced(ILogger logger, Guid orderId, decimal amount);
}
```

The Roslyn compiler generates the following code at compile time:

```csharp
public static partial class LogExtensions
{
    private static readonly Action<ILogger, Guid, decimal, Exception?> __OrderPlacedCallback =
        LoggerMessage.Define<Guid, decimal>(
            LogLevel.Information,
            new EventId(501, nameof(OrderPlaced)),
            "Order {OrderId} placed with amount {Amount}");

    public static void OrderPlaced(ILogger logger, Guid orderId, decimal amount)
    {
        if (logger.IsEnabled(LogLevel.Information))
        {
            __OrderPlacedCallback(logger, orderId, amount, null);
        }
    }
}
```

### Why This Has 0 Byte Allocations:
1. **Pre-compiled Delegate**: The template `"Order {OrderId} placed with amount {Amount}"` is parsed once at application startup.
2. **Generic Struct State**: `LoggerMessage.Define<T1, T2>` stores `Guid` and `decimal` inside a strongly typed struct `LogValues<Guid, decimal>`. No boxing occurs!
3. **Automatic `IsEnabled` Check**: The method exits before doing any work if the log level is filtered out.

---

# 6. Internals of Scopes & `AsyncLocal<T>`

How does `_logger.BeginScope(...)` work across asynchronous methods?

```csharp
using (_logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = correlationId }))
{
    await _orderService.CreateOrderAsync();
}
```

### The Mechanism: `IExternalScopeProvider` & `AsyncLocal<T>`

1. `BeginScope` pushes the scope state onto an internal scope stack.
2. The scope stack is stored in `AsyncLocal<ScopeNode>`.
3. Because it uses `AsyncLocal<T>`, the scope flows down the asynchronous `ExecutionContext` across all `await` continuations and child tasks.
4. When `Dispose()` is called at the end of the `using` block, the scope node is popped off the `AsyncLocal` stack.
5. When any logger downstream logs an event, it queries `IExternalScopeProvider.ForEachScope()` to attach all parent scopes to the structured payload.

```
Async Execution Flow:

[Scope: CorrelationId=123]
       │
       ├── await Repository.GetAsync()     --> Inherits CorrelationId=123
       │
       ├── await PaymentGateway.ChargeAsync() --> Inherits CorrelationId=123
       │
       └── await EventBus.PublishAsync()   --> Inherits CorrelationId=123
```

---

# 7. Asynchronous vs Synchronous Log Dispatch

```
Synchronous Sink (Bad for High Load)
[ Request Thread ] ──► [ ILogger ] ──► [ Write to Console / File / Disk ] (Blocks Thread!)

Asynchronous Batching Sink (Recommended)
[ Request Thread ] ──► [ ILogger ] ──► [ Channel<LogEvent> / RingBuffer ] (Fast Memory Write)
                                                    │
                                                    ▼
                                       [ Background Worker Thread ]
                                                    │
                                                    ▼
                                       [ Batch HTTP to OTLP / Elastic ]
```

When writing at 50,000 req/sec:
- Synchronous logging blocks Kestrel worker threads on OS file/console handles, causing thread starvation.
- Asynchronous logging writes events into a bounded in-memory `Channel<T>` (e.g., `System.Threading.Channels`) and flushes in batches on a background thread.

---

# Principal Architecture Checklist for Logging

- [ ] All high-volume logging uses `[LoggerMessage]` source generator methods.
- [ ] No string interpolation `$"..."` in any `ILogger` calls.
- [ ] Request correlation IDs and trace IDs are captured in a Middleware logging scope via `_logger.BeginScope()`.
- [ ] Log levels in `appsettings.Production.json` filter out `Trace` and `Debug` from framework namespaces (`Microsoft.AspNetCore`, `Microsoft.EntityFrameworkCore`).
- [ ] Downstream log sinks use non-blocking asynchronous batching (OpenTelemetry OTLP exporter or Serilog Async sink).
- [ ] Sensitive data (passwords, tokens, credit card numbers, PII) is redacted or excluded before logging.

---

# Self Assessment

1. Explain how `LoggerMessage.Define` avoids boxing value types such as `int` or `Guid`.
2. Trace the path of an `ILogger<T>` call from the service constructor to the underlying `ILoggerProvider`.
3. Why does `AsyncLocal<T>` enable logging scopes to cross asynchronous `await` boundaries?
4. What happens to application throughput when a logging sink writes synchronously to disk during peak traffic?
5. How does the Roslyn `[LoggerMessage]` source generator verify log template parameters at compile time?
