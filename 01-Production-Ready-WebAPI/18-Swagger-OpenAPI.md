# 18 - OpenAPI Specification & Contract Documentation

> "OpenAPI is not an interactive test page for developers.
>
> It is the formal machine-readable contract that defines your API, drives automated client SDK generation, and governs enterprise integration boundaries."

---

# Why Should a Principal Engineer Care?

Many teams treat Swagger as a simple debugging UI:

```csharp
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
```

This superficial view misses the entire point of the **OpenAPI Specification (OAS)**.

As a Principal Engineer, you realize that:
- **Contract-Driven Development**: The OpenAPI document is the single source of truth for Web, iOS, Android, and third-party integrations.
- **Automated Client SDK Generation**: Tools like **Microsoft Kiota** and **NSwag** generate strongly typed client libraries directly from your OpenAPI document in CI/CD.
- **Security Exposure Risks**: Exposing raw Swagger UI in production without authentication leaks internal architectural topologies, database entity schemas, and administrative endpoints to attackers.
- **Ecosystem Modernization**: ASP.NET Core has transitioned from legacy third-party tools (Swashbuckle) to native, high-performance built-in support (**`Microsoft.AspNetCore.OpenApi`**).

---

# Production Story

Thursday.

11:45 PM.

A penetration testing firm discovers an open Swagger UI endpoint on Nova Commerce's public production cluster:

```
https://api.novacommerce.com/swagger/index.html
```

The Swagger document was left enabled in production because the frontend team used it for live testing.

### What the Attackers Found:
1. Complete list of all unreleased v2 beta endpoints.
2. An internal administrative endpoint: `POST /api/internal/admin/flush-cache-and-seed-demo-data`.
3. Schema definitions revealing internal entity IDs, password hash algorithm fields, and database column names.

Using this public blueprint, an attacker targeted the exposed admin endpoint and triggered a cache invalidation storm that degraded database performance by 80%.

The incident forced an emergency security patch and an audit of all public contract exposure boundaries.

---

# The Distinction: OpenAPI Specification vs Swagger UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. OpenAPI Document (json/yaml)                                             │
│    • Machine-readable RFC standard (OpenAPI 3.0 / 3.1)                      │
│    • Generated at compile time or runtime via metadata reflection           │
│    • Used by SDK generators (Kiota), API Gateways, and linters              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. Interactive Presentation UIs                                             │
│    • Swagger UI / Scalar / Redoc / Stoplight Elements                       │
│    • Visual HTML/JS rendering for human testing                             │
│    • Should be restricted or disabled in public production                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# Modern Native OpenAPI in .NET 8/9/10 (`Microsoft.AspNetCore.OpenApi`)

Starting in .NET 8/9+, Microsoft introduced native, built-in OpenAPI generation:

### Step 1: Configuration in `Program.cs`

```csharp
builder.Services.AddOpenApi("v1", options =>
{
    options.AddDocumentTransformer((document, context, cancellationToken) =>
    {
        document.Info = new()
        {
            Title = "Nova Commerce API",
            Version = "v1.0",
            Description = "Production-grade enterprise retail commerce platform API."
        };

        // Configure JWT Bearer Security Scheme
        document.Components ??= new();
        document.Components.SecuritySchemes.Add("Bearer", new()
        {
            Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            Description = "Enter your JWT Bearer token to access secured endpoints."
        });

        return Task.CompletedTask;
    });
});
```

---

### Step 2: Documenting Endpoints with Type Safety

```csharp
app.MapPost("/api/v1/orders", async (
    [FromBody] CreateOrderRequest request, 
    IOrderService orderService,
    CancellationToken ct) =>
{
    var result = await orderService.CreateOrderAsync(request, ct);

    return result.Match(
        order => Results.CreatedAtRoute("GetOrderById", new { id = order.Id }, order),
        error => Results.Problem(statusCode: 422, title: error.Code, detail: error.Message));
})
.WithName("CreateOrder")
.WithSummary("Creates a new customer order")
.WithDescription("Validates inventory and reserves stock before returning a 201 Created.")
.Produces<OrderResponse>(StatusCodes.Status201Created)
.ProducesProblem(StatusCodes.Status422UnprocessableEntity)
.ProducesProblem(StatusCodes.Status401Unauthorized)
.RequireAuthorization();
```

