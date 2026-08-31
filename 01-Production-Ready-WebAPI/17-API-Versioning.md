# 17 - API Versioning & Lifecycle Governance

> "Changing an API contract without versioning is not an improvement.
>
> It is an unannounced breaking change inflicted upon your consumers."

---

# Why Should a Principal Engineer Care?

In enterprise systems, you cannot force all consumers to upgrade simultaneously.

- Mobile applications remain installed on user devices for months or years without updating.
- B2B retail partners take quarters to schedule integration updates.
- Internal frontend SPAs may be cached in CDNs.

If your backend changes a field name from `CustomerId` to `UserId` or modifies a data type from `int` to `string`, un-versioned APIs will instantly break thousands of active clients.

As a Principal Engineer, you design an **API Versioning and Deprecation Strategy** that:
- Defines what constitutes a breaking change vs a non-breaking evolution.
- Selects the right versioning scheme for routing, caching, and developer experience.
- Uses standard HTTP headers (`Sunset`, `api-deprecated-versions`) to communicate lifecycle transitions.
- Integrates seamlessly with OpenAPI / Swagger documentation.

---

# Production Story

Friday.

08:00 PM.

Nova Commerce deploys an optimization to its Order API.

A developer cleaned up the JSON response model, renaming `order_total` to `totalAmount` to follow C# camelCase conventions.

Within 15 minutes:
- 45,000 Android app users who were running app version 2.4 experienced checkout failures.
- Third-party accounting integrations failed to import daily sales.
- Support received over 800 phone calls in the first hour.

The engineering team was forced to execute an emergency midnight rollback.

The change was logically correct, but without versioning, it was a catastrophic breaking change.

---

# Breaking vs Non-Breaking Changes

A Principal Engineer establishes clear rules for what requires a new API version:

```
┌─────────────────────────────────────────────────────────────┐
│ Non-Breaking Evolution (No New Version Needed)              │
│                                                             │
│  • Adding a new optional request parameter / query param    │
│  • Adding a new field to a JSON response payload            │
│  • Adding a completely new endpoint (/api/v1/wishlists)     │
│  • Improving performance or internal database queries       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Breaking Change (Requires New API Version, e.g. v2.0)       │
│                                                             │
│  • Renaming or removing an existing request/response field  │
│  • Changing the data type of an existing field              │
│  • Making an optional parameter required                    │
│  • Changing URL routing structure                           │
│  • Altering HTTP status code semantics                      │
└─────────────────────────────────────────────────────────────┘
```

---

# The Four Versioning Strategies

| Strategy | Example | Pros | Cons |
|---|---|---|---|
| **1. URL Path** | `/api/v1/orders` | Explicit, easy CDN caching, gateway-friendly, unambiguous | Couples URL to version; breaks pure REST URI opacity |
| **2. Query String** | `/api/orders?api-version=1.0` | Easy testing in browsers, clean path structure | Caching complexity on CDNs if query strings are ignored |
| **3. Header** | `X-Api-Version: 1.0` | Clean URLs, pure resource naming | Difficult to test in raw browsers; requires custom headers |
| **4. Media Type (Accept)** | `Accept: application/vnd.novacommerce.v1+json` | True HATEOAS RESTful design | Complex routing, difficult API Gateway configuration |

### Principal Recommendation:
For public web and mobile APIs, **URL Path Versioning (`/api/v1/...`)** is the pragmatic industry standard. It provides the highest visibility, simplest API Gateway routing, and zero caching ambiguity.

---

# Implementing Versioning in ASP.NET Core (`Asp.Versioning.Http`)

In modern .NET (using the official `Asp.Versioning.Http` package):

### Step 1: Register API Versioning in `Program.cs`

```csharp
builder.Services.AddApiVersioning(options =>
{
    // Default to version 1.0 if the client doesn't specify one
    options.DefaultApiVersion = new ApiVersion(1, 0);
    options.AssumeDefaultVersionWhenUnspecified = true;

    // Report supported and deprecated versions in HTTP response headers
    options.ReportApiVersions = true;

    // Read version from URL path and/or query string and/or header:
    options.ApiVersionReader = ApiVersionReader.Combine(
        new UrlSegmentApiVersionReader(),
        new QueryStringApiVersionReader("api-version"),
        new HeaderApiVersionReader("X-Api-Version"));
})
.AddApiExplorer(options =>
{
    // Format version as 'v'major[.minor][-status] (e.g. 'v1.0')
    options.GroupNameFormat = "'v'VVV";
    options.SubstituteApiVersionInUrl = true;
});
```

---

