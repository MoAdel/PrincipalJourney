# 11 - Cross-Origin Resource Sharing (CORS) Security Architecture

> "CORS is not a server security feature.
>
> CORS is a browser security relaxation mechanism that instructs user agents when to allow cross-origin JavaScript requests."

---

# Why Should a Principal Engineer Care?

When developers encounter browser CORS errors, their typical reaction is:

```csharp
app.UseCors(builder => builder
    .AllowAnyOrigin()
    .AllowAnyMethod()
    .AllowAnyHeader()); // DANGEROUS SECURITY HOLE
```

This line of code destroys cross-origin isolation:
1. **Malicious Website Data Theft**: An attacker's website (`https://evil-hacker.com`) can make background `fetch()` calls to your API from an authenticated user's browser and exfiltrate sensitive data.
2. **Wildcards with Credentials**: Attempting to use `AllowAnyOrigin()` with `AllowCredentials()` is rejected by modern browsers, leading developers down a rabbit hole of dangerous dynamic reflection hacks.
3. **Preflight Request Latency**: Un-cached `OPTIONS` preflight requests double the latency of every single mutating API call across the internet.

As a Principal Engineer, you design a **strict, environment-aware, performant CORS policy**.

---

# The CORS Preflight Handshake

```
Browser (on https://app.novacommerce.com)               Kestrel Web API (https://api.novacommerce.com)
                       │                                                        │
                       │ 1. Preflight Request (OPTIONS /api/v1/orders)          │
                       │    Origin: https://app.novacommerce.com                │
                       │    Access-Control-Request-Method: POST                 │
                       │    Access-Control-Request-Headers: Authorization       │
                       │───────────────────────────────────────────────────────►│
                       │                                                        │ 2. Evaluates Origin
                       │                                                        │    against Whitelist
                       │ 3. Preflight Response                                  │
                       │    Access-Control-Allow-Origin: https://app.novacommerce.com
                       │    Access-Control-Allow-Methods: POST, GET, OPTIONS    │
                       │    Access-Control-Allow-Headers: Authorization         │
                       │    Access-Control-Max-Age: 86400 (Cache 24 Hours!)     │
                       │◄───────────────────────────────────────────────────────│
                       │                                                        │
                       │ 4. Actual Request (POST /api/v1/orders)                │
                       │    Authorization: Bearer eyJ...                        │
                       │───────────────────────────────────────────────────────►│
                       │                                                        │ 5. Executes Action
                       │ 6. Response (201 Created)                              │
                       │◄───────────────────────────────────────────────────────│
```

---

# Hardening CORS in ASP.NET Core

```csharp
var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? [];

builder.Services.AddCors(options =>
{
    options.AddPolicy("StrictProductionPolicy", policy =>
    {
        policy.WithOrigins(allowedOrigins) // Explicit origin array (NO WILDCARDS!)
              .WithMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
              .WithHeaders("Authorization", "Content-Type", "X-Correlation-Id", "Idempotency-Key")
              .SetPreflightMaxAge(TimeSpan.FromHours(24)); // Reduces preflight overhead by 95%!
    });
});
```

---

# Common Mistakes

❌ **Using `AllowAnyOrigin()` in Production**
```csharp
// Allows any malicious website to read API responses if user sessions/tokens are present.
```
✅ **Bind allowed origins strictly from environment configuration (`appsettings.Production.json`).**

❌ **Placing `app.UseCors()` in the Wrong Middleware Position**
```csharp
app.UseAuthentication();
app.UseCors(); // BUG: Authentication executes before CORS headers are written, breaking preflight OPTIONS requests!
```
✅ **`app.UseCors()` MUST be placed BEFORE `app.UseAuthentication()` and `app.UseAuthorization()`.**

❌ **Omitting `SetPreflightMaxAge`**
```csharp
// Every single POST/PUT/DELETE request triggers a blocking OPTIONS preflight HTTP call, doubling network latency.
```
✅ **Set `SetPreflightMaxAge(TimeSpan.FromHours(24))`.**

---

# Architect's Decision

### Scenario
Nova Commerce serves traffic to an official web storefront (`https://novacommerce.com`), an admin portal (`https://admin.novacommerce.com`), and third-party mobile apps.

### Strategy:
1. **Explicit Whitelisting**: Exact subdomain matching for first-party web apps.
2. **Mobile Apps**: Native iOS/Android apps do not enforce browser CORS (CORS is purely a browser-enforced sandbox).
3. **Pipeline Order**: `app.UseCors()` positioned immediately after Routing and before Auth.
4. **Preflight Optimization**: 24-hour preflight cache duration.

---

# Principal Thinking

| Level | Perspective | Focus |
|---|---|---|
| **Junior** | Fix Error | "I added `AllowAnyOrigin()` to make the error go away." |
| **Senior** | Policy Config | "I configured allowed origins in `appsettings.json`." |
| **Principal** | Origin Isolation & Pipeline Mechanics | "Where does CORS sit relative to Auth middleware? How do we optimize preflight latency? What is our cross-origin threat boundary?" |

---

# Learning Resources & References

### Authoritative Documentation
- [Enable Cross-Origin Requests (CORS) in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/security/cors)
- [MDN Web Docs: Cross-Origin Resource Sharing (CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
