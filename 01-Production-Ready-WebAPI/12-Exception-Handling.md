# 12 - Global Exception Handling & Error Boundaries

> "Exceptions in software are like circuit breakers in an electrical grid.
>
> If they trip constantly, your design is flawed. If they fail to trip when an unexpected fault occurs, the entire system burns down."

---

# Why Should a Principal Engineer Care?

In a poorly designed Web API, error handling looks like this:

```csharp
[HttpPost]
public async Task<IActionResult> CreateOrder(CreateOrderRequest request)
{
    try
    {
        var order = await _orderService.CreateAsync(request);
        return Ok(order);
    }
    catch (Exception ex)
    {
        return StatusCode(500, new { Error = ex.Message, StackTrace = ex.StackTrace });
    }
}
```

This snippet exhibits four severe architectural failures:
1. **Security Vulnerability**: Exposes internal class names, SQL queries, and stack traces to external attackers.
2. **Controller Bloat**: Every controller endpoint becomes a repetitive graveyard of identical `try-catch` blocks.
3. **Inconsistent Error Contracts**: Every endpoint invents its own custom error JSON structure.
4. **Misuse of Exceptions**: Uses expensive CLR exceptions for routine business validation failures.

As a Principal Engineer, you design **robust error boundaries** that:
- Centralize unhandled exception handling at the outer boundary of the pipeline.
- Separate **expected business failures** (Domain Errors) from **unexpected infrastructure faults** (Exceptions).
- Conform to the industry standard **RFC 7807 / RFC 9457 Problem Details** specification.
- Prevent stack trace leakage while preserving end-to-end diagnostic correlation IDs for operators.

---

# Production Story

Tuesday.

02:14 PM.

A security audit flags Nova Commerce for a critical vulnerability (CWE-209: Generation of Error Message Containing Sensitive Information).

### What Happened:
A customer submitted an order containing an invalid postal code. The database threw an unhandled `SqlException`:

```json
HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{
  "error": "Cannot insert duplicate key in object 'dbo.Orders'. The duplicate key value is (ORD-9921).",
  "stackTrace": "at Microsoft.Data.SqlClient.SqlCommand.ExecuteReader() in SqlClient.cs:line 412\nat NovaCommerce.Infrastructure.Repositories.OrderRepository.AddAsync(Order order) in OrderRepository.cs:line 84\nat NovaCommerce.Api.Controllers.OrdersController.CreateOrder() in OrdersController.cs:line 32"
}
```

The response revealed:
- Database engine and server version.
- Exact table schema and primary key column names.
- Internal repository class names and line numbers.

An external security researcher used this information to construct a targeted SQL injection exploit against another unpatched internal service.

The fix was not patching 40 individual controllers with `try-catch`. The fix was establishing a centralized, zero-leak global exception handling architecture.

---

# The Real Problem

Error handling in enterprise distributed systems involves two competing needs:

```
External Consumer Need               Internal Engineering Need
───────────────────────              ─────────────────────────
Safe, standardized error             Full exception stack trace,
Machine-readable error codes         Internal dependency state,
Zero infrastructure details          Correlation / Trace identifiers,
Clear HTTP status codes              Structured log telemetry
```

If your architecture mixes these two concerns, you either leak internal secrets or hide crucial diagnostic context from your operations team.

---

# The Principle: Separation of Failures

A Principal Engineer establishes a strict dichotomy between **Domain Errors** and **System Exceptions**:

