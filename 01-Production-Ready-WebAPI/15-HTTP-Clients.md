# 15 - Resilient Outbound HTTP & IHttpClientFactory

> "An external HTTP call is not an in-memory method invocation.
>
> It is an unreliable, high-latency network traversal crossing process boundaries, firewalls, DNS resolvers, and external infrastructure."

---

# Why Should a Principal Engineer Care?

Most developers integrate external APIs with one of two naive patterns:

### Anti-Pattern 1: The Socket Exhaustion Trap
```csharp
public async Task<PaymentResponse> ProcessPayment(PaymentRequest request)
{
    using var client = new HttpClient(); // DANGEROUS: Exhausts OS sockets under load
    return await client.PostAsJsonAsync("https://api.payments.com", request);
}
```

### Anti-Pattern 2: The Stale DNS Trap
```csharp
// DANGEROUS: Never refreshes DNS changes when payment gateway fails over
private static readonly HttpClient _client = new HttpClient();
```

Both patterns will crash production systems under scale.

As a Principal Engineer, you must understand:
- Why OS sockets linger in `TIME_WAIT` state and exhaust TCP port ranges.
- How `IHttpClientFactory` solves socket exhaustion AND DNS stale-cache problems simultaneously.
- How to compose outgoing pipelines with **DelegatingHandlers** for telemetry, authentication, and correlation.
- How to apply modern resilience engineering with **Microsoft.Extensions.Resilience** (Polly v8).

---

# Production Story

Wednesday.

01:20 PM.

Nova Commerce's checkout service starts throwing connection timeouts:

```
System.Net.Sockets.SocketException (10048): 
Only one usage of each socket address (protocol/network address/port) is normally permitted.
```

The application server had 16 CPU cores and 64 GB of RAM. CPU utilization was under 15%.

Yet, every outbound HTTP call to the Payment Gateway and Inventory Service was blocked.

### The Investigation:
Running `netstat -ano | findstr TIME_WAIT` on the server revealed **over 28,000 TCP sockets** stuck in `TIME_WAIT` state.

A developer had placed `using var client = new HttpClient();` inside the checkout command handler.

Even though C#'s `Dispose()` closed the .NET object, the underlying operating system (Windows TCP/IP stack) keeps the TCP socket open for 120 to 240 seconds (`2 * MSL` - Maximum Segment Lifetime) to ensure in-flight packets arrive safely.

Under 250 requests/sec, the server completely exhausted the available ephemeral port range (ports 49152–65535), bringing checkout to an absolute halt.

---

# The Dual Dilemma: Sockets vs DNS

```
Option 1: new HttpClient() per request
┌────────────────────────────────────────┐
│ PRO: Honors DNS changes.               │
│ CON: Socket Exhaustion (Crash).        │
└────────────────────────────────────────┘

Option 2: static HttpClient for lifetime
┌────────────────────────────────────────┐
│ PRO: Reuses TCP connections.           │
│ CON: Ignores DNS updates (Failover     │
│      traffic is sent to dead IPs).     │
└────────────────────────────────────────┘

Option 3: IHttpClientFactory (Principal Standard)
┌─────────────────────────────────────────────────────────────┐
│ Pools underlying HttpMessageHandler connections for 2 mins. │
│ Rotates handlers to refresh DNS. Reuses sockets safely.     │
└─────────────────────────────────────────────────────────────┘
```

---

# The Four Ways to Use HttpClient

A Principal Engineer understands the trade-offs of all four consumption patterns:

### 1. Direct Instantiation (❌ Anti-Pattern)
Creates socket exhaustion. Never use in production web applications.

---

### 2. Named Clients (`AddHttpClient("name")`)
```csharp
builder.Services.AddHttpClient("PaymentGateway", client =>
{
    client.BaseAddress = new Uri("https://api.paymentgateway.com/v1/");
    client.Timeout = TimeSpan.FromSeconds(5);
});
```
```csharp
public class PaymentService(IHttpClientFactory factory)
{
    public async Task PayAsync()
    {
        var client = factory.CreateClient("PaymentGateway");
        // ...
    }
}
```
*Assessment*: Better, but relies on magic strings and leaks `HttpClient` details into business services.

---

### 3. Typed Clients (✅ Recommended)
Encapsulates HTTP calls behind a clean domain interface:

```csharp
public interface IPaymentGatewayClient
{
    Task<PaymentResult> ChargeAsync(ChargeRequest request, CancellationToken ct);
}

public sealed class PaymentGatewayClient : IPaymentGatewayClient
{
    private readonly HttpClient _httpClient;

    public PaymentGatewayClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<PaymentResult> ChargeAsync(ChargeRequest request, CancellationToken ct)
    {
        var response = await _httpClient.PostAsJsonAsync("charges", request, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<PaymentResult>(cancellationToken: ct);
    }
}
```

#### Registration in `Program.cs`:
```csharp
builder.Services.AddHttpClient<IPaymentGatewayClient, PaymentGatewayClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["PaymentGateway:BaseUrl"]!);
    client.Timeout = TimeSpan.FromSeconds(5);
    client.DefaultRequestHeaders.Add("Accept", "application/json");
});
```

---

# DelegatingHandlers: Outgoing Middleware Pipeline

Just as incoming requests pass through Middleware, outgoing HTTP requests pass through a chain of **DelegatingHandlers**.

```
Outgoing Request
       │
       ▼
CorrelationIdHandler (Injects X-Correlation-Id / W3C TraceContext)
       │
       ▼
AuthenticationHandler (Injects Bearer Token / API Key)
       │
       ▼
LoggingHandler (Logs outbound latency and response status)
       │
       ▼
SocketsHttpHandler (Pools TCP Sockets & Executes Network I/O)
```

