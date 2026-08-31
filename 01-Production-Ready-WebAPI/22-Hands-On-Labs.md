# 22 - Hands-On Architecture Labs: Nova Commerce API

> "Architecture on a whiteboard is an opinion.
>
> Architecture in code is a working reality."

---

# Overview

These 8 progressive hands-on engineering labs guide you through implementing the production-ready foundation for **Nova Commerce**.

Each lab isolates a core architectural discipline, presents the requirements, code implementation, and verification steps.

---

# Lab 1: Clean Architecture Solution Structure

### Objective
Create an enterprise solution with strict dependency inversion boundaries.

### Instructions:
1. Initialize the solution and project structure:
```bash
dotnet new sln -n NovaCommerce
mkdir src tests

dotnet new classlib -n NovaCommerce.Domain -o src/NovaCommerce.Domain
dotnet new classlib -n NovaCommerce.Application -o src/NovaCommerce.Application
dotnet new classlib -n NovaCommerce.Infrastructure -o src/NovaCommerce.Infrastructure
dotnet new webapi -n NovaCommerce.Api -o src/NovaCommerce.Api

dotnet new xunit -n NovaCommerce.UnitTests -o tests/NovaCommerce.UnitTests
dotnet new xunit -n NovaCommerce.ArchitectureTests -o tests/NovaCommerce.ArchitectureTests

dotnet sln add src/*/*.csproj tests/*/*.csproj
```

2. Establish dependency directions:
```bash
# Application depends on Domain
dotnet add src/NovaCommerce.Application reference src/NovaCommerce.Domain

# Infrastructure depends on Application and Domain
dotnet add src/NovaCommerce.Infrastructure reference src/NovaCommerce.Application

# Api (Composition Root) depends on Infrastructure and Application
dotnet add src/NovaCommerce.Api reference src/NovaCommerce.Infrastructure src/NovaCommerce.Application
```

3. Add **NetArchTest.Rules** to `NovaCommerce.ArchitectureTests` and enforce that Domain has zero dependencies.

---

# Lab 2: Zero-Allocation Structured Logging & Correlation Scope Middleware

### Objective
Implement request correlation tracing with ambient scopes and compile-time `[LoggerMessage]` source generators.

### 1. Compile-Time Logger Messages (`OrderLogMessages.cs` in Application):
```csharp
public static partial class OrderLogMessages
{
    [LoggerMessage(
        EventId = 1001,
        Level = LogLevel.Information,
        Message = "Processing checkout for Order {OrderId} of Customer {CustomerId}")]
    public static partial void LogCheckoutStarted(ILogger logger, Guid orderId, Guid customerId);

    [LoggerMessage(
        EventId = 1002,
        Level = LogLevel.Information,
        Message = "Order {OrderId} successfully placed in {ElapsedMs}ms")]
    public static partial void LogCheckoutCompleted(ILogger logger, Guid orderId, long elapsedMs);
}
```

### 2. Correlation Scope Middleware (`CorrelationScopeMiddleware.cs` in Api):
```csharp
public class CorrelationScopeMiddleware(RequestDelegate next, ILogger<CorrelationScopeMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = context.Request.Headers["X-Correlation-Id"].FirstOrDefault() 
                            ?? Guid.NewGuid().ToString("N");

        context.Response.Headers.Append("X-Correlation-Id", correlationId);

        using (logger.BeginScope(new Dictionary<string, object>
        {
            ["CorrelationId"] = correlationId,
            ["TraceId"] = context.TraceIdentifier
        }))
        {
            await next(context);
        }
    }
}
```

---

# Lab 3: RFC 7807 Global Exception Handler

### Objective
Implement `IExceptionHandler` in .NET 8/9+ to sanitize production faults into RFC 7807 ProblemDetails.

### `GlobalExceptionHandler.cs`:
```csharp
public sealed class GlobalExceptionHandler(
    ILogger<GlobalExceptionHandler> logger,
    IProblemDetailsService problemDetailsService) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        logger.LogError(exception, "Unhandled exception on {Path}: {Message}", 
            httpContext.Request.Path, exception.Message);

        var statusCode = exception switch
        {
            ValidationException => StatusCodes.Status400BadRequest,
            KeyNotFoundException => StatusCodes.Status404NotFound,
            InvalidOperationException => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status500InternalServerError
        };

        httpContext.Response.StatusCode = statusCode;

        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = new ProblemDetails
            {
                Status = statusCode,
                Title = statusCode == 500 ? "Internal Server Error" : exception.GetType().Name,
                Detail = statusCode == 500 ? "An unexpected error occurred. Please quote the trace ID." : exception.Message,
                Instance = httpContext.Request.Path,
                Extensions = { ["traceId"] = httpContext.TraceIdentifier }
            }
        });
    }
}
```