```
                       ┌────────────────────────────────────────┐
                       │          Incoming HTTP Request         │
                       └───────────────────┬────────────────────┘
                                           │
                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ Domain / Business Logic (Expected Failures)                                       │
│                                                                                   │
│  • Insufficient Inventory         • Expired Credit Card                           │
│  • Duplicate Email Address        • Account Locked                                │
│                                                                                   │
│  → Handled via: Result Pattern / Domain Errors (NO EXCEPTIONS THROWN)              │
│  → Returns: 400 Bad Request / 422 Unprocessable Entity / 409 Conflict             │
└──────────────────────────────────────────┬────────────────────────────────────────┘
                                           │
                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ System / Infrastructure Faults (Unexpected Failures)                               │
│                                                                                   │
│  • Database Out of Memory         • Network Timeout / Socket Reset                │
│  • Redis Connection Dropped       • Hardware Failure                              │
│                                                                                   │
│  → Handled via: Global Exception Handler (IExceptionHandler)                       │
│  → Emits: Structured Error Log with Correlation ID                                │
│  → Returns: 500 Internal Server Error (Sanitized RFC 7807 ProblemDetails)         │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

# Result Pattern vs Throwing Exceptions

Why shouldn't business logic throw exceptions?

### The Cost of Exceptions in .NET:
When an exception is thrown in the CLR:
1. The runtime captures the entire stack trace of the call stack.
2. It walks and unwinds the stack frame by frame.
3. It allocates multiple objects on the managed heap.
4. It pauses execution to locate compatible `catch` blocks.

Benchmark measurements reveal that throwing and catching an exception is **hundreds of times slower** than returning a typed result object.

### The Result Pattern Approach:

```csharp
public readonly struct Result<TValue, TError>
{
    public bool IsSuccess { get; }
    public TValue? Value { get; }
    public TError? Error { get; }

    private Result(TValue value)
    {
        IsSuccess = true;
        Value = value;
        Error = default;
    }

    private Result(TError error)
    {
        IsSuccess = false;
        Value = default;
        Error = error;
    }

    public static Result<TValue, TError> Success(TValue value) => new(value);
    public static Result<TValue, TError> Failure(TError error) => new(error);
}
```

### Business Service Example:
```csharp
public async Task<Result<Order, DomainError>> CreateOrderAsync(CreateOrderDto dto)
{
    if (await _customerRepo.GetBalanceAsync(dto.CustomerId) < dto.TotalAmount)
    {
        return Result<Order, DomainError>.Failure(
            new DomainError("INSUFFICIENT_FUNDS", "Customer balance is below required total."));
    }

    var order = Order.Create(dto);
    await _orderRepo.SaveAsync(order);
    return Result<Order, DomainError>.Success(order);
}
```

Exceptions are reserved exclusively for things that **should never happen during normal business operation**.

---

# Modern ASP.NET Core Exception Handling (`IExceptionHandler`)

Starting in .NET 8+, ASP.NET Core introduced the `IExceptionHandler` abstraction, replacing legacy custom middleware loops.

### Step 1: Implement `IExceptionHandler`

```csharp
public sealed class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger;
    private readonly IProblemDetailsService _problemDetailsService;

    public GlobalExceptionHandler(
        ILogger<GlobalExceptionHandler> logger,
        IProblemDetailsService problemDetailsService)
    {
        _logger = logger;
        _problemDetailsService = problemDetailsService;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        // 1. Log full technical details internally
        _logger.LogError(
            exception, 
            "Unhandled exception occurred on request {TraceId}: {ErrorMessage}", 
            httpContext.TraceIdentifier, 
            exception.Message);

        // 2. Map exception to appropriate HTTP Status Code
        var (statusCode, title, detail) = MapException(exception);

        httpContext.Response.StatusCode = statusCode;

        // 3. Write standardized RFC 7807 Problem Details
        return await _problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = new ProblemDetails
            {
                Status = statusCode,
                Title = title,
                Detail = detail,
                Instance = $"{httpContext.Request.Method} {httpContext.Request.Path}",
                Extensions =
                {
                    ["traceId"] = httpContext.TraceIdentifier
                }
            }
        });
    }

    private static (int StatusCode, string Title, string Detail) MapException(Exception exception) =>
        exception switch
        {
            ValidationException => (
                StatusCodes.Status400BadRequest, 
                "Validation Failure", 
                "One or more validation errors occurred."),

            NotFoundException => (
                StatusCodes.Status404NotFound, 
                "Resource Not Found", 
                exception.Message),

            ConcurrencyConflictException => (
                StatusCodes.Status409Conflict, 
                "Concurrency Conflict", 
                "The resource was modified by another operation."),

            UnauthorizedAccessException => (
                StatusCodes.Status403Forbidden, 
                "Access Denied", 
                "You do not have permission to access this resource."),

            _ => (
                StatusCodes.Status500InternalServerError, 
                "Internal Server Error", 
                "An unexpected error occurred. Please contact support with the trace identifier.")
        };
}
```

### Step 2: Register in `Program.cs`

```csharp
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

var app = builder.Build();

// Must be registered near the beginning of the pipeline:
app.UseExceptionHandler();
```

---

# Handling Exceptions After Response Has Started

A subtle production edge case: What happens if an exception occurs **after headers have already been sent to the client** (e.g., during chunked response streaming or large file downloads)?

```
Kestrel writes HTTP 200 OK Headers
               │
               ▼