### Step 2: Versioning Minimal APIs & Controllers

#### Minimal APIs Approach (.NET 8+):
```csharp
var versionSet = app.NewApiVersionSet()
    .HasApiVersion(new ApiVersion(1, 0))
    .HasApiVersion(new ApiVersion(2, 0))
    .ReportApiVersions()
    .Build();

// Version 1.0 Endpoint:
app.MapGet("/api/v{version:apiVersion}/orders/{id}", (Guid id) =>
{
    return TypedResults.Ok(new OrderV1Dto(id, "Legacy Format"));
})
.WithApiVersionSet(versionSet)
.MapToApiVersion(1, 0);

// Version 2.0 Endpoint:
app.MapGet("/api/v{version:apiVersion}/orders/{id}", (Guid id) =>
{
    return TypedResults.Ok(new OrderV2Dto(id, 150.00m, "USD", DateTime.UtcNow));
})
.WithApiVersionSet(versionSet)
.MapToApiVersion(2, 0);
```

---

# API Deprecation & Sunset Governance (RFC 8594)

When an old API version (e.g. v1.0) is slated for retirement:

### 1. The `Sunset` HTTP Header
Inform consumers of the exact date and time the version will be permanently shut down:

```http
HTTP/1.1 200 OK
api-supported-versions: 2.0
api-deprecated-versions: 1.0
Sunset: Wed, 11 Nov 2026 00:00:00 GMT
Link: <https://api.novacommerce.com/docs/deprecations/v1>; rel="sunset"
```

### 2. Deprecation Policy Timeline:
```
Announcement (v2 Launched) ──► Deprecation Warning (Sunset Header Added) ──► Final Blackout (v1 Returns 410 Gone)
       [Month 0]                                [Month 6]                                 [Month 12]
```

---

# Common Mistakes

❌ **Modifying DTOs In-Place for New Features that Break Old Consumers**
```csharp
// Modifying an existing DTO breaks serialized contracts across existing mobile app versions.
```
✅ **Create distinct DTOs per version (`OrderV1Response`, `OrderV2Response`) in separate versioned namespaces.**

❌ **Keeping Deprecated API Versions Alive Indefinitely**
```csharp
// Supporting 10 historical API versions creates massive maintenance drag, technical debt, and security surface.
```
✅ **Establish a formal 12-month Deprecation & Sunset policy with automated telemetry tracking active v1 consumers.**

❌ **Using Patch Versions in API URLs (`/api/v1.2.4/orders`)**
```
// URLs should only reflect Major breaking versions (/api/v1/, /api/v2/). Minor and patch changes must be backward-compatible.
```

---

# Architect's Decision

### Scenario
Nova Commerce needs an API versioning strategy supporting 5 million consumer mobile devices and 500 B2B enterprise partners.

### Standards Adopted:
1. **Primary Scheme**: URL Path Versioning (`/api/v1/...`, `/api/v2/...`).
2. **Backward Compatibility**: All minor additions must be backward-compatible (non-breaking additions only).
3. **Deprecation Window**: 12-month minimum notice before decommissioning any major version.
4. **Headers**: Automatically emit `api-supported-versions`, `api-deprecated-versions`, and RFC 8594 `Sunset` headers on all responses.

---

# Principal Thinking

| Level | Perspective | Focus |
|---|---|---|
| **Junior** | URL String | "I changed the route to `/api/v2/orders`." |
| **Senior** | Package Integration | "I configured `Asp.Versioning.Http` with Swagger integration." |
| **Principal** | Contract Governance & Migration | "What is our backward compatibility guarantee, breaking change taxonomy, automated Sunset header governance, and multi-version client migration strategy?" |

---

# Learning Resources & References

### Authoritative Documentation
- [ASP.NET Core API Versioning Guide (Official GitHub)](https://github.com/dotnet/aspnet-api-versioning)
- [RFC 8594: The Sunset HTTP Header Field](https://datatracker.ietf.org/doc/html/rfc8594)
- [Microsoft REST API Guidelines: Versioning](https://github.com/microsoft/api-guidelines/blob/vNext/Guidelines.md#12-versioning)

---

# Self Assessment

1. Explain the difference between a breaking change and a non-breaking API evolution.
2. What are the trade-offs between URL Path Versioning and Header Versioning?
3. How does the RFC 8594 `Sunset` header inform API consumers of impending retirement?
4. How do you configure `Asp.Versioning.Http` to report supported and deprecated versions automatically?
5. Why should API URLs only include the Major version number (e.g. `v1`) rather than minor/patch numbers (`v1.2.4`)?