---

# Lab 4: FluentValidation with Pipeline Behavior

### Objective
Build reusable validation rules in the Application layer without controller clutter.

### 1. FluentValidator:
```csharp
public sealed class CreateProductRequestValidator : AbstractValidator<CreateProductRequest>
{
    public CreateProductRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150);
        RuleFor(x => x.Price).GreaterThan(0);
        RuleFor(x => x.Sku).Matches(@"^[A-Z]{3}-\d{4}$").WithMessage("SKU must match format ABC-1234");
    }
}
```

### 2. CQRS Validation Pipeline:
```csharp
public sealed class ValidationBehavior<TRequest, TResponse>(IEnumerable<IValidator<TRequest>> validators)
    : IPipelineBehavior<TRequest, TResponse> where TRequest : notnull
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken ct)
    {
        if (!validators.Any()) return await next();

        var context = new ValidationContext<TRequest>(request);
        var validationResults = await Task.WhenAll(validators.Select(v => v.ValidateAsync(context, ct)));
        var failures = validationResults.SelectMany(r => r.Errors).Where(f => f != null).ToList();

        if (failures.Count != 0)
            throw new ValidationException(failures);

        return await next();
    }
}
```

---

# Lab 5: Idempotency Key Filter with Distributed Caching

### Objective
Prevent duplicate order submissions when clients retry requests.

```csharp
public sealed class IdempotentAttribute : Attribute, IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (!context.HttpContext.Request.Headers.TryGetValue("Idempotency-Key", out var keyVal))
        {
            context.Result = new BadRequestObjectResult(new ProblemDetails 
            { 
                Title = "Missing Header", 
                Detail = "Idempotency-Key header is required for this operation." 
            });
            return;
        }

        var cache = context.HttpContext.RequestServices.GetRequiredService<IDistributedCache>();
        var cacheKey = $"idempotency:{keyVal}";

        var cachedResponse = await cache.GetStringAsync(cacheKey);
        if (cachedResponse != null)
        {
            // Replay identical response
            context.Result = new ContentResult
            {
                Content = cachedResponse,
                ContentType = "application/json",
                StatusCode = StatusCodes.Status200OK
            };
            return;
        }

        var executedContext = await next();

        if (executedContext.Result is ObjectResult objectResult && objectResult.StatusCode is >= 200 and < 300)
        {
            var json = JsonSerializer.Serialize(objectResult.Value);
            await cache.SetStringAsync(cacheKey, json, new DistributedCacheEntryOptions 
            { 
                AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) 
            });
        }
    }
}
```

---

# Lab 6: Resilient Outbound HTTP Client with Polly v8

### Objective
Integrate with Payment Gateway using typed clients, socket connection pooling, and Polly resilience.

```csharp
builder.Services.AddHttpClient<IPaymentGatewayClient, PaymentGatewayClient>(client =>
{
    client.BaseAddress = new Uri("https://api.paymentgateway.com/v1/");
    client.Timeout = TimeSpan.FromSeconds(10);
})
.AddStandardResilienceHandler(options =>
{
    options.Retry.MaxRetryAttempts = 3;
    options.Retry.BackoffType = DelayBackoffType.Exponential;
    options.Retry.UseJitter = true;
    options.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(30);
    options.CircuitBreaker.FailureRatio = 0.5;
});
```

---

# Lab 7: API Versioning & Native OpenAPI Documentation

### Objective
Configure URL versioning (`/api/v1/`, `/api/v2/`) and OpenAPI v3 documentation.

```csharp
builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1, 0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true;
    options.ApiVersionReader = new UrlSegmentApiVersionReader();
})
.AddApiExplorer(options =>
{
    options.GroupNameFormat = "'v'VVV";
    options.SubstituteApiVersionInUrl = true;
});

builder.Services.AddOpenApi("v1");
builder.Services.AddOpenApi("v2");
```

---

# Lab 8: Container Probes & Azure Key Vault Secrets

### Objective
Configure three-tier health probes and Managed Identity secret retrieval.

```csharp
builder.Services.AddHealthChecks()
    .AddCheck("self", () => HealthCheckResult.Healthy(), tags: ["live"])
    .AddSqlServer(builder.Configuration.GetConnectionString("SqlDatabase")!, tags: ["ready"]);

var app = builder.Build();

app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("live")
});

app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready")
});
```

---

# Lab Completion Criteria

Your Nova Commerce API is complete when all 8 labs compile, all unit and architecture tests pass, and your container passes Kubernetes Liveness/Readiness probes under load.