Body Streaming Starts (10MB payload)
               │
               ▼
[ Connection Resets / OutOfMemoryException ]
```

### The Rule:
Once `httpContext.Response.HasStarted` is `true`, **you cannot modify status codes or headers**.

If an exception occurs after response streaming starts:
- The `ExceptionHandlerMiddleware` detects `Response.HasStarted == true`.
- It rethrows the exception or aborts the TCP connection immediately.
- Attempting to write a `ProblemDetails` payload will throw an `InvalidOperationException`.

---

# Common Mistakes

❌ **Catching `Exception` and Swallowing It**
```csharp
try { await SendEmailAsync(); }
catch (Exception) { /* Do nothing */ } // DISASTER: Silently hides cascading infrastructure failures
```
✅ **Handle or Let Fail Explicitly**
```csharp
try { await SendEmailAsync(); }
catch (SmtpException ex) { _logger.LogWarning(ex, "Transient email failure; queued for retry"); }
```

❌ **Scattering `try-catch` Across Every Controller Method**
```csharp
// Unnecessary boilerplate that duplicates error mapping and leaks inconsistent responses.
```
✅ **Use Centralized Global `IExceptionHandler` Pipeline**

❌ **Throwing Exceptions for Routine Validation Checks**
```csharp
if (string.IsNullOrEmpty(email)) throw new InvalidEmailException(); // BAD: High allocation & CPU cost
```
✅ **Use FluentValidation or Domain Result Pattern**

❌ **Returning 200 OK with Error Objects in Payload**
```json
HTTP/1.1 200 OK
{ "isSuccess": false, "errorMessage": "Invalid credentials" } // ANTI-PATTERN: Breaks HTTP semantics, caching, and API gateways
```
✅ **Return Standard HTTP 4xx / 5xx Status Codes with ProblemDetails**

---

# Architect's Decision

### Scenario
Nova Commerce requires a unified exception and error-handling architecture across all REST APIs that complies with security standards, supports rapid troubleshooting, and maintains low CPU overhead.

### Strategy:
1. **Domain Layer**: Uses `Result<TValue, Error>` for business logic invariants. Zero exceptions thrown for business rules.
2. **Application Layer**: Validates requests with FluentValidation and transforms invalid commands into `422 Unprocessable Entity` or `400 Bad Request`.
3. **API Boundary**: Employs `IExceptionHandler` and `IProblemDetailsService` to capture unhandled infrastructure faults, generate RFC 7807 payloads, and attach `TraceIdentifier`.
4. **Telemetry**: Logs unhandled exceptions at `LogLevel.Error` with stack traces strictly within internal log sinks. External responses receive generic sanitized messages.

---

# Principal Thinking

| Level | Perspective | Focus |
|---|---|---|
| **Junior** | Syntax | "I put a try/catch in my controller." |
| **Senior** | Cleanliness | "I created a global middleware to handle exceptions." |
| **Principal** | System Resilience & Boundaries | "What is the error taxonomy, the performance impact of stack unwinding, the security blast radius of error payloads, and the client contract consistency across our microservice ecosystem?" |

---

# Learning Resources & References

### Authoritative Documentation
- [Handle errors in ASP.NET Core APIs — Microsoft Learn](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/error-handling)
- [RFC 7807: Problem Details for HTTP APIs](https://datatracker.ietf.org/doc/html/rfc7807)
- [RFC 9457: Problem Details for HTTP APIs (Updated Standard)](https://datatracker.ietf.org/doc/html/rfc9457)

### Advanced Reading
- [Error Handling in Clean Architecture & Domain-Driven Design](https://enterprisecraftsmanship.com/posts/functional-c-handling-failures-input-errors/)
- [Benchmarks: The Performance Cost of Throwing Exceptions in .NET](https://adamsitnik.com/Exceptions/)

---

# Self Assessment

1. Why should business invariants return `Result<T>` instead of throwing custom exceptions?
2. How does `IExceptionHandler` in .NET 8 improve upon traditional custom middleware?
3. What happens if an exception is thrown after `Response.HasStarted` is true?
4. How do you prevent stack trace leakage while allowing developers to correlate production errors with internal logs?
5. Which HTTP status code should be returned for: (a) validation failure, (b) optimistic concurrency conflict, (c) database timeout?
