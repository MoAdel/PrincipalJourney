# 21 - Principal Engineer Production-Ready Release Checklist

> "Production readiness is not an event that happens the night before deployment.
>
> It is an engineering discipline enforced through architectural gates, automated verifications, and operational rigor."

---

# The Principal Engineer's Release Gate

Before any Web API is authorized to handle real customer traffic and revenue, it must pass this **Principal-Level Production Readiness Gate**.

```
                           Production Release Gate
                                     │
      ┌──────────────────────────────┼──────────────────────────────┐
      ▼                              ▼                              ▼
  Architecture & Security        Resilience & Performance       Observability & Ops
  • Clean Boundaries             • Polly Circuit Breakers       • Structured Logging
  • RFC 7807 ProblemDetails      • Keyset Pagination            • W3C Distributed Tracing
  • Zero Leaked Secrets          • Sockets Connection Pooling   • Liveness / Readiness Probes
```

---

# 1. Architecture & Clean Boundaries

- [ ] **Dependency Inversion Enforced**: Domain and Application layers have zero dependencies on ASP.NET Core, EF Core, or cloud SDKs.
- [ ] **Composition Root Explicit**: All DI registrations reside strictly in the API startup (`Program.cs` / Dependency Injection extension methods).
- [ ] **Scoped Lifetime Integrity**: DI scope validation enabled (`ValidateScopes = true`, `ValidateOnBuild = true`).
- [ ] **Domain Invariants Protected**: Domain entities use private setters and factory methods returning `Result<T, Error>`.

---

# 2. Middleware & Pipeline Order

- [ ] **Exception Handler First**: `app.UseExceptionHandler()` is positioned before all other middleware.
- [ ] **Security Headers Enforced**: HSTS, Content-Security-Policy, X-Content-Type-Options, and X-Frame-Options configured.
- [ ] **Auth Sequence Verified**: `app.UseAuthentication()` strictly precedes `app.UseAuthorization()`.
- [ ] **Rate Limiting Active**: Public endpoints protected by fixed-window or sliding-window rate limiters.

---

# 3. Observability & Telemetry

- [ ] **Structured Logging**: All log messages use named message templates (zero string interpolation `$"..."`).
- [ ] **Zero-Allocation Logging**: High-throughput hot paths use compile-time source generated `[LoggerMessage]`.
- [ ] **Scope Correlation**: Middleware pushes `CorrelationId`, `TraceId`, and `TenantId` into an `AsyncLocal` scope via `_logger.BeginScope()`.
- [ ] **Filtering Configured**: `Trace` and `Debug` disabled in production for framework categories (`Microsoft.AspNetCore`, `Microsoft.EntityFrameworkCore`).
- [ ] **Asynchronous Export**: OpenTelemetry OTLP or Serilog sinks use asynchronous background batching (zero synchronous disk/console blocking).

---

# 4. Error Handling & RFC 7807 Problem Details

- [ ] **Standardized Error Contracts**: All 4xx and 5xx responses emit `application/problem+json` (RFC 7807 / RFC 9457).
- [ ] **Zero Stack Trace Leaks**: Internal exceptions, SQL syntax errors, and stack traces are stripped in production.
- [ ] **TraceId Attached**: Every error response includes a `traceId` extension matching internal logs.
- [ ] **Result Pattern in Domain**: Expected business validation failures return typed `Result<T, Error>` instead of throwing CLR exceptions.

---

# 5. Input Validation & Invariants

- [ ] **Layered Validation**: Input format validated with FluentValidation; domain invariants enforced inside entities.
- [ ] **ReDoS Protection**: All regular expressions use `[GeneratedRegex]` with explicit execution timeouts.
- [ ] **Appropriate Status Codes**: Syntactic errors return `400 Bad Request`; semantic validation failures return `422 Unprocessable Entity`.

---

# 6. REST API Design & Contracts