### Implementing a Correlation ID DelegatingHandler:
```csharp
public sealed class CorrelationIdDelegatingHandler : DelegatingHandler
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CorrelationIdDelegatingHandler(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, 
        CancellationToken cancellationToken)
    {
        var correlationId = _httpContextAccessor.HttpContext?.TraceIdentifier 
                            ?? Guid.NewGuid().ToString("N");

        request.Headers.TryAddWithoutValidation("X-Correlation-Id", correlationId);

        return await base.SendAsync(request, cancellationToken);
    }
}
```

#### Registration:
```csharp
builder.Services.AddTransient<CorrelationIdDelegatingHandler>();

builder.Services.AddHttpClient<IPaymentGatewayClient, PaymentGatewayClient>()
    .AddHttpMessageHandler<CorrelationIdDelegatingHandler>();
```

---

# Resilience with `Microsoft.Extensions.Resilience` (Polly v8)

In .NET 8+, resilience pipelines are built directly into `IHttpClientFactory` via `AddStandardResilienceHandler()`:

```csharp
builder.Services.AddHttpClient<IPaymentGatewayClient, PaymentGatewayClient>(client =>
{
    client.BaseAddress = new Uri("https://api.payments.com");
})
.AddStandardResilienceHandler(options =>
{
    // 1. Total Request Timeout (e.g. 10s across all retries)
    options.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(10);

    // 2. Retry Policy with Exponential Backoff and Jitter
    options.Retry.MaxRetryAttempts = 3;
    options.Retry.BackoffType = DelayBackoffType.Exponential;
    options.Retry.UseJitter = true; // Prevents thundering herd problem
    options.Retry.Delay = TimeSpan.FromMilliseconds(200);

    // 3. Circuit Breaker Policy
    options.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(30);
    options.CircuitBreaker.FailureRatio = 0.5; // Trip if 50% of calls fail
    options.CircuitBreaker.MinimumThroughput = 20;
    options.CircuitBreaker.BreakDuration = TimeSpan.FromSeconds(15);

    // 4. Per-Attempt Timeout
    options.AttemptTimeout.Timeout = TimeSpan.FromSeconds(2.5);
});
```

### Why Jitter Matters in Retry Policies:
If 1,000 concurrent requests fail simultaneously due to a momentary network blip, retrying all 1,000 requests after exactly 200ms creates a **Thundering Herd** (Retry Storm) that DDOSes the recovering downstream service.

Adding random **Jitter** scatters retry attempts over time, allowing the downstream dependency to recover gracefully.

---

# Common Mistakes

❌ **Resolving Typed Clients from Singleton Services Directly**
```csharp
// Typed clients have transient lifetimes. Injecting them directly into Singletons can create capture bugs.
```
✅ **Inject `IHttpClientFactory` into Singletons, or use `SocketsHttpHandler` with `PooledConnectionLifetime`.**

❌ **Retrying Non-Idempotent HTTP Requests (e.g. `POST /payments`) Blindly**
```csharp
// DANGEROUS: If the server processed the payment but the response packet was dropped, retrying will charge again!
```
✅ **Only retry idempotent operations (GET, PUT, DELETE) or ensure outgoing POSTs include an `Idempotency-Key`.**

❌ **Not Propagating `CancellationToken`**
```csharp
public async Task<Data> FetchAsync() => await _client.GetFromJsonAsync<Data>("/items"); // Ignores client disconnection
```
✅ **Always accept and pass `CancellationToken ct` to every `HttpClient` method.**

---

# Architect's Decision

### Scenario
Nova Commerce integrates with a legacy third-party warehouse management system that experiences frequent 3-5 second latency spikes and occasional DNS failovers.

### Architecture Plan:
1. **Typed Client**: Encapsulate warehouse operations in `IWarehouseApiClient`.
2. **Connection Pooling**: Set `HandlerLifetime` to 2 minutes to refresh DNS changes every 120s while pooling sockets.
3. **Resilience Pipeline**:
   - Per-attempt timeout: 2 seconds.
   - 3 Retries with Exponential Backoff and Jitter on HTTP 503 / 504.
   - Circuit breaker configured to open if >50% of calls fail over a 30s window.
4. **Telemetry**: Outgoing calls propagate W3C `traceparent` headers via `DelegatingHandler` for end-to-end distributed tracing.

---

# Principal Thinking

| Level | Perspective | Focus |
|---|---|---|
| **Junior** | Functionality | "I used `new HttpClient()` to call the URL." |
| **Senior** | Factory | "I registered a typed client using `AddHttpClient`." |
| **Principal** | Distributed Systems & Sockets | "What is the TCP socket lifecycle, DNS refresh cadence, resilience pipeline (backoff, jitter, circuit breaker), and correlation propagation across downstream dependencies?" |

---

# Learning Resources & References

### Authoritative Documentation
- [Make HTTP requests using IHttpClientFactory in ASP.NET Core](https://learn.microsoft.com/en-us/dotnet/core/extensions/httpclient-factory)
- [Building resilient HTTP requests in .NET with Polly](https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience)
- [Reliability Patterns: Circuit Breaker & Retry Storms](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)

---

# Self Assessment

1. Explain the mechanism behind TCP socket exhaustion and why `using (var client = new HttpClient())` causes it.
2. How does `IHttpClientFactory` resolve the conflict between socket reuse and DNS cache updates?
3. What is the role of `DelegatingHandler` in outgoing HTTP communication?
4. Why is Jitter essential when configuring exponential backoff retry policies in distributed systems?
5. Why must you be cautious when applying automated retry policies to HTTP `POST` requests?