---

# Modern UI Alternatives: Scalar & Swagger UI

While Swagger UI is the legacy standard, modern tools like **Scalar** provide superior performance, dark mode, and built-in interactive client code generation (C#, TypeScript, Python, cURL):

```csharp
var app = builder.Build();

app.MapOpenApi(); // Generates /openapi/v1.json

if (app.Environment.IsDevelopment())
{
    // High-performance modern API documentation UI:
    app.MapScalarApiReference();
}
```

---

# Automated SDK Generation with Microsoft Kiota

Why write manual `HttpClient` wrappers when you can generate type-safe SDKs automatically?

### Using Microsoft Kiota in CI/CD:
```bash
# Generate a strongly typed C# client from the OpenAPI spec:
kiota generate \
  --openapi ./openapi/v1.json \
  --language CSharp \
  --class-name NovaCommerceClient \
  --namespace NovaCommerce.ApiClient \
  --output ./src/Clients/NovaCommerce.ApiClient
```

### Consumption in Client Applications:
```csharp
// Strongly typed, zero-magic strings, full IntelliSense:
var client = new NovaCommerceClient(requestAdapter);
var order = await client.Api.V1.Orders[orderId].GetAsync();
```

---

# Common Mistakes

❌ **Exposing Interactive Swagger UI Unprotected in Public Production**
```csharp
// ANTI-PATTERN: Allows unauthenticated internet users to explore internal endpoints
app.UseSwaggerUI(); // Left active in production
```
✅ **Restrict Swagger UI to Development environments or protect behind internal VPN / OAuth authentication policies.**

❌ **Missing Response Type Declarations (`ProducesResponseType`)**
```csharp
[HttpGet("{id}")]
public async Task<IActionResult> Get(Guid id) => Ok(await _repo.GetAsync(id)); // OpenAPI treats output as generic `void`!
```
✅ **Use `TypedResults` in Minimal APIs or explicit `[ProducesResponseType(typeof(Dto), 200)]` attributes.**

❌ **Using Object / Dictionary without Concrete Schema Types**
```csharp
public IActionResult Process([FromBody] Dictionary<string, object> data) // Destroys schema generation
```
✅ **Use strongly typed C# records with clear XML comments or data annotations.**

---

# Architect's Decision

### Scenario
Nova Commerce provides APIs consumed by an internal React SPA, native iOS/Android mobile apps, and 200+ external enterprise partners.

### Strategy:
1. **Spec Generation**: Use native `Microsoft.AspNetCore.OpenApi` with compile-time source generated metadata.
2. **Contract Artifacts**: Export raw `openapi.json` specs during CI/CD build pipelines.
3. **SDK Generation**: Generate official TypeScript and C# client SDKs via Microsoft Kiota on every main branch release.
4. **Environment Isolation**: Scalar / Swagger UI active in `Development` and `Staging`; disabled in `Production` (or secured behind corporate SSO).

---

# Principal Thinking

| Level | Perspective | Focus |
|---|---|---|
| **Junior** | UI Tool | "I use Swagger UI to click 'Try It Out' instead of Postman." |
| **Senior** | Documentation | "I add XML comments and response types to generate clean docs." |
| **Principal** | API Contract & Tooling Ecosystem | "How does our OpenAPI spec govern contract validation, breaking change detection in CI/CD, multi-language SDK generation (Kiota), and API Gateway routing policies?" |

---

# Learning Resources & References

### Authoritative Documentation
- [OpenAPI Support in ASP.NET Core (.NET 8/9/10) — Microsoft Learn](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/openapi/overview)
- [Microsoft Kiota: OpenAPI-based SDK Generator](https://learn.microsoft.com/en-us/openapi/kiota/overview)
- [OpenAPI Specification v3.1 Standard](https://spec.openapis.org/oas/latest.html)

---

# Self Assessment

1. Explain the difference between the OpenAPI Specification document and Swagger UI / Scalar.
2. Why is exposing Swagger UI in public production environments considered a security vulnerability?
3. How does Microsoft Kiota automate type-safe API client generation in multi-language environments?
4. How do you document multiple response status codes (e.g. 200, 400, 404, 422) using `TypedResults` in Minimal APIs?
5. How can OpenAPI documents be used in CI/CD pipelines to detect breaking contract changes before deployment?