- [ ] **Idempotency Keys**: Financial and state-altering `POST` endpoints enforce `Idempotency-Key` headers backed by Redis with TTL.
- [ ] **Keyset Pagination**: High-volume collections use Keyset (Cursor) pagination (`$O(1)$`) instead of Offset pagination (`OFFSET / FETCH`).
- [ ] **Optimistic Concurrency**: Mutating endpoints (`PUT`/`PATCH`) enforce `If-Match` headers with `RowVersion` ETags to prevent lost updates.
- [ ] **Safe HTTP Verbs**: `GET` and `HEAD` endpoints have zero side effects on server state.

---

# 7. Outbound HTTP & Resilience

- [ ] **Connection Pooling**: All outgoing HTTP calls use typed clients configured via `IHttpClientFactory` or `SocketsHttpHandler`.
- [ ] **DNS Rotation**: `PooledConnectionLifetime` / `HandlerLifetime` set to 2 minutes to prevent stale DNS during failovers.
- [ ] **Standard Resilience Pipeline**: Configured with Exponential Backoff + Jitter retries, Circuit Breakers, and Total Request Timeouts.
- [ ] **CancellationToken Propagation**: Every outbound HTTP call accepts and passes `CancellationToken`.

---

# 8. API Versioning & Lifecycle

- [ ] **Explicit Versioning**: All routes versioned via URL path (`/api/v1/...`).
- [ ] **Deprecation Headers**: Deprecated versions emit `api-deprecated-versions` and RFC 8594 `Sunset` headers.
- [ ] **Backward Compatibility**: CI pipeline runs schema validation tests to prevent accidental breaking contract changes.

---

# 9. OpenAPI & Documentation

- [ ] **Generated Specification**: High-performance native `Microsoft.AspNetCore.OpenApi` enabled.
- [ ] **Swagger UI Restricted**: Interactive UI disabled or secured behind internal corporate authentication in production.
- [ ] **Client SDK Generation**: Automated Kiota / NSwag generation integrated into CI/CD for web and mobile clients.

---

# 10. Health Checks & Orchestration Probes

- [ ] **Probe Separation**:
  - `Startup Probe` (`/health/ready`): Waits for DI warmup and migrations.
  - `Liveness Probe` (`/health/live`): Fast, in-memory self-check only (NEVER touches databases).
  - `Readiness Probe` (`/health/ready`): Validates database and cache connectivity with strict 2-second timeouts.
- [ ] **Probe Result Caching**: In-memory 3-second cache applied to readiness checks to prevent pod thundering herds.

---

# 11. Configuration & Secret Management

- [ ] **Zero Hardcoded Secrets**: Production passwords and keys stored exclusively in Azure Key Vault / AWS Secrets Manager.
- [ ] **Managed Identities**: Services authenticate to cloud infrastructure using Managed Identities (zero long-lived credentials).
- [ ] **Startup Validation**: Critical configuration validated on startup via `.ValidateDataAnnotations().ValidateOnStart()`.
- [ ] **Dynamic Secret Rotation**: Secrets monitored via `IOptionsMonitor<T>` for zero-downtime rotation.

---

# 12. Performance & Capacity

- [ ] **Asynchronous I/O**: Zero blocking calls (`.Result`, `.Wait()`) in request paths.
- [ ] **Memory Allocation Audit**: Hot paths profiled in BenchmarkDotNet to ensure zero unnecessary heap allocations.
- [ ] **Database Connection Pool**: SQL Server pool size tuned to match maximum expected concurrency (`Max Pool Size = 128-256`).

---

# The Go / No-Go Decision Matrix

| Category | Must-Have (Blocker) | Nice-to-Have (Post-Launch) |
|---|---|---|
| **Security** | Zero hardcoded secrets, sanitized 500 errors, rate limiting | Fine-grained API key scopes |
| **Observability** | Structured logging, trace IDs, liveness/readiness probes | Custom business metric dashboards |
| **Resilience** | Circuit breaker on billing, idempotency keys on checkout | Automatic failover to secondary cloud region |
| **Contract** | URL versioning, RFC 7807 ProblemDetails, OpenAPI spec | Client SDK auto-publishing to private NuGet |

---

# Principal Summary

If any single **Blocker** item is unchecked, the Principal Engineer's verdict is **NO-GO**.

Deploying a fast API that fails in production is not agility. It is negligence.

Engineering excellence is building a foundation that survives under pressure.
